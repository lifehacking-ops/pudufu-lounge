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

  const [mem, cats, rights, ps, allLounges, course, live, lb7, lb30, lbAll, pass, flags, taskRows, matRows] =
    await Promise.all([
      Q.members(loungeId, L.course_id), Q.categories(), Q.categoryRights(loungeId),
      Q.posts(loungeId, viewerId), Q.lounges(),
      account.course(L.course_id), account.live(L.course_id),
      Q.received(loungeId, 7), Q.received(loungeId, 30), Q.received(loungeId, null),
      account.passes(viewerId, L.course_id), Q.sectionFlags(loungeId),
      Q.tasks(loungeId), Q.materials(loungeId)
    ]);

  const [submit, totalPosts, mine, railN, recent] = await Promise.all([
    Q.taskSubmit(loungeId), Q.postCount(loungeId), Q.myTasks(loungeId, viewerId),
    Q.railStats(loungeId), Q.recentMembers(loungeId, 6)]);

  const [tp7, tp30, tpAll] = await Promise.all([
    Q.topPosts(loungeId, 7), Q.topPosts(loungeId, 30), Q.topPosts(loungeId, null)
  ]);

  // 내가 어느 레슨을 어디까지 봤는지. 진도율 · 완료 표시 · 이어보기가 이걸로 살아난다.
  const watchRows = await account.watched(viewerId, L.course_id);
  const watch = new Map(watchRows.map((w) => [Number(w.lesson_id), w]));

  const meRow = mem.find((x) => Number(x.user_id) === Number(viewerId));
  const staff = !!(meRow && (meRow.role === "instructor" || meRow.role === "admin"));

  /* ---- 멤버 ----
     수강생 화면이 멤버로 하는 일은 검색뿐이다. 접속 기록 · 정지 사유 · 피드백권은
     운영 정보라 보낼 이유도 없다. 200명이면 그것만으로 38KB 다. */
  const fullMembers = mem.map((m) => ({
    userId: Number(m.user_id),
    name: m.nickname,
    cohort: m.cohort || 0,
    role: m.role,
    section: m.section_id == null ? null : Number(m.section_id),
    lastDays: daysBetween(m.last_seen_at, now) ?? 99,
    joined: daysBetween(m.joined_at, now),
    first: m.first_submit_at
      ? Math.max(0, daysBetween(m.first_submit_at, now) === null ? 0
          : daysBetween(m.joined_at, now) - daysBetween(m.first_submit_at, now))
      : null,
    paid: m.role === "student",

    /* 피드백권 잔량. 표에서 바로 보여야 지급과 회수를 판단할 수 있다. */
    ...(m.quota_per == null ? {} : { passLeft: m.quota_per - m.used, passQuota: m.quota_per }),
    muted: !!(m.muted_until && new Date(m.muted_until) > now),
    mutedUntil: m.muted_until || null,
    mutedReason: m.muted_reason || null,
    ...(m.staff_of ? { lounges: m.staff_of.map(loungeKey) } : {})
  }));

  const members = staff ? fullMembers : fullMembers.map((m) => ({
    userId: m.userId, name: m.name, role: m.role, cohort: m.cohort, section: m.section
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

  /* ---- 글 + 댓글 ----
     첫 화면은 한 묶음만 싣는다. 나머지는 '더 보기' 가 같은 길로 이어 온다. */
  /* 고정 글은 오래됐어도 맨 위여야 한다. 첫 묶음에 없으면 따로 집어 얹는다. */
  const pinIds = (await Q.pinnedPosts(loungeId, viewerId)).map((x) => x.id)
    .filter((id) => !ps.some((p) => String(p.id) === String(id)));
  const extra = await Q.postsByIds(loungeId, viewerId, pinIds);

  const all = extra.concat(ps);
  const cms = all.length ? await Q.comments(loungeId, viewerId, all.map((p) => p.id)) : [];
  const posts = shapePosts(all, cms, now);

  /* 대시보드와 게시물 관리는 전체를 세야 한다. 스태프에게만 가벼운 목록을 보낸다. */
  const index = staff ? (await Q.postIndex(loungeId)).map((p) => ({
    id: p.id, cat: p.category, taskId: p.task_id == null ? null : Number(p.task_id),
    author: p.author_name, mine: Number(p.user_id) === Number(viewerId),
    when: when(p.created_at, now), title: p.title,
    views: p.view_count, comments: p.comment_n, reacts: p.react_n,
    reports: p.reports || 0, pinned: !!p.is_pinned
  })) : null;

  /* ---- 강의 : 섹션 → 레슨 → 과제 · 자료 ----
     강의 구조(섹션 · 레슨)는 프드프 것이고, 과제 · 자료 · 게시 여부는 라운지 것이다.
     화면이 쓰기 쉽게 한 나무로 엮어 보낸다. */
  const myTaskById = new Map(mine.map((m) => [Number(m.task_id), m]));
  const tasksOf = new Map();
  taskRows.forEach((t) => {
    const k = Number(t.lesson_id);
    if (!tasksOf.has(k)) tasksOf.set(k, []);
    const my = myTaskById.get(Number(t.id));
    tasksOf.get(k).push({
      id: Number(t.id), seq: t.seq, title: t.title,
      qs: Array.isArray(t.questions) ? t.questions : JSON.parse(t.questions || "[]"),
      submittedPostId: my ? Number(my.id) : null,
      ...(staff ? { submitted: t.submitted } : {})
    });
  });
  const matsOf = new Map();
  matRows.forEach((m) => {
    const k = Number(m.lesson_id);
    if (!matsOf.has(k)) matsOf.set(k, []);
    matsOf.get(k).push({ id: Number(m.id), kind: m.kind, url: m.url, label: m.label });
  });

  const pub = new Map(flags.map((f) => [Number(f.section_id), f.published]));
  const lessonsOf = new Map();
  (course.lessons || []).forEach((l) => {
    const w = watch.get(Number(l.id));
    const dur = l.duration_sec == null ? null : Number(l.duration_sec);
    const sec = w ? Number(w.watched_sec || 0) : 0;
    const k = Number(l.section_id);
    if (!lessonsOf.has(k)) lessonsOf.set(k, []);
    lessonsOf.get(k).push({
      id: Number(l.id), seq: l.seq, title: l.title,
      durationSec: dur, videoUrl: l.video_url || null,
      doc: l.doc || null, description: l.description || null,
      timeline: Array.isArray(l.timeline) ? l.timeline : (l.timeline ? JSON.parse(l.timeline) : []),
      watchedSec: sec,
      // 완료의 진실은 is_complete. 길이를 알면 끝까지 본 것도 완료로 본다.
      done: !!(w && (w.is_complete || (dur && sec >= dur))),
      tasks: tasksOf.get(Number(l.id)) || [],
      materials: matsOf.get(Number(l.id)) || []
    });
  });

  const sections = (course.sections || []).map((sc) => ({
    id: Number(sc.id), seq: sc.seq, title: sc.title,
    published: pub.has(Number(sc.id)) ? !!pub.get(Number(sc.id)) : true,   // 행이 없으면 공개
    lessons: (lessonsOf.get(Number(sc.id)) || []).sort((a, b) => a.seq - b.seq)
  }));

  /* 이어보기 : 가장 최근에 본 레슨. 다 본 레슨만 남았으면 그중 최근 것 — 다음 레슨은 화면이 고른다. */
  let resume = null;
  const lessonIndex = new Map();
  sections.forEach((sc) => sc.lessons.forEach((l) => lessonIndex.set(l.id, { sectionId: sc.id, lesson: l })));
  const recentWatch = watchRows
    .filter((w) => lessonIndex.has(Number(w.lesson_id)))
    .sort((a, b) => new Date(b.watched_at) - new Date(a.watched_at));
  const pick = recentWatch.find((w) => !lessonIndex.get(Number(w.lesson_id)).lesson.done) || recentWatch[0];
  if (pick) {
    const hit = lessonIndex.get(Number(pick.lesson_id));
    resume = { lessonId: hit.lesson.id, sectionId: hit.sectionId, watchedSec: Number(pick.watched_sec || 0), at: pick.watched_at };
  }

  /* 과제 진행률 : 공개 섹션의 살아 있는 과제 중 내가 낸 것 */
  let taskTotal = 0, taskDone = 0;
  sections.filter((sc) => sc.published).forEach((sc) => sc.lessons.forEach((l) => l.tasks.forEach((t) => {
    taskTotal++; if (t.submittedPostId) taskDone++;
  })));

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
  /* 200명이면 세 기간을 합쳐 40KB 가 넘는다. 아래쪽은 아무도 열어 보지 않는다.
     위 50명과 '나' 만 싣는다 — 내 순위는 몇 등이든 보여야 한다. */
  const RANK_TOP = 50;

  function ranked(list) {
    let rank = 0, prev = null;
    const meName = (mem.find((x) => Number(x.user_id) === Number(viewerId)) || {}).nickname;
    const full = list.map((r, i) => {
      if (r.total !== prev) { rank = i + 1; prev = r.total; }
      return {
        rank: rank, name: r.name, section: r.section_id == null ? null : Number(r.section_id), cohort: r.cohort || 0,
        total: r.total,
        emojis: (r.emojis || []).map((x) => [x.e, x.n])
      };
    });
    const top = full.slice(0, RANK_TOP);
    const mine = full.find((x) => x.name === meName);
    if (mine && !top.some((x) => x.name === meName)) top.push(mine);
    return top;
  }

  const top5 = (list) => list.filter((r) => r.total > 0).slice(0, 5)
    .map((r) => [r.name, Number(r.total).toLocaleString("ko-KR")]);

  return {
    members, posts, sections, resume, taskProgress: { done: taskDone, total: taskTotal },
    categories, lounges, passes,
    editableCourse: config.pudufu.mode !== "remote",   // 로컬에서만 섹션 · 레슨을 여기서 만든다
    live: live
      ? { title: live.title,
          when: liveWhen(live.starts_at),
          days: Math.max(0, Math.ceil((new Date(live.starts_at) - now) / 86400000)) }
      : { title: "예정된 라이브가 없습니다", when: "", days: 0 },
    leaderboard: { "7": top5(lb7), "30": top5(lb30), all: top5(lbAll) },
    ranking: { "7": ranked(lb7), "30": ranked(lb30), all: ranked(lbAll) },
    topPosts: { "7": tp7, "30": tp30, all: tpAll },
    lounge: { id: loungeKey(L.id), name: L.name, intro: L.intro,
              todo: (L.todo || "").split("\n").map((x) => x.trim()).filter(Boolean),
              attach: L.intro_att || [] },
    me: (function () {
      const m = mem.find((x) => Number(x.user_id) === Number(viewerId));
      if (!m) return { name: "손님", role: "student", lounges: [] };

      /* 정지·만료도 같이 보낸다. 화면이 모르면 다 쓰고 나서 게시를 누른 순간에야
         '쓸 수 없습니다' 를 만난다 — 쓴 사람은 그 앞에서 알았어야 한다. */
      const muted = !!(m.muted_until && new Date(m.muted_until) > now);
      const out = {
        name: m.nickname, role: m.role,
        lounges: (m.staff_of || []).map(loungeKey)
      };
      if (muted) {
        out.muted = true;
        out.mutedUntil = dayLabel(m.muted_until);
        out.mutedReason = m.muted_reason || null;
      }
      if (m.expires_at && new Date(m.expires_at) < now) {
        out.expired = true;
        out.expiredAt = dayLabel(m.expires_at);
      }
      return out;
    })(),
    stats: { students: submit.students, submitted: submit.submitted, posts: totalPosts.n },

    rail: {
      students: railN.students, today: railN.today, cohorts: railN.cohorts,
      recent: recent.map((r) => r.nickname)
    },

    /* 내 순위 / 전체 수강생. '상위 12%' 가 마크업에 박혀 있었다. */
    myRank: Object.fromEntries([["7", lb7], ["30", lb30], ["all", lbAll]].map(([k, list]) => {
      const meName = meRow && meRow.nickname;
      const i = list.findIndex((r) => r.name === meName && r.total > 0);
      return [k, { rank: i < 0 ? null : i + 1, of: railN.students }];
    })),

    /* 내가 낸 과제. 피드 묶음 밖에 있어도 강의실이 '제출 완료' 를 알아야 한다. */
    myTasks: Object.fromEntries(mine.map((m) => [Number(m.task_id), {
      postId: Number(m.id), when: when(m.created_at, now), at: m.created_at,
      mission: m.answers || [],
      attach: (m.attach || []).map((a) => ({ type: a.kind, url: a.url || null, title: a.label, label: a.label }))
    }])),
    more: ps.length >= Q.PAGE,   // 더 실을 글이 남았는가
    cursor: ps.length ? { at: ps[ps.length - 1].created_at, id: String(ps[ps.length - 1].id) } : null,
    postIndex: index,            // 스태프에게만. 대시보드와 게시물 관리가 센다
    api: "/l"        // 목업에는 없다. 있으면 쓰기가 서버로 간다
  };
}

/* 화면이 쓰는 라운지 열쇠. 양쪽(me.lounges · lounges[].id · lounge.id)이 같은
   함수를 거치므로 무엇이든 된다. 이름을 박아 두면 라운지가 생기고 없어질 때마다
   여기를 고쳐야 한다. */
const loungeKey = (id) => String(id);

/* 저장은 UTC 로 하고 보여줄 때만 한국 시각으로 옮긴다. */
function liveWhen(at) {
  const f = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", weekday: "short", hour: "2-digit", minute: "2-digit", hour12: false
  });
  const part = {};
  f.formatToParts(new Date(at)).forEach((x) => { part[x.type] = x.value; });
  return `${part.weekday} ${part.hour}:${part.minute}`;
}

