/* SQL 은 전부 여기 모은다. 코드 곳곳에 흩어지면 DB 를 바꿀 때 찾아다녀야 한다.
   Postgres 전용 문법은 아껴 쓴다 — DISTINCT ON · 배열 · RETURNING 남용 없음. */

const { rows, one } = require("./db");

const lounge = (id) =>
  one(`SELECT id, course_id, name, intro, todo, intro_att FROM lounge WHERE id = $1`, [id]);

const lounges = () =>
  rows(`SELECT l.id, l.name,
               (SELECT json_agg(json_build_object('name', c.name, 'placement', lc.placement, 'sort', lc.sort)
                                ORDER BY lc.placement, lc.sort)
                  FROM lounge_category lc JOIN category c ON c.id = lc.category_id
                 WHERE lc.lounge_id = l.id AND c.deleted_at IS NULL) AS chips
          FROM lounge l ORDER BY l.id`);

/* 이 사람이 이 라운지를 볼 수 있는가. 수강이 끝났어도 읽기는 열어 둔다 —
   만료는 강의 시청을 막는 것이지 지난 대화를 지우는 것이 아니다. */
const memberOf = (loungeId, userId) =>
  one(`SELECT m.role, u.nickname FROM lounge_member m
         JOIN ext_user u ON u.id = m.user_id
        WHERE m.lounge_id = $1 AND m.user_id = $2`, [loungeId, userId]);

const members = (loungeId, courseId) =>
  rows(`SELECT m.user_id, u.nickname, m.role, m.cohort, m.week,
               fp.quota_per, fp.used,
               m.joined_at, m.expires_at, m.last_seen_at, m.muted_until, m.muted_reason,
               (SELECT min(p.created_at) FROM post p JOIN category c ON c.id = p.category_id
                 WHERE p.user_id = m.user_id AND p.lounge_id = m.lounge_id
                   AND c.name = '과제' AND p.deleted_at IS NULL) AS first_submit_at,
               (SELECT json_agg(x.lounge_id ORDER BY x.lounge_id)
                  FROM lounge_member x WHERE x.user_id = m.user_id
                   AND x.role IN ('instructor','admin')) AS staff_of
          FROM lounge_member m
          JOIN ext_user u ON u.id = m.user_id
     LEFT JOIN ext_feedback_pass fp ON fp.user_id = m.user_id AND fp.course_id = $2
         WHERE m.lounge_id = $1
         ORDER BY m.role, m.id`, [loungeId, courseId]);

const categories = () =>
  rows(`SELECT id, name, is_system, pass_required
          FROM category WHERE deleted_at IS NULL ORDER BY id`);

/* 라운지별 쓰기 권한. 배치와 같은 표에 있다. */
const categoryRights = (loungeId) =>
  rows(`SELECT c.name, lc.student_can_write, lc.instructor_can_write
          FROM lounge_category lc JOIN category c ON c.id = lc.category_id
         WHERE lc.lounge_id = $1 AND c.deleted_at IS NULL`, [loungeId]);

/* 첫 화면에 글을 전부 실어 보내지 않는다. 150편이면 250KB 가 되고,
   그걸 다 그리면 화면이 90 뭉치만큼 길어진다. 최신 것부터 한 묶음씩 준다.

   커서는 (쓴 시각, id) 쌍이다. 시각만으로는 같은 초에 올라온 두 글에서
   한 편이 건너뛰어진다. id 만으로는 시각 순서와 어긋날 수 있다.
   고정 글은 여기서 따로 다루지 않는다 — 어느 묶음에 있든 화면이 위로 올린다. */
const PAGE = 30;

