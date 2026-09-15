/* 쓰기. 권한은 여기서만 판정한다.
 *
 * 클라이언트의 can() 은 '무엇을 보여줄지'만 정한다. 브라우저에서 온 요청은
 * 무엇이든 거짓일 수 있으므로 모든 쓰기를 여기서 다시 검사한다.
 */

const { rows, one, pool } = require("./db");
const account = require("./account");

class Denied extends Error {
  constructor(msg) { super(msg); this.code = 403; }
}
class Missing extends Error {
  constructor(msg) { super(msg || "없습니다"); this.code = 404; }
}

/* 이 라운지에서 이 사람이 무엇인가 */
async function membership(loungeId, userId) {
  const m = await one(
    `SELECT m.id, m.role, m.expires_at, m.muted_until, m.muted_reason, u.nickname
       FROM lounge_member m JOIN ext_user u ON u.id = m.user_id
      WHERE m.lounge_id = $1 AND m.user_id = $2`, [loungeId, userId]);
  if (!m) throw new Denied("이 라운지의 멤버가 아닙니다");
  m.expired = !!(m.expires_at && new Date(m.expires_at) < new Date());
  m.staff = m.role === "instructor" || m.role === "admin";
  m.muted = !!(m.muted_until && new Date(m.muted_until) > new Date());
  return m;
}

/* 이 라운지에서 이 카테고리에 글을 쓸 수 있는가.
   카테고리가 이 라운지에 놓여 있지 않으면 아무도 못 쓴다. */
async function writable(loungeId, me, categoryName) {
  const c = await one(
    `SELECT c.id, c.name, c.is_system, c.pass_required,
            lc.student_can_write, lc.instructor_can_write
       FROM category c
       JOIN lounge_category lc ON lc.category_id = c.id AND lc.lounge_id = $1
      WHERE c.name = $2 AND c.deleted_at IS NULL`, [loungeId, categoryName]);
  if (!c) throw new Denied("이 라운지에 없는 카테고리입니다");

  const ok = me.role === "admin"
    || (me.role === "instructor" && c.instructor_can_write)
    || (me.role === "student" && c.student_can_write);
  if (!ok) throw new Denied(`'${c.name}' 은 쓸 수 없습니다`);

  return c;
}

/* 수강이 끝나면 강의에 딸린 것은 막고 라운지 자체는 열어 둔다.
   라운지는 사람이고 강의는 자산이다. */
function checkExpiry(me, category, week) {
  if (!me.expired || me.staff) return;
  if (category.pass_required) throw new Denied("수강 기간이 끝나 피드백권을 쓸 수 없습니다");
  if (week) throw new Denied("수강 기간이 끝나 과제를 제출할 수 없습니다");
}

/* 피드백권. 소유는 프드프 소관이고 라운지는 잔여를 읽고 쓴 사실만 남긴다. */
async function spendPass(loungeId, courseId, me, postId) {
  const p = await account.passes(me_userId(me), courseId);
  const left = p ? p.quota_per - p.used : 0;
  if (left <= 0) throw new Denied("이번 주 피드백권을 다 썼습니다");
  await rows(
    `INSERT INTO feedback_pass_use (lounge_id, user_id, post_id) VALUES ($1, $2, $3)`,
    [loungeId, me_userId(me), postId]);
}
const me_userId = (me) => me.user_id;

/* ---------- 글 ---------- */

