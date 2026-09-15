/* 라운지 서버.
 *
 * 프레임워크를 쓰지 않는다. 서버가 하는 일이 셋뿐이라서다 —
 * 로그인 확인, DB 에서 화면 데이터 만들기, 쓰기 받기.
 * 렌더는 lounge.js 가 브라우저에서 한다. */

const http = require("http");
const fs = require("fs");
const path = require("path");

const config = require("./config");
const present = require("./present");
const render = require("./render");
const account = require("./account");
const writes = require("./writes");
const { unfurl } = require("./unfurl");
const storage = require("./storage");
const { pool } = require("./db");
const Q = require("./queries");

const ROOT = path.join(__dirname, "..");
const TYPES = { ".css": "text/css", ".js": "text/javascript",
                ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

/* 지금은 개발용 고정 사용자다. SSO 가 붙으면 여기만 바뀐다 —
   프드프 /sso/authorize 로 보내고 돌아온 code 를 /sso/token 으로 바꿔
   user_id 를 얻은 뒤 세션에 담는다. docs/API.md 1부 ①. */
function viewer(req) {
  return config.devUserId;
}

/* 라운지를 볼 수 있는 사람인지. 쓰기는 writes.js 가 따로 또 본다 —
   읽기 문 하나로 쓰기까지 믿지 않는다. */
async function allowed(req) {
  const id = viewer(req);
  if (!id) return false;
  return !!(await Q.memberOf(config.loungeId, id));
}

function send(res, code, body, type) {
  res.writeHead(code, { "content-type": type || "text/plain; charset=utf-8" });
  res.end(body);
}

const json = (res, code, obj) =>
  send(res, code, JSON.stringify(obj), "application/json; charset=utf-8");

function body(req) {
  return new Promise((ok, no) => {
    let s = "";
    req.on("data", (d) => {
      s += d;
      if (s.length > 1e6) { no(new Error("본문이 너무 큽니다")); req.destroy(); }
    });
    req.on("end", () => { try { ok(s ? JSON.parse(s) : {}); } catch (e) { no(e); } });
    req.on("error", no);
  });
}

/* /l/posts/12/comments 처럼 생긴 것에서 숫자를 꺼낸다 */
const seg = (p) => p.split("/").filter(Boolean);

async function handler(req, res) {
  const url = new URL(req.url, "http://x");
  const p = url.pathname;

  try {
    if (p.startsWith("/assets/")) {
      const file = path.join(ROOT, "web", p);
      if (!file.startsWith(path.join(ROOT, "web"))) return send(res, 403, "no");
      if (!fs.existsSync(file)) return send(res, 404, "없음");
      return send(res, 200, fs.readFileSync(file),
        (TYPES[path.extname(file)] || "application/octet-stream") + "; charset=utf-8");
    }

    if (p === "/health") return send(res, 200, "ok");

    /* 브라우저가 항상 찾는다. 없으면 콘솔에 404 가 남는다. */
    if (p === "/favicon.ico") {
      res.writeHead(204);
      return res.end();
    }

    /* 피드 '더 보기'. 첫 화면과 같은 조립을 거쳐 한 묶음씩 잇는다. */
    if (p === "/l/posts" && req.method === "GET") {
      if (!(await allowed(req))) return json(res, 403, { error: "이 라운지의 멤버가 아닙니다" });
      const at = url.searchParams.get("at"), id = url.searchParams.get("id");
      const before = at && id ? { at: at, id: id } : null;
      return json(res, 200, await present.postPage(config.loungeId, viewer(req), before));
    }

    /* 화면이 쓰는 데이터를 그대로 본다. 디버깅과 검증용. */
    if (p === "/l/data.json") {
      if (!(await allowed(req))) return json(res, 403, { error: "이 라운지의 멤버가 아닙니다" });
      const data = await present.loungeData(config.loungeId, viewer(req));
      return send(res, 200, JSON.stringify(data, null, 1), "application/json; charset=utf-8");
    }

    /* 시청 기록에서 주차를 다시 계산한다. 하루 한 번이면 충분하다. */
    if (p === "/l/sync-weeks") {
      const L = await require("./queries").lounge(config.loungeId);
      const n = await account.syncWeeks(config.loungeId, L.course_id);
      return send(res, 200, `${n}명 갱신`);
    }

    /* ---- 쓰기. 권한은 server/writes.js 가 다시 검사한다 ---- */
    if (req.method !== "GET" && p.startsWith("/l/")) {
      const me = viewer(req);
      const L = config.loungeId;
      const s = seg(p);            // ["l", ...]
      const input = await body(req);

      try {
        if (req.method === "POST" && s[1] === "posts" && s.length === 2)
          return json(res, 200, await writes.createPost(L, me, input));

        if (req.method === "PATCH" && s[1] === "posts" && s.length === 3)
          return json(res, 200, await writes.editPost(L, me, +s[2], input));

        if (req.method === "DELETE" && s[1] === "posts" && s.length === 3)
          return json(res, 200, await writes.deletePost(L, me, +s[2]));

        if (req.method === "POST" && s[1] === "posts" && s[3] === "comments")
          return json(res, 200, await writes.createComment(L, me, +s[2], input));

        if (req.method === "DELETE" && s[1] === "comments" && s.length === 3)
          return json(res, 200, await writes.deleteComment(L, me, +s[2]));

        /* 글쓰기 창에서 주소를 붙여넣는 순간 미리 보여주기 위한 것.
           저장은 글을 올릴 때 서버가 다시 한다. */
        /* 파일은 서버를 통과하지 않는다. 올려도 되는 주소만 내준다. */
        if (req.method === "POST" && s[1] === "uploads")
          return json(res, 200, await storage.signUpload(me, input.type, Number(input.size || 0)));

        if (req.method === "POST" && s[1] === "unfurl")
          return json(res, 200, await unfurl(String(input.url || "").slice(0, 2000)));

        if (req.method === "PUT" && s[1] === "posts" && s[3] === "pinned")
          return json(res, 200, await writes.setPinned(L, me, +s[2], input.pinned));

        if (req.method === "POST" && s[1] === "posts" && s[3] === "report")
          return json(res, 200, await writes.reportPost(L, me, +s[2], input.reason));

        if (req.method === "POST" && s[1] === "posts" && s[3] === "view")
          return json(res, 200, await writes.markView(L, me, +s[2]));

        if (req.method === "PUT" && s[1] === "lessons" && s[3] === "done")
          return json(res, 200, await writes.markWatched(L, me, +s[2], input.done));

        if (req.method === "PUT" && s[3] === "reactions")
          return json(res, 200, await writes.toggleReaction(
            L, me, s[1] === "posts" ? "post" : "comment", +s[2], input.emoji));

        /* 관리. 이 라운지를 맡은 관리자만 — server/writes.js 가 다시 본다. */
        if (s[1] === "admin") {
          if (req.method === "PATCH" && s[2] === "members")
            return json(res, 200, await writes.setRole(L, me, +s[3], input.role));

          if (req.method === "POST" && s[2] === "categories" && s.length === 3)
            return json(res, 200, await writes.addCategory(L, me, input.name));

          if (req.method === "DELETE" && s[2] === "categories")
            return json(res, 200, await writes.removeCategory(L, me, +s[3]));

          if (req.method === "PUT" && s[2] === "categories" && s[4] === "placement")
            return json(res, 200, await writes.setPlacement(L, me, +s[3], input.placement));

          if (req.method === "PUT" && s[2] === "categories" && s[4] === "rights")
            return json(res, 200, await writes.setRights(L, me, +s[3], input));

          if (req.method === "PUT" && s[2] === "weeks" && s[4] === "published")
            return json(res, 200, await writes.setWeekPublished(L, me, +s[3], input.published));

          if (req.method === "POST" && s[2] === "lessons")
            return json(res, 200, await writes.addLesson(L, me, input));

          if (req.method === "POST" && s[2] === "weeks")
            return json(res, 200, await writes.addWeek(L, me, input));

          if (req.method === "PUT" && s[2] === "weeks" && s[4] === "mission")
            return json(res, 200, await writes.setMission(L, me, +s[3], input));

          if (req.method === "PUT" && s[2] === "members" && s[4] === "muted")
            return json(res, 200, await writes.setMuted(L, me, +s[3], input.days, input.reason));

          if (req.method === "POST" && s[2] === "members" && s[4] === "passes")
            return json(res, 200, await writes.grantPass(L, me, +s[3], input.count));

          if (req.method === "PUT" && s[2] === "lounge")
            return json(res, 200, await writes.setLounge(L, me, input));

          if (req.method === "PATCH" && s[2] === "categories")
            return json(res, 200, await writes.renameCategory(L, me, +s[3], input.name));
        }
      } catch (e) {
        if (e.code === 403 || e.code === 404) return json(res, e.code, { error: e.message });
        throw e;
      }
      return json(res, 404, { error: "그런 길이 없습니다" });
    }

    if (p === "/" || p === "/l" || p.startsWith("/l/")) {
      /* 글 주소(?p=12)는 밖으로 돌아다닌다. 링크를 받았다고 들어올 수 있으면
         강의를 사지 않은 사람이 남의 과제와 피드백을 다 읽게 된다. */
      if (!(await allowed(req))) return send(res, 403, render.locked(), "text/html; charset=utf-8");

      const data = await present.loungeData(config.loungeId, viewer(req));
      return send(res, 200, render.page(data), "text/html; charset=utf-8");
    }

    send(res, 404, "없음");
  } catch (e) {
    console.error(e);
    send(res, 500, "서버 오류: " + e.message);
  }
}

module.exports = handler;

/* 직접 실행하면 서버를 띄운다. Vercel 에서는 api/index.js 가 핸들러만 가져간다. */
if (require.main === module) {
  const server = http.createServer(handler);
  server.listen(config.port, () => {
    console.log(`라운지 → http://localhost:${config.port}  (${config.demo ? "데모" : "DB"} · 프드프 ${config.pudufu.mode})`);
  });
  process.on("SIGTERM", () => { server.close(); pool.end(); });
}
