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
    `SELECT m.id, m.role, m.expires_at, u.nickname
       FROM lounge_member m JOIN ext_user u ON u.id = m.user_id
      WHERE m.lounge_id = $1 AND m.user_id = $2`, [loungeId, userId]);
  if (!m) throw new Denied("이 라운지의 멤버가 아닙니다");
  m.expired = !!(m.expires_at && new Date(m.expires_at) < new Date());
  m.staff = m.role === "instructor" || m.role === "admin";
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
  await membership(loungeId, userId);
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