async function createPost(loungeId, userId, input) {
  const me = await membership(loungeId, userId);
  me.user_id = userId;
  const L = await one("SELECT course_id FROM lounge WHERE id = $1", [loungeId]);
  if (me.muted) throw new Denied("활동이 정지되어 글을 쓸 수 없습니다" + (me.muted_reason ? " — " + me.muted_reason : ""));
  const cat = await writable(loungeId, me, input.cat);
  checkExpiry(me, cat, input.wk);

  if (!input.title || !input.title.trim()) throw new Denied("제목이 없습니다");

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 과제는 주차마다 한 편이다. 다시 올리면 앞의 것을 지우고 새로 쓴다.
    if (input.overwrite && input.wk) {
      await client.query(
        `UPDATE post SET deleted_at = now(), deleted_by = $1
          WHERE lounge_id = $2 AND user_id = $1 AND category_id = $3
            AND week = $4 AND deleted_at IS NULL`,
        [userId, loungeId, cat.id, input.wk]);
    }

    const r = await client.query(
      `INSERT INTO post (lounge_id, category_id, user_id, author_name, title, body, week)
       VALUES ($1, $2, $3, $4, $5, $6, $7) RETURNING id`,
      [loungeId, cat.id, userId, me.nickname, input.title.trim(),
       input.body || null, input.wk || null]);
    const id = r.rows[0].id;

    for (const [i, a] of (input.mission || []).entries()) {
      await client.query(
        `INSERT INTO post_answer (post_id, seq, question, answer) VALUES ($1, $2, $3, $4)`,
        [id, i + 1, a.q, a.a]);
    }

    if (input.attach) {
      const a = input.attach;
      await client.query(
        `INSERT INTO attachment (post_id, kind, url, label) VALUES ($1, $2, $3, $4)`,
        [id, a.type, a.url || "", a.title || a.label || null]);
    } else {
      /* 첨부를 따로 고르지 않았어도 주소가 있으면 카드로 만든다.
         사람은 링크를 '첨부'한다고 생각하지 않고 그냥 붙여넣는다.
         과제 글은 본문이 비어 있고 답변에 쓰므로 답변까지 훑는다 —
         '블로그 주소를 적으세요' 같은 질문이 실제로 있다. */
      const hay = [input.body || ""]
        .concat((input.mission || []).map((a) => a.a || ""))
        .join("\n");
      const found = firstUrl(hay);
      if (found) {
        const card = await unfurl(found);
        await client.query(
          `INSERT INTO attachment (post_id, kind, url, label) VALUES ($1, $2, $3, $4)`,
          [id, card.kind, card.url, card.title || null]);
      }
    }

    await client.query("COMMIT");

    if (cat.pass_required) await spendPass(loungeId, L.course_id, me, id);
    return { id };
  } catch (e) {
    await client.query("ROLLBACK");
    throw e;
  } finally {
    client.release();
  }
}

async function editPost(loungeId, userId, postId, input) {
  const me = await membership(loungeId, userId);
  const p = await one(
    `SELECT id, user_id FROM post WHERE id = $1 AND lounge_id = $2 AND deleted_at IS NULL`,
    [postId, loungeId]);
  if (!p) throw new Missing();
  if (p.user_id !== userId) throw new Denied("내 글만 고칠 수 있습니다");

  await rows(
    `UPDATE post SET title = $1, body = $2, edited_at = now() WHERE id = $3`,
    [input.title, input.body || null, postId]);
  return { id: postId };
}

async function deletePost(loungeId, userId, postId) {
  const me = await membership(loungeId, userId);
  if (me.role !== "admin") throw new Denied("관리자만 지울 수 있습니다");
  const n = await rows(
    `UPDATE post SET deleted_at = now(), deleted_by = $1
      WHERE id = $2 AND lounge_id = $3 AND deleted_at IS NULL`,
    [userId, postId, loungeId]);
  return { ok: true };
}

/* ---------- 댓글 ---------- */

