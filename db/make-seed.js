/* 프로토타입의 예시 데이터를 그대로 seed.sql 로 옮긴다.
 *
 * 손으로 두 벌 쓰면 반드시 어긋난다. 프로토타입이 스테이징이므로 데이터도
 * web/assets/data-mock.js 가 원본이고, 이 스크립트가 그것을 SQL 로 번역한다.
 *
 *   node db/make-seed.js > db/seed.sql
 */

const path = require("path");

/* 프로토타입이 쓰는 목업을 그대로 읽는다. 화면과 시드가 같은 원본을 본다. */
global.window = {};
require(path.join(__dirname, "..", "web", "assets", "data-mock.js"));
const D = global.window.LOUNGE_DATA;

const MEMBERS    = D.members;
const POSTS      = D.posts;
const LESSONS    = D.lessons;
const WEEKS      = D.weeks;
const CATEGORIES = D.categories;
const LOUNGES    = D.lounges;
const MISSIONS   = D.missions;
const LIVE       = D.live;

/* ---- 도우미 ---- */

const q = (v) => v == null ? "NULL" : "'" + String(v).replace(/\\/g, "\\\\").replace(/'/g, "''") + "'";
const n = (v) => v == null ? "NULL" : String(v);

/* "2시간 전" 같은 표시용 문자열을 @now 기준 식으로 바꾼다.
   고정 날짜로 박으면 며칠 뒤에 시드가 상해서 대시보드가 이상해진다. */
function ago(when) {
  if (/방금/.test(when)) return "@now";
  let m;
  if ((m = when.match(/(\d+)\s*분 전/)))  return `DATE_SUB(@now, INTERVAL ${m[1]} MINUTE)`;
  if ((m = when.match(/(\d+)\s*시간 전/))) return `DATE_SUB(@now, INTERVAL ${m[1]} HOUR)`;
  if (/어제/.test(when))                   return "DATE_SUB(@now, INTERVAL 1 DAY)";
  if ((m = when.match(/(\d+)\s*일 전/)))   return `DATE_SUB(@now, INTERVAL ${m[1]} DAY)`;
  if ((m = when.match(/(\d+)\s*주 전/)))   return `DATE_SUB(@now, INTERVAL ${m[1] * 7} DAY)`;
  return "DATE_SUB(@now, INTERVAL 30 DAY)";   // '계속 누적' 같은 고정 공지
}

const days = (d) => d === 0 ? "@now" : `DATE_SUB(@now, INTERVAL ${d} DAY)`;

const out = [];
const say = (s) => out.push(s);

/* ---- 사람 ---- */

const uid = {};
MEMBERS.forEach((m, i) => { uid[m.name] = i + 1; });

// 글·댓글에 나오는 이름이 명부에 다 있는지 본다
const seen = new Set();
POSTS.forEach((p) => {
  seen.add(p.author);
  (p.thread || []).forEach((c) => {
    seen.add(c.author);
    (c.replies || []).forEach((r) => seen.add(r.author));
  });
});
const missing = [...seen].filter((x) => !uid[x]);
if (missing.length) throw new Error("명부에 없는 사람: " + missing.join(", "));

const COURSE = 1;

/* ---- 머리말 ---- */

say(`-- =============================================================================
-- 프드프 라운지 · 시드
--
-- db/make-seed.js 가 web/assets/data-mock.js 에서 뽑아 만든다. 직접 고치지 말 것.
-- 목업 데이터를 고치고 다시 돌린다:
--
--     node db/make-seed.js > db/seed.sql
--
-- 시각은 전부 불러오는 시점(@now) 기준 상대값이다. 며칠 뒤에 넣어도
-- '어제 올라온 글'과 '이번 주 미제출'이 그대로 말이 된다.
-- =============================================================================

SET NAMES utf8mb4;
SET @now = NOW();
SET foreign_key_checks = 0;

TRUNCATE TABLE reaction;
TRUNCATE TABLE post_view;
TRUNCATE TABLE comment;
TRUNCATE TABLE attachment;
TRUNCATE TABLE post_answer;
TRUNCATE TABLE feedback_pass_use;
TRUNCATE TABLE post;
TRUNCATE TABLE lounge_category;
TRUNCATE TABLE category;
TRUNCATE TABLE lounge_member;
TRUNCATE TABLE lounge_digest;
TRUNCATE TABLE lounge;
TRUNCATE TABLE ext_live;
TRUNCATE TABLE ext_feedback_pass;
TRUNCATE TABLE ext_watch;
TRUNCATE TABLE ext_purchase;
TRUNCATE TABLE ext_mission;
TRUNCATE TABLE ext_lesson;
TRUNCATE TABLE ext_course;
TRUNCATE TABLE ext_user;
SET foreign_key_checks = 1;
`);

/* ---- 2부 · 프드프에서 받아 온 것 ---- */

say(`
-- =============================================================================
-- 프드프 캐시 (운영에서는 API 응답으로 채워진다)
-- =============================================================================

-- 계정`);
say("INSERT INTO `ext_user` (`id`, `nickname`, `email`, `synced_at`) VALUES");
say(MEMBERS.map((m, i) =>
  `  (${i + 1}, ${q(m.name)}, ${q("user" + (i + 1) + "@example.com")}, @now)`).join(",\n") + ";");

say(`
-- 강의`);
say("INSERT INTO `ext_course` (`id`, `title`, `weeks`, `synced_at`) VALUES");
say(`  (${COURSE}, ${q("학원마케팅 올인원 강의")}, ${WEEKS.length}, @now);`);

say(`
-- 주차별 강. 교안 본문이 통합 검색의 대상이 된다.`);
const seqOf = {};
say("INSERT INTO `ext_lesson` (`course_id`, `week`, `seq`, `chapter`, `title`, `duration`, `video_url`, `doc`, `synced_at`) VALUES");
say(LESSONS.map((l) => {
  seqOf[l.wk] = (seqOf[l.wk] || 0) + 1;
  const url = l.video ? `https://customer-xxxx.cloudflarestream.com/${COURSE}-${l.wk}-${seqOf[l.wk]}/iframe` : null;
  return `  (${COURSE}, ${l.wk}, ${seqOf[l.wk]}, ${q(l.chap)}, ${q(l.t)}, ${q(l.d)}, ${q(url)}, ${q(l.doc)}, @now)`;
}).join(",\n") + ";");

say(`
-- 주차별 미션 양식. 글쓰기 창의 과제 폼이 이걸 읽는다.`);
const mrows = [];
Object.keys(MISSIONS).map(Number).sort((a, b) => a - b).forEach((wk) => {
  const m = MISSIONS[wk];
  m.qs.forEach((x, i) => {
    mrows.push(`  (${COURSE}, ${wk}, ${q(m.title)}, ${i + 1}, ${q(x.q)}, ${q(x.hint)}, @now)`);
  });
});
say("INSERT INTO `ext_mission` (`course_id`, `week`, `title`, `seq`, `question`, `hint`, `synced_at`) VALUES");
say(mrows.join(",\n") + ";");

say(`
-- 구매. 기수와 만료일이 여기서 나온다.`);
const students = MEMBERS.filter((m) => m.role === "student");
say("INSERT INTO `ext_purchase` (`user_id`, `course_id`, `cohort`, `purchased_at`, `expires_at`, `synced_at`) VALUES");
say(students.map((m) =>
  `  (${uid[m.name]}, ${COURSE}, ${m.cohort}, ${days(m.joined)}, DATE_ADD(${days(m.joined)}, INTERVAL 365 DAY), @now)`
).join(",\n") + ";");

say(`
-- 시청 기록. lounge_member.week 는 이 표에서 계산한 값의 캐시다.
-- 여기서는 '지난 주차의 강은 다 봤다'로 깔아 둔다.`);
const lessonId = {};
let lid = 0;
const bywk = {};
LESSONS.forEach((l) => { lid++; (bywk[l.wk] = bywk[l.wk] || []).push(lid); });
const wrows = [];
students.forEach((m) => {
  for (let w = 1; w < m.wk; w++) (bywk[w] || []).forEach((id) => {
    wrows.push(`  (${uid[m.name]}, ${id}, ${days(m.joined - w * 3 > 0 ? m.joined - w * 3 : 0)}, 1, @now)`);
  });
});
say("INSERT INTO `ext_watch` (`user_id`, `lesson_id`, `watched_at`, `is_complete`, `synced_at`) VALUES");
say(wrows.join(",\n") + ";");

say(`
-- 피드백권 잔여. 소유는 프드프 소관이고 라운지는 읽기만 한다.`);
say("INSERT INTO `ext_feedback_pass` (`user_id`, `course_id`, `quota_per`, `period`, `period_start`, `used`, `synced_at`) VALUES");
say(students.map((m) =>
  `  (${uid[m.name]}, ${COURSE}, 3, 'week', DATE(DATE_SUB(@now, INTERVAL WEEKDAY(@now) DAY)), 0, @now)`
).join(",\n") + ";");

say(`
-- 다음 라이브`);
say("INSERT INTO `ext_live` (`course_id`, `title`, `starts_at`, `synced_at`) VALUES");
say(`  (${COURSE}, ${q(LIVE.title)}, DATE_ADD(@now, INTERVAL ${LIVE.days} DAY), @now);`);

/* ---- 1부 · 라운지 ---- */

say(`
-- =============================================================================
-- 라운지
-- =============================================================================

-- 강의 하나에 라운지 하나. 나머지 둘은 필터 관리에서 '다른 라운지가 사용 중'을
-- 보여주기 위해 같이 둔다.`);
say("INSERT INTO `lounge` (`id`, `course_id`, `name`, `intro`) VALUES");
say(LOUNGES.map((l, i) =>
  `  (${i + 1}, ${i + 1}, ${q(l.name)}, ${i === 0 ? q("강의를 듣기 전에 여기 먼저 들르는 곳입니다. 과제도, 피드백도, 등록 인증도 이 안에서 끝납니다. 잘 쓴 글보다 자주 들르는 게 중요합니다.") : "NULL"})`
).join(",\n") + ";");

say(`
-- 멤버. 역할이 라운지 단위로 붙는다.`);
say("INSERT INTO `lounge_member` (`lounge_id`, `user_id`, `role`, `cohort`, `joined_at`, `expires_at`, `last_seen_at`, `week`, `week_synced_at`) VALUES");
say(MEMBERS.map((m) => {
  const staff = m.role !== "student";
  const exp = staff ? "NULL" : `DATE_ADD(${days(m.joined)}, INTERVAL 365 DAY)`;
  return `  (1, ${uid[m.name]}, ${q(m.role)}, ${n(m.cohort || null)}, ${days(m.joined)}, ${exp}, ${days(m.lastDays)}, ${m.wk}, @now)`;
}).join(",\n") + ";");

// 관리자는 세 라운지를 다 맡는다
const admin = MEMBERS.find((m) => m.role === "admin");
say(`INSERT INTO \`lounge_member\` (\`lounge_id\`, \`user_id\`, \`role\`, \`joined_at\`, \`last_seen_at\`, \`week\`) VALUES
  (2, ${uid[admin.name]}, 'admin', ${days(400)}, @now, 1),
  (3, ${uid[admin.name]}, 'admin', ${days(400)}, @now, 1);`);

say(`
-- 카테고리. 전역 풀이다.`);
const cid = {};
say("INSERT INTO `category` (`id`, `name`, `is_system`, `pass_required`) VALUES");
say(CATEGORIES.map((c, i) => {
  cid[c.name] = i + 1;
  return `  (${i + 1}, ${q(c.name)}, ${c.system ? 1 : 0}, ${c.pass ? 1 : 0})`;
}).join(",\n") + ";");

say(`
-- 라운지별 배치와 쓰기 권한. 행이 없으면 그 라운지에서 '미사용'이다.`);
const lcrows = [];
LOUNGES.forEach((L, li) => {
  const place = (names, p) => names.forEach((nm, i) => {
    const c = CATEGORIES.find((x) => x.name === nm);
    const stu = !c.roles || c.roles.indexOf("student") > -1 ? 1 : 0;
    const ins = !c.roles || c.roles.indexOf("instructor") > -1 ? 1 : 0;
    lcrows.push(`  (${li + 1}, ${cid[nm]}, ${q(p)}, ${i}, ${stu}, ${ins})`);
  });
  place(L.show, "show");
  place(L.more, "more");
});
say("INSERT INTO `lounge_category` (`lounge_id`, `category_id`, `placement`, `sort`, `student_can_write`, `instructor_can_write`) VALUES");
say(lcrows.join(",\n") + ";");

/* ---- 글 ---- */

const cmtCount = (p) => (p.thread || []).reduce((a, c) => a + 1 + (c.replies || []).length, 0);
const reactTotal = (p) => Object.values(p.reactions || {}).reduce((a, b) => a + b, 0);

const postRows = [], answerRows = [], attachRows = [], commentRows = [], reactRows = [], passRows = [];
let pid = 0, cmid = 0;

POSTS.forEach((p) => {
  pid++;
  const at = ago(p.when);
  const rc = (p.likes || 0) + reactTotal(p);
  postRows.push(`  (${pid}, 1, ${cid[p.cat]}, ${uid[p.author]}, ${q(p.author)}, ${q(p.title)}, ${q(p.body || null)}, ${n(p.wk || null)}, ${p.pinned ? 1 : 0}, ${rc}, ${cmtCount(p)}, ${n(p.views || 0)}, ${at}, ${at})`);

  (p.mission || []).forEach((a, i) => {
    answerRows.push(`  (${pid}, ${i + 1}, ${q(a.q)}, ${q(a.a)})`);
  });

  if (p.attach) {
    const a = p.attach;
    attachRows.push(`  (${pid}, ${q(a.type)}, ${q(a.url || "")}, ${q(a.title || a.label || null)}, 0)`);
  }

  // 피드백권을 쓰는 카테고리면 소모 기록을 남긴다
  if (CATEGORIES.find((c) => c.name === p.cat && c.pass)) {
    passRows.push(`  (1, ${uid[p.author]}, ${pid}, ${at})`);
  }

  // 반응. 글쓴이가 아닌 사람에게서 순서대로 붙인다.
  const pool = MEMBERS.filter((m) => m.name !== p.author).map((m) => uid[m.name]);
  let cursor = 0;
  const give = (emoji, count) => {
    for (let k = 0; k < count && cursor < pool.length; k++, cursor++) {
      reactRows.push(`  ('post', ${pid}, ${pool[cursor]}, ${q(emoji)}, ${at})`);
    }
  };
  give("👍", p.likes || 0);
  Object.keys(p.reactions || {}).forEach((e) => give(e, p.reactions[e]));

  const pushCmt = (c, parent) => {
    cmid++;
    const me = cmid;
    commentRows.push(`  (${me}, ${pid}, ${n(parent)}, ${uid[c.author]}, ${q(c.author)}, ${q(c.text)}, ${c.up || 0}, ${ago(c.when)})`);
    (c.replies || []).forEach((r) => pushCmt(r, me));
  };
  (p.thread || []).forEach((c) => pushCmt(c, null));
});

say(`
-- 글. 글쓴이는 user_id 로 판정하고 author_name 으로 표시한다.`);
say("INSERT INTO `post` (`id`, `lounge_id`, `category_id`, `user_id`, `author_name`, `title`, `body`, `week`, `is_pinned`, `reaction_count`, `comment_count`, `view_count`, `created_at`, `updated_at`) VALUES");
say(postRows.join(",\n") + ";");

say(`
-- 과제 미션 답변. 질문 문구도 그때 것으로 같이 남긴다.`);
say("INSERT INTO `post_answer` (`post_id`, `seq`, `question`, `answer`) VALUES");
say(answerRows.join(",\n") + ";");

say(`
-- 첨부`);
say("INSERT INTO `attachment` (`post_id`, `type`, `url`, `label`, `sort`) VALUES");
say(attachRows.join(",\n") + ";");

say(`
-- 댓글. 답글은 한 단계까지만.`);
say("INSERT INTO `comment` (`id`, `post_id`, `parent_id`, `user_id`, `author_name`, `body`, `reaction_count`, `created_at`) VALUES");
say(commentRows.join(",\n") + ";");

say(`
-- 반응`);
say("INSERT INTO `reaction` (`target_type`, `target_id`, `user_id`, `emoji`, `created_at`) VALUES");
say(reactRows.join(",\n") + ";");

say(`
-- 피드백권 소모. 글을 올리는 시점에 나간다. 답이 안 와도 이미 쓴 것이다.`);
say("INSERT INTO `feedback_pass_use` (`lounge_id`, `user_id`, `post_id`, `used_at`) VALUES");
say(passRows.join(",\n") + ";");

say(`
-- 파생 카운터를 실제 행 수로 맞춘다. 시드가 어긋나지 않았는지 확인하는 셈이기도 하다.
UPDATE post p SET
  p.comment_count  = (SELECT COUNT(*) FROM comment c WHERE c.post_id = p.id AND c.deleted_at IS NULL),
  p.reaction_count = (SELECT COUNT(*) FROM reaction r WHERE r.target_type = 'post' AND r.target_id = p.id);
`);

console.log(out.join("\n"));

console.error(`사람 ${MEMBERS.length} · 글 ${pid} · 댓글 ${cmid} · 반응 ${reactRows.length} · 강 ${LESSONS.length} · 미션 ${mrows.length} · 시청 ${wrows.length}`);
