/* 설정 한 곳. 값은 환경 변수로 들어오고 기본값은 로컬 개발용이다. */

const env = process.env;

/* DB 주소가 없으면 데모로 돈다.
   프로토타입과 같은 목업 데이터를 서버가 내려주고 쓰기는 받지 않는다.
   DATABASE_URL 을 넣는 순간 같은 코드가 진짜 DB 를 본다. */
const demo = !env.DATABASE_URL && !env.PGHOST;

module.exports = {
  demo: demo,
  port: Number(env.PORT || 4000),

  db: {
    // 로컬은 소켓, Supabase 는 connectionString 하나로 끝난다
    connectionString: env.DATABASE_URL || null,
    host: env.PGHOST || "/tmp",
    port: Number(env.PGPORT || 5439),
    user: env.PGUSER || "postgres",
    database: env.PGDATABASE || "lounge"
  },

  /* 프드프에서 무엇을 받아 올 것인가.
     mode 가 'local' 이면 ext_* 캐시만 읽고 프드프에 붙지 않는다.
     'remote' 로 바꾸면 같은 어댑터가 HTTP 로 받아 온다 — 부르는 쪽은 그대로다. */
  pudufu: {
    mode: env.PUDUFU_MODE || "local",
    base: env.PUDUFU_BASE || "https://pudufu.net",
    key: env.PUDUFU_KEY || ""
  },

  /* 로그인. SSO 가 붙기 전에는 이 사람으로 본다. */
  devUserId: Number(env.DEV_USER_ID || 7),   // 박현종

  loungeId: Number(env.LOUNGE_ID || 1)
};
