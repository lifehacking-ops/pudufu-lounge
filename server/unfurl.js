/* 본문에 붙여넣은 주소를 카드로 바꾼다.
 *
 * 브라우저에서 남의 사이트를 읽으면 CORS 에 막히므로 서버가 가져온다.
 * 가져오는 것은 제목 · 설명 · 대표 이미지뿐이고, 실패해도 글쓰기를 막지 않는다.
 */

const YT = /(?:youtube\.com\/(?:watch\?v=|embed\/|shorts\/)|youtu\.be\/)([\w-]{11})/;

function kindOf(url) {
  if (YT.test(url)) return "youtube";
  if (/\.(png|jpe?g|gif|webp|avif)(\?|$)/i.test(url)) return "image";
  return "link";
}

/* 첫 번째 주소만 본다. 글 하나에 카드 하나면 충분하고,
   여러 개를 붙이면 본문이 카드에 묻힌다. */
function firstUrl(text) {
  const m = String(text || "").match(/https?:\/\/[^\s<>"']+/);
  return m ? m[0].replace(/[.,;:)\]]+$/, "") : null;
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

async function unfurl(url) {
  const kind = kindOf(url);
  if (kind !== "link") return { kind, url, title: null, description: null, image: null };

  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 6000);   // 남의 서버를 오래 기다리지 않는다
  try {
    const res = await fetch(url, {
      signal: ctrl.signal,
      redirect: "follow",
      headers: { "user-agent": "Mozilla/5.0 (compatible; PudufuLounge/1.0)" }
    });
    if (!res.ok) throw new Error(String(res.status));

    const type = res.headers.get("content-type") || "";
    if (/^image\//.test(type)) return { kind: "image", url, title: null, image: url };
    if (!/text\/html/.test(type)) return { kind: "link", url, title: null };

    // 머리만 읽는다. 본문 전체를 받을 이유가 없다.
    const html = (await res.text()).slice(0, 200000);

    return {
      kind: "link",
      url: res.url || url,
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
    // 못 읽어도 주소는 살린다. 카드 대신 주소만 보여준다.
    return { kind: "link", url, title: null, description: null, image: null };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = { unfurl, firstUrl, kindOf };
