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

function shell() {
  let html = fs.readFileSync(SRC, "utf8");

  // 자산 경로를 서버 기준으로
  html = html.replace(/(href|src)="web\/assets\//g, '$1="/assets/');

  /* 역할 전환기는 프로토타입에만 있는 데모 장치다. 앱에서 역할은
     lounge_member 가 정하고 서버가 판정한다 — 브라우저에서 바꿀 수 있으면
     안 되고, 바꿔 봐야 서버가 거절한다. */
  const rs = html.indexOf("<!-- 세 시점을 바로 비교하기");
  const re = html.indexOf("</div>", html.indexOf('id="roleMenu"')) + 6;
  if (rs > -1) html = html.slice(0, rs) + html.slice(re);

  // 스펙 시트는 기획 설명용이라 앱에서는 뺀다
  const i = html.indexOf('<section class="sheet">');
  const j = html.indexOf("</section>", i);
  if (i > -1) html = html.slice(0, i) + html.slice(j + 10);

  return html;
}

function page(data) {
  return shell().replace(
    '<script src="/assets/data-mock.js"></script>',
    "<script>window.LOUNGE_DATA=" +
      JSON.stringify(data).replace(/</g, "\\u003c") +
      ";</script>"
  );
}

module.exports = { page };
