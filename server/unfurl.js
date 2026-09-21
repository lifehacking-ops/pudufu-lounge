/* 본문에 붙여넣은 주소를 카드로 바꾼다.
 *
 * 브라우저에서 남의 사이트를 읽으면 CORS 에 막히므로 서버가 가져온다.
 * 가져오는 것은 제목 · 설명 · 대표 이미지뿐이고, 실패해도 글쓰기를 막지 않는다.
 */

const dns = require("dns").promises;
const net = require("net");

const YT = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/;

/* ---- 서버가 남의 주소를 대신 열어 주는 기능이다 ----
   글 쓴 사람이 주소를 정하므로, 서버만 닿을 수 있는 곳(자기 자신 · 사설망 ·
   클라우드 메타데이터)을 적으면 서버가 거기를 대리로 열어 준다. 열기 전에
   주소를 IP 로 풀어서 그런 대역이면 거절한다. 리다이렉트도 한 번 갈 때마다
   다시 본다 — 공개 주소가 내부 주소로 튀는 수법이 있다. */

function isPrivateIp(ip) {
  if (net.isIPv4(ip)) {
    const [a, b] = ip.split(".").map(Number);
    return a === 0 || a === 10 || a === 127                 // 미지정 · 사설 · 자기 자신
      || (a === 100 && b >= 64 && b <= 127)                 // 통신사 NAT
      || (a === 169 && b === 254)                           // 링크 로컬 · 클라우드 메타데이터
      || (a === 172 && b >= 16 && b <= 31)                  // 사설
      || (a === 192 && b === 168)                           // 사설
      || a >= 224;                                          // 멀티캐스트 · 예약
  }
  const v6 = ip.toLowerCase();
  if (v6 === "::" || v6 === "::1") return true;
  if (v6.startsWith("fe80") || v6.startsWith("fc") || v6.startsWith("fd")) return true;   // 링크 로컬 · 사설

  /* v4 를 v6 로 감싼 것. 점 표기(::ffff:127.0.0.1)도 오지만 URL 파서는 16진
     (::ffff:7f00:1)으로 고쳐 놓는다. 둘 다 v4 로 되돌려 다시 본다. */
  let m = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
  if (m) return isPrivateIp(m[1]);
  m = v6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
  if (m) {
    const hi = parseInt(m[1], 16), lo = parseInt(m[2], 16);
    return isPrivateIp([hi >> 8, hi & 255, lo >> 8, lo & 255].join("."));
  }
  return false;
}

/* 이름 풀이에도 시한을 건다. dns.lookup 은 취소가 없어서, 응답 없는 이름 서버를 만나면
   운영체제 기본값(수십 초)까지 기다린다 — 글 게시가 30초 넘게 걸린 원인이 이것이었다.
   시한이 지나면 '못 찾음' 으로 본다. 검사를 못 했으니 열지 않는다. */
function lookupWithin(host, signal) {
  return new Promise((resolve, reject) => {
    const bail = () => reject(new Error("주소를 찾는 데 시간이 너무 걸립니다"));
    if (signal && signal.aborted) return bail();
    if (signal) signal.addEventListener("abort", bail, { once: true });
    dns.lookup(host, { all: true, verbatim: true }).then(resolve, () => resolve([]));
  });
}

/* 열어도 되는 주소인가. 안 되면 이유를 던진다. */
async function assertPublic(url, signal) {
  let u;
  try { u = new URL(url); } catch (e) { throw new Error("주소가 아닙니다"); }
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("http(s) 만 엽니다");
  if (u.username || u.password) throw new Error("계정이 든 주소는 열지 않습니다");

  const host = u.hostname.replace(/^\[|\]$/g, "");
  if (host === "localhost" || host.endsWith(".localhost") || host.endsWith(".local") || host.endsWith(".internal")) {
    throw new Error("내부 주소입니다");
  }
  if (net.isIP(host)) {
    if (isPrivateIp(host)) throw new Error("내부 주소입니다");
    return u;
  }
  // 이름은 IP 로 풀어서 본다. 하나라도 내부 대역이면 연다고 볼 수 없다.
  const found = await lookupWithin(host, signal);
  if (!found.length) throw new Error("주소를 찾을 수 없습니다");
  if (found.some((a) => isPrivateIp(a.address))) throw new Error("내부 주소입니다");
  return u;
}

const MAX_HOPS = 3;
const MAX_BYTES = 200000;   // 머리만 읽는다. 본문 전체를 받을 이유가 없다.

/* 리다이렉트를 손으로 따라간다. 자동으로 따르면 두 번째 주소는 검사를 건너뛴다. */
async function fetchPublic(url, signal) {
  let cur = url;
  for (let hop = 0; hop <= MAX_HOPS; hop++) {
    // 내부 주소라 거절한 것만 blocked 다. 시한에 걸려 못 본 것은 그냥 실패 — 카드 없이 주소만 남는다.
    await assertPublic(cur, signal).catch((e) => { if (!/시간/.test(e.message)) e.blocked = true; throw e; });
    const res = await fetch(cur, {
      signal, redirect: "manual",
      headers: { "user-agent": "Mozilla/5.0 (compatible; PudufuLounge/1.0)" }
    });
    if (res.status >= 300 && res.status < 400) {
      const to = res.headers.get("location");
      if (!to) throw new Error("갈 곳 없는 리다이렉트");
      cur = new URL(to, cur).href;
      continue;
    }
    return { res, url: cur };
  }
  throw new Error("리다이렉트가 너무 깁니다");
}