async function createComment(loungeId, userId, postId, input) {
  const me = await membership(loungeId, userId);   // 만료돼도 댓글은 쓴다
  if (me.muted) throw new Denied("활동이 정지되어 댓글을 쓸 수 없습니다");
  const p = await one(
    `SELECT id FROM post WHERE id = $1 AND lounge_id = $2 AND deleted_at IS NULL`,
    [postId, loungeId]);
  if (!p) throw new Missing();
  if (!input.body || !input.body.trim()) throw new Denied("내용이 없습니다");

  // 답글의 답글은 만들지 않는다. 한 단계에서 멈춘다.
  let parent = null;
  if (input.parentId) {
    parent = await one(
      `SELECT id, parent_id FROM comment WHERE id = $1 AND post_id = $2 AND deleted_at IS NULL`,
      [input.parentId, postId]);
    if (!parent) throw new Missing("원댓글이 없습니다");
    if (parent.parent_id) parent = { id: parent.parent_id };
  }

  const r = await one(
    `INSERT INTO comment (post_id, parent_id, user_id, author_name, body)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [postId, parent ? parent.id : null, userId, me.nickname, input.body.trim()]);

  await rows(`UPDATE post SET comment_count = comment_count + 1 WHERE id = $1`, [postId]);
  return { id: r.id };
}

async function deleteComment(loungeId, userId, commentId) {
  const me = await membership(loungeId, userId);
  const c = await one(
    `SELECT cm.id, cm.user_id, cm.post_id FROM comment cm
       JOIN post p ON p.id = cm.post_id
      WHERE cm.id = $1 AND p.lounge_id = $2 AND cm.deleted_at IS NULL`, [commentId, loungeId]);
  if (!c) throw new Missing();
  if (c.user_id !== userId && me.role !== "admin") throw new Denied("내 댓글만 지울 수 있습니다");

  await rows(`UPDATE comment SET deleted_at = now(), deleted_by = $1 WHERE id = $2`,
    [userId, commentId]);
  await rows(`UPDATE post SET comment_count = greatest(0, comment_count - 1) WHERE id = $1`,
    [c.post_id]);
  return { ok: true };
}

/* ---------- 반응 ---------- */

async function toggleReaction(loungeId, userId, kind, targetId, emoji) {
  const me = await membership(loungeId, userId);
  if (me.muted) throw new Denied("활동이 정지되어 반응할 수 없습니다");
  if (!emoji) throw new Denied("이모지가 없습니다");

  const exists = await one(
    `SELECT id FROM reaction
      WHERE target_kind = $1 AND target_id = $2 AND user_id = $3 AND emoji = $4`,
    [kind, targetId, userId, emoji]);

  if (exists) {
    await rows(`DELETE FROM reaction WHERE id = $1`, [exists.id]);
  } else {
    await rows(
      `INSERT INTO reaction (target_kind, target_id, user_id, emoji) VALUES ($1, $2, $3, $4)`,
      [kind, targetId, userId, emoji]);
  }

  const table = kind === "post" ? "post" : "comment";
  await rows(
    `UPDATE ${table} SET reaction_count =
       (SELECT count(*) FROM reaction r WHERE r.target_kind = $1 AND r.target_id = $2)
      WHERE id = $2`, [kind, targetId]);

  return { on: !exists };
}

module.exports = { createPost, editPost, deletePost, createComment, deleteComment,
                   toggleReaction, Denied, Missing };

/* ============================================================================
   관리 — 이 라운지를 맡은 관리자만.
   역할이 계정이 아니라 라운지에 붙으므로, 옆 강의 관리자는 여기를 만지지 못한다.
   ============================================================================ */

async function admin(loungeId, userId) {
  const me = await membership(loungeId, userId);
  if (me.role !== "admin") throw new Denied("이 라운지의 관리자가 아닙니다");
  return me;
}

/* 역할은 이 라운지에 대해서만 올라가고 내려간다.
   담당 라운지 목록은 이 행들에서 저절로 나온다 — 따로 적지 않는다. */
async function setRole(loungeId, userId, targetUserId, role) {
  await admin(loungeId, userId);
  if (["student", "instructor", "admin"].indexOf(role) < 0) throw new Denied("없는 역할입니다");

  const m = await one(
    `SELECT id, role FROM lounge_member WHERE lounge_id = $1 AND user_id = $2`,
    [loungeId, targetUserId]);
  if (!m) throw new Missing("이 라운지의 멤버가 아닙니다");

  // 마지막 관리자를 내리면 아무도 이 라운지를 못 만진다
  if (m.role === "admin" && role !== "admin") {
    const n = await one(
      `SELECT count(*)::int AS n FROM lounge_member
        WHERE lounge_id = $1 AND role = 'admin' AND user_id <> $2`, [loungeId, targetUserId]);
    if (!n.n) throw new Denied("마지막 관리자는 내릴 수 없습니다");
  }

  await rows(`UPDATE lounge_member SET role = $1 WHERE id = $2`, [role, m.id]);
  return { ok: true };
}

/* 카테고리는 전역 풀이다. 만들면 이 라운지에 바로 붙여 쓸 수 있게 놓는다. */
async function addCategory(loungeId, userId, name) {
  await admin(loungeId, userId);
  name = (name || "").trim();
  if (!name) throw new Denied("이름이 없습니다");
  if (name === "전체") throw new Denied("‘전체’ 는 필터 바가 쓰는 이름입니다");
  if (name.length > 40) throw new Denied("이름이 너무 깁니다");

  const dup = await one(`SELECT id FROM category WHERE name = $1 AND deleted_at IS NULL`, [name]);
  if (dup) throw new Denied(`‘${name}’ 은 이미 있습니다`);

  const c = await one(`INSERT INTO category (name) VALUES ($1) RETURNING id`, [name]);

  // 기본 노출 상한을 넘으면 '필터 더보기' 안으로 들어간다
  const cnt = await one(
    `SELECT count(*)::int AS n FROM lounge_category
      WHERE lounge_id = $1 AND placement = 'show'`, [loungeId]);
  const placement = cnt.n < FILTER_MAX ? "show" : "more";

  await rows(
    `INSERT INTO lounge_category (lounge_id, category_id, placement, sort)
     VALUES ($1, $2, $3, $4)`, [loungeId, c.id, placement, cnt.n]);

  return { id: c.id, placement };
}

const FILTER_MAX = 7;

/* 지우는 조건은 화면이 보여주는 것과 같아야 한다.
   기본 기능이 아니고 · 글이 없고 · 어느 라운지도 쓰지 않을 때만. */
async function removeCategory(loungeId, userId, categoryId) {
  await admin(loungeId, userId);
  const c = await one(
    `SELECT id, name, is_system FROM category WHERE id = $1 AND deleted_at IS NULL`, [categoryId]);
  if (!c) throw new Missing();
  if (c.is_system) throw new Denied(`‘${c.name}’ 은 뒤에 동작이 붙어 있어 지울 수 없습니다`);

  const used = await one(
    `SELECT (SELECT count(*)::int FROM post WHERE category_id = $1 AND deleted_at IS NULL) AS posts,
            (SELECT count(*)::int FROM lounge_category WHERE category_id = $1) AS lounges`,
    [categoryId]);
  if (used.posts) throw new Denied(`글이 ${used.posts}개 남아 있습니다`);
  if (used.lounges) throw new Denied("아직 쓰는 라운지가 있습니다");

  await rows(`UPDATE category SET deleted_at = now() WHERE id = $1`, [categoryId]);
  return { ok: true };
}

/* 기본 노출 / 필터 더보기 / 미사용. 행이 없으면 미사용이다. */
async function setPlacement(loungeId, userId, categoryId, placement) {
  await admin(loungeId, userId);
  if (["show", "more", "off"].indexOf(placement) < 0) throw new Denied("없는 자리입니다");

  if (placement === "off") {
    await rows(`DELETE FROM lounge_category WHERE lounge_id = $1 AND category_id = $2`,
      [loungeId, categoryId]);
    return { ok: true };
  }

  if (placement === "show") {
    const cnt = await one(
      `SELECT count(*)::int AS n FROM lounge_category
        WHERE lounge_id = $1 AND placement = 'show' AND category_id <> $2`,
      [loungeId, categoryId]);
    // 칩 줄이 접히면 필터가 있다는 사실 자체가 안 보인다
    if (cnt.n >= FILTER_MAX) throw new Denied(`기본 노출은 ${FILTER_MAX}개까지입니다`);
  }

  const sort = await one(
    `SELECT coalesce(max(sort), -1) + 1 AS s FROM lounge_category
      WHERE lounge_id = $1 AND placement = $2`, [loungeId, placement]);

  await rows(
    `INSERT INTO lounge_category (lounge_id, category_id, placement, sort)
     VALUES ($1, $2, $3, $4)
     ON CONFLICT (lounge_id, category_id)
     DO UPDATE SET placement = $3, sort = $4`,
    [loungeId, categoryId, placement, sort.s]);
  return { ok: true };
}

/* 카테고리 × 역할. 관리자는 항상 쓸 수 있으므로 칸을 두지 않는다. */
async function setRights(loungeId, userId, categoryId, rights) {
  await admin(loungeId, userId);
  const n = await rows(
    `UPDATE lounge_category SET student_can_write = $1, instructor_can_write = $2
      WHERE lounge_id = $3 AND category_id = $4`,
    [!!rights.student, !!rights.instructor, loungeId, categoryId]);
  return { ok: true };
}

module.exports.setRole = setRole;
module.exports.addCategory = addCategory;
module.exports.removeCategory = removeCategory;
module.exports.setPlacement = setPlacement;
module.exports.setRights = setRights;

/* ---------- 강의 게시 ----------
   구분이 하나 있다.

   · 어느 주차를 라운지에서 열지는 **라운지가 정한다.** 커뮤니티 운영이지
     강의 콘텐츠가 아니다. 그래서 lounge_week 에 쓴다.
   · 주차와 강 자체는 **프드프가 원본이다.** 로컬(PUDUFU_MODE=local)에서는
     비계인 ext_* 에 직접 써서 혼자 개발할 수 있게 하지만, 운영에서는 막는다 —
     여기서 고쳐 봐야 다음 동기화 때 덮인다. */

const config = require("./config");
const { unfurl, firstUrl } = require("./unfurl");

async function setWeekPublished(loungeId, userId, week, published) {
  await admin(loungeId, userId);
  await rows(
    `INSERT INTO lounge_week (lounge_id, week, published) VALUES ($1, $2, $3)
     ON CONFLICT (lounge_id, week) DO UPDATE SET published = $3, updated_at = now()`,
    [loungeId, week, !!published]);
  return { ok: true };
}

function onlyLocal() {
  if (config.pudufu.mode !== "local") {
    throw new Denied("강의 내용은 프드프에서 만듭니다. 여기서 고치면 다음 동기화 때 덮입니다");
  }
}

async function addLesson(loungeId, userId, input) {
  await admin(loungeId, userId);
  onlyLocal();
  const L = await one("SELECT course_id FROM lounge WHERE id = $1", [loungeId]);
  if (!input.chapter || !input.title) throw new Denied("챕터와 강 제목은 있어야 합니다");

  const seq = await one(
    `SELECT coalesce(max(seq), 0) + 1 AS s FROM ext_lesson WHERE course_id = $1 AND week = $2`,
    [L.course_id, input.week]);

  const r = await one(
    `INSERT INTO ext_lesson (course_id, week, seq, chapter, title, duration, video_url, doc, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, now()) RETURNING id`,
    [L.course_id, input.week, seq.s, input.chapter, input.title,
     input.duration || null, input.duration ? "" : null, input.doc || null]);
  return { id: r.id, seq: seq.s };
}

async function addWeek(loungeId, userId, input) {
  await admin(loungeId, userId);
  onlyLocal();
  const L = await one(
    `SELECT c.id AS course_id, c.weeks
       FROM ext_course c JOIN lounge l ON l.course_id = c.id
      WHERE l.id = $1`, [loungeId]);
  if (!input.title) throw new Denied("강의 제목은 있어야 합니다");
  if (!input.mission) throw new Denied("과제 미션 한 줄은 있어야 합니다");
  const qs = (input.qs || []).filter((q) => q.q && q.q.trim());
  if (!qs.length) throw new Denied("질문이 하나는 있어야 합니다");
  if (qs.length > 8) throw new Denied("질문은 8개까지입니다");

  const next = await one(
    `SELECT coalesce(max(week), 0) + 1 AS w FROM ext_week WHERE course_id = $1`, [L.course_id]);
  const wk = next.w;

  await rows(`INSERT INTO ext_week (course_id, week, title, synced_at) VALUES ($1, $2, $3, now())`,
    [L.course_id, wk, input.title]);

  for (const [i, q] of qs.entries()) {
    await rows(
      `INSERT INTO ext_mission (course_id, week, title, seq, question, hint, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [L.course_id, wk, `${wk}주차 미션 · ${input.mission}`, i + 1, q.q.trim(), (q.hint || "").trim() || null]);
  }

  await rows(`UPDATE ext_course SET weeks = greatest(weeks, $2) WHERE id = $1`, [L.course_id, wk]);
  // 새 주차는 비공개로 연다. 열 준비가 되면 관리자가 게시한다.
  await rows(`INSERT INTO lounge_week (lounge_id, week, published) VALUES ($1, $2, false)
              ON CONFLICT (lounge_id, week) DO UPDATE SET published = false`, [loungeId, wk]);

  return { week: wk };
}

