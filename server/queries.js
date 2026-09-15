/* SQL 은 전부 여기 모은다. 코드 곳곳에 흩어지면 DB 를 바꿀 때 찾아다녀야 한다.
   Postgres 전용 문법은 아껴 쓴다 — DISTINCT ON · 배열 · RETURNING 남용 없음. */

const { rows, one } = require("./db");

const lounge = (id) =>
  one(`SELECT id, course_id, name, intro FROM lounge WHERE id = $1`, [id]);

const lounges = () =>
  rows(`SELECT l.id, l.name,
               (SELECT json_agg(json_build_object('name', c.name, 'placement', lc.placement, 'sort', lc.sort)
                                ORDER BY lc.placement, lc.sort)
                  FROM lounge_category lc JOIN category c ON c.id = lc.category_id
                 WHERE lc.lounge_id = l.id AND c.deleted_at IS NULL) AS chips
          FROM lounge l ORDER BY l.id`);

const members = (loungeId) =>
  rows(`SELECT m.user_id, u.nickname, m.role, m.cohort, m.week,
               m.joined_at, m.expires_at, m.last_seen_at, m.muted_until, m.muted_reason,
               (SELECT min(p.created_at) FROM post p JOIN category c ON c.id = p.category_id
                 WHERE p.user_id = m.user_id AND p.lounge_id = m.lounge_id
                   AND c.name = '과제' AND p.deleted_at IS NULL) AS first_submit_at,
               (SELECT json_agg(x.lounge_id ORDER BY x.lounge_id)
                  FROM lounge_member x WHERE x.user_id = m.user_id
                   AND x.role IN ('instructor','admin')) AS staff_of
          FROM lounge_member m JOIN ext_user u ON u.id = m.user_id
         WHERE m.lounge_id = $1
         ORDER BY m.role, m.id`, [loungeId]);

const categories = () =>
  rows(`SELECT id, name, is_system, pass_required
          FROM category WHERE deleted_at IS NULL ORDER BY id`);

/* 라운지별 쓰기 권한. 배치와 같은 표에 있다. */
const categoryRights = (loungeId) =>
  rows(`SELECT c.name, lc.student_can_write, lc.instructor_can_write
          FROM lounge_category lc JOIN category c ON c.id = lc.category_id
         WHERE lc.lounge_id = $1 AND c.deleted_at IS NULL`, [loungeId]);

const posts = (loungeId, viewerId) =>
  rows(`SELECT p.id, p.title, p.body, p.week, p.is_pinned, p.view_count,
               p.created_at, p.user_id, p.author_name, c.name AS category,
               (p.user_id = $2) AS mine,
               (SELECT count(*)::int FROM reaction r
                 WHERE r.target_kind = 'post' AND r.target_id = p.id AND r.emoji = '👍') AS likes,
               EXISTS (SELECT 1 FROM reaction r
                        WHERE r.target_kind = 'post' AND r.target_id = p.id AND r.user_id = $2) AS reacted,
               -- 내가 어떤 이모지를 눌렀는지. 없으면 눌렀던 표시가 새로고침마다 풀린다.
               (SELECT r.emoji FROM reaction r
                 WHERE r.target_kind = 'post' AND r.target_id = p.id AND r.user_id = $2
                 LIMIT 1) AS my_react,
               (SELECT json_object_agg(e.emoji, e.n) FROM (
                  SELECT r.emoji, count(*)::int AS n FROM reaction r
                   WHERE r.target_kind = 'post' AND r.target_id = p.id AND r.emoji <> '👍'
                   GROUP BY r.emoji) e) AS reactions,
               (SELECT json_agg(json_build_object('seq', a.seq, 'q', a.question, 'a', a.answer) ORDER BY a.seq)
                  FROM post_answer a WHERE a.post_id = p.id) AS answers,
               (SELECT json_build_object('kind', t.kind, 'url', t.url, 'label', t.label)
                  FROM attachment t WHERE t.post_id = p.id ORDER BY t.sort LIMIT 1) AS attach,
               (SELECT count(*)::int FROM post_report pr WHERE pr.post_id = p.id) AS reports,
               EXISTS (SELECT 1 FROM post_report pr WHERE pr.post_id = p.id AND pr.user_id = $2) AS reported
          FROM post p JOIN category c ON c.id = p.category_id
         WHERE p.lounge_id = $1 AND p.deleted_at IS NULL
         ORDER BY p.created_at DESC`, [loungeId, viewerId]);

