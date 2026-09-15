/* DB 행을 화면이 아는 모양으로 옮긴다.
 *
 * 나오는 것은 window.LOUNGE_DATA 이고, 그 모양의 명세는
 * web/assets/data-mock.js 다. lounge.js 는 목업인지 서버인지 알지 못한다 —
 * 그래서 기능을 프로토타입에서 먼저 확인하고 그대로 앱에 쓸 수 있다.
 */

const path = require("path");
const Q = require("./queries");
const account = require("./account");
const config = require("./config");

/* 시각은 서버가 문자열까지 만들어 내려준다.
   클라이언트가 "3일 전" 을 계산하면 브라우저 시계에 따라 달라진다. */
function when(at, now) {
  const s = Math.floor((now - new Date(at)) / 1000);
  if (s < 60) return "방금";
  if (s < 3600) return Math.floor(s / 60) + "분 전";
  if (s < 86400) return Math.floor(s / 3600) + "시간 전";
  const d = Math.floor(s / 86400);
  if (d === 1) return "어제";
  if (d < 7) return d + "일 전";
  return Math.floor(d / 7) + "주 전";
}

const daysBetween = (at, now) =>
  at ? Math.floor((now - new Date(at)) / 86400000) : null;

/* DB 가 없으면 프로토타입이 쓰는 목업을 그대로 내려준다.
   화면 코드는 어차피 출처를 모르므로 그대로 뜬다. 쓰기만 받지 않는다. */
function demoData() {
  global.window = global.window || {};
  delete require.cache[require.resolve("../web/assets/data-mock.js")];
  require("../web/assets/data-mock.js");
  const D = global.window.LOUNGE_DATA;
  return Object.assign({}, D, {
    me: { name: "박현종", role: "student", lounges: [] },
    demo: true
    // api 를 넣지 않는다 — 쓰기가 서버로 가지 않고 화면 안에서만 돈다
  });
}

