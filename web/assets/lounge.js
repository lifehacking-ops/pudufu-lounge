/* 프드프 라운지 · 화면과 동작
 *
 * 프로토타입과 앱이 같은 파일을 쓴다. 기능을 고칠 때는 프로토타입에서 먼저
 * 확인하고, 확정되면 여기 한 곳만 고치면 양쪽이 같이 바뀐다.
 *
 * 데이터는 window.LOUNGE_DATA 로 들어온다. 이 파일은 그것이 목업인지
 * 서버가 내려준 것인지 알지 못한다.
 */

(function () {
  "use strict";

  /* 데이터는 밖에서 들어온다.
     프로토타입은 web/assets/data-mock.js 가 채우고,
     앱은 서버가 같은 모양으로 채운다. 이 아래 코드는 어느 쪽인지 모른다. */
  var D = window.LOUNGE_DATA;

  /* 쓰기는 이 한 곳으로만 나간다.
     프로토타입에는 D.api 가 없어서 메모리만 고치고 끝난다.
     앱에서는 서버가 D.api 를 넣어 주므로 같은 자리에서 DB 로도 간다.
     이 아래 코드는 자기가 어느 쪽인지 알지 못한다. */
  var API = D.api || null;

  function send(method, path, payload) {
    if (!API) return Promise.resolve(null);
    return fetch(API + path, {
      method: method,
      headers: { "content-type": "application/json" },
      body: payload ? JSON.stringify(payload) : undefined
    }).then(function (r) {
      return r.json().catch(function () { return {}; }).then(function (j) {
        if (!r.ok) throw new Error(j.error || ("저장하지 못했습니다 (" + r.status + ")"));
        return j;
      });
    });
  }

  /* 보내는 동안 단추를 잠근다. 게시가 느리면 사람은 한 번 더 누르고, 그러면 두 편이
     올라간다. 잠금은 화면의 일이고, 그래도 두 요청이 떠났을 때는 서버가 하나로 본다. */
  /* 글 한 편 · 댓글 한 개에 열쇠 하나. 쓰기 시작할 때 만들고 저장되면 버린다.
     같은 열쇠가 서버에 두 번 가면 서버가 하나로 본다 — 단추 잠금이 새는 경우
     (느린 회선에서 두 요청이 이미 떠난 경우)까지 막는다. */
  function newKey() {
    return "k" + Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
  }

  function busy(btn, label, promise) {
    if (!btn) return promise;
    var was = btn.textContent;
    btn.disabled = true;
    btn.textContent = label;
    btn.setAttribute("aria-busy", "true");
    return promise.finally(function () {
      btn.disabled = false;
      btn.textContent = was;
      btn.removeAttribute("aria-busy");
    });
  }

  /* 저장이 실패하면 조용히 지나가지 않는다. 화면과 DB 가 어긋난 채로 두면
     무엇이 사실인지 알 수 없게 된다. 그 자리에 알리고 되읽게 한다. */
  function failed(e) {
    var box = $("saveError");
    if (!box) {
      box = el("div", "gate gate-block");
      box.id = "saveError";
      box.dataset.tone = "error";
      document.querySelector(".grid-community").prepend(box);
    }
    box.textContent = "";
    box.appendChild(el("b", null, "저장하지 못했습니다."));
    box.appendChild(el("span", "muted", e.message));
    box.appendChild(el("span", "grow"));
    var again = el("button", "btn-sec", "새로고침");
    again.type = "button";
    again.addEventListener("click", function () { location.reload(); });
    box.appendChild(again);
    box.hidden = false;
  }


  var $ = function (id) { return document.getElementById(id); };

  function el(tag, cls, text) {
    var n = document.createElement(tag);
    if (cls) n.className = cls;
    if (text != null) n.textContent = text;
    return n;
  }

  /* 아이콘은 Lucide 정본 경로를 그대로 쓴다(디자인 가이드 8절). 선 굵기 2, 색은 글자색.
     장식이므로 aria-hidden — 뜻은 감싸는 버튼의 aria-label 이 말한다.
     라이브러리를 싣지 않는 이유: 쓰는 아이콘이 열둘뿐이고, 파일만 열면 돌아야 한다. */
  var ICONS = {
    x: '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>',
    play: '<polygon points="6 3 20 12 6 21 6 3"/>',
    more: '<circle cx="12" cy="12" r="1"/><circle cx="12" cy="5" r="1"/><circle cx="12" cy="19" r="1"/>',
    "chevron-down": '<path d="m6 9 6 6 6-6"/>',
    "chevron-left": '<path d="m15 18-6-6 6-6"/>',
    "chevron-right": '<path d="m9 18 6-6-6-6"/>',
    plus: '<path d="M5 12h14"/><path d="M12 5v14"/>',
    minus: '<path d="M5 12h14"/>',
    "arrow-left": '<path d="m12 19-7-7 7-7"/><path d="M19 12H5"/>',
    "arrow-right": '<path d="M5 12h14"/><path d="m12 5 7 7-7 7"/>',
    pencil: '<path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z"/><path d="m15 5 4 4"/>',
    check: '<path d="M20 6 9 17l-5-5"/>',
    pin: '<path d="M12 17v5"/><path d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V6h1a2 2 0 0 0 0-4H8a2 2 0 0 0 0 4h1z"/>'
  };

  function icon(name, size) {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", size || 16);
    svg.setAttribute("height", size || 16);
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", name === "play" ? "currentColor" : "none");   // 재생만 채운 삼각형
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    svg.innerHTML = ICONS[name];
    return svg;
  }

  /* 요소 안에 아이콘 하나를 넣고 그 요소를 돌려준다 */
  function iconIn(node, name, size) {
    node.appendChild(icon(name, size));
    return node;
  }

  function initial(name) { return name.slice(0, 1); }

  /* 글이 길어지면 상자가 따라 늘어난다. 손잡이를 잡아끌 일이 없다.
     붙여넣기도 input 이벤트를 내므로 같은 경로로 처리된다.
     height 를 auto 로 되돌린 뒤 재는 이유는, 지운 만큼 다시 줄어들게 하려는 것이다. */
  function autoGrow(node) {
    node.style.height = "auto";
    node.style.height = node.scrollHeight + "px";
  }

  /* 상단 고정은 '상단 고정' 네 글자 대신 핀 하나로 말한다 */
  function pinIcon() {
    var wrap = el("span", "pin");
    wrap.title = "상단 고정";
    wrap.setAttribute("aria-label", "상단 고정");
    return iconIn(wrap, "pin", 13);
  }

  /* ================= 역할 · 권한 =================
     이 프로토타입의 원래 시점은 수강생 하나뿐이었다. 운영하는 쪽 화면을 만들려면
     역할이 먼저 있어야 한다. 상단 역할 전환기는 세 시점을 바로 비교해 보기 위한
     데모 장치이고, 실제 제품에는 없다. */

  /* 역할은 계정 단위가 아니라 라운지 단위다. 어느 라운지의 강사인지까지 있어야
     '옆 강의 관리자가 내 라운지를 만지는' 일이 안 생긴다. */
  /* 앱에서는 서버가 내려준다(lounge_member 가 정한다).
     프로토타입에는 없으므로 아래 기본값으로 시작하고 전환기로 바꾼다. */
  var ME = D.me || { name: "박현종", role: "student", lounges: [] };   // student | instructor | admin

  var ROLES = [
    { key: "student",    label: "수강생" },
    { key: "instructor", label: "강사" },
    { key: "admin",      label: "관리자" }
  ];

  function roleLabel(key) {
    var r = ROLES.filter(function (x) { return x.key === key; })[0];
    return r ? r.label : key;
  }

  /* 지금 보고 있는 라운지를 맡고 있는가 */
  function managesHere(m) { return (m.lounges || []).indexOf(loungeId) > -1; }

  function isStaff() { return (ME.role === "instructor" || ME.role === "admin") && managesHere(ME); }
  function isAdmin() { return ME.role === "admin" && managesHere(ME); }

  /* 카테고리 단일 소스.
     예전에는 글쓰기 창 목록 · 필터 칩 마크업 · 피드백권이 따로 놀아서
     '공지'가 한쪽에만 있는 식으로 어긋나 있었다. 이제 여기 한 곳만 본다. */
  /* system 은 이름 뒤에 동작이 붙어 있는 카테고리다. '과제'에는 주차별 미션 양식이,
     '콘텐츠 피드백'에는 피드백권이 묶여 있어서 지우면 그 기능이 같이 죽는다. */
  var CATEGORIES = D.categories;

  function categoryOf(name) {
    return CATEGORIES.filter(function (c) { return c.name === name; })[0];
  }

  /* 카테고리를 지워도 되는지. 글이 남아 있거나 다른 라운지가 쓰고 있으면 안 된다. */
  function catUsage(name) {
    return {
      posts: allPosts().filter(function (p) { return p.cat === name; }).length,
      lounges: LOUNGES.filter(function (L) {
        return L.show.indexOf(name) > -1 || L.more.indexOf(name) > -1;
      }).map(function (L) { return L.name; })
    };
  }

  function catBlocker(c) {
    if (c.system) return "기본 기능";
    var u = catUsage(c.name);
    if (u.posts) return "글 " + u.posts + "개";
    if (u.lounges.length) return u.lounges[0] + "에서 사용 중";
    return null;
  }

  /* can("write:공지") · can("manage") · can("delete") · can("dashboard") */
  function can(action) {
    if (action === "dashboard") return isStaff();
    if (action === "manage" || action === "delete") return isAdmin();

    if (action.indexOf("write:") === 0) {
      var c = categoryOf(action.slice(6));
      if (!c || !c.roles) return true;
      return c.roles.indexOf(ME.role) > -1;
    }
    return false;
  }

  /* 라운지마다 다른 필터. 기본 노출 · 더보기 · 미사용 세 칸으로 나눈다.
     기본 노출은 일곱 개까지만 — 칩은 추가가 쉬워서 억제 장치가 없으면 무한정 늘어난다. */
  var FILTER_MAX = 7;

  var LOUNGES = D.lounges;

  /* 지금 보고 있는 라운지. 서버가 알려준다 — 여기에 "academy" 가 박혀 있으면
     다른 라운지에서는 담당 판정도 필터 배치도 남의 라운지 것을 본다. */
  var loungeId = (D.lounge && D.lounge.id) || "academy";

  function lounge() {
    return LOUNGES.filter(function (l) { return l.id === loungeId; })[0]
      || { id: loungeId, name: (D.lounge && D.lounge.name) || "", show: [], more: [] };
  }

  /* 글쓰기 창에 띄울 카테고리 — 권한을 통과한 것만 */
  function writableCats() {
    return CATEGORIES.filter(function (c) { return can("write:" + c.name); }).map(function (c) { return c.name; });
  }

  /* ================= 데이터 (예시) ================= */

  /* 권한이 필요한 카테고리. 실제 라운지의 '피드백권'을 그대로 옮겼다.
     주 3회 · 총 무제한 · 365일 · 관리자 지급. 쓰면 1회 차감된다. */
  var PASSES = D.passes;

  /* 지금 내가 진행 중인 주차. 실제로는 마지막으로 본 강의에서 나오는 값이고,
     이미 시스템이 아는 값이라 글쓰기에서 다시 물어보지 않는다. */
  var CURRENT_WK = D.currentWk || 3;
  var WEEK_DUE = D.weekDue || {};   // 주차별 마감. 라운지가 정한다. 없으면 없다.

  /* 주차별 미션 양식. 강사는 질문과 예시만 갈아끼우면 된다.
     hint 는 칸의 placeholder 로만 쓰이고 저장되지 않는다 — 비계는 남기되 결과물에는 안 남는다. */
  var MISSIONS = D.missions;

  /* 미션 양식 위젯. 라운지 글쓰기 창과 강의실이 같은 모듈을 쓴다.
     강의를 보다가 그 자리에서 과제를 써야 뷰어와 게시판을 왕복하지 않는다. */
  function buildMissionForm(wk, opts) {
    var def = MISSIONS[wk];
    if (!def) return null;
    opts = opts || {};

    var box = el("div", "mission");

    // 글쓰기 창에서는 주차 줄이 이미 제목을 말하므로 머리를 생략한다
    if (!opts.headless) {
      var head = el("div", "mission-h");
      head.appendChild(el("span", null, def.title));
      head.appendChild(el("span", "sub", opts.sub || "칸만 채우면 됩니다"));
      box.appendChild(head);
    }

    var list = el("div", "mq-list");
    var inputs = [];

    def.qs.forEach(function (item, i) {
      var wrap = el("div", "mq");
      wrap.appendChild(el("span", "mq-q", "Q" + (i + 1) + ". " + item.q));

      var input = document.createElement("textarea");
      input.className = "ta";
      input.placeholder = item.hint;
      input.addEventListener("input", function () { autoGrow(input); sync(); });
      wrap.appendChild(input);
      list.appendChild(wrap);
      inputs.push(input);
    });

    box.appendChild(list);

    function complete() {
      return inputs.length > 0 && inputs.every(function (i) { return !!i.value.trim(); });
    }

    // 완료 조건은 텍스트 기호가 아니라 칸이 찼는지에 묶인다
    function sync() {
      if (opts.onChange) opts.onChange(complete());
    }

    return {
      wk: wk,
      el: box,
      sync: sync,
      complete: complete,
      answers: function () {
        return inputs.map(function (input, i) { return { q: def.qs[i].q, a: input.value.trim() }; });
      },
      clear: function () {
        inputs.forEach(function (i) { i.value = ""; autoGrow(i); });
        sync();
      },

      // 이미 제출한 답변을 다시 불러올 때 쓴다
      fill: function (values) {
        inputs.forEach(function (inp, i) { inp.value = values[i] || ""; autoGrow(inp); });
        sync();
      }
    };
  }

  /* 라운지에 미션 글을 올리는 한 곳. 글쓰기 창과 강의실이 같이 부른다. */
  /* 내가 그 주차에 이미 올린 과제 글 */
  /* 내가 낸 과제는 피드 묶음 밖에 있을 수 있다 — 150편이 쌓이면 첫 묶음에 없다.
     서버가 내 것만 따로 보내 주므로 화면에 실린 글보다 그쪽을 먼저 믿는다. */
  var MY_MISSIONS = (D.myMissions || []).map(function (m) {
    return { id: m.id, cat: "과제", wk: m.wk, title: m.title, when: m.when,
             mine: true, mission: m.mission, attach: m.attach && m.attach.length ? m.attach : undefined,
             reactions: {}, myReact: null, thread: [], views: 0, body: "" };
  });

  function myMissionPost(wk) {
    var inFeed = POSTS.filter(function (p) {
      return p.mine && p.cat === "과제" && p.wk === wk && p.mission;
    })[0];
    if (inFeed) return inFeed;
    return MY_MISSIONS.filter(function (p) { return p.wk === wk; })[0];
  }

  /* 글에 적힌 주소를 카드로 편다. 글 저장과 다른 요청이다 — 남의 서버가 느려도
     글은 이미 올라가 있고, 카드는 도착하면 그 자리에 붙는다. 실패해도 글은 그대로다. */
  function fetchCard(post, url) {
    if (!post || !post.id) return;
    send("POST", "/posts/" + post.id + "/card", { url: url }).then(function (r) {
      if (!r || !r.attach || !r.attach.length) return;
      post.attach = r.attach;
      render();
      if (openRef === post) openPost(post);
    }).catch(function () { /* 카드는 있으면 좋은 것이다. 없어도 글은 읽힌다 */ });
  }

  /* overwrite 면 새 글을 쌓지 않고 이미 올린 글을 고쳐 쓴다 */
  function publishMission(wk, answers, title, overwrite, attach, key) {
    var exist = myMissionPost(wk);
    var name = title || wk + "주차 과제 올립니다";

    // 과제는 주차마다 한 편이다. 덮어쓰기는 앞의 것을 지우고 새로 쓴다.
    return send("POST", "/posts", {
      cat: "과제", wk: wk, title: name, body: "", mission: answers,
      attach: attach || [], overwrite: !!(overwrite && exist), key: key || newKey()
    }).then(function (r) {
      if (r && r.duplicate && !(overwrite && exist)) return;   // 두 번 누른 것. 이미 올라가 있다
      if (overwrite && exist) {
        exist.mission = answers;
        exist.when = "방금 수정함";
        exist.title = name;
        if (attach && attach.length) exist.attach = attach;
        if (r) exist.id = r.id;
      } else {
        var fresh = {
          id: r ? r.id : undefined,
          cat: "과제", wk: wk,
          author: ME.name, when: "방금", state: "live",
          views: 1, mine: true,
          reactions: {}, myReact: null, thread: [],
          title: name, body: "", mission: answers,
          attach: attach && attach.length ? attach : undefined
        };
        POSTS.unshift(fresh);
        MY_MISSIONS.push(fresh);
      }
      if (r && r.card) fetchCard(overwrite && exist ? exist : POSTS[0], r.card);
      render();
      markMissionQuest(wk);

      // 강의실 과제 칸도 같이 고쳐 그린다. 안 그러면 낸 뒤에도 빈 양식이 남는다.
      mountClassMission();
      paintRail();
    }).catch(failed);
  }

  var POSTS = D.posts;

  /* 좋아요는 반응의 한 종류다. 별도 버튼을 두지 않고 👍 로 흡수한다.
     기존 likes 는 👍 개수로, liked 는 내 반응으로 옮긴다.
     '더 보기' 로 이어 오는 글도 같은 손질을 거친다 — 한쪽만 손질하면
     스크롤 아래부터 반응이 안 눌린다. */
  function normalizePost(p) {
    if (!p.reactions) p.reactions = {};
    if (p.likes) p.reactions["👍"] = (p.reactions["👍"] || 0) + p.likes;
    if (p.liked && !p.myReact) p.myReact = "👍";
    delete p.likes;
    delete p.liked;

    // 댓글 수는 따로 들고 있지 않는다. 실제 댓글에서 센다.
    if (!p.thread) p.thread = [];
    delete p.comments;

    // 첨부는 여러 장이 될 수 있다. 한 장짜리 예시 데이터도 배열로 맞춘다.
    if (p.attach && !Array.isArray(p.attach)) p.attach = [p.attach];

    // "2시간 전" 같은 문자열만으로는 '어제 몇 건'을 셀 수 없다. 숫자로 바꿔 둔다.
    p.daysAgo = parseDays(p.when);
  }

  POSTS.forEach(normalizePost);

  /* 대시보드와 게시물 관리는 전체를 세야 한다. 서버가 가벼운 목록을 따로 준다.
     없으면(프로토타입 · 수강생) 화면에 실린 글로 대신한다. */
  var INDEX = D.postIndex || null;
  if (INDEX) INDEX.forEach(function (p) { p.daysAgo = parseDays(p.when); });
  function allPosts() { return INDEX || POSTS; }

  function parseDays(when) {
    if (/방금|분 전|시간 전/.test(when)) return 0;
    if (/어제/.test(when)) return 1;
    var m = when.match(/(\d+)\s*일 전/);
    if (m) return parseInt(m[1], 10);
    m = when.match(/(\d+)\s*주 전/);
    if (m) return parseInt(m[1], 10) * 7;
    return 99;   // "계속 누적" 같은 상시 글
  }

  function cmtCount(p) {
    var n = 0;
    (p.thread || []).forEach(function (c) { n += 1 + (c.replies || []).length; });
    return n;
  }

  /* 가벼운 목록에는 댓글 내용이 없고 개수만 있다. 세는 쪽을 하나로 둔다. */
  function cmtN(p) { return p.comments != null ? p.comments : cmtCount(p); }

  function reactTotal(p) {
    var n = 0;
    Object.keys(p.reactions || {}).forEach(function (k) { n += p.reactions[k]; });
    return n;
  }


  var LB = D.leaderboard;

  /* 상위 몇 % 인가. 서버가 내 순위와 수강생 수를 준다. 프로토타입은 예시값.
     순위가 없으면(받은 이모지 0) 숫자를 만들지 않는다 — '—' 로 둔다. */
  var MY_PCT = (function () {
    if (!D.myRank) return { "7": 12, "30": 21, "all": 34 };
    var out = {};
    Object.keys(D.myRank).forEach(function (k) {
      var m = D.myRank[k];
      out[k] = m && m.rank && m.of ? Math.max(1, Math.round(m.rank / m.of * 100)) : "—";
    });
    return out;
  })();

  /* 강의는 카드가 아니라 '강' 단위로 찾는다.
     어느 주차 · 어느 섹션에 속한 강인지와, 교안에서 검색어가 걸린 대목을 같이 보여준다. */
  var LESSONS = D.lessons;

  /* 수강생 명부. 강사 화면이 필요로 하는 값을 담는다.
     wk = 지금 서 있는 주차 · lastDays = 마지막 활동 이후 지난 날 */
  /* 프드프 계정에서 오는 값과 라운지가 만드는 값이 섞여 있다.
       name   닉네임 — 계정이 정한다. 라운지에서 고치지 않는다
       cohort 기수  — 강의 구매 데이터에서 정해진다. 역시 고치지 않는다
       joined 가입 후 며칠 · first 가입에서 첫 과제까지 며칠(null 이면 아직 안 냄)
     '학원'은 프드프에 입력받는 창이 없어서 두지 않는다. */
  var MEMBERS = D.members;

  function students() { return MEMBERS.filter(function (m) { return m.role === "student"; }); }

  /* 다음 라이브 특강 */
  var LIVE = D.live;

  /* 주차 하나가 강의 하나다. 목록에 여덟 장이 깔리고, 한 장을 열면 그 주차의 강이 나온다. */
  var WEEKS = D.weeks;

  /* 강 하나를 커리큘럼 항목으로 바꾼다.
     검색도 LESSONS 가 아니라 이 항목을 보므로 주차·챕터를 같이 들고 있는다. */
  /* 시청 기록의 원본은 프드프다. 라운지는 남기기만 하고 쌓지 않는다. */
  function saveWatched(item) {
    if (!item.id) return;
    send("PUT", "/lessons/" + item.id + "/done", { done: !!item.done })
      .catch(function (err) { item.done = !item.done; renderCurric(); updateProgress(); failed(err); });
  }

  function lessonItemOf(l, done) {
    return { id: l.id, wk: l.wk, chap: l.chap, t: l.t, d: l.video ? l.d : "교안",
             doc: l.doc, video: l.video,
             /* 서버가 내 시청 기록을 주면 그것을 쓴다. 프로토타입에는 없으므로
                지난 주차는 다 본 것으로 깔아 둔다. */
             done: l.done != null ? !!l.done : !!done };
  }

  function makeCourse(wk, title, published) {
    var past = wk < CURRENT_WK;

    var lessons = LESSONS.filter(function (l) { return l.wk === wk; })
      .map(function (l) { return lessonItemOf(l, past); });

    // 진행 중인 주차는 첫 강만 듣고 멈춰 있는 상태로 둔다
    if (wk === CURRENT_WK && lessons.length) {
      if (lessons[0].done == null) lessons[0].done = true;
      lessons[0].cur = true;
      lessons[0].rich = true;
    } else if (lessons.length) {
      lessons[0].cur = true;
    }

    return {
      wk: wk,
      title: title,
      published: published,
      sections: [
        { name: "강의 · 4~5분 단위", open: true, items: lessons },
        { name: "과제 & 자료", open: true, items: [
          { t: wk + "주차 과제 올리기", d: "과제", mission: true, done: past },
          { t: "남의 글 3개 보고 반응 1개", d: "퀘스트", done: past }
        ] }
      ]
    };
  }

  /* 게시 여부는 라운지가 정한다. 서버가 주면 그것을 쓰고, 프로토타입에서는
     전부 공개로 시작한다. */
  var COURSES = WEEKS.map(function (title, i) {
    return makeCourse(i + 1, title, D.weekPublished ? D.weekPublished[i] !== false : true);
  });

  /* 게시 전 주차는 수강생 화면 어디에도 나오지 않는다 — 목록·검색·주차 선택기 전부.
     관리자에게만 보여서 게시하기 전에 열어보고 확인할 수 있다. */
  function courseOf(wk) { return COURSES.filter(function (c) { return c.wk === wk; })[0]; }
  function liveCourses() { return COURSES.filter(function (c) { return c.published; }); }
  function shownCourses() { return can("manage") ? COURSES : liveCourses(); }

  var viewWk = CURRENT_WK;
  function course() { return courseOf(viewWk); }

  function flatOf(c) {
    var a = [];
    c.sections.forEach(function (sec) { sec.items.forEach(function (it) { a.push(it); }); });
    return a;
  }

  /* ================= 카운트다운 ================= */

  /* 마감은 라운지가 정한다. 없으면 세지 않는다 — 예전에는 '지금 + 54시간' 이라는
     가짜 시각을 항상 세고 있었다. 프로토타입에서만 예시로 하나 만든다. */
  var target = WEEK_DUE[CURRENT_WK] ? Date.parse(WEEK_DUE[CURRENT_WK])
    : (D.api ? null : Date.now() + (2 * 24 + 6) * 3600e3 + 12 * 60e3 + 5e3);

  /* 과제 카드는 다시 그려지므로 표시 대상을 그때그때 찾는다 */
  function tick() {
    if (target == null) return;
    var s = Math.floor(Math.max(0, target - Date.now()) / 1000);
    var h = Math.floor(s / 3600), m = Math.floor((s % 3600) / 60), ss = s % 60;
    var p = function (n) { return String(n).padStart(2, "0"); };
    var txt = p(h) + ":" + p(m) + ":" + p(ss);

    var nodes = [$("countdown")].concat(Array.prototype.slice.call(document.querySelectorAll(".cd")));
    nodes.forEach(function (n) { if (n) n.textContent = txt; });
  }
  tick();
  setInterval(tick, 1000);

  /* ================= 라운지 전환 (P1-7) ================= */

  var loungeBtn = $("loungeBtn"), loungeMenu = $("loungeMenu");

  loungeBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var open = loungeMenu.hidden;
    loungeMenu.hidden = !open;
    loungeBtn.setAttribute("aria-expanded", String(open));
  });

  /* ================= 역할 전환 (데모 장치) =================
     세 시점을 나란히 비교하려고 둔 것이다. 실제 제품에는 이 셀렉터가 없고,
     역할은 로그인한 계정이 정한다. 이름(ME.name)은 바뀌지 않는다 —
     '같은 사람이 어떤 권한을 가졌을 때'를 보는 장치다. */

  var roleBtn = $("roleBtn"), roleMenu = $("roleMenu"), roleNow = $("roleNow");
  var hasSwitcher = !!roleBtn;   // 앱에는 없다. 역할은 서버가 정한다

  function paintRoleMenu() {
    if (!hasSwitcher) return;
    roleMenu.textContent = "";
    ROLES.forEach(function (r) {
      var b = el("button", null, r.label);
      b.type = "button";
      b.setAttribute("aria-current", String(ME.role === r.key));
      b.addEventListener("click", function () { applyRole(r.key); closeRoleMenu(); });
      roleMenu.appendChild(b);
    });
  }

  function closeRoleMenu() {
    if (!hasSwitcher) return;
    roleMenu.hidden = true;
    roleBtn.setAttribute("aria-expanded", "false");
  }

  function applyRole(key) {
    ME.role = key;
    if (hasSwitcher) roleNow.textContent = roleLabel(key);
    /* 담당 라운지는 서버가 정한다. 전환기로 바꾼 경우에만 흉내 낸다 —
       앱에서 이 줄이 돌면 서버가 준 실제 담당 목록을 지운다. */
    if (hasSwitcher) ME.lounges = key === "student" ? [] : [loungeId];
    $("tabAdmin").hidden = !can("dashboard");

    // 권한을 잃은 채로 관리 화면에 서 있으면 커뮤니티로 되돌린다
    if (screenNow === "admin" && !can("dashboard")) show("community");
    else if (screenNow === "admin") renderAdmin();

    paintCat();          // 글쓰기 창 카테고리 목록
    renderFilters();     // 라운지 필터 칩
    render();            // 피드
    renderCourseList();  // 게시 전 주차는 수강생에게 안 보인다

    // 게시 전 주차를 열어둔 채로 권한을 잃으면 강의 목록으로 되돌린다
    if (screenNow === "lesson" && !course().published && !can("manage")) show("courses");
  }

  if (hasSwitcher) roleBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var open = roleMenu.hidden;
    if (open) paintRoleMenu();
    roleMenu.hidden = !open;
    roleBtn.setAttribute("aria-expanded", String(open));
  });

  /* ================= 통합 검색 (P1-8) ================= */

  var searchField = $("searchField"), searchClear = $("searchClear");


  function esc(s) { return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"); }
  function tokensOf(q) { return q.toLowerCase().split(/\s+/).filter(Boolean); }
  function hitAll(hay, tk) { var low = hay.toLowerCase(); return tk.every(function (t) { return low.indexOf(t) > -1; }); }

  /* 검색어가 걸린 자리를 그대로 표시해준다 */
  function mark(text, tk) {
    var frag = document.createDocumentFragment();
    if (!tk.length) { frag.appendChild(document.createTextNode(text)); return frag; }

    var rx = new RegExp("(" + tk.map(esc).join("|") + ")", "ig");
    var last = 0, m;

    while ((m = rx.exec(text)) !== null) {
      if (m.index > last) frag.appendChild(document.createTextNode(text.slice(last, m.index)));
      var el2 = document.createElement("mark");
      el2.textContent = m[0];
      frag.appendChild(el2);
      last = m.index + m[0].length;
      if (rx.lastIndex === m.index) rx.lastIndex++;
    }

    if (last < text.length) frag.appendChild(document.createTextNode(text.slice(last)));
    return frag;
  }

  /* 교안이 길면 검색어 주변만 잘라서 보여준다 */
  function excerpt(text, tk, span) {
    span = span || 90;
    var low = text.toLowerCase(), at = -1;
    tk.some(function (t) { var i = low.indexOf(t); if (i > -1) { at = i; return true; } return false; });
    if (at < 0) return text.slice(0, span * 2);
    var from = Math.max(0, at - span), to = Math.min(text.length, at + span);
    return (from > 0 ? "… " : "") + text.slice(from, to).trim() + (to < text.length ? " …" : "");
  }

  function postHits(tk) {
    return POSTS.filter(function (p) {
      var answers = (p.mission || []).map(function (a) { return a.q + " " + a.a; }).join(" ");
      return hitAll([p.title, p.cat, p.author, p.wk ? p.wk + "주차" : "", p.body || "", answers].join(" "), tk);
    });
  }

  /* 댓글은 글 안에 묻혀 있어서 피드로는 다시 못 찾는다. 검색에서는 한 건씩 센다.
     답글까지 평평하게 편다. */
  function commentHits(tk) {
    var out = [];
    POSTS.forEach(function (p) {
      (p.thread || []).forEach(function (c) {
        if (hitAll(c.text + " " + c.author, tk)) out.push({ c: c, p: p, reply: false });
        (c.replies || []).forEach(function (r) {
          if (hitAll(r.text + " " + r.author, tk)) out.push({ c: r, p: p, reply: true });
        });
      });
    });
    return out;
  }

  function lessonHits(tk) {
    var out = [];
    liveCourses().forEach(function (c) {
      c.sections[0].items.forEach(function (l) {
        if (hitAll([l.t, l.doc || "", l.chap, l.wk + "주차"].join(" "), tk)) out.push(l);
      });
    });
    return out;
  }

  function memberHits(tk) {
    return MEMBERS.filter(function (m) {
      return hitAll([m.name, roleLabel(m.role), m.cohort ? m.cohort + "기" : ""].join(" "), tk);
    });
  }

  /* ----- 결과 화면 ----- */

  var searchResults = $("searchResults"), feedArea = $("feedArea");
  var srQuery = "", srTab = "글";
  var SR_TABS = ["글", "댓글", "강의", "멤버"];

  /* 검색 중에는 둘러보기용 화면을 치운다.
     소개와 글쓰기 창은 찾으러 온 사람에게는 방해물이다. */
  function setBrowsing(on) {
    feedArea.hidden = !on;
    $("composer").hidden = !on || writeLocked();
    $("intro").hidden = !on || !!introDismissed;
    var lock = document.querySelector(".write-lock");
    if (lock) lock.hidden = !on;
  }

  function closeSearchResults() {
    searchResults.hidden = true;
    setBrowsing(true);
  }

  function playMark() {
    return iconIn(el("span", "play"), "play", 14);
  }

  function postItem(p, tk) {
    var row = el("button", "sr-item");
    row.type = "button";
    row.addEventListener("click", function () { closeSearchResults(); openById(p.id, null); });

    var main = el("div", "sr-main");
    main.appendChild(el("span", "sr-where", p.cat + (p.wk ? " · " + p.wk + "주차" : "") + " · " + p.author));

    var h = el("h3", "sr-t");
    h.appendChild(mark(p.title, tk));
    main.appendChild(h);

    var source = p.body || (p.mission || []).map(function (a) { return a.a; }).join(" ");
    if (source) {
      var x = el("p", "sr-x");
      x.appendChild(mark(excerpt(source, tk), tk));
      main.appendChild(x);
    }

    var foot = el("div", "sr-foot");
    foot.appendChild(el("span", null, "반응 " + reactTotal(p)));
    foot.appendChild(el("span", null, "댓글 " + cmtCount(p)));
    main.appendChild(foot);

    row.appendChild(main);
    if (p.attach && p.attach.length) {
      row.appendChild(el("div", "sr-shot",
        p.attach[0].type === "youtube" ? "영상 첨부"
          : p.attach.length > 1 ? "첨부 " + p.attach.length + "개" : "첨부 자료"));
    }
    return row;
  }

  /* 댓글에는 제목이 없다. 찾던 말이 든 본문이 곧 제목 자리에 온다.
     어느 글에 달린 말인지는 그 위에, 누가 언제 남겼는지는 그 아래에. */
  function commentItem(h, tk) {
    var row = el("button", "sr-item");
    row.type = "button";
    row.addEventListener("click", function () {
      closeSearchResults();
      openById(h.p.id, function () { focusComment(h.c); });
    });

    var main = el("div", "sr-main");
    main.appendChild(el("span", "sr-where", (h.reply ? "답글" : "댓글") + " · " + h.p.cat + " · " + h.p.title));

    var t = el("p", "sr-t sr-cmt");
    t.appendChild(mark(h.c.text, tk));
    main.appendChild(t);

    var foot = el("div", "sr-foot");
    foot.appendChild(el("span", null, h.c.author));
    foot.appendChild(el("span", null, h.c.when));
    if (h.c.up) foot.appendChild(el("span", null, "좋아요 " + h.c.up));
    main.appendChild(foot);

    row.appendChild(main);
    return row;
  }

  function lessonItem(l, tk) {
    var row = el("button", "sr-item");
    row.type = "button";
    row.addEventListener("click", function () { closeSearchResults(); show("lesson"); });

    var main = el("div", "sr-main");
    main.appendChild(el("span", "sr-where", l.wk + "주차 · " + l.chap));

    var h = el("h3", "sr-t");
    h.appendChild(mark(l.t, tk));
    main.appendChild(h);

    var x = el("p", "sr-x");
    x.appendChild(mark(excerpt(l.doc, tk), tk));
    main.appendChild(x);

    var foot = el("div", "sr-foot");
    foot.appendChild(el("span", null, l.video ? "영상 " + l.d : "교안"));
    main.appendChild(foot);

    row.appendChild(main);

    if (l.video) {
      var th = el("div", "sr-thumb");
      th.appendChild(playMark());
      row.appendChild(th);
    }
    return row;
  }

  function memberItem(m, tk) {
    var row = el("button", "sr-item");
    row.type = "button";

    row.appendChild(el("span", "ava ava-34", initial(m.name)));

    var main = el("div", "sr-main");
    var h = el("h3", "sr-t");
    h.appendChild(mark(m.name, tk));
    main.appendChild(h);

    var where = [m.cohort ? m.cohort + "기" : roleLabel(m.role)];
    if (m.role === "student") where.push(m.wk + "주차");
    main.appendChild(el("span", "sr-where", where.join(" · ")));

    row.appendChild(main);
    return row;
  }

  function paintResults() {
    var tk = tokensOf(srQuery);
    var groups = searchGroups();

    searchResults.textContent = "";

    var head = el("div", "sr-head");
    var label = el("span", "t");
    label.appendChild(el("b", null, "“" + srQuery + "”"));
    label.appendChild(document.createTextNode(" 검색 결과"));
    head.appendChild(label);

    var close = el("button", "btn-ghost", "검색 닫기");
    close.type = "button";
    close.addEventListener("click", clearSearch);
    head.appendChild(close);
    searchResults.appendChild(head);

    // 탭마다 몇 건인지 같이 보여준다
    var tabs = el("div", "sr-tabs");
    SR_TABS.forEach(function (g) {
      var b = el("button");
      b.type = "button";
      b.setAttribute("aria-current", String(g === srTab));
      b.appendChild(document.createTextNode(g));
      b.appendChild(el("span", "n", String(groups[g].length)));
      b.addEventListener("click", function () { srTab = g; paintResults(); });
      tabs.appendChild(b);
    });
    searchResults.appendChild(tabs);

    var rows = groups[srTab];
    if (!rows.length) {
      searchResults.appendChild(el("p", "sr-empty", srTab + " 결과가 없습니다. 다른 탭을 보거나 다른 말로 찾아보세요."));
      return;
    }

    var list = el("div", "sr-list");
    rows.forEach(function (r) {
      list.appendChild(
        srTab === "글" ? postItem(r, tk) :
        srTab === "댓글" ? commentItem(r, tk) :
        srTab === "강의" ? lessonItem(r, tk) : memberItem(r, tk));
    });
    searchResults.appendChild(list);
  }

  /* 검색 결과. 서버가 준 것이 있으면 그것을 쓴다 — 화면에 실린 묶음만 뒤지면
     30편 밖의 글은 없는 것이 된다. 서버가 없는 프로토타입에서는 실린 것에서 찾는다. */
  var srServer = null;

  function runSearch() {
    srQuery = searchField.value.trim();
    if (!srQuery) { closeSearchResults(); return; }

    srServer = null;
    openResults();

    if (!API) return;
    send("GET", "/search?q=" + encodeURIComponent(srQuery))
      .then(function (r) {
        if (!r || srQuery !== searchField.value.trim()) return;
        r.posts.forEach(function (p) { p.thread = p.thread || []; p.reactions = p.reactions || {}; });
        srServer = r;
        openResults();
      })
      .catch(failed);
  }

  function openResults() {
    // 결과가 가장 많은 탭을 먼저 연다
    var g = searchGroups();
    srTab = SR_TABS.reduce(function (a, b) { return g[b].length > g[a].length ? b : a; }, "글");

    paintResults();
    searchResults.hidden = false;
    setBrowsing(false);
    window.scrollTo(0, 0);
  }

  function searchGroups() {
    var tk = tokensOf(srQuery);
    if (srServer) {
      return {
        "글": srServer.posts,
        "댓글": srServer.comments.map(function (c) {
          return { c: { id: c.id, author: c.author, text: c.text, when: c.when },
                   p: { id: c.postId, title: c.postTitle, cat: c.cat },
                   reply: c.reply };
        }),
        "강의": lessonHits(tk),
        "멤버": memberHits(tk)
      };
    }
    return { "글": postHits(tk), "댓글": commentHits(tk), "강의": lessonHits(tk), "멤버": memberHits(tk) };
  }

  function clearSearch() {
    searchField.value = "";
    searchClear.hidden = true;
    closeSearchResults();
    searchField.focus();
  }

  searchField.addEventListener("input", function () {
    searchClear.hidden = !searchField.value;
  });

  searchField.addEventListener("keydown", function (e) {
    if (e.key === "Enter") { e.preventDefault(); runSearch(); }
  });

  searchClear.addEventListener("click", clearSearch);

  document.addEventListener("click", function (e) {
    if (!loungeMenu.hidden && !loungeMenu.contains(e.target) && !loungeBtn.contains(e.target)) {
      loungeMenu.hidden = true;
      loungeBtn.setAttribute("aria-expanded", "false");
    }
    if (hasSwitcher && !roleMenu.hidden && !roleMenu.contains(e.target) && !roleBtn.contains(e.target)) closeRoleMenu();
    if (roleRow > -1 && !e.target.closest(".pick")) { roleRow = -1; renderAdmin(); }
  });

  document.addEventListener("keydown", function (e) {
    if (e.key !== "Escape") return;
    loungeMenu.hidden = true;
    loungeBtn.setAttribute("aria-expanded", "false");
    closeRoleMenu();
  });

  /* ================= 라운지 소개 =================
     기획안 2장의 목표 행동을 설명이 아니라 '할 일'로 준다.
     닫으면 사라지므로 매일 오는 사람에게는 글쓰기 창이 최상단이 된다. */

  var TODO_FALLBACK = [
    "다른 사람 글 3개 읽기",
    "마음에 드는 글에 반응 하나",
    "이번 주차 과제 올리기"
  ];

  function todoList() {
    var t = D.lounge && D.lounge.todo;
    return t && t.length ? t : TODO_FALLBACK;
  }

  function paintTodo() {
    var host = $("introTodo");
    host.textContent = "";

    todoList().forEach(function (text) {
      var li = el("li");
      li.setAttribute("data-on", "false");

      var chk = el("button", "check");
      chk.type = "button";
      chk.setAttribute("aria-pressed", "false");
      chk.setAttribute("aria-label", text);
      chk.appendChild(icon("check", 12));

      chk.addEventListener("click", function () {
        var on = chk.getAttribute("aria-pressed") !== "true";
        chk.setAttribute("aria-pressed", String(on));
        li.setAttribute("data-on", String(on));
      });

      li.appendChild(chk);
      li.appendChild(el("span", "t", text));
      host.appendChild(li);
    });
  }
  paintTodo();

  var introDismissed = false;

  $("introClose").addEventListener("click", function () {
    introDismissed = true;
    $("intro").hidden = true;
  });

  /* ----- 라운지 소개 -----
     라운지마다 다른 글이고, 운영하면서 계속 손보는 글이다. 마크업에 박아
     두면 고칠 때마다 배포해야 한다. 데이터에서 읽고 자리에서 고친다. */
  var introHead = document.querySelector(".intro-head");
  var introText = document.querySelector(".intro-x");

  /* 라운지 이름이 화면 곳곳에 박혀 있었다. 라운지가 둘이 되는 순간 전부 거짓말이
     된다 — 다른 라운지에 들어와 있는데 머리에는 앞 라운지 이름이 걸린다. */
  function paintLoungeName() {
    if (!D.lounge) return;
    var full = D.lounge.name + " 라운지";

    document.title = full;
    var set = function (id, text) { var e = $(id); if (e) e.textContent = text; };
    set("loungeNow", full);
    set("railName", full);
    set("railBanner", "라운지 배너 자리 · " + D.lounge.name);
    set("whoLounge", full);
    set("whoName", ME.name);
    set("classMeta", full + " · " + WEEKS.length + "주 과정");

    // 라운지 전환 목록에서 '지금' 은 진짜 지금 보는 것에 붙어야 한다
    var menu = $("loungeMenu");
    if (menu) {
      menu.textContent = "";
      LOUNGES.forEach(function (l) {
        var b = el("button", null, l.name + " 라운지");
        b.type = "button";
        if (l.id === loungeId) {
          b.setAttribute("aria-current", "true");
          b.appendChild(el("span", "now", "지금"));
        }
        menu.appendChild(b);
      });
    }
  }
  paintLoungeName();

  function paintIntro() {
    if (!D.lounge) return;   // 프로토타입에는 없다. 마크업의 예시 문장을 그대로 둔다.
    introHead.querySelector(".card-t").textContent = D.lounge.name;
    introText.textContent = D.lounge.intro || "아직 소개글이 없습니다.";

    /* 첨부는 글과 같은 것을 쓴다. 링크 카드도 사진도 같은 모양으로 선다. */
    var old = document.querySelector("#intro .att, #intro .shotwrap");
    if (old) old.remove();
    var att = attachments(D.lounge.attach, false);
    if (att) introText.parentNode.insertBefore(att, introText.nextSibling);
  }
  paintIntro();

  function introEditor() {
    if (!(API && can("manage"))) return;

    var edit = el("button", "btn-ghost", "수정");
    edit.type = "button";
    introHead.insertBefore(edit, $("introClose"));

    edit.addEventListener("click", function () {
      var box = el("div", "intro-edit");

      box.appendChild(el("span", "kicker", "소개글"));
      var ta2 = document.createElement("textarea");
      ta2.className = "ta";
      ta2.value = (D.lounge && D.lounge.intro) || "";
      ta2.setAttribute("aria-label", "라운지 소개글");
      box.appendChild(ta2);

      /* 글쓰기 창과 같은 첨부 줄. 주소를 그냥 적어도 카드가 된다. */
      var att = attachRow(((D.lounge && D.lounge.attach) || []).slice(), { zone: box });
      box.appendChild(att.el);

      /* 할 일은 한 줄에 하나로 적는다. 칸을 다섯 개 세워 두면 다섯 개를
         채워야 할 것 같아진다 — 비워 두는 쪽이 기본이어야 한다. */
      box.appendChild(el("span", "kicker", "오늘 여기서 할 일 · 한 줄에 하나 · 5개까지"));
      var ta3 = document.createElement("textarea");
      ta3.className = "ta";
      ta3.value = todoList().join("\n");
      ta3.setAttribute("aria-label", "오늘 여기서 할 일");
      box.appendChild(ta3);

      var row = el("div", "row");
      var save = el("button", "btn-primary sm", "저장");
      var undo = el("button", "btn-ghost", "취소");
      save.type = undo.type = "button";
      row.appendChild(save);
      row.appendChild(undo);
      box.appendChild(row);

      introText.hidden = true;
      edit.hidden = true;
      introText.parentNode.insertBefore(box, introText.nextSibling);
      ta2.focus();

      function done() { box.remove(); introText.hidden = false; edit.hidden = false; }
      undo.addEventListener("click", done);

      save.addEventListener("click", function () {
        var was = { intro: D.lounge.intro, todo: D.lounge.todo, attach: D.lounge.attach };

        D.lounge.intro = ta2.value.trim();
        D.lounge.attach = att.value();
        D.lounge.todo = ta3.value.split("\n")
          .map(function (x) { return x.trim(); })
          .filter(Boolean);

        paintIntro();
        paintTodo();
        done();

        send("PUT", "/admin/lounge",
             { intro: D.lounge.intro, todo: D.lounge.todo, attach: D.lounge.attach })
          .then(function (r) {
            // 본문에 적은 주소를 서버가 카드로 폈을 수 있다. 돌려준 것을 그대로 쓴다.
            if (r && r.attach) { D.lounge.attach = r.attach; paintIntro(); }
          })
          .catch(function (e) {
            D.lounge.intro = was.intro;
            D.lounge.todo = was.todo;
            D.lounge.attach = was.attach;
            paintIntro();
            paintTodo();
            failed(e);
          });
      });
    });
  }
  introEditor();

  /* ================= 글쓰기 (P1-2 · 3 · 4) ================= */

  var composer = $("composer"), rest = $("composerRest"), openBox = $("composerOpen");
  var ta = $("ta"), wTitle = $("wTitle");
  var postBtn = $("composerPost"), cancelBtn = $("composerCancel");

  function setComposer(on) {
    if (on && writeLocked()) return;   // 잠긴 사람은 창이 열리지 않는다
    if (on && !draft.key) draft.key = newKey();
    composer.classList.toggle("open", on);
    rest.hidden = on;
    openBox.hidden = !on;
    if (on) wTitle.focus();
  }

  /* 정지된 사람에게 빈 종이를 내주면, 다 쓰고 게시를 누른 순간에야 막힌다.
     쓰기 전에 말한다. 읽기는 그대로 두므로 화면을 가리지는 않는다. */
  function writeLocked() { return !!(ME.muted); }

  function paintWriteLock() {
    var old = document.querySelector(".write-lock");
    if (old) old.remove();
    if (!writeLocked()) return;

    rest.hidden = true;
    var box = el("div", "gate write-lock");
    box.appendChild(el("b", null, "활동이 정지되어 글과 댓글을 쓸 수 없습니다."));
    box.appendChild(el("span", "muted",
      (ME.mutedReason ? ME.mutedReason + " · " : "") +
      (ME.mutedUntil ? ME.mutedUntil + "까지" : "") + " · 읽기는 그대로입니다"));
    composer.parentNode.insertBefore(box, composer);
    composer.hidden = true;
  }
  paintWriteLock();

  rest.addEventListener("click", function () { setComposer(true); });
  cancelBtn.addEventListener("click", function () {
    wTitle.value = "";
    ta.value = "";
    autoGrow(ta);
    if (missionForm) missionForm.clear();
    composerAtt.clear();
    draft.cat = DEFAULT_CAT;
    draft.wk = CURRENT_WK;
    syncComposer();
    updatePostBtn();
    setComposer(false);
  });

  ta.addEventListener("input", function () { autoGrow(ta); updatePostBtn(); });
  wTitle.addEventListener("input", updatePostBtn);

  /* ----- 파일 첨부 -----
     파일은 서버를 통과하지 않는다. 서버에서 '올려도 되는 주소'를 받아
     브라우저가 보관소로 바로 올린다 — 서버리스는 본문 크기 제한이 있다. */

  var fileInput = $("fileInput"), fileBtn = $("fileBtn");

  var ATTACH_MAX = 10;

  /* 올리기 자체는 한 곳에만 둔다. 글쓰기 창과 강의실 과제 폼이 같이 쓴다. */
  function uploadFile(f, onProgress) {
    if (!API) {
      // 프로토타입에는 보관소가 없다. 자리만 잡아 둔다 — 종류는 파일에서 읽는다.
      var kind = f.type.indexOf("video/") === 0 ? "video" : f.type === "application/pdf" ? "link" : "image";
      return Promise.resolve({ type: kind, label: f.name, name: f.name });
    }
    if (onProgress) onProgress({ name: f.name, uploading: true });

    return send("POST", "/uploads", { type: f.type, size: f.size })
      .then(function (r) {
        return fetch(r.uploadUrl, { method: "PUT", body: f, headers: { "content-type": f.type } })
          .then(function (up) {
            if (!up.ok) throw new Error("올리지 못했습니다 (" + up.status + ")");
            return { type: r.kind, url: r.url, title: f.name, label: f.name, name: f.name };
          });
      });
  }

  /* 첨부 한 벌. 글쓰기 창 · 강의실 과제 · 라운지 소개가 같은 것을 쓴다.
     붙이는 방법이 자리마다 다르면 자리마다 새로 익혀야 한다.

     올린 것은 이름표가 아니라 미리보기로 보여준다 — 무엇을 올렸는지 눈으로
     확인해야 한다. 사진은 그림으로, 영상은 첫 프레임에 ▶ 표시로, PDF 는 파일
     타일로. 올라가는 동안에도 자리는 먼저 잡힌다.

     끌어다 놓기와 붙여넣기(스크린샷)도 받는다. 파일 고르기 창까지 가는 길이
     하나뿐이면 매번 세 번 눌러야 한다. */
  var ACCEPT = {
    "image/png": 1, "image/jpeg": 1, "image/gif": 1, "image/webp": 1,
    "application/pdf": 1, "video/mp4": 1, "video/webm": 1, "video/quicktime": 1
  };

  function attachRow(list, opts) {
    opts = opts || {};
    list = list || [];   // 넘긴 배열을 그대로 쓴다 — 초안이 같은 것을 본다

    var wrap = el("div", "att-block");

    var pick = opts.input || document.createElement("input");
    if (!opts.input) {
      pick.type = "file"; pick.hidden = true; pick.multiple = true;
      pick.accept = Object.keys(ACCEPT).join(",");
      wrap.appendChild(pick);
    }

    var add = opts.button || null;
    if (!add) {
      add = el("button", "fadd-btn", "+ 파일 첨부");
      add.type = "button";
      wrap.appendChild(add);
    }
    add.addEventListener("click", function () { pick.click(); });

    var strip = el("div", "att-strip");
    strip.hidden = true;
    wrap.appendChild(strip);

    function kindOfFile(f) {
      return f.type.indexOf("video/") === 0 ? "video" : f.type.indexOf("image/") === 0 ? "image" : "link";
    }

    function thumb(a, i) {
      var t = el("div", "att-thumb" + (a.uploading ? " uploading" : ""));
      var src = a.preview || a.url;
      var kind = a.type || "image";

      if (kind === "video" && src) {
        var v = document.createElement("video");
        v.src = src; v.muted = true; v.preload = "metadata"; v.playsInline = true;
        t.appendChild(v);
        t.appendChild(iconIn(el("span", "att-play"), "play", 12));
      } else if (kind === "image" && src) {
        var im = document.createElement("img");
        im.src = src; im.alt = a.name || a.label || "";
        t.appendChild(im);
      } else {
        var f = el("div", "att-file");
        var name = a.name || a.label || a.url || "파일";
        f.appendChild(el("b", null, (name.split(".").pop() || "").toUpperCase().slice(0, 4) || "링크"));
        f.appendChild(el("span", null, name));
        t.appendChild(f);
      }
      if (a.uploading) t.appendChild(el("span", "att-wait", "올리는 중"));

      var x = iconIn(el("button", "att-x"), "x", 14);
      x.type = "button";
      x.setAttribute("aria-label", (a.name || a.label || "첨부") + " 떼기");
      x.addEventListener("click", function (e) {
        e.stopPropagation();
        if (a.preview) URL.revokeObjectURL(a.preview);
        list.splice(i, 1);
        paint();
        if (opts.onChange) opts.onChange();
      });
      t.appendChild(x);
      return t;
    }

    function paint() {
      strip.textContent = "";
      strip.hidden = !list.length;
      if (add) add.hidden = list.length >= ATTACH_MAX;
      list.forEach(function (a, i) { strip.appendChild(thumb(a, i)); });
    }

    function addFiles(files) {
      files = [].slice.call(files || []);
      if (!files.length) return;
      var room = ATTACH_MAX - list.length;
      if (room <= 0) { failed(new Error("첨부는 " + ATTACH_MAX + "개까지입니다")); return; }

      files.slice(0, room).forEach(function (f) {
        if (!ACCEPT[f.type]) {
          failed(new Error("'" + f.name + "' 은 올릴 수 없는 형식입니다. 사진 · 영상(mp4 · webm · mov) · PDF 만 됩니다."));
          return;
        }
        var kind = kindOfFile(f);
        /* 고른 자리를 먼저 잡아 두고 올라온 것으로 바꾼다. 그래야 여러 장을
           같이 올릴 때 순서가 엎치락뒤치락하지 않는다. 미리보기는 파일 자체로
           만들어 올라오기를 기다리지 않는다. */
        var slot = { name: f.name, uploading: true, type: kind,
                     preview: kind === "link" ? null : URL.createObjectURL(f) };
        list.push(slot);
        paint();

        uploadFile(f)
          .then(function (a) {
            var i = list.indexOf(slot);
            if (i < 0) { if (slot.preview) URL.revokeObjectURL(slot.preview); return; }   // 올라오기 전에 뗐다
            a.preview = slot.preview;
            list[i] = a;
            paint();
            if (opts.onChange) opts.onChange();
          })
          .catch(function (err) {
            var i = list.indexOf(slot);
            if (i > -1) list.splice(i, 1);
            if (slot.preview) URL.revokeObjectURL(slot.preview);
            paint();
            failed(err);
          });
      });
    }

    pick.addEventListener("change", function () { addFiles(pick.files); pick.value = ""; });

    function hasFiles(e) {
      var t = e.dataTransfer;
      return !!(t && t.types && [].indexOf.call(t.types, "Files") > -1);
    }

    /* 끌어다 놓는 자리. 글쓰기 카드 전체가 받는다 — 접혀 있어도. */
    function bindZone(zone) {
      if (!zone) return;
      ["dragenter", "dragover"].forEach(function (ev) {
        zone.addEventListener(ev, function (e) {
          if (!hasFiles(e)) return;
          e.preventDefault();
          zone.classList.add("dropping");
        });
      });
      zone.addEventListener("dragleave", function (e) {
        if (!e.relatedTarget || !zone.contains(e.relatedTarget)) zone.classList.remove("dropping");
      });
      zone.addEventListener("drop", function (e) {
        if (!hasFiles(e)) return;
        e.preventDefault();
        zone.classList.remove("dropping");
        addFiles(e.dataTransfer.files);
        if (opts.onDrop) opts.onDrop();
      });
      // 스크린샷은 붙여넣는다. 파일로 저장해서 고르는 길은 너무 멀다.
      zone.addEventListener("paste", function (e) {
        var fs = e.clipboardData && e.clipboardData.files;
        if (fs && fs.length) { e.preventDefault(); addFiles(fs); if (opts.onDrop) opts.onDrop(); }
      });
    }
    bindZone(opts.zone);

    paint();

    return {
      el: wrap,
      add: addFiles,
      bindZone: bindZone,
      paint: paint,
      clear: function () {
        list.forEach(function (a) { if (a.preview) URL.revokeObjectURL(a.preview); });
        list.length = 0;
        paint();
      },
      value: function () { return list.filter(function (a) { return !a.uploading; }); }
    };
  }



  /* 글쓰기 상태. 주차는 사용자가 고르는 값이 아니라 맥락이 정하는 값이다.
     기본 카테고리는 양식이 안 붙는 것으로 둔다. 창을 열면 빈 종이여야 하고,
     과제 양식은 '과제'를 고른 사람에게만 나온다. 과제를 낼 자리는 강의실 아래에 따로 있다. */
  var DEFAULT_CAT = "자유";

  function fallbackCat() {
    if (can("write:" + DEFAULT_CAT)) return DEFAULT_CAT;
    var open = writableCats().filter(function (n) { return !categoryOf(n).pass; });
    return open[0] || writableCats()[0] || DEFAULT_CAT;
  }

  var draft = { cat: DEFAULT_CAT, wk: CURRENT_WK, attach: [] };

  /* 글쓰기 창의 첨부. 툴바의 클립 단추와 숨은 파일 입력을 그대로 쓰고,
     미리보기 줄은 본문 아래 · 툴바 위에 선다. 카드 전체가 끌어다 놓기 자리다. */
  var composerAtt = attachRow(draft.attach, {
    input: fileInput, button: fileBtn, zone: composer,
    onChange: updatePostBtn,
    onDrop: function () { setComposer(true); }
  });
  (function () {
    var foot = composer.querySelector(".composer-foot");
    if (foot) foot.parentNode.insertBefore(composerAtt.el, foot);
  })();

  function syncComposer() { paintCat(); syncWkLine(); syncGate(); syncMission(); }

  /* ISO 시각 → datetime-local 입력값(현지 시각). 비면 빈 문자열. */
  function toLocalInput(iso) {
    if (!iso) return "";
    var d = new Date(iso);
    var p = function (n) { return String(n).padStart(2, "0"); };
    return d.getFullYear() + "-" + p(d.getMonth() + 1) + "-" + p(d.getDate()) +
      "T" + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  function dueLabel(iso) {
    var d = new Date(iso);
    var days = ["일", "월", "화", "수", "목", "금", "토"];
    var p = function (n) { return String(n).padStart(2, "0"); };
    return days[d.getDay()] + " " + p(d.getHours()) + ":" + p(d.getMinutes());
  }

  /* ----- 우측 레일 -----
     예전에는 멤버 24 · 온라인 7 · 기수 3 · 3주차 · 상위 12% 가 전부 마크업에 박혀
     있었다. 글이 0편인 라운지에서도 그대로 보였다. 전부 데이터에서 그린다. */
  function paintRail() {
    var set = function (id, v) { var e = $(id); if (e) e.textContent = String(v); };

    if (D.rail) {
      set("railStudents", D.rail.students);
      set("railToday", D.rail.today);
      set("railCohorts", D.rail.cohorts);
      var row = $("railRecent");
      if (row) {
        row.textContent = "";
        D.rail.recent.forEach(function (n) { row.appendChild(el("span", "ava ava-24", initial(n))); });
        if (!D.rail.recent.length) row.appendChild(el("span", "meta-m", "아직 접속한 사람이 없습니다"));
      }
    }

    /* 이번 주 과제 카드. 이 주차에 과제가 없으면 카드를 통째로 뺀다. */
    var card = $("railMission");
    var def = MISSIONS[CURRENT_WK];
    if (card) {
      if (!def) { card.hidden = true; }
      else {
        card.hidden = false;
        set("railWk", CURRENT_WK);
        set("railMissionT", String(def.title || "").replace(/^\d+주차 미션 · /, ""));
        var done = !!myMissionPost(CURRENT_WK);
        var badge = $("railDone");
        if (badge) {
          badge.textContent = done ? "제출함" : "미제출";
          badge.className = "badge " + (done ? "b-ontime" : "b-none");
        }
        var due = WEEK_DUE[CURRENT_WK];
        var lab = $("railDueLabel"), cd = $("countdown");
        if (due) {
          target = Date.parse(due);
          if (lab) { lab.hidden = false; lab.textContent = "정시 마감까지 · " + dueLabel(due); }
          if (cd) cd.hidden = false;
          tick();
        } else if (D.api) {
          if (lab) { lab.hidden = false; lab.textContent = "마감 없음"; }
          if (cd) cd.hidden = true;
        }
      }
    }

    paintRibbon();
  }

  /* 완주 리본. 낸 주차는 정시·지각으로, 안 낸 주차는 지났는지 남았는지로 가른다.
     마감이 없는 주차는 제출이면 그냥 정시로 본다 — 늦었다고 말할 기준이 없다. */
  function paintRibbon() {
    var rib = $("ribbon");
    if (!rib || !D.api) return;   // 프로토타입은 마크업의 예시 그대로
    rib.textContent = "";

    var total = WEEKS.length, ontime = 0, late = 0, left = 0;
    for (var wk = 1; wk <= total; wk++) {
      var mine = myMissionPost(wk);
      var cell = el("div", "rcell");
      if (mine) {
        var due = WEEK_DUE[wk];
        var isLate = due && mine.at && Date.parse(mine.at) > Date.parse(due);
        cell.className += isLate ? " r-late hatch" : " r-ontime";
        cell.title = wk + "주차 · " + (isLate ? "지각 제출" : "정시 제출");
        if (isLate) late++; else ontime++;
      } else if (wk < CURRENT_WK) {
        cell.className += " r-none";
        cell.title = wk + "주차 · 미제출";
      } else {
        cell.className += wk === CURRENT_WK ? " r-none" : " r-future";
        cell.title = wk + "주차 · " + (wk === CURRENT_WK ? "이번 주" : "예정");
        left++;
      }
      rib.appendChild(cell);
    }
    var set = function (id, v) { var e = $(id); if (e) e.textContent = v; };
    set("ribbonHead", total + "주 완주 현황");
    set("ribbonN", (ontime + late) + "/" + total);
    set("ribbonSum", "정시 " + ontime + " · 지각 " + late + " · 남은 주차 " + left);
    var sec = rib.closest("section");
    if (sec) sec.hidden = total === 0;
  }

  /* 우측 레일의 이번 주 제출 현황. 관리 화면 대시보드와 같은 함수로 세어
     두 화면의 숫자가 어긋나지 않게 한다. */
  function paintWkSubmit() {
    var all, done;
    if (D.stats) {
      all = D.stats.students;
      done = D.stats.submitted;
    } else {
      all = students().length;
      done = all - notSubmitted().length;
    }
    $("wkFill").style.width = (all ? (done / all) * 100 : 0) + "%";
    $("wkSubmit").textContent = "";
    $("wkSubmit").appendChild(el("span", "tnum", String(all)));
    $("wkSubmit").appendChild(document.createTextNode("명 중 "));
    $("wkSubmit").appendChild(el("span", "tnum", String(done)));
    $("wkSubmit").appendChild(document.createTextNode("명 제출"));
  }

  /* ----- 카테고리 : 알약 나열이 아니라 토글 하나 ----- */

  var catBtn = $("catBtn"), catMenu = $("catMenu"), catNow = $("catNow");

  function paintCat() {
    // 역할이 내려가거나 카테고리가 지워지면 쓰던 값이 권한 밖일 수 있다
    if (!categoryOf(draft.cat) || !can("write:" + draft.cat)) draft.cat = fallbackCat();
    catNow.textContent = draft.cat;
    catMenu.textContent = "";

    writableCats().forEach(function (name) {
      var pass = PASSES[name];
      var b = el("button");
      b.type = "button";
      b.setAttribute("aria-current", String(name === draft.cat));
      b.appendChild(document.createTextNode(name));
      if (pass) {
        b.setAttribute("data-empty", String(pass.left <= 0));
        b.appendChild(el("span", "left", pass.left + "회 남음"));
      }
      b.addEventListener("click", function () {
        draft.cat = name;
        closeCatMenu();
        syncComposer();
        updatePostBtn();
      });
      catMenu.appendChild(b);
    });
  }

  function closeCatMenu() {
    catMenu.hidden = true;
    catBtn.setAttribute("aria-expanded", "false");
  }

  catBtn.addEventListener("click", function (e) {
    e.stopPropagation();
    var willOpen = catMenu.hidden;
    catMenu.hidden = !willOpen;
    catBtn.setAttribute("aria-expanded", String(willOpen));
  });

  document.addEventListener("click", function (e) {
    if (!catMenu.hidden && !catMenu.contains(e.target) && e.target !== catBtn) closeCatMenu();
  });

  /* ----- 과제 주차 : 고르게 하지 않는다 -----
     기본값은 내가 지금 진행 중인 주차다. 시스템이 이미 아는 값이라 물어볼 필요가 없다.
     예외(늦은 과제 · 앞선 주차)만 '변경'으로 연다. 주차가 50개여도 UI 는 그대로다. */

  var wkLine = $("wkLine"), wkPick = $("wkPick");

  function shortTitle(wk) { return MISSIONS[wk].title.replace(/^\d+주차 미션 · /, ""); }

  function syncWkLine() {
    wkPick.textContent = "";
    var cur = currentMission();
    if (!cur) { wkLine.hidden = true; return; }

    wkLine.textContent = "";
    wkLine.appendChild(el("b", null, cur.wk + "주차 미션"));
    wkLine.appendChild(el("span", null, shortTitle(cur.wk)));

    var chg = el("button", "chg", "변경");
    chg.type = "button";
    chg.addEventListener("click", toggleWkPick);
    wkLine.appendChild(chg);
    wkLine.hidden = false;
  }

  function toggleWkPick() {
    if (wkPick.firstChild) { wkPick.textContent = ""; return; }

    var box = el("div", "wkpick");
    var input = document.createElement("input");
    input.type = "text";
    input.placeholder = "주차 번호나 제목으로 찾기";
    var list = el("div", "list");

    function paint(q) {
      list.textContent = "";
      var keys = Object.keys(MISSIONS).map(Number)
        .filter(function (k) { var c = courseOf(k); return !!c && c.published; })
        .sort(function (a, b) { return a - b; });
      var hit = keys.filter(function (k) {
        if (!q) return true;
        return String(k).indexOf(q) >= 0 || MISSIONS[k].title.indexOf(q) >= 0;
      });

      if (!hit.length) { list.appendChild(el("div", "none", "그런 주차가 없습니다")); return; }

      hit.forEach(function (k) {
        var b = el("button");
        b.type = "button";
        b.appendChild(el("b", null, k + "주차"));
        b.appendChild(document.createTextNode(shortTitle(k)));
        b.addEventListener("click", function () {
          draft.wk = k;
          wkPick.textContent = "";
          syncComposer();
          updatePostBtn();
        });
        list.appendChild(b);
      });
    }

    input.addEventListener("input", function () { paint(input.value.trim()); });
    box.appendChild(input);
    box.appendChild(list);
    wkPick.appendChild(box);
    paint("");
    input.focus();
  }

  /* ----- 권한이 필요한 카테고리 -----
     실제 라운지는 피드백권이 없으면 글을 쓰다가 막힌다. 여기서는 고르는 순간 보여준다. */

  var gateNote = $("gateNote");

  function currentPass() { return PASSES[draft.cat] || null; }

  function syncGate() {
    var p = currentPass();
    if (!p) { gateNote.hidden = true; return; }

    gateNote.textContent = "";
    if (p.left > 0) {
      gateNote.appendChild(el("b", null, "피드백권이 필요한 카테고리입니다."));
      gateNote.appendChild(document.createTextNode(" 이번 주 " + p.left + "회 남았고, 올리면 1회 차감됩니다."));
    } else {
      gateNote.appendChild(el("b", null, "이번 주 피드백권을 다 썼습니다."));
      gateNote.appendChild(document.createTextNode(" 다음 주에 " + p.per + "회가 다시 채워집니다."));
    }
    gateNote.appendChild(el("span", "muted", p.note));
    gateNote.hidden = false;
  }

  /* ----- 주차별 미션 양식 -----
     카테고리 '과제' + 주차를 고르면 그 주차 양식이 칸으로 펼쳐진다.
     가이드 예시는 placeholder 로만 살아 있고 저장되지 않는다. */

  var missionBox = $("missionBox");
  var missionForm = null;

  function currentMission() {
    if (draft.cat !== "과제" || !MISSIONS[draft.wk]) return null;
    return { wk: draft.wk, def: MISSIONS[draft.wk] };
  }

  function syncMission() {
    var cur = currentMission();

    if (!cur) {
      missionBox.hidden = true;
      missionBox.textContent = "";
      missionForm = null;
      ta.hidden = false;
      updatePostBtn();
      return;
    }

    if (!missionForm || missionForm.wk !== cur.wk) {
      missionForm = buildMissionForm(cur.wk, { onChange: updatePostBtn, headless: true });
      missionBox.textContent = "";
      missionBox.appendChild(missionForm.el);
    }

    // 과제일 땐 미션 칸이 본문을 대신한다. 두 개를 같이 보여주지 않는다.
    ta.hidden = true;
    missionBox.hidden = false;
    missionForm.sync();
  }

  function updatePostBtn() {
    var pass = currentPass();
    if (pass && pass.left <= 0) { postBtn.disabled = true; return; }
    if (currentMission()) {
      postBtn.disabled = !(missionForm && missionForm.complete());
    } else {
      postBtn.disabled = !(wTitle.value.trim() || ta.value.trim());
    }
  }

  postBtn.addEventListener("click", function () {
    var cur = currentMission();
    var pass = currentPass();
    if (pass && pass.left <= 0) return;

    var title = wTitle.value.trim();
    var body = ta.value.trim();
    var answers = null;

    if (cur) {
      if (!missionForm || !missionForm.complete()) return;
      answers = missionForm.answers();
    } else if (!title && !body) {
      return;
    }

    var post = {
      cat: draft.cat,
      wk: cur ? cur.wk : 0,
      author: ME.name,
      when: "방금",
      state: "live",
      comments: 0, views: 1,
      mine: true,
      reactions: {}, myReact: null, thread: [],
      title: title || (cur ? cur.wk + "주차 과제 올립니다" : body.split("\n")[0].slice(0, 70)),

      /* 제목을 안 적었으면 첫 줄이 제목이 되고 나머지가 본문이다.
         예전에는 여기서 줄바꿈을 공백으로 바꾸고 160자에서 잘랐다 — 미리보기
         문자열이던 시절의 코드다. 지금은 이 값이 그대로 DB 로 가므로
         쓴 사람이 넣은 줄을 건드리지 않는다. 피드에서 접는 일은 CSS 가 한다. */
      body: answers ? "" : (title ? body : body.split("\n").slice(1).join("\n").trim()),
      mission: answers
    };

    // 올라가는 중인 것은 주소가 없다. 다 올라온 것만 붙인다.
    var ready = draft.attach.filter(function (a) { return !a.uploading; });
    if (ready.length) post.attach = ready;

    if (postBtn.disabled) return;   // 이미 보내는 중이다
    busy(postBtn, "게시 중…", send("POST", "/posts", {
      cat: post.cat, wk: post.wk || null, title: post.title,
      body: post.body, mission: answers, attach: ready, key: draft.key || newKey()
    })).then(function (r) {
      draft.key = null;   // 이 글은 끝났다. 다음 글은 새 열쇠다.
      // 서버가 같은 글로 봤으면 화면에 두 번 세우지 않는다
      if (r && r.duplicate) { setComposer(false); return; }
      if (r) post.id = r.id;
      if (r && r.attach && r.attach.length) post.attach = r.attach;
      POSTS.unshift(post);
      // 본문에 적은 주소는 글이 선 뒤에 카드로 편다. 게시가 남의 서버를 기다리지 않는다.
      if (r && r.card) fetchCard(post, r.card);

      // 피드백권이 필요한 카테고리면 여기서 1회 차감된다
      if (pass) pass.left -= 1;

      wTitle.value = "";
      ta.value = "";
      autoGrow(ta);
      composerAtt.clear();
      if (missionForm) missionForm.clear();
      draft.cat = DEFAULT_CAT; // 다음 글도 빈 종이에서 시작한다
      draft.wk = CURRENT_WK;   // 주차는 다시 진행 중인 주차부터
      setComposer(false);
      render();
      syncComposer();
      updatePostBtn();
    }).catch(failed);

    // 미션을 올리면 그 주차 과제 퀘스트가 체크되고 진도율이 오른다
    if (cur) markMissionQuest(cur.wk);
  });

  syncComposer();

  /* ================= 필터 (P1-5) ================= */

  /* 주차 칩은 없앴다. '3주차 과제' 검색이 같은 일을 하고, 그쪽이 주차 개수에 안 묶인다. */
  var state = { cat: "전체", mine: false, liked: false, sort: "new" };

  var catFilter = $("catFilter");
  var moreOpen = false;

  /* 칩은 라운지 설정에서 그린다. 관리 화면에서 설정을 바꾸면 여기 바로 반영된다. */
  function renderFilters() {
    catFilter.textContent = "";

    function catChip(name, isMore) {
      var b = el("button", "chip", name);
      b.type = "button";
      b.setAttribute("data-cat", name);
      b.setAttribute("aria-pressed", String(state.cat === name));
      if (isMore) b.hidden = !moreOpen;
      b.addEventListener("click", function () {
        state.cat = name;
        renderFilters();
        render();
      });
      return b;
    }

    catFilter.appendChild(catChip("전체", false));
    lounge().show.forEach(function (n) { catFilter.appendChild(catChip(n, false)); });
    lounge().more.forEach(function (n) { catFilter.appendChild(catChip(n, true)); });

    var sep = el("span", "fsep");
    sep.hidden = !moreOpen;
    sep.setAttribute("aria-hidden", "true");
    catFilter.appendChild(sep);

    [["mine", "내 글"], ["liked", "반응한 글"]].forEach(function (v) {
      var b = el("button", "chip", v[1]);
      b.type = "button";
      b.setAttribute("data-view", v[0]);
      b.setAttribute("aria-pressed", String(!!state[v[0]]));
      b.hidden = !moreOpen;
      b.addEventListener("click", function () {
        state[v[0]] = !state[v[0]];
        renderFilters();
        render();
      });
      catFilter.appendChild(b);
    });

    var more = el("button", "chip chip-more", moreOpen ? "필터 줄이기" : "필터 더보기");
    more.type = "button";
    more.id = "moreBtn";
    more.setAttribute("aria-expanded", String(moreOpen));
    more.addEventListener("click", function () { moreOpen = !moreOpen; renderFilters(); });
    catFilter.appendChild(more);
  }

  renderFilters();

  /* ----- 정렬 토글 ----- */

  var sortButtons = Array.prototype.slice.call($("sortFilter").querySelectorAll("[data-sort]"));

  sortButtons.forEach(function (b) {
    b.addEventListener("click", function () {
      sortButtons.forEach(function (o) { o.setAttribute("aria-pressed", String(o === b)); });
      state.sort = b.getAttribute("data-sort");
      render();
    });
  });

  /* ================= 피드 렌더 ================= */

  var feed = $("feed"), resultCount = $("resultCount");

  /* 이모지 · GIF 딸깍 반응. 현재 라운지는 반응 수단이 하트 하나뿐이라
     반응하려면 문장을 써야 한다. 여기서 쓰는 이모지는 UI 장식이 아니라
     사람이 남기는 내용이므로 '이모지 금지' 규칙의 예외다. */
  var REACTS = ["👍", "🔥", "👏", "😂", "😮", "🙌"];

  function reactionBar(p) {
    if (!p.reactions) p.reactions = {};

    var host = el("div");
    var bar = el("div", "reacts");
    var picker = null;
    host.appendChild(bar);

    function closePicker() {
      if (picker) { host.removeChild(picker); picker = null; }
    }

    /* 반응만 낙관적으로 먼저 반영한다. 딸깍 반응이 서버를 기다리면
       딸깍이 아니게 된다. 실패하면 되돌린다. */
    function toggle(key) {
      var before = { my: p.myReact, counts: Object.assign({}, p.reactions) };
      var chain = [];
      if (p.myReact && p.myReact !== key) chain.push(p.myReact);
      chain.push(key);
      chain.forEach(function (e) {
        send("PUT", "/posts/" + p.id + "/reactions", { emoji: e }).catch(function (err) {
          p.myReact = before.my;
          p.reactions = before.counts;
          paint();
          failed(err);
        });
      });

      if (p.myReact === key) {
        p.reactions[key] = Math.max(0, (p.reactions[key] || 1) - 1);
        p.myReact = null;
      } else {
        if (p.myReact) p.reactions[p.myReact] = Math.max(0, (p.reactions[p.myReact] || 1) - 1);
        p.reactions[key] = (p.reactions[key] || 0) + 1;
        p.myReact = key;
      }
      paint();
    }

    function buildPicker() {
      var row = el("div", "react-pick");
      REACTS.forEach(function (key) {
        var b = el("button", null, key);
        b.type = "button";
        b.setAttribute("aria-label", key + " 반응");
        b.addEventListener("click", function () { toggle(key); closePicker(); });
        row.appendChild(b);
      });
      var gif = el("button", "gif", "GIF");
      gif.type = "button";
      gif.addEventListener("click", function () { toggle("GIF"); closePicker(); });
      row.appendChild(gif);
      return row;
    }

    function pill(key) {
      var n = p.reactions[key] || 0;
      var b = el("button", "react");
      b.type = "button";
      b.setAttribute("aria-pressed", String(p.myReact === key));
      b.appendChild(el("span", "mark", key));
      if (n) b.appendChild(document.createTextNode(String(n)));
      b.addEventListener("click", function () { toggle(key); });
      return b;
    }

    function paint() {
      closePicker();
      bar.textContent = "";

      // 👍 는 개수가 0이어도 늘 자리에 있다. 반응이 한 번의 클릭으로 끝나야 하기 때문.
      bar.appendChild(pill("👍"));

      Object.keys(p.reactions).forEach(function (key) {
        if (key === "👍" || !p.reactions[key]) return;
        bar.appendChild(pill(key));
      });

      var add = iconIn(el("button", "react react-add"), "plus", 14);
      add.type = "button";
      add.setAttribute("aria-label", "반응 고르기");
      add.addEventListener("click", function () {
        if (picker) { closePicker(); return; }
        picker = buildPicker();
        host.appendChild(picker);
      });
      bar.appendChild(add);
    }

    paint();
    return host;
  }

  /* 첨부. 이미지 · 링크 · 영상 세 가지.
     영상은 눌러야 재생기를 붙인다 — 피드에 재생기가 열 개 떠 있을 이유가 없다. */
  /* 어떤 형태의 유튜브 주소든 임베드 주소로 바꾼다 (watch?v= · youtu.be · embed) */
  function ytEmbed(url) {
    var m = url.match(/(?:youtu\.be\/|[?&]v=|embed\/)([A-Za-z0-9_-]{6,})/);
    return m ? "https://www.youtube.com/embed/" + m[1] : url;
  }

  function pretty(url) {
    return String(url || "").replace(/^https?:\/\//i, "").replace(/\/$/, "");
  }

  /* 사진이 여러 장이면 세로로 쌓지 않고 옆으로 넘긴다. 세로로 쌓으면
     사진 넉 장짜리 글 하나가 피드 한 화면을 다 먹는다. */
  function attachments(list, compact) {
    var all = [].concat(list || []).filter(Boolean);
    if (!all.length) return null;

    /* 피드에서는 첫 장만 보여 준다. 목록은 훑는 자리고, 다 보려면 글로 들어온다.
       몇 장인지만 숫자로 알린다. */
    if (compact) {
      var one = attachment(all[0], true, all);
      if (one && all.length > 1) {
        one.appendChild(el("span", "shot-n", all.length + "장"));
        one.classList.add("att-many");
      }
      return one;
    }

    if (all.length === 1) return attachment(all[0], compact, all);

    var strip = el("div", "shots");
    all.forEach(function (a) {
      var cell = el("div", "shot");
      var box = attachment(a, compact, all);
      if (box) cell.appendChild(box);
      strip.appendChild(cell);
    });

    var wrap = el("div", "shotwrap");
    wrap.appendChild(strip);

    // 화살표는 넘길 데가 있을 때만 쓴다. 없는데 떠 있으면 눌러 보게 된다.
    ["prev", "next"].forEach(function (dir) {
      var b = el("button", "shot-nav shot-" + dir);
      b.type = "button";
      b.setAttribute("aria-label", dir === "prev" ? "이전" : "다음");
      b.appendChild(icon(dir === "prev" ? "chevron-left" : "chevron-right", 16));
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        strip.scrollBy({ left: (dir === "prev" ? -1 : 1) * strip.clientWidth * 0.8, behavior: "smooth" });
      });
      wrap.appendChild(b);
    });

    function paintNav() {
      var room = strip.scrollWidth - strip.clientWidth;
      wrap.querySelector(".shot-prev").hidden = strip.scrollLeft <= 4;
      wrap.querySelector(".shot-next").hidden = strip.scrollLeft >= room - 4;
    }
    strip.addEventListener("scroll", paintNav);
    setTimeout(paintNav, 0);

    wrap.appendChild(el("span", "shot-n", all.length + "개"));
    return wrap;
  }

  /* 사진·영상은 눌러서 크게 본다. 다만 피드에서는 아니다 — 208px 짜리 칸에서
     재생해 봐야 보이지 않는다. 목록에서 누르면 글로 들어가고, 재생은 글 안에서 한다.
     단추로 감싸면 글을 여는 클릭과 부딪히지 않는다 — 본문 클릭은 button 을 건너뛴다. */
  function zoom(inner, a, siblings, compact) {
    if (compact) return inner;   // 피드에서는 그냥 그림이다. 누르면 글이 열린다.

    var b = el("button", "att-zoom");
    b.type = "button";
    b.setAttribute("aria-label", (a.label || a.title || "첨부") + " 크게 보기");
    b.appendChild(inner);
    b.addEventListener("click", function (e) {
      e.stopPropagation();
      var list = ([].concat(siblings || [a])).filter(function (x) {
        return x && (x.type === "image" || x.type === "video") && x.url;
      });
      if (!list.length) return;
      openViewer(list, Math.max(0, list.indexOf(a)));
    });
    return b;
  }

  /* ---- 확대 뷰어 ----
     사진과 영상을 같은 자리에서 본다. 좌우로 넘기고, ESC 나 바깥을 누르면 닫힌다. */
  var viewer = null, viewerList = [], viewerAt = 0;

  function buildViewer() {
    var v = el("div", "viewer");
    v.hidden = true;

    var stage = el("div", "viewer-stage");
    v.appendChild(stage);

    var close = iconIn(el("button", "viewer-x"), "x", 22);
    close.type = "button";
    close.setAttribute("aria-label", "닫기");
    close.addEventListener("click", closeViewer);
    v.appendChild(close);

    var count = el("span", "viewer-n");
    v.appendChild(count);

    ["prev", "next"].forEach(function (dir) {
      var b = el("button", "viewer-nav viewer-" + dir);
      b.type = "button";
      b.setAttribute("aria-label", dir === "prev" ? "이전" : "다음");
      b.appendChild(icon(dir === "prev" ? "chevron-left" : "chevron-right", 22));
      b.addEventListener("click", function () { step(dir === "prev" ? -1 : 1); });
      v.appendChild(b);
    });

    v.addEventListener("click", function (e) { if (e.target === v || e.target === stage) closeViewer(); });

    document.body.appendChild(v);
    return { el: v, stage: stage, count: count };
  }

  function paintViewer() {
    var a = viewerList[viewerAt];
    viewer.stage.textContent = "";

    if (a.type === "video") {
      var vd = document.createElement("video");
      vd.src = a.url;
      vd.controls = true;
      vd.autoplay = true;
      vd.playsInline = true;
      viewer.stage.appendChild(vd);
    } else {
      var im = document.createElement("img");
      im.src = a.url;
      im.alt = a.label || a.title || "첨부";
      viewer.stage.appendChild(im);
    }

    viewer.count.textContent = viewerList.length > 1 ? (viewerAt + 1) + " / " + viewerList.length : "";
    viewer.el.querySelector(".viewer-prev").hidden = viewerList.length < 2;
    viewer.el.querySelector(".viewer-next").hidden = viewerList.length < 2;
  }

  function step(d) {
    viewerAt = (viewerAt + d + viewerList.length) % viewerList.length;
    paintViewer();
  }

  function openViewer(list, at) {
    if (!viewer) viewer = buildViewer();
    viewerList = list;
    viewerAt = at || 0;
    paintViewer();
    viewer.el.hidden = false;
    document.body.style.overflow = "hidden";
  }

  function closeViewer() {
    if (!viewer || viewer.el.hidden) return;
    viewer.stage.textContent = "";   // 영상이 남아서 소리를 내지 않게
    viewer.el.hidden = true;
    document.body.style.overflow = postModal && !postModal.hidden ? "hidden" : "";
  }

  function viewerOpen() { return !!(viewer && !viewer.el.hidden); }

  function attachment(a, compact, siblings) {
    if (!a) return null;

    var box = el("div", "att" + (compact ? " att-compact" : ""));

    if (a.type === "image") {
      // 실제로 올린 파일이면 그대로 보여준다. 프로토타입에는 주소가 없어 자리만 잡는다.
      if (a.url) {
        var real = document.createElement("img");
        real.className = "att-real";
        real.src = a.url;
        real.alt = a.label || a.title || "첨부 이미지";
        real.loading = "lazy";
        box.appendChild(zoom(real, a, siblings, compact));
        return box;
      }
      var img = el("div", "att-img");
      img.appendChild(el("span", null, "이미지 첨부 자리"));
      if (a.label) img.appendChild(el("span", null, a.label));
      box.appendChild(img);
      return box;
    }

    /* 올린 영상은 사진과 같은 자리에 같은 크기로 선다. 목록에서는 첫 프레임만
       세워 두고, 재생은 뷰어에서 한다 — 피드에서 네 개가 동시에 돌면 안 된다. */
    if (a.type === "video") {
      var v = document.createElement("video");
      v.className = "att-real";
      v.src = a.url;
      v.preload = "metadata";
      v.muted = true;
      v.playsInline = true;

      var hold = el("div", "att-vid");
      hold.appendChild(v);
      hold.appendChild(iconIn(el("span", "att-play"), "play", 18));
      box.appendChild(zoom(hold, a, siblings, compact));
      return box;
    }

    if (a.type === "link") {
      /* 카드가 눌리지 않으면 주소를 손으로 옮겨 적어야 한다. 그러라고 붙인 게 아니다.
         주소가 http(s) 일 때만 링크로 만든다 — 남이 쓴 글에서 오는 값이다. */
      var safe = /^https?:\/\//i.test(a.url || "");
      var link = safe ? document.createElement("a") : box;
      if (safe) {
        link.className = box.className;
        link.href = a.url;
        link.target = "_blank";
        link.rel = "noopener noreferrer nofollow ugc";
      }
      link.classList.add("att-link");
      link.appendChild(el("span", "t", a.title || a.url));
      link.appendChild(el("span", "u", pretty(a.url)));
      return link;
    }

    if (a.type === "youtube") {
      var stage = el("div", "att-video");

      var play = el("button", "play");
      play.type = "button";
      play.setAttribute("aria-label", "영상 재생");
      play.appendChild(icon("play", 19));
      stage.appendChild(play);
      stage.appendChild(el("span", "cap", a.url ? (a.title || "") : "영상 URL 을 넣으면 눌러서 바로 재생됩니다"));

      play.addEventListener("click", function () {
        if (!a.url) return;

        /* file:// 로 열면 출처가 null 이라 유튜브가 재생을 거부한다("구성 오류").
           그때는 깨진 재생기를 보여주는 대신 링크로 내보낸다. */
        if (location.protocol === "file:") {
          stage.textContent = "";
          var note = el("div", "note");
          note.appendChild(document.createTextNode("로컬 파일로 열면 유튜브가 재생을 막습니다. 로컬 서버로 열거나 "));
          var go = document.createElement("a");
          go.href = a.url;
          go.target = "_blank";
          go.rel = "noopener";
          go.textContent = "유튜브에서 보기";
          note.appendChild(go);
          stage.appendChild(note);
          return;
        }

        var src = ytEmbed(a.url);
        var frame = document.createElement("iframe");
        frame.src = src + (src.indexOf("?") > -1 ? "&" : "?") + "autoplay=1";
        frame.allow = "accelerometer; autoplay; encrypted-media; picture-in-picture; fullscreen";
        frame.setAttribute("allowfullscreen", "");
        stage.textContent = "";
        stage.appendChild(frame);
      });

      box.appendChild(stage);
      return box;
    }

    return null;
  }

  /* 미션 글은 질문을 작게 눕히고 답변을 본문으로 올린다. 첫 답변만 펼쳐 두어야
     비계가 아니라 사람이 쓴 말이 먼저 보이고, 피드에서 글 3개 읽기가 가능해진다. */
  function missionAnswers(rows, openAll) {
    var wrap = el("div", "ans");

    // 피드에서는 첫 답변만 두 줄로 맛보이고 끝낸다.
    // 나머지를 펼치는 버튼은 두지 않는다 — 더 보려면 글로 들어와야 댓글까지 닿는다.
    (openAll ? rows : rows.slice(0, 1)).forEach(function (row, i) {
      var r = el("div", "ans-row");
      r.appendChild(el("span", "ans-q", "Q" + (i + 1) + ". " + row.q));
      r.appendChild(el("p", "ans-a" + (openAll ? "" : " clamp2"), row.a));
      wrap.appendChild(r);
    });

    return wrap;
  }

  /* 본문은 두 줄만 보이고 나머지는 접는다. 접힌 줄이 있을 때만 '더보기' 를 단다 —
     짧은 글에까지 붙으면 누를 것이 없는 단추가 된다. 몇 줄이 접혔는지는
     그려 봐야 알기 때문에, 단추는 일단 숨겨 두고 render 끝에서 한 번에 잰다. */
  function bodyBlock(body) {
    var box = el("div", "post-xw");
    var x = el("p", "post-x clamp2", body);

    var more = el("button", "morelink", "더보기");
    more.type = "button";
    more.hidden = true;
    more.addEventListener("click", function () {
      var folded = x.classList.toggle("clamp2");
      more.textContent = folded ? "더보기" : "접기";
    });

    box.appendChild(x);
    box.appendChild(more);
    return box;
  }

  /* ----- 더 보기 -----
     첫 화면에는 한 묶음만 실려 온다. 150편을 한꺼번에 그리면 화면이 90 뭉치만큼
     길어지고, 그 아래를 보는 사람은 없다. 누를 때마다 다음 묶음을 잇는다. */
  var more = { left: !!D.more, cursor: D.cursor || null, pending: false };

  function moreButton() {
    var b = el("button", "feed-more", more.pending ? "불러오는 중…" : "글 더 보기");
    b.type = "button";
    b.disabled = more.pending;
    b.addEventListener("click", loadMore);
    return b;
  }

  function loadMore() {
    if (more.pending || !more.left || !API || !more.cursor) return;
    more.pending = true;
    render();

    send("GET", "/posts?at=" + encodeURIComponent(more.cursor.at) + "&id=" + more.cursor.id)
      .then(function (r) {
        more.pending = false;
        if (!r) return;
        // 같은 글이 두 번 실리지 않게 — 그 사이에 새 글이 올라올 수 있다
        var have = {};
        POSTS.forEach(function (p) { have[p.id] = true; });
        r.posts.forEach(function (p) {
          if (have[p.id]) return;
          normalizePost(p);
          POSTS.push(p);
        });
        more.left = !!r.more;
        more.cursor = r.cursor || null;
        render();
      })
      .catch(function (e) { more.pending = false; render(); failed(e); });
  }

  function render() {
    var rows = POSTS.filter(function (p) {
      if (state.cat !== "전체" && p.cat !== state.cat) return false;
      if (state.mine && !p.mine) return false;
      if (state.liked && !p.myReact) return false;
      return true;
    });

    if (state.sort === "like") {
      rows = rows.slice().sort(function (a, b) { return reactTotal(b) - reactTotal(a); });
    }

    // 고정 글은 위계가 아니라 순서만 앞선다. 걸린 조건에 맞을 때만 올라온다.
    rows = rows.slice().sort(function (a, b) { return (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0); });

    /* 전체 수는 서버가 센다. 화면에 30편만 실려 있어도 '150개' 라고 말해야
       사람이 스스로를 의심하지 않는다. */
    var whole = state.cat === "전체" && !state.mine && !state.liked;
    var total = whole && D.stats ? D.stats.posts
      : whole && INDEX ? INDEX.length : rows.length;
    resultCount.textContent = String(total);
    paintWkSubmit();

    feed.textContent = "";

    if (!rows.length) {
      feed.appendChild(el("p", "empty",
        more.pending ? "불러오는 중입니다." : "이 조건에 맞는 글이 아직 없습니다."));
      if (!more.pending) return;
    }

    rows.forEach(function (p) {
      var card = el("article", "card pad-s post" + (p.pinned ? " pinned" : ""));

      // 카테고리 · 주차 · 시각이 먼저 오고, 그 아래에 쓴 사람이 온다
      var meta = el("div", "post-meta");
      meta.appendChild(el("span", "cat", p.cat));
      meta.appendChild(el("span", "sep", "·"));
      meta.appendChild(el("span", null, p.when));
      meta.appendChild(el("span", "grow"));
      if (p.pinned) meta.appendChild(pinIcon());

      /* 수정 · 고정 · 삭제는 케밥 메뉴 안에 둔다. 셋을 늘어놓으면
         조작 버튼이 본문보다 먼저 눈에 든다. */
      var feedGate = el("div", "gate-slot");
      feedGate.hidden = true;

      var menu = postMenu(p, {
        onEdit: function () { openPost(p); editPost(p); },
        onDelete: function () {
          feedGate.textContent = "";
          feedGate.appendChild(deleteGate(p, function () { feedGate.hidden = true; }));
          feedGate.hidden = false;
        }
      });
      if (menu) meta.appendChild(menu);

      card.appendChild(meta);
      card.appendChild(feedGate);


      var top = el("div", "post-top");
      top.appendChild(el("span", "ava ava-34" + (p.mine ? " ava-ink" : ""), initial(p.author)));
      top.appendChild(el("span", "post-name", p.author));
      card.appendChild(top);

      var body = el("div", "post-body");
      var text = el("div", "post-text");
      var h = el("h3", "post-h");
      var titleBtn = el("button", null, p.title);
      titleBtn.type = "button";
      titleBtn.addEventListener("click", function () { openPost(p); });
      h.appendChild(titleBtn);
      text.appendChild(h);

      if (p.body) text.appendChild(bodyBlock(p.body));
      if (p.mission) text.appendChild(missionAnswers(p.mission));
      body.appendChild(text);

      // 미리보기를 누르면 글로 들어간다. 댓글은 글 안에서만 달 수 있다.
      body.addEventListener("click", function (e) {
        if (e.target.closest("button, a")) return;
        openPost(p);
      });
      var att = attachments(p.attach, true);
      if (att) body.appendChild(att);
      card.appendChild(body);

      // 좋아요 버튼은 두지 않는다. 👍 가 반응의 한 종류로 그 역할을 한다.
      var foot = el("div", "post-foot");
      var cmtBtn = el("button", "footlink", "댓글 " + cmtCount(p));
      cmtBtn.type = "button";
      cmtBtn.addEventListener("click", function () { openPost(p); });
      foot.appendChild(cmtBtn);
      foot.appendChild(el("span", null, "조회 " + p.views));

      card.appendChild(reactionBar(p));
      card.appendChild(foot);

      feed.appendChild(card);
    });

    if (more.left) feed.appendChild(moreButton());

    /* 접힌 줄이 실제로 있는지는 그려 봐야 안다. 다 그린 뒤 한 번에 잰다.
       화면이 숨어 있으면 높이가 0 이라 잴 수 없으니 그때는 건드리지 않는다. */
    if (feed.clientHeight) {
      [].forEach.call(feed.querySelectorAll(".post-x"), function (x) {
        if (x.nextSibling) x.nextSibling.hidden = x.scrollHeight <= x.clientHeight + 1;
      });
    }
  }

  render();

  /* ================= 게시물 상세 · 댓글 =================
     상세는 페이지가 아니라 모달이다. 닫으면 보던 자리로 그대로 돌아온다.
     댓글 액션은 좋아요와 답글 둘뿐이고, 답글은 한 단계만 들어간다. */

  var postModal = $("postModal");
  var detailBody = $("detailBody"), detailComments = $("detailComments");
  var openRef = null;

  function closePost() {
    /* 숨기기만 하면 유튜브 재생기가 그대로 남아 소리가 계속 난다.
       보이지 않는 곳에서 나는 소리는 끌 방법도 없다. 재생기를 먼저 걷는다. */
    [].forEach.call(postModal.querySelectorAll("iframe"), function (f) { f.remove(); });
    [].forEach.call(postModal.querySelectorAll("video"), function (v) { v.pause(); });
    postModal.hidden = true;
    openRef = null;
    document.body.style.overflow = "";
    remember(true);   // 닫힌 상태로 주소를 고쳐 쓴다. 뒤로가기가 닫은 글을 다시 열지 않게
  }

  function openPost(p) {
    openRef = p;
    detailBody.textContent = "";

    /* 조회는 사람 단위로 한 번만 센다. 서버가 실제 수를 돌려준다. */
    if (p.id) {
      send("POST", "/posts/" + p.id + "/view").then(function (r) {
        if (r && typeof r.views === "number" && r.views !== p.views) {
          p.views = r.views;
          if (openRef === p) render();
        }
      }).catch(function () { /* 조회수는 실패해도 글 읽기를 막지 않는다 */ });
    }

    var meta = el("div", "post-meta");
    meta.appendChild(el("span", "cat", p.cat));
    meta.appendChild(el("span", "sep", "·"));
    meta.appendChild(el("span", null, p.when));
    meta.appendChild(el("span", "grow"));
    if (p.pinned) meta.appendChild(pinIcon());

    // 피드와 같은 메뉴를 쓴다. 자리가 달라도 할 수 있는 일은 같아야 한다.
    var dmenu = postMenu(p, {
      onEdit: function () { editPost(p); },
      onDelete: function () { askDelete(p); },
      after: function () { openPost(p); }
    });
    if (dmenu) meta.appendChild(dmenu);

    detailBody.appendChild(meta);

    var top = el("div", "post-top");
    top.appendChild(el("span", "ava ava-34" + (p.mine ? " ava-ink" : ""), initial(p.author)));
    top.appendChild(el("span", "post-name", p.author));
    detailBody.appendChild(top);

    detailBody.appendChild(el("h2", "detail-title", p.title));
    if (p.body) detailBody.appendChild(el("p", "detail-text", p.body));
    if (p.mission) detailBody.appendChild(missionAnswers(p.mission, true));
    var detailAtt = attachments(p.attach, false);
    if (detailAtt) detailBody.appendChild(detailAtt);
    detailBody.appendChild(reactionBar(p));

    detailGate = el("div", "gate-slot");
    detailGate.hidden = true;
    detailBody.appendChild(detailGate);

    renderComments();
    postModal.hidden = false;
    remember();   // 글 하나가 한 걸음. 뒤로가기가 이 글을 닫는다
    document.body.style.overflow = "hidden";
  }

  var detailGate = null;

  /* 검색에서 들어온 댓글은 글만 열어주면 어디 있는지 다시 못 찾는다.
     접힌 답글이면 펴고, 그 자리로 내려가 잠깐 표시해 둔다. */
  function focusComment(c) {
    /* 서버 검색에서 온 댓글은 화면에 그려진 것과 다른 객체다. id 로 다시 찾는다 —
       못 찾으면 글만 열리고 아무 데도 강조되지 않는다. */
    var node = c.node;
    if (!node && c.id) {
      var hit = [].filter.call(detailComments.querySelectorAll("[data-cid]"), function (n) {
        return n.getAttribute("data-cid") === String(c.id);
      })[0];
      node = hit || null;
    }
    if (!node) return;

    if (node.hidden) {
      var more = node.parentNode.querySelector(".cmt-more");
      if (more) more.click();
    }

    node.classList.add("cmt-hit");
    node.scrollIntoView({ block: "center" });
    setTimeout(function () { node.classList.remove("cmt-hit"); }, 2400);
  }

  function askDelete(p) {
    detailGate.textContent = "";
    detailGate.hidden = false;
    detailGate.appendChild(deleteGate(p, function (done) {
      if (done) closePost();
      else detailGate.hidden = true;
    }));
  }

  /* 내 글 수정. 상세 본문 자리를 그대로 편집 화면으로 바꾼다.
     과제 글이면 미션 칸을, 보통 글이면 제목과 본문을 연다. */
  /* 글쓰기 창의 카테고리 고르개를 그대로 쓴다. 자리가 달라도 같은 일을 하는
     컨트롤은 같은 모양이어야 한다 — 하나를 익히면 나머지도 안다. */
  function catPick(current, names, locked) {
    var wrap = el("div", "pick");

    var btn = el("button", "pick-btn");
    btn.type = "button";
    btn.setAttribute("aria-expanded", "false");
    btn.disabled = !!locked;

    var now = el("span", null, current);
    btn.appendChild(now);
    btn.appendChild(iconIn(el("span", "caret"), "chevron-down", 14));

    var menu = el("div", "pick-menu cat-pop");
    menu.hidden = true;

    var picked = current;

    names.forEach(function (name) {
      var b = el("button", null, name);
      b.type = "button";
      b.setAttribute("aria-current", String(name === picked));
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        picked = name;
        now.textContent = name;
        [].forEach.call(menu.children, function (x) {
          x.setAttribute("aria-current", String(x.textContent === picked));
        });
        menu.hidden = true;
        btn.setAttribute("aria-expanded", "false");
      });
      menu.appendChild(b);
    });

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = menu.hidden;
      closePicks();
      menu.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    });

    wrap.appendChild(btn);
    wrap.appendChild(menu);
    return { el: wrap, value: function () { return picked; } };
  }

  function closePicks() {
    [].forEach.call(document.querySelectorAll(".cat-pop"), function (m) {
      m.hidden = true;
      if (m.previousSibling) m.previousSibling.setAttribute("aria-expanded", "false");
    });
  }
  document.addEventListener("click", closePicks);

  /* 이 카테고리가 피드백권을 쓰는가. PASSES 는 '내가 가진 권' 이라 스태프에게는
     비어 있다. 카테고리의 성질은 CATEGORIES 에서 봐야 한다. */
  function passOf(name) {
    var c = categoryOf(name);
    return !!(c && c.pass);
  }

  /* 옮겨 갈 수 있는 곳 — 내가 쓸 수 있고, 권이 안 붙고, 과제가 아닌 것.
     지금 있는 자리는 언제나 목록에 둔다. 어디에 있는지가 먼저 보여야 한다. */
  function moveTargets(now) {
    var list = writableCats().filter(function (n) {
      return n !== "과제" && !passOf(n);
    });
    if (list.indexOf(now) < 0) list.unshift(now);
    return list;
  }

  function editPost(p) {
    detailBody.textContent = "";
    detailBody.appendChild(el("span", "kicker", "글 수정"));

    var title = document.createElement("input");
    title.className = "w-title";
    title.type = "text";
    title.value = p.title;
    title.placeholder = "제목";
    detailBody.appendChild(title);

    /* 카테고리를 잘못 골라 올리는 일이 잦다. 고칠 때 같이 옮길 수 있어야 한다.
       다만 옮기는 것으로 관문을 피할 수는 없다 — 과제와 피드백권 카테고리는
       양식과 권에 묶여 있어서 그대로 둔다. 서버도 같은 것을 다시 본다. */
    var movable = p.cat !== "과제" && !passOf(p.cat);
    var cat = catPick(p.cat, movable ? moveTargets(p.cat) : [], !movable);

    var save = el("button", "btn-primary sm", "저장");
    save.type = "button";

    var form = null, body = null;

    if (p.mission && MISSIONS[p.wk]) {
      form = buildMissionForm(p.wk, { headless: true, onChange: function (ok) { save.disabled = !ok; } });
      form.fill(p.mission.map(function (a) { return a.a; }));
      detailBody.appendChild(form.el);
    } else {
      body = document.createElement("textarea");
      body.className = "w-body";
      body.value = p.body || "";
      body.placeholder = "본문";
      body.addEventListener("input", function () { autoGrow(body); });
      detailBody.appendChild(body);
      autoGrow(body);
    }

    // 글쓰기 창과 같은 순서다 — 카테고리 · 취소 · 확정
    var row = el("div", "row");
    row.appendChild(el("span", "grow"));
    row.appendChild(cat.el);

    var cancel = el("button", "btn-ghost", "취소");
    cancel.type = "button";
    cancel.addEventListener("click", function () { openPost(p); });
    row.appendChild(cancel);
    row.appendChild(save);
    detailBody.appendChild(row);

    if (!movable) {
      detailBody.appendChild(el("p", "sec-note",
        p.cat === "과제" ? "과제는 주차 양식에 묶여 있어 카테고리를 옮길 수 없습니다"
                         : "피드백권을 쓴 글은 카테고리를 옮길 수 없습니다"));
    }

    save.addEventListener("click", function () {
      var was = p.cat;
      var t = title.value.trim();
      if (t) p.title = t;
      if (form) p.mission = form.answers();
      else p.body = body.value.trim();
      if (movable) p.cat = cat.value();
      p.when = "방금 수정함";

      send("PATCH", "/posts/" + p.id, { title: p.title, body: p.body || "", cat: p.cat })
        .catch(function (e) { p.cat = was; render(); failed(e); });

      render();
      openPost(p);
      if (form) mountClassMission();
    });

    if (form) form.sync();
  }

  function renderComments() {
    var p = openRef;
    if (!p) return;

    detailComments.textContent = "";
    detailComments.appendChild(el("span", "cmt-count", "댓글 " + cmtCount(p)));

    var list = el("div", "cmt-list");
    if (!p.thread.length) {
      list.appendChild(el("p", "cmt-none", "첫 댓글을 남겨보세요."));
    } else {
      p.thread.forEach(function (c) { list.appendChild(commentNode(c, false)); });
    }
    detailComments.appendChild(list);
    detailComments.appendChild(newCommentBox());
  }

  function parentOf(reply) {
    return (openRef.thread || []).filter(function (c) {
      return (c.replies || []).indexOf(reply) > -1;
    })[0] || { replies: [] };
  }

  function commentNode(c, isReply) {
    var row = el("div", "cmt");
    c.node = row;   // 검색 결과에서 이 댓글로 바로 내려가기 위해
    if (c.id) row.setAttribute("data-cid", String(c.id));
    row.appendChild(el("span", "ava " + (isReply ? "ava-24" : "ava-34"), initial(c.author)));

    var main = el("div", "cmt-main");

    var bub = el("div", "bubble");
    var who = el("div");
    who.appendChild(el("span", "who", c.author));
    who.appendChild(el("span", "when", c.when));
    bub.appendChild(who);

    var body = el("p");
    if (c.at) body.appendChild(el("span", "at", "@" + c.at + " "));
    body.appendChild(document.createTextNode(c.text));
    bub.appendChild(body);
    main.appendChild(bub);

    var act = el("div", "cmt-act");
    var up = el("button");
    up.type = "button";

    function paintUp() {
      up.setAttribute("aria-pressed", String(!!c.mineUp));
      up.textContent = c.up ? "좋아요 " + c.up : "좋아요";
    }

    up.addEventListener("click", function () {
      c.mineUp = !c.mineUp;
      c.up += c.mineUp ? 1 : -1;
      if (c.id) send("PUT", "/comments/" + c.id + "/reactions", { emoji: "👍" }).catch(failed);
      paintUp();
    });
    paintUp();
    act.appendChild(up);

    // 답글의 답글은 만들지 않는다. 한 단계에서 멈춘다.
    if (!isReply) {
      var re = el("button", null, "답글");
      re.type = "button";
      re.addEventListener("click", function () { toggleReply(c, main); });
      act.appendChild(re);
    }

    /* 내 댓글은 내가, 남의 댓글은 관리자가 지운다. 서버가 다시 본다. */
    if (c.author === ME.name || can("delete")) {
      var del = el("button", "del", "삭제");
      del.type = "button";
      del.addEventListener("click", function () {
        var gate = el("div", "gate cmt-gate");
        gate.dataset.tone = "error";
        gate.appendChild(el("b", null, "이 댓글을 지웁니다."));
        if (!isReply && c.replies && c.replies.length) {
          gate.appendChild(el("span", "muted", "답글 " + c.replies.length + "개도 같이 사라집니다."));
        }
        gate.appendChild(el("span", "grow"));

        var no = el("button", "btn-sec", "취소");
        no.type = "button";
        no.addEventListener("click", function () { gate.remove(); });
        gate.appendChild(no);

        var yes = el("button", "btn-primary sm", "삭제");
        yes.type = "button";
        yes.addEventListener("click", function () {
          function drop() {
            var list = isReply ? parentOf(c).replies : openRef.thread;
            var i = list.indexOf(c);
            if (i > -1) list.splice(i, 1);
            renderComments();
            render();
          }
          if (API && c.id) send("DELETE", "/comments/" + c.id).then(drop).catch(failed);
          else drop();
        });
        gate.appendChild(yes);

        if (!main.querySelector(".gate")) main.appendChild(gate);
      });
      act.appendChild(del);
    }
    main.appendChild(act);

    // 답글이 많으면 두 개만 두고 접는다. 원글이 답글에 묻히지 않게.
    if (!isReply && c.replies && c.replies.length) {
      var reps = el("div", "cmt-replies");
      var folded = [];

      c.replies.forEach(function (r, i) {
        var node = commentNode(r, true);
        reps.appendChild(node);
        if (i >= 2) { node.hidden = true; folded.push(node); }
      });

      if (folded.length) {
        var more = el("button", "cmt-more");
        more.type = "button";
        var open = false;
        var label = function () { return open ? "답글 접기" : "답글 " + folded.length + "개 더보기"; };
        more.textContent = label();
        more.addEventListener("click", function () {
          open = !open;
          folded.forEach(function (n) { n.hidden = !open; });
          more.textContent = label();
        });
        reps.appendChild(more);
      }

      main.appendChild(reps);
    }

    row.appendChild(main);
    return row;
  }

  function writeBox(placeholder, label, onSend) {
    if (writeLocked()) {
      var lock = el("div", "gate");
      lock.appendChild(el("b", null, "활동이 정지되어 댓글을 쓸 수 없습니다."));
      lock.appendChild(el("span", "muted", ME.mutedUntil ? ME.mutedUntil + "까지" : ""));
      return { el: lock, field: null };
    }

    var box = el("div", "cmt-new");
    box.appendChild(el("span", "ava ava-34 ava-ink", initial(ME.name)));

    var grow = el("div", "grow");
    var field = document.createElement("textarea");
    field.className = "cmt-field";
    field.placeholder = placeholder;

    var send = el("div", "cmt-send");
    var btn = el("button", "btn-primary sm", label);
    btn.type = "button";
    btn.disabled = true;
    send.appendChild(btn);
    send.hidden = true;

    field.addEventListener("input", function () {
      autoGrow(field);
      btn.disabled = !field.value.trim();
    });
    field.addEventListener("focus", function () { send.hidden = false; });

    var key = newKey();
    btn.addEventListener("click", function () {
      var t = field.value.trim();
      if (!t || btn.disabled) return;
      var p = onSend(t, key);
      if (p && p.then) busy(btn, "등록 중…", p.then(function () { key = newKey(); }));
    });

    grow.appendChild(field);
    grow.appendChild(send);
    box.appendChild(grow);
    return { el: box, field: field };
  }

  function newCommentBox() {
    return writeBox("댓글 남기기", "댓글 등록", function (text, key) {
      var c = { author: ME.name, when: "방금", text: text, up: 0, replies: [] };
      var ref = openRef;
      return send("POST", "/posts/" + ref.id + "/comments", { body: text, key: key })
        .then(function (r) {
          // 서버가 15초 안의 같은 댓글로 봤으면 두 번 세우지 않는다
          if (r && r.duplicate) return;
          if (r) c.id = r.id;
          ref.thread.push(c);
          renderComments();
          render();
        }).catch(failed);
    }).el;
  }

  function toggleReply(c, host) {
    var open = host.querySelector(".replybox");
    if (open) { host.removeChild(open); return; }

    var w = writeBox(c.author + "님에게 답글", "답글 등록", function (text, key) {
      c.replies = c.replies || [];
      var re = { author: ME.name, at: c.author, when: "방금", text: text, up: 0, replies: [] };
      return send("POST", "/posts/" + openRef.id + "/comments", { body: text, parentId: c.id, key: key })
        .then(function (r) {
          if (r && r.duplicate) return;
          if (r) re.id = r.id;
          c.replies.push(re);
          renderComments();
          render();
        }).catch(failed);
    });

    w.el.classList.add("replybox");
    host.appendChild(w.el);
    w.field.focus();
  }

  $("detailClose").addEventListener("click", closePost);

  postModal.addEventListener("click", function (e) {
    if (e.target === postModal) closePost();
  });

  document.addEventListener("keydown", function (e) {
    /* 뷰어가 열려 있으면 뷰어가 먼저다. 확대해서 보다가 ESC 를 눌렀는데
       글까지 닫히면 보던 자리를 잃는다. */
    if (viewerOpen()) {
      if (e.key === "Escape") closeViewer();
      if (e.key === "ArrowLeft") step(-1);
      if (e.key === "ArrowRight") step(1);
      return;
    }
    if (e.key === "Escape" && !postModal.hidden) closePost();
  });

  /* ?p=<id> 로 들어오면 그 글을 바로 편다 — 파일 끝의 applyUrl() 이 맡는다. */

  /* ================= 리더보드 ================= */

  var lbList = $("lbList"), myPct = $("myPct");

  function renderLb(key) {
    lbList.textContent = "";
    LB[key].forEach(function (row, i) {
      var li = document.createElement("li");
      if (i < 3) li.setAttribute("data-top", "true");
      li.appendChild(el("span", "rk", String(i + 1)));
      li.appendChild(el("span", "ava ava-24" + (row[0] === ME.name ? " ava-ink" : ""), initial(row[0])));
      li.appendChild(el("span", "nm", row[0]));
      li.appendChild(el("span", "pt", row[1]));
      lbList.appendChild(li);
    });
    myPct.textContent = String(MY_PCT[key]);
  }

  Array.prototype.slice.call($("lbSeg").querySelectorAll("button")).forEach(function (b) {
    b.addEventListener("click", function () {
      Array.prototype.slice.call($("lbSeg").querySelectorAll("button")).forEach(function (o) {
        o.setAttribute("aria-pressed", String(o === b));
      });
      renderLb(b.getAttribute("data-lb"));
    });
  });

  renderLb("7");

  /* ================= 화면 전환 (P1-6) ================= */

  /* 화면 레지스트리. 탭 하나가 여러 화면을 거느릴 수 있어서(강의 = 목록 + 상세)
     화면과 탭을 따로 적는다. */
  var SCREENS = [
    { key: "community", el: "screenCommunity", tab: "tabCommunity" },
    { key: "courses",   el: "screenCourses",   tab: "tabClassroom" },
    { key: "lesson",    el: "screenClassroom", tab: "tabClassroom" },
    { key: "ranking",   el: "screenRanking",   tab: "tabRanking" },
    { key: "admin",     el: "screenAdmin",     tab: "tabAdmin" }
  ];

  var TABS = ["tabCommunity", "tabClassroom", "tabRanking", "tabAdmin"];
  var screenNow = "community";

  function show(which) {
    screenNow = which;
    var onTab = null;

    SCREENS.forEach(function (sc) {
      var hit = sc.key === which;
      $(sc.el).hidden = !hit;
      if (hit) onTab = sc.tab;
    });

    TABS.forEach(function (id) {
      $(id).setAttribute("aria-current", String(id === onTab));
    });

    if (which === "admin") renderAdmin();
    if (which === "ranking") renderRanking();
    window.scrollTo(0, 0);
    remember();
  }

  $("tabCommunity").addEventListener("click", function () { show("community"); });
  $("tabClassroom").addEventListener("click", function () { show("courses"); });
  $("tabRanking").addEventListener("click", function () { show("ranking"); });
  $("tabAdmin").addEventListener("click", function () { show("admin"); });

  // 강의 목록에서 코스를 고르면 상세로
  $("crumbCourses").addEventListener("click", function () { show("courses"); });

  // 우측 레일 '강의 이어보기' 는 목록을 건너뛰고 보던 레슨으로 바로 (P1-6)
  $("toCourseBtn").addEventListener("click", function () {
    show(watchLocked() ? "courses" : "lesson");   // 만료면 안내가 있는 목록으로
  });

  /* ================= 강의 목록 · 상세 ================= */

  var curric = $("curric"), courseList = $("courseList");
  var pctPill = $("pctPill"), pctFill = $("pctFill"), qDone = $("qDone"), qAll = $("qAll");
  var lessonKicker = $("lessonKicker"), lessonTitle = $("lessonTitle"), lessonDone = $("lessonDone");
  var crumbCur = $("crumbCur"), weekKicker = $("weekKicker"), weekTitle = $("weekTitle");
  var proseEl = $("lessonProse"), videoCap = $("videoCap"), videoBox = $("lessonVideo");
  var classMission = $("classMission"), nextLesson = $("nextLesson");
  var richHTML = proseEl.innerHTML;   // 3주차 1강용 구조화 교안. 한 번만 보관해 둔다

  function flat() { return flatOf(course()); }
  function curItem() { return flat().filter(function (it) { return it.cur; })[0] || flat()[0]; }

  function checkIcon() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    svg.setAttribute("width", "11");
    svg.setAttribute("height", "11");
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "3.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var path = document.createElementNS("http://www.w3.org/2000/svg", "path");
    path.setAttribute("d", "M20 6 9 17l-5-5");
    svg.appendChild(path);
    return svg;
  }

  function pctOf(c) {
    var items = flatOf(c);
    var done = items.filter(function (it) { return it.done; }).length;
    return { done: done, all: items.length, value: Math.round((done / items.length) * 100) };
  }

  /* ----- 강의 목록 : 주차 한 장씩 ----- */

  /* 수강이 끝나면 강의 시청은 막고 라운지는 그대로 둔다 — 함께 정한 규칙이다.
     스태프는 만료가 없다. */
  function watchLocked() { return !!(ME.expired && !isStaff()); }

  function renderCourseList() {
    if (!courseList) return;
    courseList.textContent = "";

    if (watchLocked()) {
      var note = el("div", "gate");
      note.dataset.tone = "info";
      note.appendChild(el("b", null, "수강 기간이 끝났습니다" + (ME.expiredAt ? " · " + ME.expiredAt : "")));
      note.appendChild(el("span", "muted", "강의는 다시 볼 수 없지만 라운지는 그대로 쓰실 수 있습니다."));
      courseList.appendChild(note);
    }

    if (!shownCourses().length) {
      courseList.appendChild(el("p", "empty",
        can("manage") ? "아직 등록된 강의가 없습니다. 관리 › 강의 게시에서 주차를 만드세요."
                      : "아직 열린 강의가 없습니다."));
      return;
    }

    shownCourses().forEach(function (c) {
      var p = pctOf(c);
      var state = !c.published ? "draft"
        : p.value === 100 ? "done" : c.wk === CURRENT_WK ? "live" : p.done ? "live" : "soon";

      var card = el("button", "card course");
      card.type = "button";
      card.setAttribute("data-open", "true");
      card.addEventListener("click", function () { openWeek(c.wk); });

      var box = el("div", "course-in");
      var head = el("div");
      head.appendChild(el("span", "kicker", c.wk + "주차"));
      head.appendChild(el("h2", "course-t", c.title));
      box.appendChild(head);

      var track = el("div", "track");
      var fill = el("div", "fill");
      fill.style.width = p.value + "%";
      track.appendChild(fill);
      box.appendChild(track);

      var foot = el("div", "course-foot");
      var left = el("span");
      left.appendChild(el("span", "course-pct", p.value + "%"));
      left.appendChild(document.createTextNode(" · 레슨 " + p.all + "개"));
      foot.appendChild(left);

      var badge = el("span", "badge " + (state === "done" ? "b-ontime" : state === "live" ? "b-live" : "b-none"));
      if (state === "live") badge.appendChild(el("span", "dot"));
      badge.appendChild(document.createTextNode(
        state === "done" ? "완료" : state === "live" ? "진행중" : state === "draft" ? "비공개" : "예정"));
      foot.appendChild(badge);

      box.appendChild(foot);
      card.appendChild(box);
      courseList.appendChild(card);
    });
  }

  function openWeek(wk) {
    var c = courseOf(wk);
    if (!c || (!c.published && !can("manage"))) return;
    if (watchLocked()) return;   // 수강이 끝나면 강의는 다시 볼 수 없다

    viewWk = wk;
    show("lesson");
    paintWeekHead();
    renderCurric();
    updateProgress();
    selectLesson(curItem());
  }

  function paintWeekHead() {
    var c = course();
    if (!c) return;   // 아직 강의가 없는 라운지. 강의실은 빈 화면으로 둔다.

    crumbCur.textContent = c.wk + "주차 · " + c.title;
    weekKicker.textContent = "";
    weekKicker.appendChild(document.createTextNode(loungeName() + " · "));
    weekKicker.appendChild(el("span", "disp", String(c.wk)));
    weekKicker.appendChild(document.createTextNode("주차"));
    weekTitle.textContent = c.title;
  }

  function loungeName() { return (D.lounge && D.lounge.name) || "학원마케팅 올인원 강의"; }

  function updateProgress() {
    var p = pctOf(course());
    pctPill.textContent = p.value + "%";
    pctFill.style.width = p.value + "%";
    qDone.textContent = String(p.done);
    qAll.textContent = String(p.all);
    renderCourseList();
  }

  /* ----- 과제 퀘스트 ----- */

  function questItem(wk) {
    var c = courseOf(wk);
    return c && flatOf(c).filter(function (it) { return it.mission; })[0];
  }

  function missionQuestDone(wk) {
    var hit = questItem(wk);
    return !!(hit && hit.done);
  }

  function markMissionQuest(wk) {
    var hit = questItem(wk);
    if (hit) hit.done = true;
    if (wk === viewWk) {
      renderCurric();
      updateProgress();
      if (curItem() === hit) mountClassMission();
    }
    else renderCourseList();
  }

  /* ----- 강의 본문 ----- */

  function selectLesson(item) {
    var items = flat();
    items.forEach(function (it) { it.cur = it === item; });

    var idx = items.indexOf(item);
    lessonKicker.textContent = "";

    lessonDone.setAttribute("aria-pressed", String(!!item.done));
    lessonDone.textContent = item.done ? "완료됨" : "완료로 표시";

    // 과제 항목은 빈 교안을 띄우지 않고 그 자리에 제출 양식을 열어준다
    var isMission = !!item.mission && !!MISSIONS[viewWk];
    videoBox.hidden = isMission;
    proseEl.hidden = isMission;
    classMission.hidden = !isMission;

    if (isMission) {
      lessonKicker.appendChild(document.createTextNode("과제"));
      lessonTitle.textContent = MISSIONS[viewWk].title;
      mountClassMission();
    } else {
      lessonKicker.appendChild(document.createTextNode("강의 · "));
      lessonKicker.appendChild(el("span", "disp", String(idx + 1).padStart(2, "0")));
      lessonTitle.textContent = item.t;
      videoCap.textContent = item.video ? item.t : "이 강은 교안으로만 제공됩니다";

      // 구조화 교안은 3주차 1강에만 있다. 나머지는 교안 본문을 그대로 보여준다.
      if (item.rich) {
        proseEl.innerHTML = richHTML;
      } else {
        proseEl.textContent = "";
        proseEl.appendChild(el("p", null, item.doc || "교안 준비 중입니다."));
      }
    }

    // 마지막 강을 다 들으면 다음 칸이 과제다. 버튼이 그걸 미리 말해준다.
    var nx = items[idx + 1];
    nextLesson.textContent = nx && nx.mission ? "과제 쓰러 가기" : "다음 강의";

    renderCurric();
  }

  function chevron() {
    var svg = document.createElementNS("http://www.w3.org/2000/svg", "svg");
    ["width", "12", "height", "12"].forEach(function (v, i, a) { if (i % 2 === 0) svg.setAttribute(v, a[i + 1]); });
    svg.setAttribute("viewBox", "0 0 24 24");
    svg.setAttribute("fill", "none");
    svg.setAttribute("stroke", "currentColor");
    svg.setAttribute("stroke-width", "2.5");
    svg.setAttribute("stroke-linecap", "round");
    svg.setAttribute("stroke-linejoin", "round");
    svg.setAttribute("aria-hidden", "true");
    var cp = document.createElementNS("http://www.w3.org/2000/svg", "path");
    cp.setAttribute("d", "m6 9 6 6 6-6");
    svg.appendChild(cp);
    return svg;
  }

  function renderCurric() {
    curric.textContent = "";

    course().sections.forEach(function (sec) {
      var block = el("div", "secblock");

      var head = el("button", "sechead");
      head.type = "button";
      head.setAttribute("aria-expanded", String(sec.open));
      head.appendChild(el("span", "grow", sec.name));
      head.appendChild(el("span", "n", sec.items.filter(function (i) { return i.done; }).length + "/" + sec.items.length));
      head.appendChild(chevron());
      head.addEventListener("click", function () { sec.open = !sec.open; renderCurric(); });
      block.appendChild(head);

      if (sec.open) {
        var ul = el("ul", "lessons");

        sec.items.forEach(function (item) {
          var li = document.createElement("li");
          li.className = "lesson";
          li.setAttribute("data-cur", String(!!item.cur));
          li.setAttribute("data-done", String(!!item.done));

          var chk = el("button", "check");
          chk.type = "button";
          chk.setAttribute("aria-pressed", String(!!item.done));
          chk.setAttribute("aria-label", item.t + " 완료 표시");
          chk.appendChild(checkIcon());
          chk.addEventListener("click", function (e) {
            e.stopPropagation();
            item.done = !item.done;
            saveWatched(item);
            if (item.cur) {
              lessonDone.setAttribute("aria-pressed", String(item.done));
              lessonDone.textContent = item.done ? "완료됨" : "완료로 표시";
            }
            updateProgress();
            renderCurric();
          });
          li.appendChild(chk);

          var t = el("button", "t", item.t);
          t.type = "button";
          t.addEventListener("click", function () { selectLesson(item); });
          li.appendChild(t);

          li.appendChild(el("span", "d", item.d));
          ul.appendChild(li);
        });

        block.appendChild(ul);
      }

      curric.appendChild(block);
    });
  }

  lessonDone.addEventListener("click", function () {
    var item = curItem();
    item.done = !item.done;
    saveWatched(item);
    lessonDone.setAttribute("aria-pressed", String(item.done));
    lessonDone.textContent = item.done ? "완료됨" : "완료로 표시";
    updateProgress();
    renderCurric();
  });

  $("prevLesson").addEventListener("click", function () {
    var items = flat(), i = items.indexOf(curItem());
    if (i > 0) selectLesson(items[i - 1]);
  });

  nextLesson.addEventListener("click", function () {
    var items = flat(), i = items.indexOf(curItem());
    if (i < items.length - 1) selectLesson(items[i + 1]);
  });

  /* ----- 강의 아래 과제 카드 -----
     이미 제출했으면 제출한 답변을 보여주고, 다시 올리려 하면 덮어쓸지 먼저 묻는다. */

  function mountClassMission() {
    classMission.textContent = "";

    var wk = viewWk;
    var def = MISSIONS[wk];
    if (!def) return;

    if (watchLocked()) {
      var over = el("div", "gate");
      over.appendChild(el("b", null, "수강 기간이 끝나 과제를 낼 수 없습니다"));
      over.appendChild(el("span", "muted", "이미 낸 과제는 라운지에 그대로 남아 있습니다."));
      classMission.appendChild(over);
      return;
    }

    var posted = myMissionPost(wk);
    var card = el("div", "classmission");

    var head = el("div", "cm-head");

    if (posted) {
      var ok = el("p", "cm-state");
      ok.appendChild(el("span", "mbox", "✓"));
      ok.appendChild(document.createTextNode(" 제출 완료 · " + posted.when + " 라운지에 올림"));
      head.appendChild(ok);
    } else {
      head.appendChild(el("p", "meta", "별도 제출 양식이 없습니다. 아래 세 칸을 채우면 그게 제출입니다."));
    }

    card.appendChild(head);

    var send = el("button", "btn-primary sm", posted ? "다시 올리기" : "라운지에 올리기");
    send.type = "button";
    send.disabled = true;

    var form = buildMissionForm(wk, {
      headless: true,
      onChange: function (done) { send.disabled = !done; }
    });

    // 이미 제출했다면 그때 쓴 답변을 그대로 불러온다
    if (posted) form.fill(posted.mission.map(function (a) { return a.a; }));

    /* 과제에도 파일을 붙인다. 캡처 한 장이 답변 세 줄보다 나을 때가 많고,
       전후 비교처럼 두 장이 있어야 말이 되는 것도 있다. 이미 낸 과제의 파일은
       그대로 이어 받는다. */
    var cmAtt = attachRow(posted && posted.attach ? posted.attach.slice() : []);

    var confirmBox = el("div", "gate cm-confirm");
    confirmBox.hidden = true;

    var cmKey = newKey();   // 이 폼에서 나가는 과제는 한 편이다
    function doSend(overwrite) {
      if (send.disabled) return;
      confirmBox.hidden = true;
      busy(send, "올리는 중…", publishMission(wk, form.answers(), null, overwrite, cmAtt.value(), cmKey)
        .then(function () { cmKey = newKey(); }));
    }

    send.addEventListener("click", function () {
      if (!posted) { doSend(false); return; }
      confirmBox.hidden = false;
    });

    confirmBox.appendChild(el("b", null, "이미 제출한 과제가 있습니다."));
    confirmBox.appendChild(document.createTextNode(" 덮어쓰면 이전 답변은 사라집니다."));
    confirmBox.appendChild(el("span", "grow"));

    var cancel = el("button", "btn-ghost", "취소");
    cancel.type = "button";
    cancel.addEventListener("click", function () { confirmBox.hidden = true; });
    confirmBox.appendChild(cancel);

    var over = el("button", "btn-primary sm", "덮어쓰기");
    over.type = "button";
    over.addEventListener("click", function () { doSend(true); });
    confirmBox.appendChild(over);

    var row = el("div", "row");
    var dl = el("span", "meta-m");
    dl.appendChild(document.createTextNode("마감까지 "));
    dl.appendChild(el("span", "tnum cd", "--:--:--"));
    row.appendChild(dl);
    row.appendChild(el("span", "grow"));

    if (posted) {
      var go = el("button", "btn-sec", "라운지에서 보기");
      go.type = "button";
      go.addEventListener("click", function () { show("community"); openPost(posted); });
      row.appendChild(go);
    }
    row.appendChild(send);

    card.appendChild(form.el);
    card.appendChild(cmAtt.el);
    cmAtt.bindZone(card);
    card.appendChild(row);
    card.appendChild(confirmBox);   // 확인은 누른 버튼 바로 아래에 뜬다
    classMission.appendChild(card);

    form.sync();
    tick();
  }


  /* ================= 관리 · 강사 화면 =================
     한 화면 안에 탭을 둔다. 강사는 대시보드만 보고, 나머지 세 탭은 관리자만 본다.
     숫자는 전부 POSTS · MEMBERS 에서 그때그때 세므로 다른 화면과 어긋나지 않는다. */

  var ADM_TABS = [
    { key: "dash",    label: "대시보드",   need: "dashboard" },
    { key: "course",  label: "강의 게시",   need: "manage" },
    { key: "roles",   label: "수강생 관리",   need: "manage" },
    { key: "filters", label: "필터 관리",   need: "manage" },
    { key: "posts",   label: "게시물 관리", need: "manage" }
  ];

  var admTab = "dash";
  var admSeg = $("admSeg"), admBody = $("admBody");
  var roleRow = -1;           // 역할 메뉴가 열린 멤버 인덱스
  var muteRow = -1;           // 정지 확인이 열린 멤버 인덱스
  var memQ = "";              // 멤버 찾기
  var memShown = 50;          // 한 번에 세우는 줄 수
  var delRow = -1;            // 삭제 확인이 열린 게시물 인덱스

  function admCard(title, sub) {
    var c = el("div", "card pad");
    var h = el("div", "row");
    h.appendChild(el("h3", "card-t", title));
    if (sub) { h.appendChild(el("span", "grow")); h.appendChild(el("span", "meta-m", sub)); }
    c.appendChild(h);
    return c;
  }

  function admTable(heads) {
    var wrap = el("div", "tablescroll");
    var t = el("table", "mt");
    var thead = el("thead"), tr = el("tr");
    heads.forEach(function (h) { tr.appendChild(el("th", null, h)); });
    thead.appendChild(tr);
    t.appendChild(thead);
    var tb = el("tbody");
    t.appendChild(tb);
    wrap.appendChild(t);
    return { el: wrap, body: tb };
  }

  function renderAdmin() {
    var tabs = ADM_TABS.filter(function (t) { return can(t.need); });
    if (!tabs.filter(function (t) { return t.key === admTab; })[0]) admTab = tabs.length ? tabs[0].key : "dash";

    admSeg.textContent = "";
    admSeg.hidden = tabs.length < 2;
    tabs.forEach(function (t) {
      var b = el("button", null, t.label);
      b.type = "button";
      b.setAttribute("aria-pressed", String(admTab === t.key));
      b.addEventListener("click", function () { admTab = t.key; roleRow = -1; delRow = -1; catDel = ""; catErr = ""; renderAdmin(); remember(); });
      admSeg.appendChild(b);
    });

    $("admTitle").textContent = isAdmin() ? "라운지 운영" : "수강생 현황";
    $("admDesc").textContent = lounge().name + " · " + roleLabel(ME.role) + " 시점";

    admBody.textContent = "";
    if (admTab === "course") paintCourseTab(admBody);
    else if (admTab === "roles") paintRolesTab(admBody);
    else if (admTab === "filters") paintFiltersTab(admBody);
    else if (admTab === "posts") paintPostsTab(admBody);
    else paintDash(admBody);
  }

  /* ---------- 강의 게시 ----------
     주차 하나가 강의 한 장이다. 여기서 게시 여부를 정하고, 주차 안에 강을 붙이고,
     주차 자체를 새로 연다. 게시 전 주차는 수강생 쪽 어디에도 나오지 않는다. */

  function cField(label, ph, big) {
    var wrap = el("div", "cfield");
    wrap.appendChild(el("span", "cfield-l", label));

    var input = document.createElement(big ? "textarea" : "input");
    input.className = big ? "ta" : "adm-find";
    if (!big) input.type = "text";
    input.placeholder = ph;
    input.setAttribute("aria-label", label);
    wrap.appendChild(input);

    return { el: wrap, input: input, val: function () { return input.value.trim(); } };
  }

  /* 폼은 renderAdmin 을 거치지 않고 제자리에서 여닫는다 — 다시 그리면 쓰던 값이 날아간다. */
  function cForm(head) {
    var box = el("div", "cadd");
    box.appendChild(el("div", "cadd-h", head));

    var warn = el("p", "warn");
    warn.hidden = true;

    function say(msg) { warn.textContent = msg; warn.hidden = !msg; }

    function foot(label, onSave, onCancel) {
      box.appendChild(warn);
      var row = el("div", "row");

      var no = el("button", "btn-sec", "취소");
      no.type = "button";
      no.addEventListener("click", onCancel);
      row.appendChild(el("span", "grow"));
      row.appendChild(no);

      var ok = el("button", "btn-primary sm", label);
      ok.type = "button";
      ok.addEventListener("click", onSave);
      row.appendChild(ok);

      box.appendChild(row);
    }

    return { el: box, say: say, foot: foot };
  }

  /* 주차 하나에 강을 붙인다. 길이를 비우면 영상 없는 교안 전용 강이 된다. */
  function lessonForm(cr) {
    var f = cForm(cr.wk + "주차에 강 추가");

    var chap = cField("챕터", "예: 후기 수집");
    var title = cField("강 제목", "예: 학부모 후기를 어떻게 받아내는가");
    var pair = el("div", "cadd-2");
    pair.appendChild(chap.el);
    pair.appendChild(title.el);
    f.el.appendChild(pair);

    var len = cField("영상 길이", "예: 4:30 · 비우면 교안 전용");
    f.el.appendChild(len.el);

    var doc = cField("교안 본문", "강의실 본문에 그대로 실립니다", true);
    f.el.appendChild(doc.el);

    function reset() {
      [chap, title, len, doc].forEach(function (x) { x.input.value = ""; });
      f.say("");
      f.el.hidden = true;
    }

    f.foot("이 주차에 게시", function () {
      if (!chap.val() || !title.val()) { f.say("챕터와 강 제목은 있어야 합니다."); return; }

      var made = { wk: cr.wk, chap: chap.val(), t: title.val(),
                   d: len.val(), video: !!len.val(), doc: doc.val() };

      function put() {
        LESSONS.push(made);
        cr.sections[0].items.push(lessonItemOf(made, false));
        reset();
        renderCourseList();
        if (viewWk === cr.wk) { renderCurric(); updateProgress(); }
        renderAdmin();
      }

      if (!API) return put();

      send("POST", "/admin/lessons", {
        week: cr.wk, chapter: made.chap, title: made.t,
        duration: made.d, doc: made.doc
      }).then(put).catch(function (err) { f.say(err.message); });
    }, reset);

    f.reset = reset;
    f.focus = function () { chap.input.focus(); };
    return f;
  }

  /* 질문 칸. 주차마다 물을 것이 다르므로 개수를 고정하지 않는다.
     세 개로 박아 두면 '주소 하나만 받는 주차' 도 빈 칸 두 개를 끌고 간다. */
  var QS_MAX = 8;

  function questionList(host, initial) {
    var wrap = el("div");
    var rows = [];

    function add(q, hint, focus) {
      if (rows.length >= QS_MAX) return;
      var row = el("div", "qrow-edit");
      var n = rows.length + 1;

      var qi = cField("Q" + n + " 질문", "수강생에게 물을 것");
      var hi = cField("Q" + n + " 힌트", "칸 안내 문구 · 비워도 됩니다");
      qi.input.value = q || "";
      hi.input.value = hint || "";

      var pair = el("div", "cadd-2");
      pair.appendChild(qi.el);
      pair.appendChild(hi.el);
      row.appendChild(pair);

      var x = iconIn(el("button", "fmove"), "x", 14);
      x.type = "button";
      x.setAttribute("aria-label", n + "번 질문 빼기");
      x.addEventListener("click", function () {
        if (rows.length <= 1) return;   // 질문이 없는 과제는 과제가 아니다
        rows.splice(rows.indexOf(item), 1);
        row.remove();
        renumber();
      });
      row.appendChild(x);

      var item = { q: qi, h: hi, el: row };
      rows.push(item);
      wrap.appendChild(row);
      renumber();
      if (focus) qi.input.focus();
    }

    function renumber() {
      rows.forEach(function (r, i) {
        r.q.el.querySelector(".cfield-l").textContent = "Q" + (i + 1) + " 질문";
        r.h.el.querySelector(".cfield-l").textContent = "Q" + (i + 1) + " 힌트";
        r.el.querySelector(".fmove").disabled = rows.length <= 1;
      });
      more.hidden = rows.length >= QS_MAX;
      more.textContent = "+ 질문 추가 (" + rows.length + "/" + QS_MAX + ")";
    }

    var more = el("button", "fadd-btn", "+ 질문 추가");
    more.type = "button";
    more.addEventListener("click", function () { add("", "", true); });

    (initial && initial.length ? initial : [{ q: "", hint: "" }])
      .forEach(function (x) { add(x.q, x.hint, false); });

    host.appendChild(wrap);
    host.appendChild(more);

    return function () {
      return rows.map(function (r) { return { q: r.q.val(), hint: r.h.val() }; })
        .filter(function (x) { return x.q; });
    };
  }

  /* 이미 연 주차의 과제 양식을 고친다.
     이미 낸 과제는 그때의 질문을 스냅샷으로 갖고 있어서 안 바뀐다. */
  function missionForm2(cr) {
    var cur = MISSIONS[cr.wk] || { title: "", qs: [] };
    var f = cForm(cr.wk + "주차 과제 양식");

    var mis = cField("과제 미션 한 줄", "예: 후기 세 개 받아오기");
    mis.input.value = (cur.title || "").replace(/^\d+주차 미션 · /, "");
    f.el.appendChild(mis.el);

    var readQs = questionList(f.el, cur.qs || []);

    function close() { f.say(""); f.el.hidden = true; }

    f.foot("양식 저장", function () {
      if (!mis.val()) { f.say("과제 미션 한 줄은 있어야 합니다. 이게 그 주차 과제 칸의 제목이 됩니다."); return; }
      var list = readQs();
      if (!list.length) { f.say("질문이 하나는 있어야 합니다."); return; }

      function put(title) {
        MISSIONS[cr.wk] = { title: title, qs: list };
        close();
        if (viewWk === cr.wk) mountClassMission();
        syncComposer();
        renderAdmin();
      }

      var title = cr.wk + "주차 미션 · " + mis.val();
      if (!API) return put(title);

      send("PUT", "/admin/weeks/" + cr.wk + "/mission", { mission: mis.val(), qs: list })
        .then(function (r) {
          put(r.title);
          if (r.alreadySubmitted) {
            failed(new Error("이미 제출된 과제 " + r.alreadySubmitted + "건은 그대로 둡니다. 낼 때의 질문이 함께 저장돼 있습니다."));
          }
        })
        .catch(function (err) { f.say(err.message); });
    }, close);

    f.reset = close;
    f.focus = function () { mis.input.focus(); };
    return f;
  }

  /* 새 주차는 과제 양식까지 같이 받는다. 양식 없이 열면 그 주차 과제 칸이 빈 채로 남는다. */
  function weekForm() {
    var wrap = el("div", "fadd");

    var open = el("button", "fadd-btn", "+ 새 주차 만들기");
    open.type = "button";
    wrap.appendChild(open);

    var nextWk = COURSES.reduce(function (a, c) { return Math.max(a, c.wk); }, 0) + 1;
    var f = cForm(nextWk + "주차 만들기");
    f.el.hidden = true;

    var title = cField("강의 제목", "예: 학부모 후기를 자산으로 만들기");
    f.el.appendChild(title.el);

    var mis = cField("과제 미션 한 줄", "예: 후기 세 개 받아오기");
    f.el.appendChild(mis.el);

    var readQs = questionList(f.el, []);

    function close() {
      f.say("");
      f.el.hidden = true;
      open.hidden = false;
    }

    f.foot("만들고 비공개로 두기", function () {
      if (!title.val()) { f.say("강의 제목은 있어야 합니다."); return; }
      if (!mis.val()) { f.say("과제 미션 한 줄은 있어야 합니다. 이게 그 주차 과제 칸의 제목이 됩니다."); return; }
      var picked = readQs();
      if (!picked.length) { f.say("질문이 하나는 있어야 합니다."); return; }

      var body = { title: title.val(), mission: mis.val(), qs: picked };

      function put(wk) {
        MISSIONS[wk] = {
          title: wk + "주차 미션 · " + body.mission,
          qs: body.qs
        };
        WEEKS[wk - 1] = body.title;
        COURSES.push(makeCourse(wk, body.title, false));
        close();
        renderCourseList();
        renderAdmin();
      }

      if (!API) return put(nextWk);

      send("POST", "/admin/weeks", body)
        .then(function (r) { put(r.week); })
        .catch(function (err) { f.say(err.message); });
    }, close);

    open.addEventListener("click", function () {
      open.hidden = true;
      f.el.hidden = false;
      title.input.focus();
    });

    wrap.appendChild(f.el);
    return wrap;
  }

  function paintCourseTab(host) {
    var c = admCard("강의 게시", "공개 " + liveCourses().length + " / 전체 " + COURSES.length + "주차");

    var t = admTable(["주차", "제목", "강", "마감", "상태", ""]);
    var forms = [];

    COURSES.forEach(function (cr) {
      var tr = el("tr");
      tr.appendChild(el("td", null, String(cr.wk)));
      tr.appendChild(el("td", null, cr.title));
      tr.appendChild(el("td", null, cr.sections[0].items.length + "개"));

      /* 마감. 비우면 마감 없음이다 — 그 주차 카드에서 카운트다운이 사라지고
         완주 리본도 정시·지각을 가르지 않는다. */
      var dueTd = el("td");
      var due = document.createElement("input");
      due.type = "datetime-local";
      due.className = "adm-find adm-due";
      due.value = toLocalInput(WEEK_DUE[cr.wk]);
      due.setAttribute("aria-label", cr.wk + "주차 마감");
      due.addEventListener("change", function () {
        var was = WEEK_DUE[cr.wk];
        var iso = due.value ? new Date(due.value).toISOString() : null;
        if (iso) WEEK_DUE[cr.wk] = iso; else delete WEEK_DUE[cr.wk];
        paintRail();
        send("PUT", "/admin/weeks/" + cr.wk + "/due", { dueAt: iso })
          .catch(function (err) {
            if (was) WEEK_DUE[cr.wk] = was; else delete WEEK_DUE[cr.wk];
            due.value = toLocalInput(was);
            paintRail();
            failed(err);
          });
      });
      dueTd.appendChild(due);
      tr.appendChild(dueTd);

      var st = el("td");
      st.appendChild(el("span", "badge " + (cr.published ? "b-ontime" : "b-none"),
        cr.published ? "공개" : "비공개"));
      tr.appendChild(st);

      var ops = el("td");
      var row = el("div", "crow");

      var add = el("button", "fadd-btn", "강 추가");
      add.type = "button";
      row.appendChild(add);

      var mis = el("button", "fadd-btn", "과제 양식");
      mis.type = "button";
      row.appendChild(mis);

      var pub = el("button", cr.published ? "del" : "fadd-btn", cr.published ? "비공개로" : "게시하기");
      pub.type = "button";
      pub.addEventListener("click", function () {
        cr.published = !cr.published;
        renderCourseList();
        renderAdmin();

        send("PUT", "/admin/weeks/" + cr.wk + "/published", { published: cr.published })
          .catch(function (err) {
            cr.published = !cr.published;
            renderCourseList(); renderAdmin();
            failed(err);
          });
      });
      row.appendChild(pub);

      ops.appendChild(row);
      tr.appendChild(ops);
      t.body.appendChild(tr);

      // 폼은 표 안이 아니라 표 아래에 둔다. 칸 너비 규칙이 입력창을 눌러버린다.
      var f = lessonForm(cr);
      f.el.hidden = true;
      forms.push(f);

      var mf = missionForm2(cr);
      mf.el.hidden = true;
      forms.push(mf);

      function toggle(which) {
        var opening = which.el.hidden;
        forms.forEach(function (x) { x.el.hidden = true; });
        which.el.hidden = !opening;
        if (opening) which.focus();
      }

      add.addEventListener("click", function () { toggle(f); });
      mis.addEventListener("click", function () { toggle(mf); });
    });

    c.appendChild(t.el);
    forms.forEach(function (f) { c.appendChild(f.el); });

    c.appendChild(el("p", "sec-note",
      "비공개로 내리면 수강생의 강의 목록 · 통합 검색 · 과제 주차 선택기에서 즉시 사라집니다. 관리자에게는 계속 보이므로 게시 전에 열어보고 확인할 수 있습니다."));

    c.appendChild(weekForm());
    host.appendChild(c);
  }

  /* ================= 랭킹 =================
     글과 댓글에 받은 이모지만 센다. 글을 몇 개 썼는지는 보지 않는다 — 많이 쓴
     사람이 아니라 남에게 가닿은 사람이 위로 온다. 남의 글에 단 좋은 댓글 하나가
     내 글 한 편만큼 값하는 것은 커뮤니티에서 자연스럽다.

     순위를 '내가 몇 등인지' 만 보여주면 따라갈 수가 없다. 위와 나의 간격,
     그리고 어떤 글이 가닿았는지를 같이 둔다. */

  var rankWin = "7";
  var RANK_WINS = [["7", "7일"], ["30", "30일"], ["all", "전체"]];

  function renderRanking() {
    var seg = $("rankSeg"), main = $("rankMain"), rail = $("rankRail");
    var list = (D.ranking && D.ranking[rankWin]) || [];
    var tops = (D.topPosts && D.topPosts[rankWin]) || [];

    seg.textContent = "";
    RANK_WINS.forEach(function (w) {
      var b = el("button", null, w[1]);
      b.type = "button";
      b.setAttribute("aria-pressed", String(rankWin === w[0]));
      b.addEventListener("click", function () { rankWin = w[0]; renderRanking(); });
      seg.appendChild(b);
    });

    main.textContent = "";
    rail.textContent = "";

    var got = list.filter(function (r) { return r.total > 0; });
    var c = admCard("받은 이모지", got.length + "명이 받았습니다");

    if (!got.length) {
      c.appendChild(el("p", "adm-empty", "이 기간에 받은 이모지가 없습니다"));
      main.appendChild(c);
      return;
    }

    var top = got[0].total;
    got.forEach(function (r) {
      var row = el("div", "rank" + (r.name === ME.name ? " rank-me" : ""));

      var no = el("span", "rank-no" + (r.rank <= 3 ? " rank-top" : ""), String(r.rank));
      row.appendChild(no);
      row.appendChild(el("span", "ava ava-24", initial(r.name)));

      var who = el("div", "rank-who");
      who.appendChild(el("span", "rank-name", r.name));
      who.appendChild(el("span", "rank-sub", (r.cohort ? r.cohort + "기 · " : "") + r.wk + "주차"));
      row.appendChild(who);

      /* 무엇을 받았는지까지 보여준다. 숫자 하나만 두면 '이모지 기준' 이
         말로만 남는다. */
      var ems = el("div", "rank-ems");
      r.emojis.slice(0, 4).forEach(function (e) {
        var pill = el("span", "rank-em");
        pill.appendChild(el("span", "rank-em-i", e[0]));
        pill.appendChild(el("span", null, String(e[1])));
        ems.appendChild(pill);
      });
      row.appendChild(ems);

      var bar = el("div", "rank-bar");
      var fill = el("div", "rank-fill");
      fill.style.width = (r.total / top) * 100 + "%";
      bar.appendChild(fill);
      row.appendChild(bar);

      row.appendChild(el("span", "rank-total", String(r.total)));
      c.appendChild(row);
    });
    main.appendChild(c);

    /* 내 자리 — 목록 밖에 있어도 보여야 한다.
       강사 · 관리자는 순위 대상이 아니다. 그때도 왜 없는지는 말해 준다 —
       아무 말도 없으면 빠진 것처럼 보인다. */
    var me = list.filter(function (r) { return r.name === ME.name; })[0];
    if (!me && isStaff()) {
      var sc = admCard("내 자리");
      sc.appendChild(el("p", "sec-note",
        roleLabel(ME.role) + "는 순위에 들어가지 않습니다. 공지에 반응이 몰리면 순위가 뒤집힙니다."));
      rail.appendChild(sc);
    }
    if (me) {
      var mc = admCard("내 자리");
      var big = el("p", "rank-mine");
      big.appendChild(el("b", null, me.total ? me.rank + "위" : "아직 없음"));
      big.appendChild(el("span", null, me.total + "개 받음"));
      mc.appendChild(big);

      var ahead = got.filter(function (r) { return r.rank < me.rank; }).pop();
      mc.appendChild(el("p", "sec-note", !me.total
        ? "글을 올리고 반응을 받으면 여기에 자리가 생깁니다."
        : ahead
          ? ahead.rank + "위 " + ahead.name + "까지 " + (ahead.total - me.total) + "개 남았습니다."
          : "맨 위입니다."));
      rail.appendChild(mc);
    }

    if (tops.length) {
      var tc = admCard("가장 많이 받은 글");
      tops.forEach(function (p) {
        var b = el("button", "qrow");
        b.type = "button";
        b.appendChild(el("span", "badge b-live", String(p.got)));
        b.appendChild(el("span", "qrow-t", p.title));
        b.appendChild(el("span", "qrow-m", p.author_name));
        b.addEventListener("click", function () {
          var hit = POSTS.filter(function (x) { return String(x.id) === String(p.id); })[0];
          show("community");
          if (hit) openPost(hit);
        });
        tc.appendChild(b);
      });
      rail.appendChild(tc);
    }
  }

  /* ---------- 대시보드 ----------
     원칙 하나: 보고 나서 오늘 할 일이 바뀌는 숫자만 둔다.
     총 가입자 · 누적 게시물 · 평균 진도율처럼 어제와 오늘이 같은 숫자는 두지 않는다. */

  function passCats() {
    return CATEGORIES.filter(function (c) { return c.pass; }).map(function (c) { return c.name; });
  }

  /* 피드백권을 써서 올라온 요청 중 아직 답이 없는 것.
     과제에 답을 안 다는 것과는 무게가 다르다 — 수강생이 가진 것을 쓰고 기다리는 중이다. */
  function feedbackQueue() {
    var names = passCats();
    return allPosts().filter(function (p) { return names.indexOf(p.cat) > -1 && cmtN(p) === 0; })
      .sort(function (a, b) { return b.daysAgo - a.daysAgo; });
  }

  function feedbackWeek() {
    var names = passCats();
    return allPosts().filter(function (p) { return names.indexOf(p.cat) > -1 && p.daysAgo <= 7; }).length;
  }

  /* 답이 안 달린 과제. 냈는데 아무 반응이 없으면 다음 것을 안 낸다. */
  function unanswered() {
    var names = passCats();
    return POSTS.filter(function (p) {
      return p.cat === "과제" && names.indexOf(p.cat) < 0 && cmtCount(p) === 0;
    }).sort(function (a, b) { return b.daysAgo - a.daysAgo; });
  }

  /* 이번 주에 과제를 안 낸 사람 */
  function notSubmitted() {
    var did = {};
    allPosts().forEach(function (p) { if (p.cat === "과제" && p.daysAgo <= 7) did[p.author] = true; });
    return students().filter(function (m) { return !did[m.name]; });
  }

  function atRisk() {
    return students().filter(function (m) { return m.lastDays >= 7; })
      .sort(function (a, b) { return b.lastDays - a.lastDays; });
  }

  function paintDash(host) {
    var fb = feedbackQueue(), un = unanswered(), ns = notSubmitted(), risk = atRisk();

    var tiles = el("dl", "stats stats-4");
    [
      ["대기 중인 피드백", fb.length + "건"],
      ["답 없는 과제", un.length + "건"],
      ["이번 주 미제출", ns.length + "명"],
      ["7일 이상 조용", risk.length + "명"]
    ].forEach(function (pair) {
      var d = el("div", "stat");
      d.appendChild(el("dt", null, pair[0]));
      d.appendChild(el("dd", null, pair[1]));
      tiles.appendChild(d);
    });
    host.appendChild(tiles);

    var grid = el("div", "adm-grid");
    var main = el("div", "adm-col"), rail = el("div", "adm-col");
    grid.appendChild(main);
    grid.appendChild(rail);
    host.appendChild(grid);

    var flagged = reported();
    if (flagged.length) main.appendChild(reportCard(flagged));
    main.appendChild(feedbackCard(fb));
    main.appendChild(todayCard(un, ns, risk));
    if (isAdmin()) main.appendChild(funnelCard());
    if (isAdmin()) main.appendChild(digestCard());

    rail.appendChild(liveCard());
    rail.appendChild(yesterdayCats());
  }

  /* 대시보드에서 글로 건너뛴다. 모달을 닫았을 때 뒤에 전체 목록이 깔려 있으면
     방금 본 글이 어디에 서 있었는지 알 수 없다. 그 글이 선 자리로 데려다 놓는다. */
  /* 글 한 편을 연다. 피드 묶음 안에 없으면 서버에서 그 한 편만 받아 온다 —
     대시보드에서 건너뛴 글도, 링크를 받아 온 글도 묶음 밖일 수 있다. */
  function openById(id, after) {
    var have = POSTS.filter(function (x) { return String(x.id) === String(id); })[0];
    if (have) { openPost(have); if (after) after(have); return; }
    if (!API) return;

    send("GET", "/posts/" + id)
      .then(function (p) {
        if (!p) return;
        normalizePost(p);
        POSTS.push(p);
        openPost(p);
        if (after) after(p);
      })
      .catch(failed);
  }

  function jumpTo(p) {
    var L = lounge();
    var inShow = L.show.indexOf(p.cat) > -1, inMore = L.more.indexOf(p.cat) > -1;

    // 이 라운지에 없는 칩이면 누를 칩도 없다. 그때만 전체로 둔다.
    state.cat = inShow || inMore ? p.cat : "전체";
    if (inMore) moreOpen = true;
    state.mine = false;     // 켜져 있으면 건너뛴 글이 도리어 걸러진다
    state.liked = false;

    renderFilters();
    show("community");   // 그리기 전에 띄운다 — 숨은 화면은 높이를 잴 수 없다
    render();
    openById(p.id);
  }

  /* 신고된 글. 알림 체계가 없으므로 누가 신고해도 관리자는 알 길이 없었다 —
     게시물 관리 150줄에서 빨간 표를 눈으로 찾아야 했다. 대시보드 맨 위에 세운다. */
  function reported() {
    return allPosts().filter(function (p) { return p.reports > 0; })
      .sort(function (a, b) { return b.reports - a.reports; });
  }

  function reportCard(list) {
    var c = admCard("신고된 글", list.length + "건");
    list.slice(0, 5).forEach(function (p) {
      var b = el("button", "qrow");
      b.type = "button";
      b.appendChild(el("span", "badge b-late", p.reports + "건"));
      b.appendChild(el("span", "qrow-t", p.title));
      b.appendChild(el("span", "qrow-m", p.author));
      b.addEventListener("click", function () { jumpTo(p); });
      c.appendChild(b);
    });
    return c;
  }

  /* 피드백권으로 온 요청은 따로 세운다. 과제 답글은 선의지만 이건 약속이다.
     답이 안 가면 수강생 입장에서는 권만 없어진 셈이 된다. */
  function feedbackCard(fb) {
    var c = admCard("피드백 요청", "이번 주 " + feedbackWeek() + "건 접수");

    if (!fb.length) {
      c.appendChild(el("p", "adm-empty", "밀린 요청이 없습니다"));
      return c;
    }

    fb.forEach(function (p) {
      var b = el("button", "qrow");
      b.type = "button";

      var wait = p.daysAgo === 0 ? "오늘" : p.daysAgo + "일 대기";
      b.appendChild(el("span", "badge " + (p.daysAgo >= 3 ? "b-late" : "b-none"), wait));
      b.appendChild(el("span", "qrow-t", p.title));
      b.appendChild(el("span", "qrow-m", p.author));
      b.addEventListener("click", function () { jumpTo(p); });
      c.appendChild(b);
    });
    return c;
  }

  /* 지표가 아니라 명단이다. '3주차 8명'이 아니라 '이 세 사람에게 오늘 댓글' */
  function todayCard(un, ns, risk) {
    var c = admCard("오늘 챙길 사람");

    function section(title, n, rows, empty) {
      var head = el("div", "sechead-s");
      head.appendChild(el("span", "kicker", title));
      head.appendChild(el("span", "sec-n", String(n)));
      c.appendChild(head);
      if (!rows.length) { c.appendChild(el("p", "adm-empty", empty)); return; }
      rows.forEach(function (r) { c.appendChild(r); });
    }

    section("답이 안 달린 과제", un.length, un.slice(0, 5).map(function (p) {
      var b = el("button", "qrow");
      b.type = "button";
      b.appendChild(el("span", "ava ava-24", initial(p.author)));
      b.appendChild(el("span", "qrow-t", p.title));
      b.appendChild(el("span", "qrow-m", p.when));
      b.addEventListener("click", function () { jumpTo(p); });
      return b;
    }), "밀린 글이 없습니다");

    section("이번 주 과제를 안 낸 사람", ns.length, nameRows(ns, function (m) {
      return m.wk + "주차";
    }), "전원 제출했습니다");

    section("7일 이상 조용한 사람", risk.length, nameRows(risk, function (m) {
      return m.lastDays + "일";
    }, true), "해당하는 사람이 없습니다");

    return c;
  }

  /* 이름 목록. 여섯 명까지만 두고 나머지는 접는다 */
  function nameRows(list, meta, warn) {
    var out = [], folded = [];

    list.forEach(function (m, i) {
      var row = el("div", "qrow");
      row.appendChild(el("span", "ava ava-24", initial(m.name)));
      row.appendChild(el("span", "qrow-t", m.name));
      row.appendChild(el("span", warn ? "badge b-late" : "qrow-m", meta(m)));
      if (i >= 6) { row.hidden = true; folded.push(row); }
      out.push(row);
    });

    if (folded.length) {
      var more = el("button", "rowmore");
      more.type = "button";
      var open = false;
      var label = function () { return open ? "접기" : folded.length + "명 더 보기"; };
      more.textContent = label();
      more.addEventListener("click", function () {
        open = !open;
        folded.forEach(function (n) { n.hidden = !open; });
        more.textContent = label();
      });
      out.push(more);
    }
    return out;
  }

  /* 주차별 분포는 '지금 어디 있나'고, 퍼널은 '어디서 빠졌나'다.
     커리큘럼을 고칠 근거는 후자에서 나온다. */
  function funnelCard() {
    var stu = students();
    var c = admCard("주차별 이탈", "수강생 " + stu.length + "명");

    var rows = [], i;
    for (i = 1; i <= COURSES.length; i++) {
      var inn = stu.filter(function (m) { return m.wk >= i; }).length;
      var out = stu.filter(function (m) { return m.wk > i; }).length;
      if (!inn) break;
      rows.push({ wk: i, "in": inn, out: out, drop: inn - out });
    }

    var top = rows.length ? rows[0]["in"] : 1;
    var worst = rows.reduce(function (a, b) { return b.drop > a.drop ? b : a; }, rows[0] || { drop: 0 });

    var bars = el("div", "bars");
    rows.forEach(function (r) {
      var row = el("div", "bar");
      row.appendChild(el("span", "bar-k", r.wk + "주차"));

      var track = el("div", "bar-t");
      var stay = el("div", "bar-f");
      stay.style.width = (r.out / top) * 100 + "%";
      var lost = el("div", "bar-f bar-lost");
      lost.style.width = (r.drop / top) * 100 + "%";
      if (r === worst && r.drop > 0) lost.setAttribute("data-peak", "true");
      track.appendChild(stay);
      track.appendChild(lost);
      row.appendChild(track);

      row.appendChild(el("span", "bar-n" + (r === worst && r.drop > 0 ? " bar-worst" : ""),
        r.drop ? "-" + r.drop : "0"));
      bars.appendChild(row);
    });
    c.appendChild(bars);

    var legend = el("p", "legend");
    legend.appendChild(el("span", "lg lg-stay", "다음 주차로 넘어감"));
    legend.appendChild(el("span", "lg lg-lost", "여기서 멈춤"));
    c.appendChild(legend);

    var firsts = stu.map(function (m) { return m.first; })
      .filter(function (x) { return x != null; }).sort(function (a, b) { return a - b; });
    if (firsts.length) {
      c.appendChild(el("p", "sec-note", "가입에서 첫 과제까지 중앙값 " + firsts[Math.floor(firsts.length / 2)] + "일 · 아직 안 낸 사람 " + (stu.length - firsts.length) + "명"));
    }
    return c;
  }

  /* 9장 기획. 카카오가 봇을 막아서 자동 발송이 안 된다.
     그래서 여기서 문장을 만들어 두고, 관리자가 복사해 오픈채팅방에 붙인다. */
  function digestLines() {
    var joined = students().filter(function (m) { return m.joined === 1; }).length;
    var posts = allPosts().filter(function (p) { return p.daysAgo === 1; }).length;

    var starters = {};
    POSTS.forEach(function (p) {
      if (p.daysAgo === 1 && p.cat === "과제") starters[p.author] = true;
    });

    var fb = 0;
    POSTS.forEach(function (p) {
      (p.thread || []).forEach(function (c) {
        if (c.staff && c.when === "어제") fb++;
        (c.replies || []).forEach(function (r) { if (r.staff && r.when === "어제") fb++; });
      });
    });

    var lines = [];
    if (joined) lines.push(joined + "명이 새로 입장했어요. 환영해 주세요");
    if (posts) lines.push(posts + "개의 새 글이 올라왔어요");
    if (Object.keys(starters).length) lines.push("어제 처음 과제를 올린 분이 " + Object.keys(starters).length + "명이나 되네요");
    if (fb) lines.push("강사님이 어제 게시물 " + fb + "개에 피드백을 남겨주셨어요");
    return lines;
  }

  function digestCard() {
    var lines = digestLines();
    var c = admCard("어제 커뮤니티 요약", "매일 오전 9시");

    if (!lines.length) {
      c.appendChild(el("p", "adm-empty", "어제는 전할 소식이 없습니다"));
      return c;
    }

    var text = "[어제 커뮤니티 요약]\n\n" + lines.map(function (l, i) {
      return (i + 1) + ". " + l;
    }).join("\n");

    var box = el("pre", "digest", text);
    c.appendChild(box);

    var row = el("div", "row digest-row");
    row.appendChild(el("span", "sec-note", "카카오가 봇 연결을 막아 자동 발송이 안 됩니다. 복사해서 오픈채팅방에 붙여넣으세요."));
    row.appendChild(el("span", "grow"));

    var copy = el("button", "btn-primary sm", "복사");
    copy.type = "button";
    copy.addEventListener("click", function () {
      copyText(text);
      copy.textContent = "복사됨";
      setTimeout(function () { copy.textContent = "복사"; }, 1600);
    });
    row.appendChild(copy);
    c.appendChild(row);
    return c;
  }

  function copyText(t) {
    if (navigator.clipboard && location.protocol !== "file:") {
      navigator.clipboard.writeText(t);
      return;
    }
    var ta = document.createElement("textarea");
    ta.value = t;
    ta.style.position = "fixed";
    ta.style.opacity = "0";
    document.body.appendChild(ta);
    ta.select();
    try { document.execCommand("copy"); } catch (e) { /* 복사를 못 해도 화면은 그대로 둔다 */ }
    document.body.removeChild(ta);
  }

  /* 위 요약의 2번 줄과 같은 출처에서 센다 */
  function yesterdayCats() {
    var c = admCard("어제 올라온 글", "카테고리별");
    var rows = CATEGORIES.map(function (cat) {
      return { name: cat.name, n: allPosts().filter(function (p) { return p.daysAgo === 1 && p.cat === cat.name; }).length };
    }).filter(function (r) { return r.n > 0; });

    if (!rows.length) { c.appendChild(el("p", "adm-empty", "어제 올라온 글이 없습니다")); return c; }

    var peak = Math.max.apply(null, rows.map(function (r) { return r.n; }));
    var list = el("div", "cbar");
    rows.forEach(function (r) {
      var row = el("div", "cbar-r");
      row.appendChild(el("span", null, r.name));
      var track = el("div", "cbar-t");
      var fill = el("div", "cbar-f");
      fill.style.width = (r.n / peak) * 100 + "%";
      track.appendChild(fill);
      row.appendChild(track);
      row.appendChild(el("span", "cbar-n", String(r.n)));
      list.appendChild(row);
    });
    c.appendChild(list);
    return c;
  }

  function liveCard() {
    var c = admCard("다음 라이브");
    c.appendChild(el("p", "kicker", LIVE.when + " · D-" + LIVE.days));
    var t = el("p", "card-t live-t");
    c.appendChild(t);
    return c;
  }

  /* ---------- 권한 ---------- */

  /* 권한은 라운지 단위다. 여기서 주는 역할은 이 라운지에서만 통한다. */
  function scopeLabel(m) {
    var ls = m.lounges || [];
    if (!ls.length) return "—";
    if (ls.length === LOUNGES.length) return "전체 라운지";
    return ls.map(function (id) {
      var L = LOUNGES.filter(function (x) { return x.id === id; })[0];
      return L ? L.name : id;
    }).join(", ");
  }

  function setScope(m, on) {
    var ls = (m.lounges || []).slice();
    var i = ls.indexOf(loungeId);
    if (on && i < 0) ls.push(loungeId);
    if (!on && i > -1) ls.splice(i, 1);
    m.lounges = ls;
  }

  function roleAllows(cat, r) { return !cat.roles || cat.roles.indexOf(r) > -1; }

  function setCatRole(cat, r, on) {
    var all = ROLES.map(function (x) { return x.key; });
    var cur = cat.roles ? cat.roles.slice() : all.slice();
    var i = cur.indexOf(r);
    if (on && i < 0) cur.push(r);
    if (!on && i > -1) cur.splice(i, 1);
    cat.roles = cur.length === all.length ? undefined : cur;
  }

  function paintRolesTab(host) {
    /* 멤버 표. 200명이면 그냥 다 세울 수 없다 — 찾아서, 끊어서 본다. */
    var c1 = admCard("멤버", MEMBERS.length + "명");
    var mcount = c1.querySelector(".meta-m");

    var mfind = el("input", "adm-find");
    mfind.type = "text";
    mfind.value = memQ;
    mfind.placeholder = "닉네임 · 기수 · 역할로 찾기";
    mfind.setAttribute("aria-label", "멤버 찾기");
    mfind.addEventListener("input", function () {
      memQ = mfind.value; memShown = 50; roleRow = -1; renderAdmin();
      var again = document.querySelector("#screenAdmin .adm-find");
      if (again) { again.focus(); again.setSelectionRange(memQ.length, memQ.length); }
    });
    c1.appendChild(mfind);

    var t = admTable(["닉네임", "기수", "가입", "주차", "최근 접속", "담당 라운지", "피드백권", "활동", "역할"]);

    var mtk = tokensOf(memQ.trim());
    var mrows = MEMBERS.filter(function (m) {
      return !mtk.length || hitAll([m.name, roleLabel(m.role), m.cohort ? m.cohort + "기" : ""].join(" "), mtk);
    });
    mcount.textContent = (mtk.length ? mrows.length + " / " : "") + MEMBERS.length + "명";

    var mall = mrows.length;
    mrows.slice(0, memShown).forEach(function (m, i) {
      var tr = el("tr");
      tr.appendChild(el("td", "nm", m.name));
      tr.appendChild(el("td", "num", m.cohort ? m.cohort + "기" : "—"));
      tr.appendChild(el("td", "num", m.joined === 1 ? "어제" : m.joined + "일 전"));
      tr.appendChild(el("td", "num", m.role === "student" ? m.wk + "주차" : "—"));
      tr.appendChild(el("td", "num", m.lastDays === 0 ? "오늘" : m.lastDays + "일 전"));
      tr.appendChild(el("td", "num", scopeLabel(m)));

      /* 권은 프드프가 갖지만 '이번 주만 한 장 더' 는 라운지에서 줄 수 있어야
         운영이 된다. 다음 주기가 되면 원래대로 돌아간다. */
      /* 잔량을 먼저 보여주고 그 옆에서 더하고 뺀다. 눌러 봐야 결과를 아는
         단추는 아무도 누르지 못한다. 회수가 없으면 잘못 누른 것도 못 되돌린다. */
      var pt = el("td", "passcell");
      if (m.role === "student" && m.passLeft != null) {
        var now = el("b", "passn", m.passLeft + " / " + m.passQuota);

        function step(delta, btn) {
          btn.disabled = true;
          send("POST", "/admin/members/" + m.userId + "/passes", { count: delta })
            .then(function (r) {
              if (r && r.left != null) {
                m.passLeft = r.left;
                now.textContent = m.passLeft + " / " + m.passQuota;
              }
              paintPassBtns();
            })
            .catch(function (e) { btn.disabled = false; failed(e); });
        }

        var minus = iconIn(el("button", "fmove"), "minus", 14);
        minus.type = "button";
        minus.setAttribute("aria-label", m.name + " 의 피드백권 한 장 회수");
        minus.addEventListener("click", function () { step(-1, minus); });

        var plus = iconIn(el("button", "fmove"), "plus", 14);
        plus.type = "button";
        plus.setAttribute("aria-label", m.name + " 에게 피드백권 한 장");
        plus.addEventListener("click", function () { step(1, plus); });

        // 없는 것을 더 뺄 수도, 쿼터보다 많이 줄 수도 없다
        function paintPassBtns() {
          minus.disabled = m.passLeft <= 0;
          plus.disabled = m.passLeft >= m.passQuota;
        }
        paintPassBtns();

        pt.appendChild(minus);
        pt.appendChild(now);
        pt.appendChild(plus);
      } else if (m.role === "student") {
        pt.appendChild(el("span", "passn-none", "기록 없음"));
      }
      tr.appendChild(pt);

      /* 강퇴가 아니라 정지다. 읽기는 두고 쓰기만 멈춘다.
         한 번 눌러 바로 멈추게 두지 않는다 — 돈을 낸 사람의 입을 막는 일이고,
         며칠인지 · 왜인지를 정하지 않으면 푸는 사람도 판단할 수 없다. */
      var mt = el("td");
      if (m.role !== "admin") {
        var mb = el("button", m.muted ? "del" : "fadd-btn", m.muted ? "정지 중" : "정지");
        mb.type = "button";
        mb.addEventListener("click", function () {
          if (m.muted) { muteRow = muteRow === i ? -1 : i; renderAdmin(); return; }
          muteRow = muteRow === i ? -1 : i;
          renderAdmin();
        });
        mt.appendChild(mb);
        if (m.muted && m.mutedReason) mt.appendChild(el("span", "fwhy", m.mutedReason));
      }
      tr.appendChild(mt);

      var td = el("td");
      var pick = el("div", "pick");
      var btn = el("button", "pick-btn");
      btn.type = "button";
      btn.appendChild(el("span", null, roleLabel(m.role)));
      btn.appendChild(iconIn(el("span", "caret"), "chevron-down", 14));
      btn.setAttribute("aria-expanded", String(roleRow === i));
      btn.addEventListener("click", function (e) {
        e.stopPropagation();
        roleRow = roleRow === i ? -1 : i;
        renderAdmin();
      });
      pick.appendChild(btn);

      if (roleRow === i) {
        var menu = el("div", "pick-menu");
        ROLES.forEach(function (r) {
          var b = el("button", null, r.label);
          b.type = "button";
          b.setAttribute("aria-current", String(m.role === r.key));
          b.addEventListener("click", function (e) {
            e.stopPropagation();
            var was = m.role;
            m.role = r.key;
            setScope(m, r.key !== "student");   // 권한은 이 라운지에만 붙는다
            roleRow = -1;
            if (m.name === ME.name) applyRole(r.key);
            else renderAdmin();

            send("PATCH", "/admin/members/" + m.userId, { role: r.key })
              .catch(function (err) {
                m.role = was;
                setScope(m, was !== "student");
                // 나를 내린 것이었으면 화면 권한까지 같이 되돌린다.
                // 안 그러면 서버가 거절했는데 관리 탭이 사라진 채로 남는다.
                if (m.name === ME.name) applyRole(was);
                else renderAdmin();
                failed(err);
              });
          });
          menu.appendChild(b);
        });
        pick.appendChild(menu);
      }

      td.appendChild(pick);
      tr.appendChild(td);
      t.body.appendChild(tr);

      /* 정지 확인은 누른 줄 바로 아래에서 받는다. 브라우저 팝업은 쓰지 않는다. */
      if (muteRow === i) {
        var ctr = el("tr");
        var ctd = el("td");
        ctd.colSpan = 9;
        ctd.appendChild(muteGate(m));
        ctr.appendChild(ctd);
        t.body.appendChild(ctr);
      }
    });

    if (mall > memShown) {
      var mr = el("tr"), mtd = el("td");
      mtd.colSpan = 9;
      var mb = el("button", "fadd-btn", "더 보기 (" + memShown + " / " + mall + ")");
      mb.type = "button";
      mb.addEventListener("click", function () { memShown += 50; renderAdmin(); });
      mtd.appendChild(mb);
      mr.appendChild(mtd);
      t.body.appendChild(mr);
    }

    if (!mall) {
      var er = el("tr"), etd = el("td");
      etd.colSpan = 9;
      etd.appendChild(el("p", "adm-empty", "찾는 멤버가 없습니다"));
      er.appendChild(etd);
      t.body.appendChild(er);
    }

    c1.appendChild(t.el);
    host.appendChild(c1);

    /* 카테고리 × 역할 */
    var c2 = admCard("카테고리별 글쓰기 권한");
    c2.classList.add("adm-next");
    var t2 = admTable(["카테고리"].concat(ROLES.map(function (r) { return r.label; })));

    CATEGORIES.forEach(function (cat) {
      var tr = el("tr");
      tr.appendChild(el("td", "nm", cat.name));
      ROLES.forEach(function (r) {
        var td = el("td", "mx-cell");
        var b = el("button", "mx-tog", roleAllows(cat, r.key) ? "✓" : "");
        b.type = "button";
        b.setAttribute("aria-pressed", String(roleAllows(cat, r.key)));
        b.setAttribute("aria-label", cat.name + " · " + r.label);
        if (r.key === "admin") b.disabled = true;   // 관리자는 항상 쓸 수 있다
        b.addEventListener("click", function () {
          setCatRole(cat, r.key, !roleAllows(cat, r.key));
          paintCat();
          renderFilters();
          renderAdmin();

          send("PUT", "/admin/categories/" + cat.id + "/rights", {
            student: roleAllows(cat, "student"),
            instructor: roleAllows(cat, "instructor")
          }).catch(function (err) {
            setCatRole(cat, r.key, !roleAllows(cat, r.key));   // 되돌린다
            paintCat(); renderFilters(); renderAdmin();
            failed(err);
          });
        });
        td.appendChild(b);
        tr.appendChild(td);
      });
      t2.body.appendChild(tr);
    });

    c2.appendChild(t2.el);
    host.appendChild(c2);
  }

  /* ---------- 필터 ---------- */

  /* 맡은 라운지 하나만 만진다. 옆 강의의 필터는 그 라운지 관리자 몫이다. */
  function paintFiltersTab(host) {
    var L = lounge();

    var c = admCard("필터 칩 배치", L.name);
    var used = L.show.concat(L.more);
    var unused = CATEGORIES.map(function (x) { return x.name; })
      .filter(function (n) { return used.indexOf(n) < 0; });

    function moveTo(name, to) {
      var before = { show: L.show.slice(), more: L.more.slice() };
      [L.show, L.more].forEach(function (arr) {
        var i = arr.indexOf(name);
        if (i > -1) arr.splice(i, 1);
      });
      if (to === "show") L.show.push(name);
      if (to === "more") L.more.push(name);
      renderFilters();
      renderAdmin();

      var cat = categoryOf(name);
      send("PUT", "/admin/categories/" + (cat && cat.id) + "/placement", { placement: to })
        .catch(function (err) {
          L.show = before.show; L.more = before.more;
          renderFilters(); renderAdmin();
          failed(err);
        });
    }

    var cols = el("div", "fcols");
    [
      { key: "show", head: "기본 노출", list: L.show, hint: "최대 " + FILTER_MAX + "개" },
      { key: "more", head: "필터 더보기", list: L.more, hint: "접어 둠" },
      { key: "off", head: "미사용", list: unused, hint: "이 라운지에 없음" }
    ].forEach(function (col) {
      var box = el("div", "fcol");
      var h = el("div", "fcol-h");
      h.appendChild(el("b", null, col.head));
      h.appendChild(el("span", null, col.list.length + "개 · " + col.hint));
      box.appendChild(h);

      var list = el("div", "fcol-l");
      col.list.forEach(function (name) {
        var item = el("div", "fitem");
        item.appendChild(el("span", "fitem-n", name));
        var bs = el("div", "fitem-b");

        var order = ["show", "more", "off"];
        var at = order.indexOf(col.key);

        var left = iconIn(el("button", "fmove"), "arrow-left", 14);
        left.type = "button";
        left.setAttribute("aria-label", name + " 왼쪽으로");
        /* 기본 노출이 상한에 닿으면 더 못 넣는다. 칩 줄이 접히면 필터가 있다는 사실 자체가 안 보인다. */
        left.disabled = at === 0 || (at === 1 && L.show.length >= FILTER_MAX);
        left.addEventListener("click", function () { moveTo(name, order[at - 1]); });
        bs.appendChild(left);

        var right = iconIn(el("button", "fmove"), "arrow-right", 14);
        right.type = "button";
        right.setAttribute("aria-label", name + " 오른쪽으로");
        right.disabled = at === order.length - 1;
        right.addEventListener("click", function () { moveTo(name, order[at + 1]); });
        bs.appendChild(right);

        /* 지우기는 미사용 칸에서만. 노출 중인 칩을 곧장 지우면 실수가 되돌려지지 않는다.
           내리기 → 지우기 두 단계가 '이 라운지에서 안 씀'과 '아예 없앰'을 갈라준다. */
        if (col.key === "off") {
          var cat = categoryOf(name);
          var why = catBlocker(cat);

          /* 이름은 미사용 칸에서 고친다. 글은 id 로 이어져 있어 흩어지지 않는다. */
          if (!cat.system) {
            var ren = iconIn(el("button", "fmove"), "pencil", 13);
            ren.type = "button";
            ren.setAttribute("aria-label", name + " 이름 바꾸기");
            ren.addEventListener("click", function () {
              var inp = document.createElement("input");
              inp.className = "adm-find";
              inp.value = name;
              item.textContent = "";
              item.appendChild(inp);
              inp.focus();
              inp.select();

              function done(save) {
                var v = inp.value.trim();
                if (!save || !v || v === name) return renderAdmin();
                function put() { cat.name = v; renderFilters(); paintCat(); renderAdmin(); }
                if (!API) return put();
                send("PATCH", "/admin/categories/" + cat.id, { name: v })
                  .then(put).catch(function (e) { renderAdmin(); failed(e); });
              }
              inp.addEventListener("keydown", function (e) {
                if (e.key === "Enter") done(true);
                if (e.key === "Escape") done(false);
              });
              inp.addEventListener("blur", function () { done(true); });
            });
            bs.appendChild(ren);
          }

          if (why) {
            bs.appendChild(el("span", "fwhy", why));
          } else {
            var rm = el("button", "del", "삭제");
            rm.type = "button";
            rm.addEventListener("click", function () { catDel = catDel === name ? "" : name; renderAdmin(); });
            bs.appendChild(rm);
          }
        }

        item.appendChild(bs);
        list.appendChild(item);
      });
      if (!col.list.length) list.appendChild(el("p", "adm-empty", "비어 있음"));
      box.appendChild(list);
      cols.appendChild(box);
    });

    c.appendChild(cols);

    if (L.show.length >= FILTER_MAX) {
      c.appendChild(el("p", "warn", "기본 노출이 상한 " + FILTER_MAX + "개에 닿았습니다. 더 넣으려면 다른 칩을 먼저 더보기로 내리세요."));
    }

    if (catDel) {
      var target = catDel;
      var gate = el("div", "gate");
      gate.dataset.tone = "error";
      gate.appendChild(el("b", null, "\u201c" + target + "\u201d 카테고리를 지웁니다."));
      gate.appendChild(el("span", "muted", "글 0개 · 어느 라운지에서도 쓰지 않습니다. 되돌릴 수 없습니다."));
      gate.appendChild(el("span", "grow"));

      var no = el("button", "btn-sec", "취소");
      no.type = "button";
      no.addEventListener("click", function () { catDel = ""; renderAdmin(); });
      gate.appendChild(no);

      var yes = el("button", "btn-primary sm", "삭제");
      yes.type = "button";
      yes.addEventListener("click", function () { removeCat(target); });
      gate.appendChild(yes);
      c.appendChild(gate);
    }

    c.appendChild(addCatRow());
    host.appendChild(c);
  }

  var catErr = "";   // 추가 실패 사유. 다시 그려도 남아 있어야 한다
  var catDel = "";   // 삭제 확인이 열린 카테고리

  /* 글쓰기 창과 같은 방식으로 연다. 버튼 하나였다가 누르면 입력칸이 된다. */
  function addCatRow() {
    var wrap = el("div", "fadd");

    var open = el("button", "fadd-btn", "+ 카테고리 추가");
    open.type = "button";
    wrap.appendChild(open);

    var form = el("div", "fadd-form");
    form.hidden = true;

    var input = el("input", "adm-find");
    input.type = "text";
    input.maxLength = 12;
    input.placeholder = "카테고리 이름";
    input.setAttribute("aria-label", "새 카테고리 이름");
    form.appendChild(input);

    var row = el("div", "row cat-add-row");
    row.appendChild(el("span", "sec-note", "새 카테고리는 모든 역할이 쓸 수 있게 시작합니다. 수강생 관리에서 좁힐 수 있습니다."));
    row.appendChild(el("span", "grow"));

    var cancel = el("button", "btn-sec", "취소");
    cancel.type = "button";
    cancel.addEventListener("click", function () { catErr = ""; renderAdmin(); });
    row.appendChild(cancel);

    var save = el("button", "btn-primary sm", "추가");
    save.type = "button";
    save.addEventListener("click", function () { addCat(input.value); });
    row.appendChild(save);
    form.appendChild(row);

    input.addEventListener("keydown", function (e) {
      if (e.key === "Enter") { e.preventDefault(); addCat(input.value); }
    });

    open.addEventListener("click", function () {
      open.hidden = true;
      form.hidden = false;
      input.focus();
    });

    if (catErr) {
      open.hidden = true;
      form.hidden = false;
      form.appendChild(el("p", "warn", catErr));
      setTimeout(function () { input.focus(); }, 0);
    }

    wrap.appendChild(form);
    return wrap;
  }

  function addCat(raw) {
    var name = (raw || "").trim();

    if (!name) { catErr = "이름을 입력하세요."; renderAdmin(); return; }
    if (categoryOf(name)) { catErr = "\u201c" + name + "\u201d 은 이미 있습니다."; renderAdmin(); return; }
    if (name === "전체") { catErr = "\u201c전체\u201d 는 필터 바가 쓰는 이름입니다."; renderAdmin(); return; }

    var cat = { name: name };
    var L = lounge();

    function place(where) {
      CATEGORIES.push(cat);
      // 만들자마자 쓸 수 있게 이 라운지에 붙인다. 상한을 넘으면 더보기로.
      (where === "show" ? L.show : L.more).push(name);
      catErr = "";
      catDel = "";
      renderFilters();
      paintCat();
      renderAdmin();
    }

    if (!API) return place(L.show.length < FILTER_MAX ? "show" : "more");

    // 이름 중복과 상한은 서버가 다시 본다
    send("POST", "/admin/categories", { name: name }).then(function (r) {
      cat.id = r.id;
      place(r.placement);
    }).catch(function (err) {
      catErr = err.message;
      renderAdmin();
    });
  }

  function removeCat(name) {
    var cat = categoryOf(name);
    var i = CATEGORIES.indexOf(cat);
    if (i < 0) return;

    // 지우는 것은 되돌릴 수 없다. 서버가 조건을 다시 보고 받아 준 뒤에 뺀다.
    if (API) {
      send("DELETE", "/admin/categories/" + cat.id).then(function () {
        CATEGORIES.splice(CATEGORIES.indexOf(cat), 1);
        if (state.cat === name) { state.cat = "전체"; }
        catErr = ""; catDel = "";
        render(); renderFilters(); paintCat(); renderAdmin();
      }).catch(function (err) { catDel = ""; renderAdmin(); failed(err); });
      return;
    }

    CATEGORIES.splice(i, 1);

    if (state.cat === name) { state.cat = "전체"; render(); }
    catErr = "";
    catDel = "";
    renderFilters();
    paintCat();
    renderAdmin();
  }

  /* ---------- 게시물 ---------- */

  /* 고정은 글 옆에서 바로 켠다. 이걸 하려고 관리 화면까지 가게 하면
     매일 하는 일에 화면 이동이 하나 붙는다. */
  var PIN_MAX = 3;

  function togglePin(p, after) {
    if (!p.pinned && POSTS.filter(function (x) { return x.pinned; }).length >= PIN_MAX) {
      failed(new Error("고정은 " + PIN_MAX + "개까지입니다. 하나를 먼저 내리세요"));
      return;
    }
    var was = !!p.pinned;
    p.pinned = !was;
    render();
    if (after) after();

    send("PUT", "/posts/" + p.id + "/pinned", { pinned: p.pinned })
      .catch(function (err) { p.pinned = was; render(); if (after) after(); failed(err); });
  }

  /* 케밥 메뉴. 글마다 수정 · 고정 · 삭제를 늘어놓으면 조작 버튼이 본문보다
     먼저 눈에 든다. 자주 하는 일이 아니므로 한 겹 접어 둔다.
     onDelete 는 어디서 열었느냐에 따라 확인창 자리가 달라서 밖에서 넘긴다. */
  function postLink(p) {
    return location.origin + location.pathname + "?p=" + p.id;
  }

  function copyLink(p, near) {
    var url = postLink(p);

    function told(text) {
      var tip = el("span", "copied", text);
      (near.parentNode || document.body).appendChild(tip);
      setTimeout(function () { tip.remove(); }, 1600);
    }

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(url)
        .then(function () { told("링크를 복사했습니다"); })
        .catch(function () { told(url); });
      return;
    }
    told(url);   // 복사를 막는 브라우저에서는 주소를 보여 주고 직접 집게 한다
  }

  function postMenu(p, opts) {
    opts = opts || {};
    var wrap = el("div", "kebab");

    var btn = el("button", "kebab-btn");
    btn.type = "button";
    btn.setAttribute("aria-label", "이 글 관리");
    btn.setAttribute("aria-expanded", "false");
    btn.appendChild(icon("more", 16));
    wrap.appendChild(btn);

    var menu = el("div", "pick-menu kebab-menu");
    menu.hidden = true;

    function item(label, danger, run) {
      var b = el("button", danger ? "del" : null, label);
      b.type = "button";
      b.addEventListener("click", function (e) {
        e.stopPropagation();
        close();
        run();
      });
      menu.appendChild(b);
    }

    function close() { menu.hidden = true; btn.setAttribute("aria-expanded", "false"); }

    /* 남에게 글 하나를 건네려면 주소가 있어야 한다. 카톡으로 보내는 일이
       실제로 가장 잦다. 눌러 본 자리에서 바로 복사되게 둔다. */
    if (p.id) item("링크 복사", false, function () { copyLink(p, btn); });

    if (p.mine) item("수정", false, function () { opts.onEdit(); });

    /* 신고는 남의 글에만. 알림이 없으므로 관리자가 게시물 관리에서 본다. */
    if (!p.mine && API) {
      item(p.reported ? "신고함" : "신고", false, function () {
        p.reported = true;
        p.reports = (p.reports || 0) + 1;
        render();
        send("POST", "/posts/" + p.id + "/report", {}).catch(failed);
      });
    }
    if (can("delete")) item(p.pinned ? "고정 해제" : "상단 고정", false, function () { togglePin(p, opts.after); });
    if (can("delete")) item("삭제", true, function () { opts.onDelete(); });

    if (!menu.children.length) return null;

    btn.addEventListener("click", function (e) {
      e.stopPropagation();
      var open = menu.hidden;
      closeKebabs();
      menu.hidden = !open;
      btn.setAttribute("aria-expanded", String(open));
    });

    wrap.appendChild(menu);
    return wrap;
  }

  function closeKebabs() {
    Array.prototype.forEach.call(document.querySelectorAll(".kebab-menu"), function (m) {
      m.hidden = true;
      var b = m.parentNode.querySelector(".kebab-btn");
      if (b) b.setAttribute("aria-expanded", "false");
    });
  }

  document.addEventListener("click", closeKebabs);

  /* 삭제 확인은 어디서 눌렀든 같은 모양으로, 누른 자리 바로 아래에 뜬다.
     브라우저 confirm 은 쓰지 않는다. */
  /* 정지 · 해제를 받는 줄. 며칠인지와 이유를 같이 정한다 —
     이유가 없으면 푸는 사람이 왜 멈췄는지 알 수 없다. */
  function muteGate(m) {
    var gate = el("div", "gate");

    if (m.muted) {
      gate.dataset.tone = "info";
      gate.appendChild(el("b", null, m.name + " 님의 정지를 풉니다."));
      gate.appendChild(el("span", "muted", m.mutedReason || "사유가 적혀 있지 않습니다"));
      gate.appendChild(el("span", "grow"));

      var no = el("button", "btn-sec", "그대로 두기");
      no.type = "button";
      no.addEventListener("click", function () { muteRow = -1; renderAdmin(); });
      gate.appendChild(no);

      var free = el("button", "btn-primary sm", "정지 풀기");
      free.type = "button";
      free.addEventListener("click", function () { applyMute(m, 0, ""); });
      gate.appendChild(free);
      return gate;
    }

    gate.appendChild(el("b", null, m.name + " 님의 쓰기를 멈춥니다."));
    gate.appendChild(el("span", "muted", "읽기는 그대로입니다. 기한이 지나면 저절로 풀립니다."));

    var days = 7;
    var seg = el("div", "seg seg-s");
    [[7, "7일"], [30, "30일"], [90, "90일"]].forEach(function (d) {
      var b = el("button", null, d[1]);
      b.type = "button";
      b.setAttribute("aria-current", String(d[0] === days));
      b.addEventListener("click", function () {
        days = d[0];
        [].forEach.call(seg.children, function (x) {
          x.setAttribute("aria-current", String(x.textContent === d[1]));
        });
      });
      seg.appendChild(b);
    });
    gate.appendChild(seg);

    var why = el("input", "adm-find");
    why.type = "text";
    why.placeholder = "사유 · 본인에게는 보이지 않습니다";
    why.setAttribute("aria-label", "정지 사유");
    gate.appendChild(why);

    gate.appendChild(el("span", "grow"));

    var cancel = el("button", "btn-sec", "취소");
    cancel.type = "button";
    cancel.addEventListener("click", function () { muteRow = -1; renderAdmin(); });
    gate.appendChild(cancel);

    var yes = el("button", "btn-primary sm", "정지");
    yes.type = "button";
    yes.addEventListener("click", function () { applyMute(m, days, why.value.trim()); });
    gate.appendChild(yes);
    return gate;
  }

  function applyMute(m, days, reason) {
    var was = { muted: m.muted, reason: m.mutedReason };
    m.muted = days > 0;
    m.mutedReason = days > 0 ? reason : null;
    muteRow = -1;
    renderAdmin();

    send("PUT", "/admin/members/" + m.userId + "/muted", { days: days, reason: reason })
      .catch(function (e) {
        m.muted = was.muted;
        m.mutedReason = was.reason;
        renderAdmin();
        failed(e);
      });
  }

  function deleteGate(p, close) {
    var gate = el("div", "gate");
    gate.dataset.tone = "error";
    gate.appendChild(el("b", null, "이 글을 지웁니다."));
    gate.appendChild(el("span", "muted", "댓글 " + cmtCount(p) + "개도 같이 사라지고 되돌릴 수 없습니다."));
    gate.appendChild(el("span", "grow"));

    var cancel = el("button", "btn-sec", "취소");
    cancel.type = "button";
    cancel.addEventListener("click", function (e) { e.stopPropagation(); close(); });
    gate.appendChild(cancel);

    var yes = el("button", "btn-primary sm", "삭제");
    yes.type = "button";
    yes.addEventListener("click", function (e) { e.stopPropagation(); close(true); deletePost(p); });
    gate.appendChild(yes);
    return gate;
  }

  /* 지울 글은 피드에서 올 수도, 게시물 관리의 가벼운 목록에서 올 수도 있다.
     두 곳의 같은 글은 서로 다른 객체이므로 id 로 맞춰 양쪽에서 뺀다 —
     예전에는 피드에 실린 글만 지워졌고, 목록에서 지우면 아무 일도 없었다. */
  function deletePost(p) {
    function dropFrom(list) {
      if (!list) return;
      for (var i = list.length - 1; i >= 0; i--) {
        if (String(list[i].id) === String(p.id)) list.splice(i, 1);
      }
    }

    function drop() {
      dropFrom(POSTS);
      dropFrom(INDEX);
      dropFrom(MY_MISSIONS);
      if (D.stats && D.stats.posts > 0) D.stats.posts -= 1;
      delRow = -1;
      render();
      if (screenNow === "admin") renderAdmin();
      if (screenNow === "lesson") mountClassMission();
    }

    // 지우는 것은 되돌릴 수 없으므로 서버가 받아 준 뒤에 화면에서 뺀다
    if (API) send("DELETE", "/posts/" + p.id).then(drop).catch(failed);
    else drop();
  }

  var postQ = "";
  var postShown = 50;   // 한 번에 세우는 줄 수
  var paintRows = function () {};   // 검색 입력 때 표 몸통만 다시 그린다

  function paintPostsTab(host) {
    var c = admCard("게시물", allPosts().length + "건");
    var count = c.querySelector(".meta-m");

    var find = el("input", "adm-find");
    find.type = "text";
    find.value = postQ;
    find.placeholder = "제목 · 글쓴이 · 카테고리로 찾기";
    find.setAttribute("aria-label", "게시물 찾기");
    find.addEventListener("input", function () { postQ = find.value; delRow = -1; postShown = 50; paintRows(); });
    c.appendChild(find);

    var t = admTable(["제목", "카테고리", "글쓴이", "반응", "댓글", "신고", "올린 때", ""]);

    paintRows = function () {
    t.body.textContent = "";
    var tk = tokensOf(postQ.trim());
    var rows = allPosts().filter(function (p) {
      return !tk.length || hitAll([p.title, p.cat, p.author, p.body || ""].join(" "), tk);
    }).sort(function (a, b) { return a.daysAgo - b.daysAgo; });

    // 150건을 한 번에 세우면 표가 화면 열 뭉치만큼 길어진다. 끊어 보여준다.
    var all = rows.length;
    rows = rows.slice(0, postShown);

    count.textContent = (tk.length ? all + " / " : "") + allPosts().length + "건";

    if (!rows.length) {
      var er = el("tr"), etd = el("td");
      etd.colSpan = 7;
      etd.appendChild(el("p", "adm-empty", "찾는 글이 없습니다"));
      er.appendChild(etd);
      t.body.appendChild(er);
    }

    rows.forEach(function (p, i) {
      var tr = el("tr");

      var td0 = el("td");
      var open = el("button", "qrow-t wide");
      open.type = "button";
      open.appendChild(mark(p.title, tk));
      open.addEventListener("click", function () { show("community"); openPost(p); });
      td0.appendChild(open);
      tr.appendChild(td0);

      tr.appendChild(el("td", null, p.cat));
      tr.appendChild(el("td", "nm", p.author));
      tr.appendChild(el("td", "num", String((p.likes || 0) + reactTotal(p))));
      tr.appendChild(el("td", "num", String(cmtCount(p))));
      var rt = el("td", "num");
      if (p.reports) rt.appendChild(el("span", "badge b-late", String(p.reports)));
      tr.appendChild(rt);
      tr.appendChild(el("td", "num", p.when));

      var tdd = el("td");
      var d = el("button", "del", "삭제");
      d.type = "button";
      d.addEventListener("click", function () { delRow = delRow === i ? -1 : i; paintRows(); });
      tdd.appendChild(d);
      tr.appendChild(tdd);
      t.body.appendChild(tr);

      /* 브라우저 팝업 대신 누른 행 바로 아래에서 확인받는다 */
      if (delRow === i) {
        var ctr = el("tr");
        var ctd = el("td");
        ctd.colSpan = 8;
        ctd.appendChild(deleteGate(p, function (done) { delRow = -1; if (!done) paintRows(); }));
        ctr.appendChild(ctd);
        t.body.appendChild(ctr);
      }
    });

    // 더 있으면 한 줄로 알리고 그 자리에서 이어 붙인다
    if (all > rows.length) {
      var mr = el("tr"), mtd = el("td");
      mtd.colSpan = 8;
      var mb = el("button", "fadd-btn", "더 보기 (" + rows.length + " / " + all + ")");
      mb.type = "button";
      mb.addEventListener("click", function () { postShown += 50; paintRows(); });
      mtd.appendChild(mb);
      mr.appendChild(mtd);
      t.body.appendChild(mr);
    }
    };

    paintRows();
    c.appendChild(t.el);
    host.appendChild(c);
  }

  renderCourseList();
  paintRail();

  /* 강의가 하나도 없는 라운지도 있다 — 막 만들었거나 아직 동기화 전이다.
     그때 강의실을 그리려다 부팅이 통째로 멈추면 커뮤니티까지 같이 죽는다. */
  if (course()) {
    paintWeekHead();
    renderCurric();
    updateProgress();
    selectLesson(curItem());
    mountClassMission();
  }
  applyRole(ME.role);

  /* ================= 주소와 뒤로가기 =================
     탭 전환 · 강의실 · 글 열기는 같은 페이지 안에서 화면을 바꾸는 일이라 브라우저는
     모른다. 그래서 뒤로가기가 라운지 밖으로 나갔다. 화면이 바뀔 때마다 주소를 남기고,
     뒤로가기가 오면 그 주소대로 화면을 되돌린다. 새로고침해도 같은 화면이 뜨고,
     주소를 복사하면 그 화면이 열린다.

       /                 커뮤니티
       /?t=courses       강의 목록          /?t=lesson&w=3    3주차 강의실
       /?t=ranking       랭킹               /?t=admin&s=roles  관리 · 수강생 관리
       …&p=123           그 위에 열린 글

     필터 · 정렬은 주소에 남기지 않는다. 뒤로가기로 필터가 풀리면 오히려 헷갈린다. */
  var navSilent = false;   // 되돌리는 동안에는 다시 기록하지 않는다

  function urlNow() {
    var q = [];
    if (screenNow !== "community") q.push("t=" + screenNow);
    if (screenNow === "lesson" && viewWk) q.push("w=" + viewWk);
    if (screenNow === "admin" && admTab) q.push("s=" + admTab);
    if (openRef && openRef.id) q.push("p=" + openRef.id);
    return location.pathname + (q.length ? "?" + q.join("&") : "");
  }

  function remember(replace) {
    if (navSilent) return;
    var url = urlNow();
    if (url === location.pathname + location.search) return;
    history[replace ? "replaceState" : "pushState"](null, "", url);
  }

  function applyUrl() {
    var get = function (k) { return (location.search.match(new RegExp("[?&]" + k + "=([^&]+)")) || [])[1]; };
    var t = get("t") || "community", w = get("w"), s = get("s"), p = get("p");
    var known = SCREENS.some(function (sc) { return sc.key === t; });
    if (!known || (t === "admin" && !can("manage"))) t = "community";

    navSilent = true;
    try {
      if (t === "admin" && s) admTab = s;
      if (t === "lesson") {
        if (w && courseOf(+w)) openWeek(+w);
        if (screenNow !== "lesson") show(watchLocked() || !course() ? "courses" : "lesson");
      } else {
        show(t);
      }
      if (p) {
        if (!openRef || String(openRef.id) !== String(p)) openById(p);
      } else if (!postModal.hidden) {
        closePost();
      }
    } finally {
      navSilent = false;
    }
  }

  window.addEventListener("popstate", applyUrl);
  applyUrl();          // 들어온 주소대로 첫 화면을 세운다 (?p= 딥링크 포함)
  remember(true);      // 첫 기록은 덮어쓴다. 뒤로가기 한 번에 사이트 밖으로 나가는 것은 그대로다
})();
