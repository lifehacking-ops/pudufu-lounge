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
const SECTIONS   = D.sections;      // build() 가 조립한 모양: sections[].lessons[].tasks/materials
const LESSONS    = SECTIONS.reduce((a, s) => a.concat(s.lessons), []);
const TASKS      = D.tasks;         // 납작한 원본. lessonId 는 build() 가 채웠다
const MATERIALS  = D.materials;
const WATCH      = D.watch;
const CATEGORIES = D.categories;
const LOUNGES    = D.lounges;
const LIVE       = D.live;

/* ---- 도우미 ---- */

const q = (v) => v == null ? "NULL" : "'" + String(v).replace(/\\/g, "\\\\").replace(/'/g, "''") + "'";
const n = (v) => v == null ? "NULL" : String(v);

/* ---- 방언 ----
   MariaDB 판은 맨 아래 toMaria() 가 생성물을 통째로 바꾼다 (--mariadb).
   시드는 생성물이라 데이터는 자동으로 따라온다. */
const NOW = "now()";
const back = (n, unit) => `${NOW} - interval '${n} ${unit}'`;
const fwd  = (n, unit) => `${NOW} + interval '${n} ${unit}'`;

/* "2시간 전" 같은 표시용 문자열을 시각 식으로 바꾼다.
   고정 날짜로 박으면 며칠 뒤에 시드가 상해서 대시보드가 이상해진다. */
function ago(when) {
  if (/방금/.test(when)) return NOW;
  let m;
  if ((m = when.match(/(\d+)\s*분 전/)))  return back(m[1], "minutes");
  if ((m = when.match(/(\d+)\s*시간 전/))) return back(m[1], "hours");
  if (/어제/.test(when))                   return back(1, "days");
  if ((m = when.match(/(\d+)\s*일 전/)))   return back(m[1], "days");
  if ((m = when.match(/(\d+)\s*주 전/)))   return back(m[1] * 7, "days");
  if ((m = when.match(/(\d+)\s*개월 전/))) return back(m[1] * 30, "days");
  return back(30, "days");
}

const days = (d) => d === 0 ? NOW : back(d, "days");

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
-- 시각은 전부 불러오는 시점(now()) 기준 상대값이다. 며칠 뒤에 넣어도
-- '어제 올라온 글'과 '이번 주 미제출'이 그대로 말이 된다.
-- =============================================================================

SET TIME ZONE 'UTC';

BEGIN;

TRUNCATE lounge_section, lounge_digest, feedback_pass_use, post_view, reaction, comment,
  attachment, post_answer, post, lesson_material, lesson_task, lounge_category, category,
  lounge_member, lounge RESTART IDENTITY CASCADE;
TRUNCATE ext_live, ext_feedback_pass, ext_watch, ext_purchase,
  ext_lesson, ext_section, ext_course, ext_user RESTART IDENTITY CASCADE;
`);

/* ---- 2부 · 프드프에서 받아 온 것 ---- */

say(`
-- =============================================================================
-- 프드프 캐시 (운영에서는 API 응답으로 채워진다)
-- =============================================================================

-- 계정`);
say("INSERT INTO ext_user (id, nickname, email, synced_at) VALUES");
say(MEMBERS.map((m, i) =>
  `  (${i + 1}, ${q(m.name)}, ${q("user" + (i + 1) + "@example.com")}, now())`).join(",\n") + ";");

say(`
-- 강의`);
say("INSERT INTO ext_course (id, title, synced_at) VALUES");
say(`  (${COURSE}, ${q("학원마케팅 올인원 강의")}, now());`);

say(`
-- 섹션. 강의 목록의 카드 하나. id 는 목업 순서와 같다.`);
say("INSERT INTO ext_section (id, course_id, seq, title, synced_at) OVERRIDING SYSTEM VALUE VALUES");
say(SECTIONS.map((sec) => `  (${sec.id}, ${COURSE}, ${sec.seq}, ${q(sec.title)}, now())`).join(",\n") + ";");

say(`
-- 레슨 = 영상 하나. 교안과 설명란이 통합 검색의 대상이 된다. 타임라인은 jsonb 로 그대로.`);
say("INSERT INTO ext_lesson (id, course_id, section_id, seq, title, duration_sec, video_url, description, timeline, doc, synced_at) OVERRIDING SYSTEM VALUE VALUES");
say(LESSONS.map((l) =>
  `  (${l.id}, ${COURSE}, ${l.section}, ${l.seq}, ${q(l.title)}, ${n(l.durationSec)}, ${q(l.videoUrl)}, ${q(l.description)}, ${q(JSON.stringify(l.timeline || []))}, ${q(l.doc)}, now())`
).join(",\n") + ";");

say(`
-- 구매. 기수와 만료일이 여기서 나온다.`);
const students = MEMBERS.filter((m) => m.role === "student");
say("INSERT INTO ext_purchase (user_id, course_id, cohort, purchased_at, expires_at, synced_at) VALUES");
say(students.map((m) =>
  `  (${uid[m.name]}, ${COURSE}, ${m.cohort}, ${days(m.joined)}, ${days(m.joined)} + interval '365 days', now())`
).join(",\n") + ";");

say(`
-- 시청 기록. lounge_member.section_id 는 이 표에서 계산한 값의 캐시다.
-- 앞 섹션의 레슨은 다 봤고(watched_sec = 길이), 지금 섹션의 첫 레슨을 40% 본 것으로 깔아 둔다 —
-- 그래야 '이어보기' 가 가리킬 곳이 있다. 나(박현종)는 목업의 watch 를 그대로 쓴다.`);
const bySec = {};
LESSONS.forEach((l) => { (bySec[l.section] = bySec[l.section] || []).push(l); });
const me = MEMBERS.find((m) => m.name === "박현종");
const wrows = [];
students.forEach((m) => {
  const u = uid[m.name];
  if (m === me) {
    WATCH.forEach((w, i) => {
      const l = LESSONS[w.lesson - 1];
      wrows.push(`  (${u}, ${l.id}, ${w.sec}, ${back(WATCH.length - i, "days")}, ${!!w.done}, now())`);
    });
    return;
  }
  for (let sIdx = 1; sIdx < m.section; sIdx++) (bySec[sIdx] || []).forEach((l) => {
    wrows.push(`  (${u}, ${l.id}, ${n(l.durationSec || 0)}, ${days(m.joined - sIdx * 3 > 0 ? m.joined - sIdx * 3 : 0)}, true, now())`);
  });
  const first = (bySec[m.section] || [])[0];
  if (first && m.section > 1) {
    wrows.push(`  (${u}, ${first.id}, ${Math.round((first.durationSec || 0) * 0.4)}, ${days(m.lastDays)}, false, now())`);
  }
});
say("INSERT INTO ext_watch (user_id, lesson_id, watched_sec, watched_at, is_complete, synced_at) VALUES");
say(wrows.join(",\n") + ";");

say(`
-- 피드백권 잔여. 소유는 프드프 소관이고 라운지는 읽기만 한다.`);
say("INSERT INTO ext_feedback_pass (user_id, course_id, quota_per, period, period_start, used, synced_at) VALUES");
say(students.map((m) =>
  `  (${uid[m.name]}, ${COURSE}, 3, 'week', date_trunc('week', now())::date, 0, now())`
).join(",\n") + ";");

say(`
-- 다음 라이브`);
say("INSERT INTO ext_live (course_id, title, starts_at, synced_at) VALUES");
say(`  (${COURSE}, ${q(LIVE.title)}, ${fwd(LIVE.days, 'days')}, now());`);

/* ---- 1부 · 라운지 ---- */

say(`
-- =============================================================================
-- 라운지
-- =============================================================================

-- 강의 하나에 라운지 하나. 나머지 둘은 필터 관리에서 '다른 라운지가 사용 중'을
-- 보여주기 위해 같이 둔다.`);
say("INSERT INTO lounge (id, course_id, name, intro) OVERRIDING SYSTEM VALUE VALUES");
say(LOUNGES.map((l, i) =>
  `  (${i + 1}, ${i + 1}, ${q(l.name)}, ${i === 0 ? q("강의를 듣기 전에 여기 먼저 들르는 곳입니다. 과제도, 피드백도, 등록 인증도 이 안에서 끝납니다. 잘 쓴 글보다 자주 들르는 게 중요합니다.") : "NULL"})`
).join(",\n") + ";");

say(`
-- 섹션 게시 여부. 강의 내용은 프드프 것이고 여는 시점은 라운지 것이다.`);
say("INSERT INTO lounge_section (lounge_id, section_id, published) VALUES");
say(SECTIONS.map((sec) => `  (1, ${sec.id}, true)`).join(",\n") + ";");

say(`
-- 멤버. 역할이 라운지 단위로 붙는다.`);
say("INSERT INTO lounge_member (lounge_id, user_id, role, cohort, joined_at, expires_at, last_seen_at, section_id, section_synced_at) VALUES");
say(MEMBERS.map((m) => {
  const staff = m.role !== "student";
  const exp = staff ? "NULL" : `${days(m.joined)} + interval '365 days'`;
  return `  (1, ${uid[m.name]}, ${q(m.role)}, ${n(m.cohort || null)}, ${days(m.joined)}, ${exp}, ${days(m.lastDays)}, ${m.section}, now())`;
}).join(",\n") + ";");

// 관리자는 모든 라운지를 맡는다. 첫 라운지는 위에서 이미 들어갔다.
// 라운지 수를 여기 다시 적지 않는다 — 라운지를 줄였을 때 없는 라운지에 넣으려다 깨진 적이 있다.
const admin = MEMBERS.find((m) => m.role === "admin");
if (LOUNGES.length > 1) {
  say("INSERT INTO lounge_member (lounge_id, user_id, role, joined_at, last_seen_at) VALUES");
  say(LOUNGES.slice(1).map((_, i) =>
    `  (${i + 2}, ${uid[admin.name]}, 'admin', ${days(400)}, now())`).join(",\n") + ";");
}

say(`
-- 카테고리. 전역 풀이다.`);
const cid = {};
say("INSERT INTO category (id, name, is_system, pass_required) OVERRIDING SYSTEM VALUE VALUES");
say(CATEGORIES.map((c, i) => {
  cid[c.name] = i + 1;
  return `  (${i + 1}, ${q(c.name)}, ${!!c.system}, ${!!c.pass})`;
}).join(",\n") + ";");

say(`
-- 라운지별 배치와 쓰기 권한. 행이 없으면 그 라운지에서 '미사용'이다.`);
const lcrows = [];
LOUNGES.forEach((L, li) => {
  const place = (names, p) => names.forEach((nm, i) => {
    const c = CATEGORIES.find((x) => x.name === nm);
    const stu = !c.roles || c.roles.indexOf("student") > -1;
    const ins = !c.roles || c.roles.indexOf("instructor") > -1;
    lcrows.push(`  (${li + 1}, ${cid[nm]}, ${q(p)}, ${i}, ${stu}, ${ins})`);
  });
  place(L.show, "show");
  place(L.more, "more");
});
say("INSERT INTO lounge_category (lounge_id, category_id, placement, sort, student_can_write, instructor_can_write) VALUES");
say(lcrows.join(",\n") + ";");

say(`
-- 레슨의 과제. 관리자가 붙인 것. 질문 양식은 통째로 jsonb. id 는 목업 순서와 같다.`);
say("INSERT INTO lesson_task (id, lounge_id, lesson_id, seq, title, questions) OVERRIDING SYSTEM VALUE VALUES");
say(TASKS.map((t, i) => `  (${i + 1}, 1, ${t.lessonId}, 1, ${q(t.title)}, ${q(JSON.stringify(t.qs))})`).join(",\n") + ";");

say(`
-- 레슨의 자료. 파일 또는 링크.`);
say("INSERT INTO lesson_material (lounge_id, lesson_id, seq, kind, url, label) VALUES");
say(MATERIALS.map((m, i) => `  (1, ${m.lesson}, ${i}, ${q(m.kind)}, ${q(m.url)}, ${q(m.label)})`).join(",\n") + ";");

/* ---- 글 ---- */

const cmtCount = (p) => (p.thread || []).reduce((a, c) => a + 1 + (c.replies || []).length, 0);
const reactTotal = (p) => Object.values(p.reactions || {}).reduce((a, b) => a + b, 0);

const postRows = [], answerRows = [], attachRows = [], commentRows = [], reactRows = [], passRows = [];
let pid = 0, cmid = 0;
const capped = [];

POSTS.forEach((p) => {
  pid++;
  const at = ago(p.when);
  const rc = (p.likes || 0) + reactTotal(p);
  postRows.push(`  (${pid}, 1, ${cid[p.cat]}, ${uid[p.author]}, ${q(p.author)}, ${q(p.title)}, ${q(p.body || null)}, ${n(p.task || null)}, ${!!p.pinned}, ${rc}, ${cmtCount(p)}, ${n(p.views || 0)}, ${at}, ${at})`);

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
    let gave = 0;
    for (; gave < count && cursor < pool.length; gave++, cursor++) {
      reactRows.push(`  ('post', ${pid}, ${pool[cursor]}, ${q(emoji)}, ${at})`);
    }
    // 반응은 사람당 한 번이다. 목업의 수가 사람 수보다 많으면 여기서 잘린다 —
    // 26명이 48개의 좋아요를 누를 수는 없다. 화면과 숫자가 달라 보이면 이것이다.
    if (gave < count) capped.push(`${p.title.slice(0, 16)}… ${emoji} ${count}→${gave}`);
  };
  give("👍", p.likes || 0);
  Object.keys(p.reactions || {}).forEach((e) => give(e, p.reactions[e]));

  const pushCmt = (c, parent) => {
    cmid++;
    const me = cmid;
    commentRows.push(`  (${me}, ${pid}, ${n(parent)}, ${uid[c.author]}, ${q(c.author)}, ${q(c.text)}, ${c.up || 0}, ${ago(c.when)})`);

    /* 댓글 좋아요도 반응 행으로 남긴다. 숫자만 적어 두면 랭킹에서 안 보인다 —
       랭킹은 '받은 이모지' 를 실제 행에서 세기 때문이다. */
    const cpool = MEMBERS.filter((m) => m.name !== c.author).map((m) => uid[m.name]);
    let ccur = 0;
    for (let g = 0; g < (c.up || 0) && ccur < cpool.length; g++, ccur++) {
      reactRows.push(`  ('comment', ${me}, ${cpool[ccur]}, ${q("👍")}, ${ago(c.when)})`);
    }
    if ((c.up || 0) > cpool.length) {
      capped.push(`댓글 ${q(c.text).slice(1, 14)}… 👍 ${c.up}→${cpool.length}`);
    }

    (c.replies || []).forEach((r) => pushCmt(r, me));
  };
  (p.thread || []).forEach((c) => pushCmt(c, null));
});

say(`
-- 글. 글쓴이는 user_id 로 판정하고 author_name 으로 표시한다.`);
say("INSERT INTO post (id, lounge_id, category_id, user_id, author_name, title, body, task_id, is_pinned, reaction_count, comment_count, view_count, created_at, updated_at) OVERRIDING SYSTEM VALUE VALUES");
say(postRows.join(",\n") + ";");

say(`
-- 과제 미션 답변. 질문 문구도 그때 것으로 같이 남긴다.`);
say("INSERT INTO post_answer (post_id, seq, question, answer) VALUES");
say(answerRows.join(",\n") + ";");

say(`
-- 첨부`);
say("INSERT INTO attachment (post_id, kind, url, label, sort) VALUES");
say(attachRows.join(",\n") + ";");

say(`
-- 댓글. 답글은 한 단계까지만.`);
say("INSERT INTO comment (id, post_id, parent_id, user_id, author_name, body, reaction_count, created_at) OVERRIDING SYSTEM VALUE VALUES");
say(commentRows.join(",\n") + ";");

say(`
-- 반응`);
say("INSERT INTO reaction (target_kind, target_id, user_id, emoji, created_at) VALUES");
say(reactRows.join(",\n") + ";");

say(`
-- 피드백권 소모. 글을 올리는 시점에 나간다. 답이 안 와도 이미 쓴 것이다.`);
say("INSERT INTO feedback_pass_use (lounge_id, user_id, post_id, used_at) VALUES");
say(passRows.join(",\n") + ";");

say(`
-- id 를 직접 넣었으므로 시퀀스를 다음 값으로 옮겨 둔다.
SELECT setval(pg_get_serial_sequence('lounge','id'),   (SELECT max(id) FROM lounge));
SELECT setval(pg_get_serial_sequence('category','id'), (SELECT max(id) FROM category));
SELECT setval(pg_get_serial_sequence('post','id'),     (SELECT max(id) FROM post));
SELECT setval(pg_get_serial_sequence('lesson_task','id'), (SELECT max(id) FROM lesson_task));
SELECT setval(pg_get_serial_sequence('ext_section','id'), (SELECT max(id) FROM ext_section));
SELECT setval(pg_get_serial_sequence('ext_lesson','id'),  (SELECT max(id) FROM ext_lesson));
SELECT setval(pg_get_serial_sequence('comment','id'),  (SELECT max(id) FROM comment));

-- 파생 카운터를 실제 행 수로 맞춘다. 시드가 어긋나지 않았는지 확인하는 셈이기도 하다.
UPDATE post SET
  comment_count  = (SELECT count(*) FROM comment c WHERE c.post_id = post.id AND c.deleted_at IS NULL),
  reaction_count = (SELECT count(*) FROM reaction r WHERE r.target_kind = 'post' AND r.target_id = post.id);

UPDATE comment SET
  reaction_count = (SELECT count(*) FROM reaction r WHERE r.target_kind = 'comment' AND r.target_id = comment.id);

COMMIT;
`);

/* ---- MariaDB 판 ----
   node db/make-seed.js --mariadb > db/seed.mariadb.sql
   생성된 Postgres SQL 을 MariaDB 방언으로 바꾼다. 데이터를 두 벌 쓰지 않는다 —
   원본은 여전히 data-mock.js 하나고, 방언 차이는 전부 이 함수에 모여 있다.
   스키마 쪽 차이는 db/schema.mariadb.sql 머리 주석에 있다. */
const UNIT = { minutes: "MINUTE", hours: "HOUR", days: "DAY" };
function toMaria(sql) {
  return sql
    .replace("SET TIME ZONE 'UTC';", "SET time_zone = '+00:00';")
    .replace(/^BEGIN;$/m, "START TRANSACTION;")
    // TRUNCATE … RESTART IDENTITY CASCADE → 외래키 검사를 잠깐 끄고 표마다 TRUNCATE.
    // MariaDB 의 TRUNCATE 는 AUTO_INCREMENT 도 되돌린다.
    .replace(/TRUNCATE ([\s\S]*?) RESTART IDENTITY CASCADE;/g, (_, list) =>
      list.split(",").map((t) => `TRUNCATE TABLE ${t.trim()};`).join("\n"))
    .replace(/^(TRUNCATE TABLE [\s\S]*?;)(?=\n\n)/m, "SET FOREIGN_KEY_CHECKS = 0;\n$1\nSET FOREIGN_KEY_CHECKS = 1;")
    .replace(/interval '(\d+) (minutes|hours|days)'/g, (_, k, u) => `INTERVAL ${k} ${UNIT[u]}`)
    .replace(/date_trunc\('week', now\(\)\)::date/g, "DATE(NOW() - INTERVAL WEEKDAY(NOW()) DAY)")
    .replace(/ OVERRIDING SYSTEM VALUE/g, "")
    // id 를 직접 넣어도 AUTO_INCREMENT 는 저절로 그 다음으로 간다. 시퀀스 조정이 없다.
    .replace(/^-- id 를 직접 넣었으므로 시퀀스를 다음 값으로 옮겨 둔다\.\n(SELECT setval\(.*\n)+/m, "")
    .replace("-- db/make-seed.js 가 web/assets/data-mock.js 에서 뽑아 만든다. 직접 고치지 말 것.",
             "-- db/make-seed.js --mariadb 가 web/assets/data-mock.js 에서 뽑아 만든다. 직접 고치지 말 것.\n-- MariaDB 판. 스키마는 db/schema.mariadb.sql.");
}

const MARIA = process.argv.includes("--mariadb");
console.log(MARIA ? toMaria(out.join("\n")) : out.join("\n"));

if (capped.length) console.error(`사람 수보다 많아 잘린 반응 ${capped.length}건: ${capped.slice(0,3).join(" · ")}${capped.length>3?" …":""}`);
console.error(`사람 ${MEMBERS.length} · 글 ${pid} · 댓글 ${cmid} · 반응 ${reactRows.length} · 섹션 ${SECTIONS.length} · 레슨 ${LESSONS.length} · 과제 ${TASKS.length} · 자료 ${MATERIALS.length} · 시청 ${wrows.length}`);