const comments = (loungeId, viewerId) =>
  rows(`SELECT cm.id, cm.post_id, cm.parent_id, cm.author_name, cm.body,
               cm.reaction_count, cm.created_at,
               (m.role IN ('instructor','admin')) AS staff,
               EXISTS (SELECT 1 FROM reaction r
                        WHERE r.target_kind = 'comment' AND r.target_id = cm.id
                          AND r.user_id = $2) AS mine_up
          FROM comment cm
          JOIN post p ON p.id = cm.post_id
     LEFT JOIN lounge_member m ON m.user_id = cm.user_id AND m.lounge_id = p.lounge_id
         WHERE p.lounge_id = $1 AND cm.deleted_at IS NULL
         ORDER BY cm.created_at`, [loungeId, viewerId]);

/* ---------- 랭킹 ----------
   받은 이모지만 센다. 글을 몇 개 썼는지 · 댓글을 몇 개 달았는지는 안 본다.
   많이 쓴 사람이 아니라 남에게 가닿은 사람이 위로 온다.

   · 글에 달린 반응과 댓글에 달린 반응을 같이 센다. 둘 다 '받은 것'이다.
   · 자기 글에 자기가 누른 것은 빼다. 혼자 올릴 수 있으면 순위가 아니다.
   · 수강생만 센다. 강사 공지에 반응이 몰리면 순위가 뒤집힌다.
   · days 가 null 이면 전체 기간. */
const received = (loungeId, days) =>
  rows(`
    WITH got AS (
      SELECT p.user_id AS who, r.emoji, r.created_at
        FROM reaction r
        JOIN post p ON p.id = r.target_id AND r.target_kind = 'post'
       WHERE p.lounge_id = $1 AND p.deleted_at IS NULL AND r.user_id <> p.user_id
      UNION ALL
      SELECT c.user_id, r.emoji, r.created_at
        FROM reaction r
        JOIN comment c ON c.id = r.target_id AND r.target_kind = 'comment'
        JOIN post p2 ON p2.id = c.post_id
       WHERE p2.lounge_id = $1 AND c.deleted_at IS NULL AND r.user_id <> c.user_id
    )
    SELECT u.nickname AS name, m.week, m.cohort,
           coalesce(sum(cnt.n), 0)::int AS total,
           coalesce(json_agg(json_build_object('e', cnt.emoji, 'n', cnt.n)
                             ORDER BY cnt.n DESC) FILTER (WHERE cnt.emoji IS NOT NULL), '[]') AS emojis
      FROM lounge_member m
      JOIN ext_user u ON u.id = m.user_id
 LEFT JOIN (
      SELECT who, emoji, count(*)::int AS n FROM got
       WHERE ($2::int IS NULL OR created_at >= now() - ($2 || ' days')::interval)
       GROUP BY who, emoji
    ) cnt ON cnt.who = m.user_id
     WHERE m.lounge_id = $1 AND m.role = 'student'
     GROUP BY u.nickname, m.week, m.cohort
     ORDER BY total DESC, u.nickname`, [loungeId, days]);

/* 기간 안에 이모지를 가장 많이 받은 글. 누가 아니라 무엇이 가닿았는지. */
const topPosts = (loungeId, days) =>
  rows(`
    SELECT p.id, p.title, p.author_name, c.name AS category,
           count(*)::int AS got
      FROM reaction r
      JOIN post p ON p.id = r.target_id AND r.target_kind = 'post'
      JOIN category c ON c.id = p.category_id
     WHERE p.lounge_id = $1 AND p.deleted_at IS NULL AND r.user_id <> p.user_id
       AND ($2::int IS NULL OR r.created_at >= now() - ($2 || ' days')::interval)
     GROUP BY p.id, p.title, p.author_name, c.name
     ORDER BY got DESC, p.created_at DESC
     LIMIT 5`, [loungeId, days]);

const weekFlags = (loungeId) =>
  rows(`SELECT week, published FROM lounge_week WHERE lounge_id = $1 ORDER BY week`, [loungeId]);

module.exports = { lounge, lounges, members, categories, categoryRights,
                   posts, comments, received, topPosts, weekFlags };