/* 응답을 상한까지만 읽는다. 끝없이 흘려보내는 서버가 있다. */
async function readCapped(res) {
  const reader = res.body && res.body.getReader ? res.body.getReader() : null;
  if (!reader) return (await res.text()).slice(0, MAX_BYTES);
  const dec = new TextDecoder();
  let out = "";
  while (out.length < MAX_BYTES) {
    const { value, done } = await reader.read();
    if (done) break;
    out += dec.decode(value, { stream: true });
  }
  reader.cancel().catch(() => {});
  return out.slice(0, MAX_BYTES);
}

function kindOf(url) {
  if (YT.test(url)) return "youtube";
  if (/\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url)) return "image";
  return "link";
}

/* 첫 번째 주소만 본다. 글 하나에 카드 하나면 충분하고,
   여러 개를 붙이면 본문이 카드에 묻힌다.

   http(s):// 가 없어도 찾는다 — 사람은 "open.kakao.com/o/abc" 라고 적고, 주소창에서
   복사해도 스킴이 빠져 오는 브라우저가 있다. 대신 점이 든 낱말이 다 주소는 아니다.
   report.pdf · lounge.js 같은 파일 이름은 건너뛰고, 이메일(a@b.com)의 뒷부분도 잡지 않는다.
   web/assets/lounge.js 의 firstUrl 이 같은 규칙을 화면에서 쓴다 — 둘을 같이 고친다. */
const URL_RE = /https?:\/\/[^\s<>"']+|(?<![\w@.\/])(?:[a-z0-9-]+\.)+[a-z]{2,}(?::\d{2,5})?(?:\/[^\s<>"']*)?/gi;
const FILE_EXT = new Set(["pdf", "jpg", "jpeg", "png", "gif", "webp", "mp4", "mov", "webm", "txt", "doc", "docx",
  "xls", "xlsx", "ppt", "pptx", "hwp", "zip", "js", "css", "json", "csv", "md", "exe", "dmg", "html", "htm"]);

function firstUrl(text) {
  const s = String(text || "");
  URL_RE.lastIndex = 0;
  let m;
  while ((m = URL_RE.exec(s))) {
    let u = m[0].replace(/[.,;:)\]]+$/, "");
    if (!/^https?:\/\//i.test(u)) {
      const tld = u.split(/[/:]/)[0].split(".").pop().toLowerCase();
      if (FILE_EXT.has(tld)) continue;
      u = "https://" + u;
    }
    return u;
  }
  return null;
}

const pick = (html, ...res) => {
  for (const re of res) {
    const m = html.match(re);
    if (m && m[1]) return m[1].trim();
  }
  return null;
};

const unescape = (s) => !s ? s : s
  .replace(/&amp;/g, "&").replace(/&lt;/g, "<").replace(/&gt;/g, ">")
  .replace(/&quot;/g, '"').replace(/&#0?39;|&apos;/g, "'").replace(/&nbsp;/g, " ");

const BUDGET = 6000;   // 남의 서버를 기다리는 시간의 상한. 이름 풀이 · 리다이렉트 · 본문까지 전부 포함

async function unfurl(url) {
  const kind = kindOf(url);
  if (kind !== "link") return { kind, url, title: null, description: null, image: null };

  const plain = { kind: "link", url, title: null, description: null, image: null };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), BUDGET);
  /* 어떤 경로로도 BUDGET 을 넘기지 않는다. abort 를 무시하는 단계가 하나라도 있으면
     (예: 응답 스트림이 멎은 채 열려 있음) 여기서 끊고 주소만 남긴다. */
  const guard = new Promise((resolve) => setTimeout(() => resolve(plain), BUDGET + 1000));
  try {
    return await Promise.race([guard, fetchAndParse(url, ctrl.signal, plain)]);
  } finally {
    clearTimeout(timer);
  }
}

async function fetchAndParse(url, signal, plain) {
  try {
    const got = await fetchPublic(url, signal);
    const res = got.res;
    if (!res.ok) throw new Error(String(res.status));

    const type = res.headers.get("content-type") || "";
    if (/^image\//.test(type)) return { kind: "image", url, title: null, image: url };
    if (!/text\/html/.test(type)) return { kind: "link", url, title: null };

    const html = await readCapped(res);

    return {
      kind: "link",
      url: got.url || url,
      title: unescape(pick(html,
        /<meta[^>]+property=["']og:title["'][^>]+content=["']([^"']+)/i,
        /<meta[^>]+name=["']twitter:title["'][^>]+content=["']([^"']+)/i,
        /<title[^>]*>([^<]+)</i)),
      description: unescape(pick(html,
        /<meta[^>]+property=["']og:description["'][^>]+content=["']([^"']+)/i,
        /<meta[^>]+name=["']description["'][^>]+content=["']([^"']+)/i)),
      image: pick(html,
        /<meta[^>]+property=["']og:image["'][^>]+content=["']([^"']+)/i,
        /<meta[^>]+name=["']twitter:image["'][^>]+content=["']([^"']+)/i)
    };
  } catch (e) {
    /* 내부 주소라 열지 않은 것과 남의 서버가 안 열린 것은 다르다.
       앞의 것은 카드로 만들 이유가 없다 — 쓰는 쪽이 blocked 를 보고 건너뛴다. */
    if (e && e.blocked) return Object.assign({}, plain, { blocked: true });
    // 못 읽어도 주소는 살린다. 카드 대신 주소만 보여준다.
    return plain;
  }
}

module.exports = { unfurl, firstUrl, kindOf, assertPublic, isPrivateIp };
