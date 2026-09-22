/* 쓰기. 권한은 여기서만 판정한다.
 *
 * 클라이언트의 can() 은 '무엇을 보여줄지'만 정한다. 브라우저에서 온 요청은
 * 무엇이든 거짓일 수 있으므로 모든 쓰기를 여기서 다시 검사한다.
 */

const { rows, one, pool } = require("./db");
const account = require("./account");

const ATTACH_MAX = 10;   // 한 글에 붙일 수 있는 사진 장수

/* id 비교는 언제나 이걸로 한다. bigint 는 드라이버가 문자열로 주므로
   === 로 비교하면 소유 판정이 조용히 전부 거짓이 된다. */
const same = (a, b) => Number(a) === Number(b);

/* 라운지가 붙어 있는 강의. 원본은 lounge.course_id 다 — ext_course 는 사본이라
   동기화 전에는 비어 있을 수 있고, 그걸 거쳐 찾으면 아무것도 못 고친다. */
async function courseOf(loungeId) {
  const l = await one(`SELECT course_id, name FROM lounge WHERE id = $1`, [loungeId]);
  if (!l) throw new Missing("없는 라운지입니다");
  return { course_id: l.course_id, name: l.name };
}

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
function checkExpiry(me, category, taskId) {
  if (!me.expired || me.staff) return;
  if (category.pass_required) throw new Denied("수강 기간이 끝나 피드백권을 쓸 수 없습니다");
  if (taskId) throw new Denied("수강 기간이 끝나 과제를 제출할 수 없습니다");
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

  /* 과제 글은 어느 레슨의 어느 과제에 낸 답인지가 있어야 한다. 과제는 이 라운지 것이어야 한다. */
  let task = null;
  if (cat.name === "과제" || input.taskId) {
    task = await one(
      `SELECT id, lesson_id, title FROM lesson_task
        WHERE id = $1 AND lounge_id = $2 AND deleted_at IS NULL`, [Number(input.taskId) || 0, loungeId]);
    if (!task) throw new Denied("어느 과제에 내는지 골라야 합니다");
    if (cat.name !== "과제") throw new Denied("과제는 '과제' 카테고리로 냅니다");
  }
  checkExpiry(me, cat, task && task.id);

  if (!input.title || !input.title.trim()) throw new Denied("제목이 없습니다");

  /* 게시가 느리면 사람은 단추를 다시 누른다. 화면이 단추를 잠가도 두 요청이
     이미 떠났을 수 있다. 같은 사람이 15초 안에 같은 제목 · 본문을 보내면 두 번째는
     새 글이 아니라 첫 글의 답이다. */
  const twin = await one(
    `SELECT id FROM post
      WHERE lounge_id = $1 AND user_id = $2 AND title = $3 AND coalesce(body, '') = $4
        AND deleted_at IS NULL AND created_at > now() - interval '15 seconds'
      ORDER BY id DESC LIMIT 1`,
    [loungeId, userId, input.title.trim(), input.body || ""]);
  if (twin) return { id: twin.id, attach: [], duplicate: true };

  /* 화면이 글 한 편에 열쇠 하나를 붙여 보낸다. 같은 열쇠가 동시에 두 번 와도
     고유 인덱스가 하나만 들여보낸다 — 15초 조회는 둘이 동시에 오면 못 잡는다. */
  const key = String(input.key || "").slice(0, 40) || null;
  if (key) {
    const had = await one(`SELECT id FROM post WHERE client_key = $1`, [key]);
    if (had) return { id: had.id, attach: [], duplicate: true };
  }

  const client = await pool.connect();
  try {
    await client.query("BEGIN");

    // 과제 하나에 한 사람이 내는 글은 한 편이다. 다시 올리면 앞의 것을 지우고 새로 쓴다.
    if (input.overwrite && task) {
      await client.query(
        `UPDATE post SET deleted_at = now(), deleted_by = $1
          WHERE lounge_id = $2 AND user_id = $1 AND task_id = $3 AND deleted_at IS NULL`,
        [userId, loungeId, task.id]);
    }

    const r = await client.query(
      `INSERT INTO post (lounge_id, category_id, user_id, author_name, title, body, task_id, client_key)
       VALUES ($1, $2, $3, $4, $5, $6, $7, $8) RETURNING id`,
      [loungeId, cat.id, userId, me.nickname, input.title.trim(),
       input.body || null, task ? task.id : null, key]);
    const id = r.rows[0].id;

    for (const [i, a] of (input.mission || []).entries()) {
      await client.query(
        `INSERT INTO post_answer (post_id, seq, question, answer) VALUES ($1, $2, $3, $4)`,
        [id, i + 1, a.q, a.a]);
    }

    /* 사진은 여러 장 붙는다. 한 장만 받으면 '전후 비교' 같은 글을 쓸 수 없다.
       링크·영상 카드는 성질상 하나다 — 본문에서 처음 나온 주소 하나만 편다. */
    let files = [].concat(input.attach || []).filter(Boolean).slice(0, ATTACH_MAX);
    let pending = null;
    if (files.length) {
      for (const [i, a] of files.entries()) {
        await client.query(
          `INSERT INTO attachment (post_id, kind, url, label, sort) VALUES ($1, $2, $3, $4, $5)`,
          [id, a.type, a.url || "", a.title || a.label || null, i]);
      }
    } else {
      /* 첨부를 따로 고르지 않았어도 주소가 있으면 카드로 만든다.
         사람은 링크를 '첨부'한다고 생각하지 않고 그냥 붙여넣는다.
         과제 글은 본문이 비어 있고 답변에 쓰므로 답변까지 훑는다 —
         '블로그 주소를 적으세요' 같은 질문이 실제로 있다. */
      const hay = [input.body || ""]
        .concat((input.mission || []).map((a) => a.a || ""))
        .join("\n");
      /* 카드는 여기서 펴지 않는다. 남의 서버를 읽는 일은 느릴 수 있고, 그동안 글은
         이미 저장돼 있는데 화면은 실패로 보였다(게시 30초 · 오류 · 새로고침하면 있음).
         글은 바로 응답하고, 화면이 attachCard 를 따로 불러 카드를 붙인다. */
      pending = firstUrl(hay);
    }

    await client.query("COMMIT");

    if (cat.pass_required) await spendPass(loungeId, L.course_id, me, id);

    /* 붙은 첨부를 그대로 돌려준다. card 는 아직 펴지 않은 주소다 — 화면이 이어서 부른다. */
    return { id, attach: files, card: pending || undefined };
  } catch (e) {
    await client.query("ROLLBACK");
    if (e.code === "23505") {   // 같은 열쇠가 먼저 들어갔거나, 이 과제에 낸 글이 이미 있다
      const had = key ? await one(`SELECT id FROM post WHERE client_key = $1`, [key]) : null;
      if (had) return { id: had.id, attach: [], duplicate: true };
      if (task) {
        const mine = await one(
          `SELECT id FROM post WHERE task_id = $1 AND user_id = $2 AND deleted_at IS NULL`, [task.id, userId]);
        if (mine) throw new Denied("이 과제에 낸 글이 이미 있습니다. 다시 내려면 덮어쓰기를 고르세요");
      }
    }
    throw e;
  } finally {
    client.release();
  }
}