/* 글 한 묶음을 화면이 쓰는 모양으로 만든다. 첫 화면과 '더 보기' 가 같은 것을 쓴다 —
   두 벌로 두면 한쪽만 고쳐져서 스크롤 아래부터 다르게 보이기 시작한다. */
function shapePosts(ps, cms, now) {
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

  return ps.map((p) => {
    const out = {
      id: p.id,
      cat: p.category,
      taskId: p.task_id == null ? null : Number(p.task_id),
      lessonId: p.lesson_id == null ? null : Number(p.lesson_id),
      taskTitle: p.task_title || null,
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
}

/* '더 보기' 한 묶음. 첫 화면과 같은 조립을 거친다. */
async function postPage(loungeId, viewerId, before) {
  const ps = await Q.posts(loungeId, viewerId, before);
  const ids = ps.map((p) => p.id);
  const cms = ids.length ? await Q.comments(loungeId, viewerId, ids) : [];
  return {
    posts: shapePosts(ps, cms, new Date()),
    more: ps.length >= Q.PAGE,
    cursor: ps.length ? { at: ps[ps.length - 1].created_at, id: String(ps[ps.length - 1].id) } : null
  };
}

/* 글 한 편. 묶음 밖에 있는 글로 바로 들어올 때 쓴다 —
   링크를 받아 온 사람과, 대시보드에서 건너뛴 사람. */
async function postOne(loungeId, viewerId, id) {
  const ps = await Q.postsByIds(loungeId, viewerId, [id]);
  if (!ps.length) return null;
  const cms = await Q.comments(loungeId, viewerId, [ps[0].id]);
  return shapePosts(ps, cms, new Date())[0];
}

/* 2026년 3월 4일 같은 날짜 한 줄. 정지 해제일처럼 '언제까지' 를 말할 때 쓴다. */
function dayLabel(at) {
  if (!at) return null;
  const f = new Intl.DateTimeFormat("ko-KR", {
    timeZone: "Asia/Seoul", year: "numeric", month: "long", day: "numeric"
  });
  return f.format(new Date(at));
}

module.exports = { loungeData, postPage, postOne, when };
