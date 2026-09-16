/* 파일 보관. Supabase Storage 를 쓴다.
 *
 * 브라우저가 우리 서버를 거치지 않고 Storage 로 바로 올린다. 서버리스는
 * 본문 크기와 실행 시간에 제한이 있어서, 파일이 서버를 통과하게 두면 금세 막힌다.
 * 서버는 '여기에 올려도 된다'는 서명된 주소만 발급한다.
 *
 * 필요한 값 (.env)
 *   SUPABASE_URL          https://<ref>.supabase.co   — 없으면 DATABASE_URL 에서 뽑는다
 *   SUPABASE_SERVICE_KEY  Project Settings → API → service_role
 */

const config = require("./config");

const BUCKET = "lounge";

/* service_role 키는 모든 것을 열 수 있으므로 서버에만 둔다.
   브라우저로 내려보내지 않는다 — 내려보내면 누구나 남의 파일을 지울 수 있다. */
function creds() {
  const key = process.env.SUPABASE_SERVICE_KEY;
  let base = process.env.SUPABASE_URL;

  if (!base && config.db.connectionString) {
    // postgres.<ref> 또는 db.<ref>.supabase.co 에서 프로젝트 ref 를 얻는다
    const u = new URL(config.db.connectionString);
    const ref = u.username.includes(".")
      ? u.username.split(".").slice(1).join(".")
      : (u.hostname.match(/^db\.([a-z0-9]+)\./) || [])[1];
    if (ref) base = `https://${ref}.supabase.co`;
  }
  return { base: base, key: key, ready: !!(base && key) };
}

const OK_TYPES = {
  "image/png": "png", "image/jpeg": "jpg", "image/gif": "gif",
  "image/webp": "webp", "application/pdf": "pdf",
  // 과제로 내는 영상. 브라우저가 코덱 없이 바로 트는 것만 받는다.
  "video/mp4": "mp4", "video/webm": "webm", "video/quicktime": "mov"
};

/* 영상은 사진과 자릿수가 다르다. 1분짜리 화면 녹화가 이미 10MB 를 넘는다.
   상한 50MB 는 Supabase 무료 플랜의 파일 한도다 — 버킷 설정도 같은 값이어야
   한다. 여기서 더 받아 줘도 보관소가 거절한다. */
const MAX_IMAGE = 10 * 1024 * 1024;
const MAX_VIDEO = 50 * 1024 * 1024;

/* 브라우저가 바로 올릴 수 있는 주소를 만든다. 한 번 쓰고 마는 주소다. */
async function signUpload(userId, mime, size) {
  const c = creds();
  if (!c.ready) {
    throw Object.assign(new Error("파일 보관소가 아직 연결되지 않았습니다"), { code: 503 });
  }
  const ext = OK_TYPES[mime];
  if (!ext) throw Object.assign(new Error("이미지 · 영상 · PDF 만 올릴 수 있습니다"), { code: 403 });

  const video = mime.startsWith("video/");
  const cap = video ? MAX_VIDEO : MAX_IMAGE;
  if (size > cap) {
    throw Object.assign(new Error((video ? "영상은 50MB" : "사진은 10MB") + " 까지 올릴 수 있습니다"), { code: 403 });
  }

  const name = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}.${ext}`;
  const path = `${userId}/${name}`;

  const res = await fetch(`${c.base}/storage/v1/object/upload/sign/${BUCKET}/${path}`, {
    method: "POST",
    headers: { authorization: "Bearer " + c.key, "content-type": "application/json" },
    body: "{}"
  });
  if (!res.ok) throw new Error("보관소가 주소를 내주지 않았습니다 (" + res.status + ")");

  const j = await res.json();
  return {
    uploadUrl: c.base + "/storage/v1" + j.url,
    path: path,
    url: `${c.base}/storage/v1/object/public/${BUCKET}/${path}`,
    kind: mime === "application/pdf" ? "link" : video ? "video" : "image"
  };
}

module.exports = { signUpload, creds, BUCKET };