async function loungeData(loungeId, viewerId) {
  if (config.demo) return demoData();
  const now = new Date();
  const L = await Q.lounge(loungeId);

  const [mem, cats, rights, ps, cms, allLounges, course, live, lb7, lb30, lbAll, pass, flags] =
    await Promise.all([
      Q.members(loungeId), Q.categories(), Q.categoryRights(loungeId),
      Q.posts(loungeId, viewerId), Q.comments(loungeId, viewerId), Q.lounges(),
      account.course(L.course_id), account.live(L.course_id),
      Q.received(loungeId, 7), Q.received(loungeId, 30), Q.received(loungeId, null),
      account.passes(viewerId, L.course_id), Q.weekFlags(loungeId)
    ]);

  const [tp7, tp30, tpAll] = await Promise.all([
    Q.topPosts(loungeId, 7), Q.topPosts(loungeId, 30), Q.topPosts(loungeId, null)
  ]);

  // 내가 어느 강을 봤는지. 진도율과 체크 표시가 이걸로 살아난다.
  const seen = new Set((await account.watched(viewerId, L.course_id))
    .filter((w) => w.is_complete).map((w) => Number(w.lesson_id)));

  /* ---- 멤버 ---- */
  const members = mem.map((m) => ({
    userId: Number(m.user_id),
    name: m.nickname,
    cohort: m.cohort || 0,
    role: m.role,
    wk: m.week,
    lastDays: daysBetween(m.last_seen_at, now) ?? 99,
    joined: daysBetween(m.joined_at, now),
    first: m.first_submit_at
      ? Math.max(0, daysBetween(m.first_submit_at, now) === null ? 0
          : daysBetween(m.joined_at, now) - daysBetween(m.first_submit_at, now))
      : null,
    paid: m.role === "student",
    muted: !!(m.muted_until && new Date(m.muted_until) > now),
    mutedUntil: m.muted_until || null,
    mutedReason: m.muted_reason || null,
    ...(m.staff_of ? { lounges: m.staff_of.map(loungeKey) } : {})
  }));

  /* ---- 카테고리 : 라운지별 쓰기 권한을 roles 로 되돌린다 ---- */
  const rightOf = new Map(rights.map((r) => [r.name, r]));
  const categories = cats.map((c) => {
    const r = rightOf.get(c.name);
    const out = { id: c.id, name: c.name };
    if (c.is_system) out.system = true;
    if (c.pass_required) out.pass = true;
    if (!r) {
      // 이 라운지에 놓이지 않은 카테고리. 필터에도 안 뜨고 글도 못 쓴다.
      out.roles = [];
    } else if (!(r.student_can_write && r.instructor_can_write)) {
      out.roles = ["admin"];
      if (r.instructor_can_write) out.roles.unshift("instructor");
      if (r.student_can_write) out.roles.unshift("student");
    }
    return out;
  });

  /* ---- 글 + 댓글 ---- */
  const byPost = new Map();
  const byId = new Map();
  cms.forEach((c) => {
    const node = {
      id: c.id,
      author: c.author_name, when: when(c.created_at, now), text: c.body,
      up: c.reaction_count, mineUp: c.mine_up, replies: []
    };
    if (c.staff) node.staff = true;
    byId.set(c.id, node);
    if (c.parent_id) {
      const parent = byId.get(c.parent_id);
      if (parent) { node.at = parent.author; parent.replies.push(node); }
    } else {
      if (!byPost.has(c.post_id)) byPost.set(c.post_id, []);
      byPost.get(c.post_id).push(node);
    }
  });

  const posts = ps.map((p) => {
    const out = {
      id: p.id,
      cat: p.category,
      wk: p.week || 0,
      author: p.author_name,
      when: when(p.created_at, now),
      likes: p.likes,
      views: p.view_count,
      mine: p.mine,
      liked: p.reacted,
      myReact: p.my_react || null,
      reports: p.reports || 0,
      reported: p.reported,
      title: p.title,
      thread: byPost.get(p.id) || []
    };
    if (p.is_pinned) out.pinned = true;
    if (p.body) out.body = p.body;
    if (p.reactions) out.reactions = p.reactions;
    if (p.answers) out.mission = p.answers.map((a) => ({ q: a.q, a: a.a }));
    if (p.attach) {
      out.attach = p.attach.map((a) => ({ type: a.kind, url: a.url || null,
                                          title: a.label, label: a.label }));
    }
    return out;
  });

  /* ---- 강의 ---- */
  const lessons = course.lessons.map((l) => ({
    id: Number(l.id),
    wk: l.week, chap: l.chapter, t: l.title, d: l.duration,
    video: !!l.video_url, doc: l.doc,
    done: seen.has(Number(l.id))
  }));

  const missions = {};
  course.missions.forEach((m) => {
    if (!missions[m.week]) missions[m.week] = { title: m.title, qs: [] };
    missions[m.week].qs.push({ q: m.question, hint: m.hint });
  });

  const byWeek = new Map((course.weekTitles || []).map((w) => [w.week, w.title]));
  const pub = new Map(flags.map((f) => [f.week, f.published]));
  const weeks = [];
  const weekPublished = [];
  for (let w = 1; w <= course.weeks; w++) {
    weeks.push(byWeek.get(w) || `${w}주차`);
    weekPublished.push(pub.has(w) ? pub.get(w) : true);   // 행이 없으면 공개
  }

  /* ---- 나머지 ---- */
  const lounges = allLounges.map((l) => ({
    id: loungeKey(l.id),
    name: l.name,
    show: (l.chips || []).filter((c) => c.placement === "show").map((c) => c.name),
    more: (l.chips || []).filter((c) => c.placement === "more").map((c) => c.name)
  }));

  const passCat = cats.find((c) => c.pass_required);
  const passes = passCat && pass
    ? { [passCat.name]: {
          left: Math.max(0, pass.quota_per - pass.used),
          per: pass.quota_per,
          note: `주 ${pass.quota_per}회 · 관리자 지급` } }
    : {};

  /* 순위는 동점을 같은 등수로 본다. 받은 수가 같은데 등수가 다르면 설명할 수 없다. */
  function ranked(list) {
    let rank = 0, prev = null;
    return list.map((r, i) => {
      if (r.total !== prev) { rank = i + 1; prev = r.total; }
      return {
        rank: rank, name: r.name, wk: r.week, cohort: r.cohort || 0,
        total: r.total,
        emojis: (r.emojis || []).map((x) => [x.e, x.n])
      };
    });
  }

  const top5 = (list) => list.filter((r) => r.total > 0).slice(0, 5)
    .map((r) => [r.name, Number(r.total).toLocaleString("ko-KR")]);

  return {
    members, posts, lessons, weeks, weekPublished, missions, categories, lounges, passes,
    live: live
      ? { title: live.title,
          when: liveWhen(live.starts_at),
          days: Math.max(0, Math.ceil((new Date(live.starts_at) - now) / 86400000)) }
      : { title: "예정된 라이브가 없습니다", when: "", days: 0 },
    leaderboard: { "7": top5(lb7), "30": top5(lb30), all: top5(lbAll) },
    ranking: { "7": ranked(lb7), "30": ranked(lb30), all: ranked(lbAll) },
    topPosts: { "7": tp7, "30": tp30, all: tpAll },
    lounge: { id: loungeKey(L.id), name: L.name, intro: L.intro,
              todo: (L.todo || "").split("\n").map((x) => x.trim()).filter(Boolean) },
    me: (function () {
      const m = mem.find((x) => Number(x.user_id) === Number(viewerId));
      return m
        ? { name: m.nickname, role: m.role, lounges: (m.staff_of || []).map(loungeKey) }
        : { name: "손님", role: "student", lounges: [] };
    })(),
    api: "/l"        // 목업에는 없다. 있으면 쓰기가 서버로 간다
  };
}

const KEYS = { 1: "academy", 2: "ai", 3: "ebook" };
const loungeKey = (id) => KEYS[id] || String(id);

/* 저장은 UTC 로 하고 보여줄 때만 한국 시각으로 옮긴다. */
function liveWhen(at) {
  const f = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false
  });
  const part = {};
  f.formatToParts(new Date(at)).forEach((x) => { part[x.type] = x.value; });
  return `${part.weekday} ${part.hour}:${part.minute}`;
}

module.exports = { loungeData, when };