module.exports.setWeekPublished = setWeekPublished;
module.exports.addLesson = addLesson;
module.exports.addWeek = addWeek;

/* ---------- 조회 ----------
   사람 단위로 한 번만 센다. 같은 사람이 다시 열어도 올라가지 않는다. */

async function markView(loungeId, userId, postId) {
  await membership(loungeId, userId);
  const p = await one(
    `SELECT id FROM post WHERE id = $1 AND lounge_id = $2 AND deleted_at IS NULL`,
    [postId, loungeId]);
  if (!p) throw new Missing();

  /* 처음 보는 사람일 때만 하나 올린다.
     다시 세지 않는 이유 — post_view 는 라운지가 열린 뒤의 기록뿐이라,
     세어 버리면 그 전에 쌓인 수가 사라진다. */
  const fresh = await one(
    `INSERT INTO post_view (post_id, user_id) VALUES ($1, $2)
     ON CONFLICT (post_id, user_id) DO NOTHING
     RETURNING post_id`, [postId, userId]);

  const n = fresh
    ? await one(`UPDATE post SET view_count = view_count + 1 WHERE id = $1 RETURNING view_count`, [postId])
    : await one(`SELECT view_count FROM post WHERE id = $1`, [postId]);

  return { views: n.view_count };
}

/* ---------- 강의 시청 ----------
   원본은 프드프다. local 에서는 비계인 ext_watch 에 직접 쓰고,
   remote 에서는 프드프에 남긴다(docs/API.md 1부 ⑥). 둘 다 라운지는 쌓지 않는다. */

