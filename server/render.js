/* 프로토타입의 마크업을 그대로 쓰고, 목업 자리에 서버 데이터를 끼운다.
 *
 * 프로토타입   <script src="web/assets/data-mock.js">
 * 앱           <script>window.LOUNGE_DATA = { …서버… }</script>
 *
 * 나머지(마크업 · CSS · lounge.js)는 한 글자도 다르지 않다. */

const fs = require("fs");
const path = require("path");

const ROOT = path.join(__dirname, "..");
const SRC = path.join(ROOT, "lounge-web-prototype.html");

/* 자산 주소에 내용 해시를 붙인다. 없으면 배포한 뒤에도 브라우저가 옛 CSS · JS 를
   쥐고 있어서, 고친 것이 사용자에게는 며칠 뒤에 도착한다. 파일은 서버가 살아
   있는 동안 바뀌지 않으므로 한 번만 센다. */
const crypto = require("crypto");
const VER = {};
["lounge.css", "lounge.js", "data-mock.js"].forEach((f) => {
  try {
    VER[f] = crypto.createHash("md5").update(fs.readFileSync(path.join(ROOT, "web", "assets", f))).digest("hex").slice(0, 8);
  } catch (e) { VER[f] = "0"; }
});
const asset = (f) => `/assets/${f}?v=${VER[f] || "0"}`;

function shell(keepSwitcher) {
  let html = fs.readFileSync(SRC, "utf8");

  // 자산 경로를 서버 기준으로
  html = html.replace(/(href|src)="web\/assets\/([a-z0-9.-]+)"/g, (m, attr, f) => `${attr}="${asset(f)}"`);

  /* 역할 전환기는 프로토타입에만 있는 데모 장치다. 앱에서 역할은
     lounge_member 가 정하고 서버가 판정한다 — 브라우저에서 바꿀 수 있으면
     안 되고, 바꿔 봐야 서버가 거절한다.
     DB 없이 도는 데모에서는 세 시점을 봐야 하므로 남겨 둔다. */
  if (!keepSwitcher) {
    const rs = html.indexOf("<!-- 세 시점을 바로 비교하기");
    const re = html.indexOf("</div>", html.indexOf('id="roleMenu"')) + 6;
    if (rs > -1) html = html.slice(0, rs) + html.slice(re);
  }

  // 스펙 시트는 기획 설명용이라 앱에서는 뺀다
  const i = html.indexOf('<section class="sheet">');
  const j = html.indexOf("</section>", i);
  if (i > -1) html = html.slice(0, i) + html.slice(j + 10);

  return html;
}

function page(data) {
  return shell(!!data.demo).replace(
    `<script src="${asset("data-mock.js")}"></script>`,
    "<script>window.LOUNGE_DATA=" +
      JSON.stringify(data).replace(/</g, "\\u003c") +
      ";</script>"
  );
}

/* 멤버가 아닌 사람이 링크를 타고 들어왔을 때. 안에 무엇이 있는지는
   알려 주지 않는다 — 문이 잠겼다는 사실과 어디서 여는지만 말한다. */
function locked() {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>라운지 · 수강생 전용</title>
<link rel="stylesheet" href="${asset("lounge.css")}">
<style>
  .lock { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
  .lock-in { max-width: 380px; text-align: center; display: grid; gap: 12px; }
  .lock-in h1 { font-size: 19px; margin: 0; }
  .lock-in p { font-size: 13px; color: var(--slate); margin: 0; line-height: 1.7; }
  .lock-in a { display: inline-block; margin-top: 6px; font-size: 13px; font-weight: 700; color: var(--brand); }
</style></head>
<body><div class="lock"><div class="lock-in">
  <h1>수강생만 들어올 수 있는 라운지입니다</h1>
  <p>강의를 수강 중이면 프드프에 로그인한 뒤 다시 열어 주세요.<br>
     수강생이 아니라면 강의를 먼저 신청해야 합니다.</p>
  <a href="https://pudufu.net">프드프로 가기</a>
</div></div></body></html>`;
}

/* 서버가 넘어졌을 때. 내부 메시지는 내보내지 않는다 — 스택도 SQL 도 사용자의 일이 아니다.
   무엇을 하면 되는지만 말한다. */
function oops() {
  return `<!doctype html>
<html lang="ko"><head><meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>라운지 · 잠시 문제가 생겼습니다</title>
<link rel="stylesheet" href="${asset("lounge.css")}">
<style>
  .lock { min-height: 100vh; display: grid; place-items: center; padding: 24px; }
  .lock-in { max-width: 380px; text-align: center; display: grid; gap: 12px; }
  .lock-in h1 { font-size: 19px; margin: 0; }
  .lock-in p { font-size: 13px; color: var(--slate); margin: 0; line-height: 1.7; }
  .lock-in a { display: inline-block; margin-top: 6px; font-size: 13px; font-weight: 700; color: var(--brand); }
</style></head>
<body><div class="lock"><div class="lock-in">
  <h1>잠시 문제가 생겼습니다</h1>
  <p>라운지를 불러오지 못했습니다. 잠깐 뒤에 다시 열어 주세요.<br>
     계속 그러면 관리자에게 알려 주세요.</p>
  <a href="/">다시 열기</a>
</div></div></body></html>`;
}

module.exports = { page, locked, oops };