async function editPost(loungeId, userId, postId, input) {
  const me = await membership(loungeId, userId);
  const p = await one(
    `SELECT p.id, p.user_id, c.name AS cat, c.pass_required, c.is_system
       FROM post p JOIN category c ON c.id = p.category_id
      WHERE p.id = $1 AND p.lounge_id = $2 AND p.deleted_at IS NULL`,
    [postId, loungeId]);
  if (!p) throw new Missing();
  // bigint 는 드라이버가 문자열로 준다. '26' !== 26 이라 그냥 비교하면 늘 남의 글이 된다.
  if (!same(p.user_id, userId)) throw new Denied("내 글만 고칠 수 있습니다");

  /* 카테고리를 옮길 수 있게 하되, 옮기는 것으로 관문을 피할 수는 없게 한다.
     · 피드백권 카테고리로 옮기기 = 권을 안 쓰고 피드백을 받는 길이다
     · 과제는 주차 양식과 묶여 있다. 옮기면 답변이 갈 곳을 잃는다 */
  let move = null;
  if (input.cat && input.cat !== p.cat) {
    if (p.cat === "과제" || p.pass_required) {
      throw new Denied(`'${p.cat}' 글은 카테고리를 옮길 수 없습니다`);
    }
    const c = await writable(loungeId, me, input.cat);
    if (c.pass_required) throw new Denied(`'${c.name}' 으로는 옮길 수 없습니다. 새로 써야 합니다`);
    if (c.name === "과제") throw new Denied("과제는 강의실에서 냅니다");
    move = c.id;
  }

  await rows(
    `UPDATE post SET title = $1, body = $2, category_id = coalesce($4, category_id),
            edited_at = now()
      WHERE id = $3`,
    [input.title, input.body || null, postId, move]);
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

  // 같은 댓글이 15초 안에 두 번 오면 하나다. 느린 회선에서 '등록' 을 두 번 누른 것이다.
  const twin = await one(
    `SELECT id FROM comment
      WHERE post_id = $1 AND user_id = $2 AND body = $3
        AND deleted_at IS NULL AND created_at > now() - interval '15 seconds'
      ORDER BY id DESC LIMIT 1`, [postId, userId, input.body.trim()]);
  if (twin) return { id: twin.id, duplicate: true };

  const key = String(input.key || "").slice(0, 40) || null;
  if (key) {
    const had = await one(`SELECT id FROM comment WHERE client_key = $1`, [key]);
    if (had) return { id: had.id, duplicate: true };
  }

  // 답글의 답글은 만들지 않는다. 한 단계에서 멈춘다.
  let parent = null;
  if (input.parentId) {
    parent = await one(
      `SELECT id, parent_id FROM comment WHERE id = $1 AND post_id = $2 AND deleted_at IS NULL`,
      [input.parentId, postId]);
    if (!parent) throw new Missing("원댓글이 없습니다");
    if (parent.parent_id) parent = { id: parent.parent_id };
  }

  let r;
  try {
    r = await one(
      `INSERT INTO comment (post_id, parent_id, user_id, author_name, body, client_key)
       VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`,
      [postId, parent ? parent.id : null, userId, me.nickname, input.body.trim(), key]);
  } catch (e) {
    if (e.code === "23505" && key) {   // 같은 열쇠가 동시에 먼저 들어갔다
      const had = await one(`SELECT id FROM comment WHERE client_key = $1`, [key]);
      if (had) return { id: had.id, duplicate: true };
    }
    throw e;
  }

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
  if (!same(c.user_id, userId) && me.role !== "admin") throw new Denied("내 댓글만 지울 수 있습니다");

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

/* ---------- 링크 카드 ----------
   본문에 적힌 주소를 카드(제목 · 설명 · 이미지)로 펴서 글에 붙인다. 글 저장과 다른
   요청으로 떼어 놓은 이유는 createPost 에 적혀 있다. 첨부가 이미 있는 글에는 붙이지 않는다 —
   카드는 첨부를 따로 고르지 않은 글에만 편다는 규칙이 createPost 와 같다. */
async function attachCard(loungeId, userId, postId, url) {
  const p = await one(
    `SELECT id, user_id FROM post WHERE id = $1 AND lounge_id = $2 AND deleted_at IS NULL`, [postId, loungeId]);
  if (!p) throw new Denied("글이 없습니다");
  const me = await membership(loungeId, userId);
  if (!same(p.user_id, userId) && !me.staff) throw new Denied("내 글에만 붙일 수 있습니다");

  const has = await one(`SELECT 1 FROM attachment WHERE post_id = $1 LIMIT 1`, [postId]);
  if (has) return { attach: [] };

  const found = firstUrl(String(url || ""));
  if (!found) return { attach: [] };
  const card = await unfurl(found);
  if (card.blocked) return { attach: [] };   // 내부 주소. 글에는 글자로만 남는다

  await rows(`INSERT INTO attachment (post_id, kind, url, label) VALUES ($1, $2, $3, $4)`,
    [postId, card.kind, card.url, card.title || null]);
  return { attach: [{ type: card.kind, url: card.url, title: card.title, label: card.title }] };
}
module.exports.attachCard = attachCard;

module.exports.setRole = setRole;
module.exports.addCategory = addCategory;
module.exports.removeCategory = removeCategory;
module.exports.setPlacement = setPlacement;
module.exports.setRights = setRights;

/* ---------- 강의 · 과제 · 자료 ----------
   구분이 둘 있다.

   · 어느 섹션을 라운지에서 열지, 어느 레슨에 무슨 과제 · 자료를 붙일지는 **라운지가 정한다.**
     커뮤니티 운영이지 강의 콘텐츠가 아니다. lounge_section · lesson_task · lesson_material 에 쓴다.
   · 섹션 · 레슨 자체(영상 · 길이 · 타임라인 · 교안)는 **프드프가 원본이다.** 로컬(PUDUFU_MODE=local)
     에서는 비계인 ext_* 에 직접 써서 혼자 개발할 수 있게 하지만, 운영에서는 막는다 —
     여기서 고쳐 봐야 다음 동기화 때 덮인다. */

const config = require("./config");
const { unfurl, firstUrl, assertPublic } = require("./unfurl");

const QS_MAX = 8;

/* 섹션 게시 여부. 행이 없으면 공개다. 순차 잠금도 마감도 없다. */
async function setSectionPublished(loungeId, userId, sectionId, published) {
  await admin(loungeId, userId);
  await assertSection(loungeId, sectionId);
  await rows(
    `INSERT INTO lounge_section (lounge_id, section_id, published) VALUES ($1, $2, $3)
     ON CONFLICT (lounge_id, section_id) DO UPDATE SET published = $3, updated_at = now()`,
    [loungeId, sectionId, !!published]);
  return { ok: true };
}

/* 이 라운지의 강의에 속한 섹션 · 레슨인가. 남의 강의 레슨에 과제를 붙일 수는 없다. */
async function assertSection(loungeId, sectionId) {
  const L = await courseOf(loungeId);
  const s = await one(`SELECT id FROM ext_section WHERE id = $1 AND course_id = $2`, [sectionId, L.course_id]);
  if (!s) throw new Missing("이 강의의 섹션이 아닙니다");
  return L;
}
async function assertLesson(loungeId, lessonId) {
  const L = await courseOf(loungeId);
  const l = await one(`SELECT id FROM ext_lesson WHERE id = $1 AND course_id = $2`, [lessonId, L.course_id]);
  if (!l) throw new Missing("이 강의의 레슨이 아닙니다");
  return L;
}

/* 질문 양식 1~8개. 빈 질문은 두지 않는다. */
function cleanQs(qs) {
  const out = (qs || []).map((q) => ({ q: String(q.q || "").trim(), hint: String(q.hint || "").trim() || null }));
  if (!out.length) throw new Denied("질문이 하나는 있어야 합니다");
  if (out.length > QS_MAX) throw new Denied(`질문은 ${QS_MAX}개까지입니다`);
  if (out.some((q) => !q.q)) throw new Denied("빈 질문은 둘 수 없습니다");
  return out;
}

/* ---- 과제 : 레슨에 붙는다. 과제 하나 = 라운지 글 한 편 ---- */
async function addTask(loungeId, userId, lessonId, input) {
  await admin(loungeId, userId);
  await assertLesson(loungeId, lessonId);
  const title = String(input.title || "").trim();
  if (!title) throw new Denied("과제 제목은 있어야 합니다");
  const qs = cleanQs(input.qs);
  const seq = await one(
    `SELECT coalesce(max(seq), 0) + 1 AS s FROM lesson_task
      WHERE lounge_id = $1 AND lesson_id = $2 AND deleted_at IS NULL`, [loungeId, lessonId]);
  const r = await one(
    `INSERT INTO lesson_task (lounge_id, lesson_id, seq, title, questions)
     VALUES ($1, $2, $3, $4, $5) RETURNING id`,
    [loungeId, lessonId, seq.s, title, JSON.stringify(qs)]);
  return { id: r.id, seq: seq.s, title, qs };
}

/* 이미 낸 글은 post_answer 에 그때의 질문 문구를 스냅샷으로 갖고 있다.
   그래서 양식을 고쳐도 과거 제출물은 그대로 남는다. */
async function editTask(loungeId, userId, taskId, input) {
  await admin(loungeId, userId);
  const t = await one(`SELECT id FROM lesson_task WHERE id = $1 AND lounge_id = $2 AND deleted_at IS NULL`, [taskId, loungeId]);
  if (!t) throw new Missing("없는 과제입니다");
  const title = String(input.title || "").trim();
  if (!title) throw new Denied("과제 제목은 있어야 합니다");
  const qs = cleanQs(input.qs);
  await rows(`UPDATE lesson_task SET title = $1, questions = $2 WHERE id = $3`, [title, JSON.stringify(qs), taskId]);
  const used = await one(`SELECT count(*)::int AS n FROM post WHERE task_id = $1 AND deleted_at IS NULL`, [taskId]);
  return { id: taskId, title, qs, alreadySubmitted: used.n };
}

/* 낸 글이 있는 과제는 지우지 않는다. 지우면 그 글들이 어디에 낸 것인지 잃는다. */
async function deleteTask(loungeId, userId, taskId) {
  await admin(loungeId, userId);
  const t = await one(`SELECT id FROM lesson_task WHERE id = $1 AND lounge_id = $2 AND deleted_at IS NULL`, [taskId, loungeId]);
  if (!t) throw new Missing("없는 과제입니다");
  const used = await one(`SELECT count(*)::int AS n FROM post WHERE task_id = $1 AND deleted_at IS NULL`, [taskId]);
  if (used.n) throw new Denied(`제출한 글이 ${used.n}편 있어 지울 수 없습니다`);
  await rows(`UPDATE lesson_task SET deleted_at = now() WHERE id = $1`, [taskId]);
  return { ok: true };
}

/* ---- 자료 : 파일(올린 것) 또는 링크 ---- */
async function addMaterial(loungeId, userId, lessonId, input) {
  await admin(loungeId, userId);
  await assertLesson(loungeId, lessonId);
  const kind = input.kind === "file" ? "file" : "link";
  let url = String(input.url || "").trim();
  if (kind === "link") {
    url = firstUrl(url) || "";
    if (!url) throw new Denied("주소가 아닙니다");
    // 내부 주소는 자료로도 붙이지 않는다 — 누르면 서버가 아니라 사람의 브라우저가 열지만, 규칙은 하나다
    await assertPublic(url).catch((e) => { throw new Denied(e.message); });
  } else if (!url) {
    throw new Denied("올린 파일이 없습니다");
  }
  const label = String(input.label || "").trim().slice(0, 300) || null;
  const seq = await one(
    `SELECT coalesce(max(seq), -1) + 1 AS s FROM lesson_material
      WHERE lounge_id = $1 AND lesson_id = $2 AND deleted_at IS NULL`, [loungeId, lessonId]);
  const r = await one(
    `INSERT INTO lesson_material (lounge_id, lesson_id, seq, kind, url, label)
     VALUES ($1, $2, $3, $4, $5, $6) RETURNING id`, [loungeId, lessonId, seq.s, kind, url, label]);
  return { id: r.id, kind, url, label };
}

async function deleteMaterial(loungeId, userId, materialId) {
  await admin(loungeId, userId);
  const n = await rows(
    `UPDATE lesson_material SET deleted_at = now()
      WHERE id = $1 AND lounge_id = $2 AND deleted_at IS NULL`, [materialId, loungeId]);
  return { ok: true };
}

/* ---- 섹션 · 레슨 : 로컬 개발용. 운영에서는 프드프가 만든다 ---- */
function onlyLocal() {
  if (config.pudufu.mode !== "local") {
    throw new Denied("강의 내용은 프드프에서 만듭니다. 여기서 고치면 다음 동기화 때 덮입니다");
  }
}

async function addSection(loungeId, userId, input) {
  await admin(loungeId, userId);
  onlyLocal();
  const L = await courseOf(loungeId);
  const title = String(input.title || "").trim();
  if (!title) throw new Denied("섹션 제목은 있어야 합니다");
  await rows(`INSERT INTO ext_course (id, title, synced_at) VALUES ($1, $2, now())
              ON CONFLICT (id) DO NOTHING`, [L.course_id, L.name]);
  const next = await one(`SELECT coalesce(max(seq), 0) + 1 AS s FROM ext_section WHERE course_id = $1`, [L.course_id]);
  const r = await one(
    `INSERT INTO ext_section (course_id, seq, title, synced_at) VALUES ($1, $2, $3, now()) RETURNING id`,
    [L.course_id, next.s, title]);
  await rows(`INSERT INTO lounge_section (lounge_id, section_id, published) VALUES ($1, $2, false)
              ON CONFLICT (lounge_id, section_id) DO NOTHING`, [loungeId, r.id]);
  return { id: r.id, seq: next.s, title };
}

/* mm:ss 또는 초 → 초 */
function toSec(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Math.max(0, Math.round(v));
  const m = String(v).trim().match(/^(\d+):(\d{1,2})$/);
  if (m) return Number(m[1]) * 60 + Number(m[2]);
  const n = Number(v);
  return isNaN(n) ? null : Math.max(0, Math.round(n));
}

async function addLesson(loungeId, userId, input) {
  await admin(loungeId, userId);
  onlyLocal();
  const L = await assertSection(loungeId, Number(input.sectionId));
  const title = String(input.title || "").trim();
  if (!title) throw new Denied("레슨 제목은 있어야 합니다");
  const seq = await one(
    `SELECT coalesce(max(seq), 0) + 1 AS s FROM ext_lesson WHERE section_id = $1`, [input.sectionId]);
  const timeline = Array.isArray(input.timeline)
    ? input.timeline.map((t) => ({ t: toSec(t.t) || 0, label: String(t.label || "").trim() })).filter((t) => t.label)
    : [];
  const r = await one(
    `INSERT INTO ext_lesson (course_id, section_id, seq, title, duration_sec, video_url, description, timeline, doc, synced_at)
     VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, now()) RETURNING id`,
    [L.course_id, input.sectionId, seq.s, title, toSec(input.duration), String(input.videoUrl || "").trim() || null,
     String(input.description || "").trim() || null, JSON.stringify(timeline), String(input.doc || "").trim() || null]);
  return { id: r.id, seq: seq.s };
}

module.exports.setSectionPublished = setSectionPublished;
module.exports.addTask = addTask;
module.exports.editTask = editTask;
module.exports.deleteTask = deleteTask;
module.exports.addMaterial = addMaterial;
module.exports.deleteMaterial = deleteMaterial;
module.exports.addSection = addSection;
module.exports.addLesson = addLesson;

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
   원본은 프드프다. 라운지 안의 플레이어에서 본 것은 라운지가 보고한다 — 15초마다 · 멈출 때 · 끝날 때.
   local 에서는 비계인 ext_watch 에 직접 쓰고, remote 에서는 프드프에 남긴다(docs/API.md 1부 ⑥).
   둘 다 라운지는 쌓지 않는다. 완료(is_complete)는 한 번 참이면 거두지 않고,
   본 위치는 뒤로 물러나지 않는다(greatest). */

async function markWatched(loungeId, userId, lessonId, input) {
  await membership(loungeId, userId);
  const seconds = Math.max(0, Math.round(Number((input || {}).seconds) || 0));
  const complete = !!(input || {}).complete;

  if (config.pudufu.mode === "remote") {
    const res = await fetch(config.pudufu.base + "/api/lounge/watch", {
      method: "POST",
      headers: { "content-type": "application/json", "X-Lounge-Key": config.pudufu.key },
      body: JSON.stringify({ user_id: userId, lesson_id: lessonId, seconds, is_complete: complete })
    });
    if (!res.ok) throw new Denied("프드프에 시청 기록을 남기지 못했습니다");
    return { ok: true };
  }

  await rows(
    `INSERT INTO ext_watch (user_id, lesson_id, watched_sec, is_complete, watched_at, synced_at)
     VALUES ($1, $2, $3, $4, now(), now())
     ON CONFLICT (user_id, lesson_id)
     DO UPDATE SET watched_sec = greatest(ext_watch.watched_sec, $3),
                   is_complete = ext_watch.is_complete OR $4,
                   watched_at = now(), synced_at = now()`,
    [userId, lessonId, seconds, complete]);
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

/* ---------- 피드백권 지급 ----------
   권의 소유는 프드프 소관이라는 원칙은 그대로다. 다만 라운지 관리자가
   '이번 주만 한 장 더' 를 줄 수 있어야 운영이 된다. local 에서는 캐시를
   직접 고치고, remote 에서는 프드프에 요청한다. */

/* n 이 음수면 회수다. 잘못 누른 것을 되돌릴 방법이 없으면 아무도 못 누른다. */
async function grantPass(loungeId, userId, targetUserId, n) {
  await admin(loungeId, userId);
  const L = await one("SELECT course_id FROM lounge WHERE id = $1", [loungeId]);
  const add = Math.max(-10, Math.min(10, Number(n) || 1));
  if (!add) throw new Denied("바꿀 수가 0 입니다");

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
     늘어난 채로 남는다 — '이번 주만' 이 되지 않는다.
     회수는 반대로 쓴 횟수를 늘린다. 이미 쓴 것까지 되돌리지는 않으므로
     쿼터를 넘기지 않게 막는다. */
  const r = await one(
    `UPDATE ext_feedback_pass
        SET used = least(quota_per, greatest(0, used - $3)), synced_at = now()
      WHERE user_id = $1 AND course_id = $2
      RETURNING quota_per, used`, [targetUserId, L.course_id, add]);
  if (!r) throw new Missing("이 사람의 피드백권 기록이 없습니다");

  return { ok: true, granted: add, left: r.quota_per - r.used };
}

/* ---------- 라운지 소개 ---------- */

/* 보낸 칸만 고친다. 소개글만 고치러 왔는데 배너가 같이 지워지면 안 된다. */
async function setLounge(loungeId, userId, input) {
  await admin(loungeId, userId);

  const cols = { name: "name", intro: "intro", todo: "todo", banner: "banner_url" };
  const sets = [], vals = [loungeId];

  for (const key of Object.keys(cols)) {
    if (!(key in input)) continue;

    /* 할 일은 줄 단위다. 다섯 줄까지 — 그 이상은 할 일이 아니라 목록이 된다. */
    let v;
    if (key === "todo") {
      const lines = [].concat(input.todo || []).join("\n")
        .split("\n").map((x) => x.trim()).filter(Boolean);
      if (lines.length > 5) throw new Denied("할 일은 5개까지입니다");
      if (lines.some((x) => x.length > 60)) throw new Denied("할 일 한 줄이 너무 깁니다");
      v = lines.join("\n");
    } else {
      v = String(input[key] || "").trim();
    }

    if (key === "name" && !v) throw new Denied("라운지 이름은 비울 수 없습니다");
    if (v.length > 2000) throw new Denied("소개글이 너무 깁니다");
    vals.push(v || null);
    sets.push(`${cols[key]} = $${vals.length}`);
  }
  /* 첨부는 글과 똑같이 다룬다. 따로 고른 게 없으면 소개글에 적힌 첫 주소를
     카드로 편다 — 사람은 링크를 '첨부' 한다고 생각하지 않고 그냥 붙여넣는다. */
  let stored = null;
  if ("intro" in input || "attach" in input) {
    let files = [].concat(input.attach || []).filter(Boolean).slice(0, ATTACH_MAX);

    if (!files.length && "intro" in input) {
      const found = firstUrl(String(input.intro || ""));
      if (found) {
        const card = await unfurl(found);
        if (!card.blocked) files = [{ type: card.kind, url: card.url, title: card.title, label: card.title }];
      }
    }
    stored = files;
    vals.push(files.length ? JSON.stringify(files) : null);
    sets.push(`intro_att = $${vals.length}`);
  }

  if (!sets.length) return { ok: true };

  await rows(`UPDATE lounge SET ${sets.join(", ")} WHERE id = $1`, vals);
  return { ok: true, attach: stored };
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
  if (same(p.user_id, userId)) throw new Denied("내 글은 신고하지 않습니다");

  await rows(
    `INSERT INTO post_report (post_id, user_id, reason) VALUES ($1, $2, $3)
     ON CONFLICT (post_id, user_id) DO UPDATE SET reason = $3, created_at = now()`,
    [postId, userId, (reason || "").slice(0, 200) || null]);
  return { ok: true };
}

module.exports.setMuted = setMuted;
module.exports.reportPost = reportPost;
