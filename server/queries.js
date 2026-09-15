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
               m.joined_at, m.expires_at, m.last_seen_at,
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
               (SELECT json_object_agg(e.emoji, e.n) FROM (
                  SELECT r.emoji, count(*)::int AS n FROM reaction r
                   WHERE r.target_kind = 'post' AND r.target_id = p.id AND r.emoji <> '👍'
                   GROUP BY r.emoji) e) AS reactions,
               (SELECT json_agg(json_build_object('seq', a.seq, 'q', a.question, 'a', a.answer) ORDER BY a.seq)
                  FROM post_answer a WHERE a.post_id = p.id) AS answers,
               (SELECT json_build_object('kind', t.kind, 'url', t.url, 'label', t.label)
                  FROM attachment t WHERE t.post_id = p.id ORDER BY t.sort LIMIT 1) AS attach
          FROM post p JOIN category c ON c.id = p.category_id
         WHERE p.lounge_id = $1 AND p.deleted_at IS NULL
         ORDER BY p.created_at DESC`, [loungeId, viewerId]);

const comments = (loungeId) =>
  rows(`SELECT cm.id, cm.post_id, cm.parent_id, cm.author_name, cm.body,
               cm.reaction_count, cm.created_at,
               (m.role IN ('instructor','admin')) AS staff
          FROM comment cm
          JOIN post p ON p.id = cm.post_id
     LEFT JOIN lounge_member m ON m.user_id = cm.user_id AND m.lounge_id = p.lounge_id
         WHERE p.lounge_id = $1 AND cm.deleted_at IS NULL
         ORDER BY cm.created_at`, [loungeId]);

/* 활동량. 글 10점 · 받은 반응 1점 · 단 댓글 3점.
   프로토타입의 고정 숫자를 대신한다 — 근거 있는 값이라야 한다. */
const leaderboard = (loungeId, days) =>
  rows(`SELECT u.nickname AS name, SUM(s.score)::int AS score FROM (
          SELECT p.user_id, 10 * count(*) AS score
            FROM post p WHERE p.lounge_id = $1 AND p.deleted_at IS NULL
             AND ($2::int IS NULL OR p.created_at >= now() - ($2 || ' days')::interval)
           GROUP BY p.user_id
          UNION ALL
          SELECT p.user_id, count(*) AS score
            FROM reaction r JOIN post p ON p.id = r.target_id AND r.target_kind = 'post'
           WHERE p.lounge_id = $1 AND p.deleted_at IS NULL
             AND ($2::int IS NULL OR r.created_at >= now() - ($2 || ' days')::interval)
           GROUP BY p.user_id
          UNION ALL
          SELECT cm.user_id, 3 * count(*) AS score
            FROM comment cm JOIN post p ON p.id = cm.post_id
           WHERE p.lounge_id = $1 AND cm.deleted_at IS NULL
             AND ($2::int IS NULL OR cm.created_at >= now() - ($2 || ' days')::interval)
           GROUP BY cm.user_id) s
        JOIN ext_user u ON u.id = s.user_id
        JOIN lounge_member m ON m.user_id = s.user_id AND m.lounge_id = $1
       WHERE m.role = 'student'
       GROUP BY u.nickname ORDER BY score DESC LIMIT 5`, [loungeId, days]);

module.exports = { lounge, lounges, members, categories, categoryRights,
                   posts, comments, leaderboard };
