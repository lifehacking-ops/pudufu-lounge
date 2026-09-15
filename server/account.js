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

/* 주차 계산의 출처. 원본은 언제나 프드프다 — 라운지는 쌓지 않는다. */
async function watched(userId, courseId) {
  if (remote()) return call(`/api/lounge/watch?user_id=${userId}&course_id=${courseId}`);
  return rows(
    `SELECT w.lesson_id, w.watched_at, w.is_complete, l.week
       FROM ext_watch w JOIN ext_lesson l ON l.id = w.lesson_id
      WHERE w.user_id = $1 AND l.course_id = $2`, [userId, courseId]);
}

/* 피드백권 잔여. 소유는 프드프 소관이고 라운지는 읽기만 한다. */
async function passes(userId, courseId) {
  if (remote()) return call(`/api/lounge/passes?user_id=${userId}&course_id=${courseId}`);
  return one(
    `SELECT quota_per, period, period_start, used
       FROM ext_feedback_pass WHERE user_id = $1 AND course_id = $2`, [userId, courseId]);
}

/* 강의 구조 — 주차 · 강 · 영상 · 교안 · 미션 양식 */
async function course(courseId) {
  if (remote()) return call(`/api/lounge/course/${courseId}`);
  const [meta, weeks, lessons, missions] = await Promise.all([
    one("SELECT id, title, weeks FROM ext_course WHERE id = $1", [courseId]),
    rows("SELECT week, title FROM ext_week WHERE course_id = $1 ORDER BY week", [courseId]),
    rows(`SELECT id, week, seq, chapter, title, duration, video_url, doc
            FROM ext_lesson WHERE course_id = $1 ORDER BY week, seq`, [courseId]),
    rows(`SELECT week, title, seq, question, hint
            FROM ext_mission WHERE course_id = $1 ORDER BY week, seq`, [courseId])
  ]);
  return { ...meta, weekTitles: weeks, lessons, missions };
}

async function live(courseId) {
  if (remote()) return call(`/api/lounge/live?course_id=${courseId}`);
  return one(
    `SELECT title, starts_at FROM ext_live
      WHERE course_id = $1 AND starts_at >= now() ORDER BY starts_at LIMIT 1`, [courseId]);
}

/* 시청 기록에서 주차를 계산한다. 다 본 마지막 주차의 다음 주차에 서 있다고 본다.
   lounge_member.week 는 이 값의 캐시일 뿐이므로 하루 한 번 맞춰 주면 된다. */
async function syncWeeks(loungeId, courseId) {
  const total = await rows(
    "SELECT week, count(*)::int AS n FROM ext_lesson WHERE course_id = $1 GROUP BY week", [courseId]);
  const need = new Map(total.map((r) => [r.week, r.n]));

  const done = await rows(
    `SELECT w.user_id, l.week, count(*)::int AS n
       FROM ext_watch w JOIN ext_lesson l ON l.id = w.lesson_id
      WHERE l.course_id = $1 AND w.is_complete
      GROUP BY w.user_id, l.week`, [courseId]);

  const by = new Map();
  done.forEach((r) => {
    if (!by.has(r.user_id)) by.set(r.user_id, new Set());
    if (r.n >= (need.get(r.week) || Infinity)) by.get(r.user_id).add(r.week);
  });

  let touched = 0;
  for (const [userId, weeks] of by) {
    let w = 1;
    while (weeks.has(w)) w++;
    await rows(
      `UPDATE lounge_member SET week = $1, week_synced_at = now()
        WHERE lounge_id = $2 AND user_id = $3 AND week <> $1`, [w, loungeId, userId]);
    touched++;
  }
  return touched;
}

module.exports = { user, purchases, watched, passes, course, live, syncWeeks };
