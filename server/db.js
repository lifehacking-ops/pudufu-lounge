/* pg 풀 하나. ORM 을 쓰지 않는다 — 평문 SQL 은 DB 를 바꿔도 대부분 그대로 간다. */

const { Pool } = require("pg");
const config = require("./config");

// 시각은 전부 UTC 로 넣고 UTC 로 읽는다. 세션 타임존에 기대지 않는다.
const base = { options: "-c timezone=UTC" };

const pool = new Pool(
  config.db.connectionString
    ? { ...base, connectionString: config.db.connectionString }
    : { ...base, host: config.db.host, port: config.db.port,
        user: config.db.user, database: config.db.database }
);

async function rows(sql, params) {
  const r = await pool.query(sql, params);
  return r.rows;
}

async function one(sql, params) {
  const r = await pool.query(sql, params);
  return r.rows[0] || null;
}

module.exports = { pool, rows, one };
