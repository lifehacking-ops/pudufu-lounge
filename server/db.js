/* pg 풀 하나. ORM 을 쓰지 않는다 — 평문 SQL 은 DB 를 바꿔도 대부분 그대로 간다. */

const { Pool } = require("pg");
const config = require("./config");

// 시각은 전부 UTC 로 넣고 UTC 로 읽는다. 세션 타임존에 기대지 않는다.
const base = { options: "-c timezone=UTC" };

const url = config.db.connectionString;
const hosted = url && /supabase|neon|railway|render/.test(url);

/* 서버리스에서는 호출마다 인스턴스가 살았다 죽는다. 연결을 많이 쥐고 있으면
   금세 한도에 닿으므로 하나만 쓰고 빨리 놓는다.
   Supabase 는 6543 포트(트랜잭션 풀러)를 쓴다 — 그쪽은 prepared statement 를
   못 쓰므로 pg 의 이름 붙은 질의를 쓰지 않는다(우리는 안 쓴다). */
const serverless = !!process.env.VERCEL;

const pool = new Pool(
  url
    ? {
        ...base,
        connectionString: url,
        /* Supabase 직접 연결은 자체 서명 인증서라 검증을 끄지 않으면 붙지 않는다.
           엄격하게 하려면 Supabase 의 CA 를 내려받아 ssl.ca 로 넣으면 된다. */
        ssl: hosted ? { rejectUnauthorized: false } : undefined,
        max: serverless ? 1 : 10,
        idleTimeoutMillis: serverless ? 5000 : 30000,
        connectionTimeoutMillis: 10000
      }
    : { ...base, host: config.db.host, port: config.db.port,
        user: config.db.user, database: config.db.database }
);

pool.on("error", (e) => { console.error("DB 연결이 끊겼습니다:", e.message); });

async function rows(sql, params) {
  const r = await pool.query(sql, params);
  return r.rows;
}

async function one(sql, params) {
  const r = await pool.query(sql, params);
  return r.rows[0] || null;
}

module.exports = { pool, rows, one };