async function markWatched(loungeId, userId, lessonId, done) {
  await membership(loungeId, userId);

  if (config.pudufu.mode === "remote") {
    const res = await fetch(config.pudufu.base + "/api/lounge/watch", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Lounge-Key": config.pudufu.key },
      body: JSON.stringify({ user_id: userId, lesson_id: lessonId, is_complete: !!done })
    });
    if (!res.ok) throw new Denied("프드프에 시청 기록을 남기지 못했습니다");
  } else if (done) {
    await rows(
      `INSERT INTO ext_watch (user_id, lesson_id, is_complete, synced_at)
       VALUES ($1, $2, true, now())
       ON CONFLICT (user_id, lesson_id)
       DO UPDATE SET is_complete = true, watched_at = now(), synced_at = now()`,
      [userId, lessonId]);
  } else {
    await rows(`DELETE FROM ext_watch WHERE user_id = $1 AND lesson_id = $2`, [userId, lessonId]);
  }

  return { ok: true };
}

module.exports.markView = markView;
module.exports.markWatched = markWatched;

/* ---------- 상단 고정 ----------
   고정은 위계가 아니라 순서다. 걸린 필터 안에서만 맨 위로 온다.
   상한을 두는 이유 — 다섯 개가 고정되면 피드 위쪽이 통째로 공지판이 된다.
   카테고리 칩 7개 상한과 같은 이유다. */