const posts = (loungeId, viewerId, before, limit, ids) =>
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
               (SELECT json_agg(json_build_object('kind', t.kind, 'url', t.url, 'label', t.label)
                                 ORDER BY t.sort)
                  FROM attachment t WHERE t.post_id = p.id) AS attach,
               (SELECT count(*)::int FROM post_report pr WHERE pr.post_id = p.id) AS reports,
               EXISTS (SELECT 1 FROM post_report pr WHERE pr.post_id = p.id AND pr.user_id = $2) AS reported,
               (SELECT count(*)::int FROM comment cm
                 WHERE cm.post_id = p.id AND cm.deleted_at IS NULL) AS comment_n
          FROM post p JOIN category c ON c.id = p.category_id
         WHERE p.lounge_id = $1 AND p.deleted_at IS NULL
           AND ($3::timestamptz IS NULL
                OR (p.created_at, p.id) < ($3::timestamptz, $4::bigint))
           AND ($6::bigint[] IS NULL OR p.id = ANY($6))
         ORDER BY p.created_at DESC, p.id DESC
         LIMIT $5`,
    [loungeId, viewerId,
     before ? before.at : null, before ? before.id : null,
     limit || PAGE, ids && ids.length ? ids : null]);

/* 고정 글은 오래됐어도 맨 위에 서야 한다. 몇 편 없으므로 첫 묶음에 얹어 보낸다. */
const pinnedPosts = (loungeId, viewerId) =>
  rows(`SELECT id FROM post
         WHERE lounge_id = $1 AND is_pinned = true AND deleted_at IS NULL
         ORDER BY created_at DESC`, [loungeId]);

/* 대시보드와 게시물 관리는 '전부' 를 세야 한다 — 이번 주 미제출, 어제 올라온 글,
   답 없는 과제. 한 묶음만 보고 세면 숫자가 틀린다. 그래서 가벼운 목록을 따로 준다:
   본문 · 첨부 · 댓글 내용 없이 세는 데 필요한 것만. 스태프에게만 보낸다. */
const postIndex = (loungeId) =>
  rows(`SELECT p.id, p.title, p.user_id, p.author_name, p.week, p.created_at,
               c.name AS category, p.is_pinned, p.view_count,
               (SELECT count(*)::int FROM comment cm
                 WHERE cm.post_id = p.id AND cm.deleted_at IS NULL) AS comment_n,
               (SELECT count(*)::int FROM reaction r
                 WHERE r.target_kind = 'post' AND r.target_id = p.id) AS react_n,
               (SELECT count(*)::int FROM post_report pr WHERE pr.post_id = p.id) AS reports
          FROM post p JOIN category c ON c.id = p.category_id
         WHERE p.lounge_id = $1 AND p.deleted_at IS NULL
         ORDER BY p.created_at DESC`, [loungeId]);

/* id 몇 개를 콕 집어 온다. 고정 글과 ?p=<id> 딥링크가 쓴다. */
const postsByIds = (loungeId, viewerId, ids) =>
  ids && ids.length ? posts(loungeId, viewerId, null, ids.length, ids) : Promise.resolve([]);

/* 레일의 '몇 명 중 몇 명 제출'. 화면이 들고 있는 글만 세면 페이지를 넘길 때마다
   숫자가 달라진다. 세는 일은 DB 가 한다. */
const weekSubmit = (loungeId) =>
  one(`SELECT (SELECT count(*)::int FROM lounge_member
                WHERE lounge_id = $1 AND role = 'student') AS students,
              (SELECT count(DISTINCT p.user_id)::int
                 FROM post p JOIN category c ON c.id = p.category_id
                WHERE p.lounge_id = $1 AND c.name = '과제'
                  AND p.deleted_at IS NULL
                  AND p.created_at >= now() - interval '7 days') AS submitted`, [loungeId]);

/* 내가 낸 과제는 묶음 밖에 있어도 알아야 한다. 안 그러면 오래전에 낸 주차가
   '미제출' 로 보이고, 다시 내면 앞의 것이 덮여 사라진다. */
const myMissions = (loungeId, userId) =>
  rows(`SELECT p.id, p.week, p.title, p.created_at,
               (SELECT json_agg(json_build_object('q', a.question, 'a', a.answer) ORDER BY a.seq)
                  FROM post_answer a WHERE a.post_id = p.id) AS answers,
               (SELECT json_agg(json_build_object('kind', t.kind, 'url', t.url, 'label', t.label)
                                 ORDER BY t.sort)
                  FROM attachment t WHERE t.post_id = p.id) AS attach
          FROM post p JOIN category c ON c.id = p.category_id
         WHERE p.lounge_id = $1 AND p.user_id = $2 AND c.name = '과제'
           AND p.deleted_at IS NULL
         ORDER BY p.week`, [loungeId, userId]);

/* 검색은 DB 가 한다. 화면에 실린 묶음만 뒤지면 30편 밖의 글은 없는 것이 된다.
   pg_trgm 인덱스가 있어서 한글 부분 일치도 걸린다. 토큰은 모두 포함(AND). */
const search = (loungeId, viewerId, tokens, limit) => {
  const conds = tokens.map((_, i) => `(p.title ILIKE $${i + 3} OR p.body ILIKE $${i + 3}
      OR p.author_name ILIKE $${i + 3} OR c.name ILIKE $${i + 3}
      OR EXISTS (SELECT 1 FROM post_answer a
                  WHERE a.post_id = p.id
                    AND (a.question ILIKE $${i + 3} OR a.answer ILIKE $${i + 3})))`);
  return rows(
    `SELECT p.id, p.title, p.body, p.week, p.author_name, c.name AS category, p.created_at,
            (p.user_id = $2) AS mine
       FROM post p JOIN category c ON c.id = p.category_id
      WHERE p.lounge_id = $1 AND p.deleted_at IS NULL AND ${conds.join(" AND ")}
      ORDER BY p.created_at DESC
      LIMIT ${Number(limit) || 40}`,
    [loungeId, viewerId].concat(tokens.map((t) => "%" + t + "%")));
};

/* 댓글도 같은 방식으로. 결과에는 어느 글에 달린 것인지 같이 준다. */
const searchComments = (loungeId, tokens, limit) => {
  const conds = tokens.map((_, i) => `(cm.body ILIKE $${i + 2} OR cm.author_name ILIKE $${i + 2})`);
  return rows(
    `SELECT cm.id, cm.post_id, cm.parent_id, cm.author_name, cm.body, cm.created_at,
            p.title AS post_title, c.name AS category
       FROM comment cm
       JOIN post p ON p.id = cm.post_id
       JOIN category c ON c.id = p.category_id
      WHERE p.lounge_id = $1 AND cm.deleted_at IS NULL AND p.deleted_at IS NULL
        AND ${conds.join(" AND ")}
      ORDER BY cm.created_at DESC
      LIMIT ${Number(limit) || 40}`,
    [loungeId].concat(tokens.map((t) => "%" + t + "%")));
};

/* 남은 글이 더 있는지. 없는데 '더 보기' 가 떠 있으면 눌러 보게 된다. */
const postCount = (loungeId) =>
  one(`SELECT count(*)::int AS n FROM post WHERE lounge_id = $1 AND deleted_at IS NULL`, [loungeId]);

const comments = (loungeId, viewerId, postIds) =>
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
           AND ($3::bigint[] IS NULL OR cm.post_id = ANY($3))
         ORDER BY cm.created_at`, [loungeId, viewerId, postIds || null]);

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

module.exports = { lounge, lounges, memberOf, members, categories, categoryRights,
                   posts, postsByIds, pinnedPosts, postIndex, postCount, weekSubmit,
                   myMissions, comments, search, searchComments, received, topPosts, weekFlags, PAGE };
