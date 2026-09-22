/* ============================================================================
   프드프 어댑터 — 이 파일이 경계다.
 
   라운지는 계정 · 구매 · 시청 기록 · 피드백권 · 강의를 프드프에서 받아 온다.
   앱의 나머지 코드는 프드프를 모른다. 여기만 안다.
 
     local   ext_* 캐시만 읽는다. 프드프 없이 개발할 때
     remote  프드프 API 를 호출하고 그 결과를 ext_* 에 채운다
 
   부르는 쪽 코드는 둘 사이에서 바뀌지 않는다. docs/API.md 1부가 이 함수들의
   짝이다.
   ============================================================================ */

const { rows, one } = require("./db");
const config = require("./config");

const remote = () => config.pudufu.mode === "remote";

async function call(path) {
  const res = await fetch(config.pudufu.base + path, {
    headers: { "X-Lounge-Key": config.pudufu.key }
  });
  if (!res.ok) throw new Error(`프드프 ${path} → ${res.status}`);
  return res.json();
}

/* 로그인한 사람. SSO 가 붙기 전에는 config.devUserId 로 본다. */
async function user(userId) {
  if (remote()) return call(`/api/lounge/user/${userId}`);
  return one("SELECT id, nickname FROM ext_user WHERE id = $1", [userId]);
}

/* 기수와 만료일의 출처 */
async function purchases(userId) {
  if (remote()) return call(`/api/lounge/purchases?user_id=${userId}`);
  return rows(
    `SELECT course_id, cohort, purchased_at, expires_at
       FROM ext_purchase WHERE user_id = $1`, [userId]);
}

/* 한 사람의 시청 기록. 진도(is_complete) · 이어보기(watched_at · watched_sec)의 출처.
   원본은 언제나 프드프다 — 라운지는 쌓지 않는다. */
async function watched(userId, courseId) {
  if (remote()) return call(`/api/lounge/watch?user_id=${userId}&course_id=${courseId}`);
  return rows(
    `SELECT w.lesson_id, w.watched_sec, w.watched_at, w.is_complete, l.section_id
       FROM ext_watch w JOIN ext_lesson l ON l.id = w.lesson_id
      WHERE w.user_id = $1 AND l.course_id = $2`, [userId, courseId]);
}

/* 모든 멤버의 시청 기록. 대시보드가 '지금 어느 섹션에 있나' 를 세는 데 쓴다(syncSections).
   프드프 API ③ 은 사람 단위라, 원격에서는 전체를 한 번에 받는 ③b 가 있으면 그것을,
   없으면 멤버마다 ③ 을 부른다(하루 한 번 200회 — 감당할 수 있다). */
async function watchedAll(courseId, userIds) {
  if (remote()) {
    try {
      return await call(`/api/lounge/watch?course_id=${courseId}`);
    } catch (e) {
      const all = [];
      for (const u of userIds || []) {
        const w = await call(`/api/lounge/watch?user_id=${u}&course_id=${courseId}`).catch(() => []);
        w.forEach((x) => all.push({ ...x, user_id: u }));
      }
      return all;
    }
  }
  return rows(
    `SELECT w.user_id, w.lesson_id, w.watched_at, w.is_complete, l.section_id
       FROM ext_watch w JOIN ext_lesson l ON l.id = w.lesson_id
      WHERE l.course_id = $1`, [courseId]);
}

/* 피드백권 잔여. 소유는 프드프 소관이고 라운지는 읽기만 한다. */
async function passes(userId, courseId) {
  if (remote()) return call(`/api/lounge/passes?user_id=${userId}&course_id=${courseId}`);
  return one(
    `SELECT quota_per, period, period_start, used
       FROM ext_feedback_pass WHERE user_id = $1 AND course_id = $2`, [userId, courseId]);
}

/* 강의 구조 — 섹션 · 레슨(영상 · 길이 · 설명란 · 타임라인 · 교안).
   과제와 자료는 여기 없다 — 라운지가 소유한다(lesson_task · lesson_material). */
async function course(courseId) {
  if (remote()) return call(`/api/lounge/course/${courseId}`);
  const [meta, sections, lessons] = await Promise.all([
    one("SELECT id, title FROM ext_course WHERE id = $1", [courseId]),
    rows("SELECT id, seq, title FROM ext_section WHERE course_id = $1 ORDER BY seq", [courseId]),
    rows(`SELECT id, section_id, seq, title, duration_sec, video_url, description, timeline, doc
            FROM ext_lesson WHERE course_id = $1 ORDER BY section_id, seq`, [courseId])
  ]);
  return { ...(meta || { id: courseId, title: "" }), sections, lessons };
}

async function live(courseId) {
  if (remote()) return call(`/api/lounge/live?course_id=${courseId}`);
  return one(
    `SELECT title, starts_at FROM ext_live
      WHERE course_id = $1 AND starts_at >= now() ORDER BY starts_at LIMIT 1`, [courseId]);
}

/* 시청 기록에서 '지금 어느 섹션에 있나' 를 계산한다.
   마지막으로 본 레슨의 섹션에 서 있다고 본다. 그 섹션의 레슨을 다 봤으면 다음 섹션.
   본 것이 없으면 첫 섹션. lounge_member.section_id 는 이 값의 캐시일 뿐이므로
   하루 한 번 맞춰 주면 된다. */
async function syncSections(loungeId, courseId) {
  const c = await course(courseId);
  if (!c.sections.length) return 0;
  const order = c.sections.map((s) => Number(s.id));
  const lessonsOf = new Map();
  c.lessons.forEach((l) => {
    const k = Number(l.section_id);
    if (!lessonsOf.has(k)) lessonsOf.set(k, []);
    lessonsOf.get(k).push(Number(l.id));
  });

  const members = await rows(
    `SELECT user_id, section_id FROM lounge_member WHERE lounge_id = $1`, [loungeId]);
  const watch = await watchedAll(courseId, members.map((m) => m.user_id));

  const byUser = new Map();
  watch.forEach((w) => {
    const u = String(w.user_id);
    if (!byUser.has(u)) byUser.set(u, { last: null, done: new Set() });
    const rec = byUser.get(u);
    if (w.is_complete) rec.done.add(Number(w.lesson_id));
    if (!rec.last || new Date(w.watched_at) > new Date(rec.last.watched_at)) rec.last = w;
  });

  const sectionOfLesson = new Map();
  c.lessons.forEach((l) => sectionOfLesson.set(Number(l.id), Number(l.section_id)));

  let touched = 0;
  for (const m of members) {
    const rec = byUser.get(String(m.user_id));
    let cur = order[0];
    if (rec && rec.last) {
      cur = sectionOfLesson.get(Number(rec.last.lesson_id)) || order[0];
      // 그 섹션을 다 봤으면 다음 섹션으로
      let i = order.indexOf(cur);
      while (i < order.length - 1 && (lessonsOf.get(order[i]) || []).every((id) => rec.done.has(id))) i++;
      cur = order[i];
    }
    if (Number(m.section_id) === cur) continue;
    await rows(
      `UPDATE lounge_member SET section_id = $1, section_synced_at = now()
        WHERE lounge_id = $2 AND user_id = $3`, [cur, loungeId, m.user_id]);
    touched++;
  }
  return touched;
}

module.exports = { user, purchases, watched, watchedAll, passes, course, live, syncSections };
