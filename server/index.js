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
const { pool } = require("./db");

const ROOT = path.join(__dirname, "..");
const TYPES = { ".css": "text/css", ".js": "text/javascript",
                ".png": "image/png", ".svg": "image/svg+xml", ".ico": "image/x-icon" };

/* 지금은 개발용 고정 사용자다. SSO 가 붙으면 여기만 바뀐다 —
   프드프 /sso/authorize 로 보내고 돌아온 code 를 /sso/token 으로 바꿔
   user_id 를 얻은 뒤 세션에 담는다. docs/API.md 1부 ①. */
function viewer(req) {
  return config.devUserId;
}

function send(res, code, body, type) {
  res.writeHead(code, { "content-type": type || "text/plain; charset=utf-8" });
  res.end(body);
}

const server = http.createServer(async (req, res) => {
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

    /* 화면이 쓰는 데이터를 그대로 본다. 디버깅과 검증용. */
    if (p === "/l/data.json") {
      const data = await present.loungeData(config.loungeId, viewer(req));
      return send(res, 200, JSON.stringify(data, null, 1), "application/json; charset=utf-8");
    }

    /* 시청 기록에서 주차를 다시 계산한다. 하루 한 번이면 충분하다. */
    if (p === "/l/sync-weeks") {
      const L = await require("./queries").lounge(config.loungeId);
      const n = await account.syncWeeks(config.loungeId, L.course_id);
      return send(res, 200, `${n}명 갱신`);
    }

    if (p === "/" || p === "/l" || p.startsWith("/l/")) {
      const data = await present.loungeData(config.loungeId, viewer(req));
      return send(res, 200, render.page(data), "text/html; charset=utf-8");
    }

    send(res, 404, "없음");
  } catch (e) {
    console.error(e);
    send(res, 500, "서버 오류: " + e.message);
  }
});

server.listen(config.port, () => {
  console.log(`라운지 → http://localhost:${config.port}  (프드프 ${config.pudufu.mode})`);
});

process.on("SIGTERM", () => { server.close(); pool.end(); });