const PIN_MAX = 3;

async function setPinned(loungeId, userId, postId, pinned) {
  await admin(loungeId, userId);

  const p = await one(
    `SELECT id, is_pinned FROM post
      WHERE id = $1 AND lounge_id = $2 AND deleted_at IS NULL`, [postId, loungeId]);
  if (!p) throw new Missing();

  if (pinned && !p.is_pinned) {
    const n = await one(
      `SELECT count(*)::int AS n FROM post
        WHERE lounge_id = $1 AND is_pinned AND deleted_at IS NULL`, [loungeId]);
    if (n.n >= PIN_MAX) {
      throw new Denied(`고정은 ${PIN_MAX}개까지입니다. 하나를 먼저 내리세요`);
    }
  }

  await rows(`UPDATE post SET is_pinned = $1 WHERE id = $2`, [!!pinned, postId]);
  return { pinned: !!pinned };
}

module.exports.setPinned = setPinned;
module.exports.PIN_MAX = PIN_MAX;

/* ---------- 과제 양식 ----------
   이미 낸 과제는 post_answer 에 그때의 질문 문구를 스냅샷으로 갖고 있다.
   그래서 양식을 고쳐도 과거 제출물은 그대로 남는다 — 무엇에 답한 글이었는지가
   보존된다. 그게 아니면 양식을 못 고칠 뻔했다. */

