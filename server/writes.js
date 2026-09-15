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