async function setMission(loungeId, userId, week, input) {
  await admin(loungeId, userId);
  onlyLocal();

  const L = await one(
    `SELECT c.id AS course_id FROM ext_course c JOIN lounge l ON l.course_id = c.id
      WHERE l.id = $1`, [loungeId]);

  if (!input.mission) throw new Denied("과제 미션 한 줄은 있어야 합니다");
  if (!input.qs || !input.qs.length) throw new Denied("질문이 하나는 있어야 합니다");
  if (input.qs.length > 8) throw new Denied("질문은 8개까지입니다");
  if (input.qs.some((q) => !q.q || !q.q.trim())) throw new Denied("빈 질문은 둘 수 없습니다");

  const title = `${week}주차 미션 · ${input.mission}`;

  await rows(`DELETE FROM ext_mission WHERE course_id = $1 AND week = $2`, [L.course_id, week]);
  for (const [i, q] of input.qs.entries()) {
    await rows(
      `INSERT INTO ext_mission (course_id, week, title, seq, question, hint, synced_at)
       VALUES ($1, $2, $3, $4, $5, $6, now())`,
      [L.course_id, week, title, i + 1, q.q.trim(), (q.hint || "").trim() || null]);
  }

  const used = await one(
    `SELECT count(*)::int AS n FROM post p JOIN category c ON c.id = p.category_id
      WHERE p.lounge_id = $1 AND p.week = $2 AND c.name = '과제' AND p.deleted_at IS NULL`,
    [loungeId, week]);

  return { week: week, title: title, alreadySubmitted: used.n };
}

module.exports.setMission = setMission;

/* ---------- 피드백권 지급 ----------
   권의 소유는 프드프 소관이라는 원칙은 그대로다. 다만 라운지 관리자가
   '이번 주만 한 장 더' 를 줄 수 있어야 운영이 된다. local 에서는 캐시를
   직접 고치고, remote 에서는 프드프에 요청한다. */

async function grantPass(loungeId, userId, targetUserId, n) {
  await admin(loungeId, userId);
  const L = await one("SELECT course_id FROM lounge WHERE id = $1", [loungeId]);
  const add = Math.max(1, Math.min(10, Number(n) || 1));

  if (config.pudufu.mode === "remote") {
    const res = await fetch(config.pudufu.base + "/api/lounge/passes/grant", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Lounge-Key": config.pudufu.key },
      body: JSON.stringify({ user_id: targetUserId, course_id: L.course_id, count: add })
    });
    if (!res.ok) throw new Denied("프드프가 지급을 받지 않았습니다");
    return { ok: true, granted: add };
  }

  /* 쓴 횟수를 줄이는 방식으로 준다. 주기당 지급 수를 늘리면 다음 주에도
     늘어난 채로 남는다 — '이번 주만' 이 되지 않는다. */
  const r = await one(
    `UPDATE ext_feedback_pass SET used = greatest(0, used - $3), synced_at = now()
      WHERE user_id = $1 AND course_id = $2
      RETURNING quota_per, used`, [targetUserId, L.course_id, add]);
  if (!r) throw new Missing("이 사람의 피드백권 기록이 없습니다");

  return { ok: true, granted: add, left: r.quota_per - r.used };
}

/* ---------- 라운지 소개 ---------- */

async function setLounge(loungeId, userId, input) {
  await admin(loungeId, userId);
  await rows(
    `UPDATE lounge SET name = coalesce($2, name), intro = $3, banner_url = $4 WHERE id = $1`,
    [loungeId, (input.name || "").trim() || null,
     (input.intro || "").trim() || null, (input.banner || "").trim() || null]);
  return { ok: true };
}

/* ---------- 카테고리 이름 ----------
   글의 카테고리는 id 로 이어져 있으므로 이름을 바꿔도 글이 흩어지지 않는다. */

async function renameCategory(loungeId, userId, categoryId, name) {
  await admin(loungeId, userId);
  name = (name || "").trim();
  if (!name) throw new Denied("이름이 없습니다");
  if (name === "전체") throw new Denied("‘전체’ 는 필터 바가 쓰는 이름입니다");

  const c = await one(`SELECT id, name, is_system FROM category WHERE id = $1 AND deleted_at IS NULL`, [categoryId]);
  if (!c) throw new Missing();
  if (c.is_system) throw new Denied(`‘${c.name}’ 은 뒤에 동작이 붙어 있어 이름을 바꾸지 않습니다`);

  const dup = await one(
    `SELECT id FROM category WHERE name = $1 AND deleted_at IS NULL AND id <> $2`, [name, categoryId]);
  if (dup) throw new Denied(`‘${name}’ 은 이미 있습니다`);

  await rows(`UPDATE category SET name = $1 WHERE id = $2`, [name, categoryId]);
  return { ok: true, name: name };
}

module.exports.grantPass = grantPass;
module.exports.setLounge = setLounge;
module.exports.renameCategory = renameCategory;

/* ---------- 활동 정지 ----------
   강퇴가 아니다. 돈을 낸 사람을 쫓아낼 수는 없으므로 읽기는 두고 쓰기만 멈춘다.
   기한이 지나면 저절로 풀린다 — 영구 정지는 사실상 환불 문제가 된다. */

async function setMuted(loungeId, userId, targetUserId, days, reason) {
  const me = await admin(loungeId, userId);
  if (Number(targetUserId) === Number(userId)) throw new Denied("자기 자신은 정지할 수 없습니다");

  const t = await one(
    `SELECT id, role FROM lounge_member WHERE lounge_id = $1 AND user_id = $2`,
    [loungeId, targetUserId]);
  if (!t) throw new Missing("이 라운지의 멤버가 아닙니다");
  if (t.role === "admin") throw new Denied("관리자는 정지할 수 없습니다. 먼저 역할을 내리세요");

  const n = Number(days) || 0;
  if (n <= 0) {
    await rows(`UPDATE lounge_member SET muted_until = NULL, muted_reason = NULL WHERE id = $1`, [t.id]);
    return { muted: false };
  }
  if (n > 90) throw new Denied("90일까지만 정지할 수 있습니다");

  const r = await one(
    `UPDATE lounge_member SET muted_until = now() + ($2 || ' days')::interval,
            muted_reason = $3 WHERE id = $1 RETURNING muted_until`,
    [t.id, String(n), (reason || "").slice(0, 200) || null]);
  return { muted: true, until: r.muted_until };
}

/* ---------- 신고 ----------
   알림이 없으므로 신고는 관리자가 게시물 관리에서 본다.
   같은 사람이 여러 번 눌러도 한 건이다. */

async function reportPost(loungeId, userId, postId, reason) {
  await membership(loungeId, userId);
  const p = await one(
    `SELECT id, user_id FROM post WHERE id = $1 AND lounge_id = $2 AND deleted_at IS NULL`,
    [postId, loungeId]);
  if (!p) throw new Missing();
  if (Number(p.user_id) === Number(userId)) throw new Denied("내 글은 신고하지 않습니다");

  await rows(
    `INSERT INTO post_report (post_id, user_id, reason) VALUES ($1, $2, $3)
     ON CONFLICT (post_id, user_id) DO UPDATE SET reason = $3, created_at = now()`,
    [postId, userId, (reason || "").slice(0, 200) || null]);
  return { ok: true };
}

module.exports.setMuted = setMuted;
module.exports.reportPost = reportPost;
