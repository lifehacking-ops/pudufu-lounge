# 라운지를 MariaDB 로 옮기기

프드프의 DB 는 MariaDB 다. 라운지는 PostgreSQL 로 만들어졌다. 이 문서는 라운지를 프드프 안으로
이식할 때 **DB 층에서 해야 할 일 전부**를 적은 것이다. 2026-09-17 에 전수 조사했고, 스키마는
MariaDB 13.0.2 에서 실제로 올려 확인했다.

## 결론

- **막히는 것은 없다.** Postgres 전용으로 쓴 것마다 MariaDB 짝이 있다.
- **MariaDB 10.5 이상**이 전제다 — `INSERT … RETURNING`, `JSON_ARRAYAGG(… ORDER BY)` 때문이다.
  10.2~10.4 면 RETURNING 을 전부 `insertId` / SELECT 로 풀어야 해서 일이 늘어난다.
- 일의 크기: 스키마(끝남) · SQL 변환 2~3일 · 회귀 검증 1~2일.

## 이미 된 것

| 파일 | 무엇 |
|---|---|
| `db/schema.mariadb.sql` | 변환된 스키마. 표 · 컬럼 · 제약이 `db/schema.sql` 과 1:1. 머리 주석에 달라진 점 전수 |
| `db/seed.mariadb.sql` | 샘플 라운지 시드의 MariaDB 판. `npm run seed:mariadb` 로 다시 만든다(원본은 `web/assets/data-mock.js`) |
| `db/mariadb-smoke.sql` | 변환에서 쓰는 SQL 패턴 14가지를 돌려 보는 검증. 빈 DB 든 시드가 든 DB 든 된다. 끝에 `SMOKE OK` 가 나와야 한다 |

```sh
mariadb -e "CREATE DATABASE lounge CHARACTER SET utf8mb4 COLLATE utf8mb4_unicode_ci"
mariadb lounge < db/schema.mariadb.sql
mariadb lounge < db/seed.mariadb.sql       # 멤버 27 · 글 23 · 댓글 15 · 반응 246
mariadb lounge < db/mariadb-smoke.sql      # 마지막 줄 SMOKE OK
```

MariaDB 13.0.2 에서 셋 다 확인했다(2026-09-17). 시드 적재 뒤 `post.comment_count` · `reaction_count` 가 실제 행 수와 일치하고,
id 를 직접 넣은 표의 AUTO_INCREMENT 가 max(id)+1 로 가 있는 것까지 봤다.

## 남은 것 — SQL 변환 (`server/queries.js` 265줄 · `server/writes.js` 848줄 · `server/db.js` 59줄)

SQL 은 이 세 파일에만 있다. 나머지 서버 코드(`present.js`, `index.js`)는 결과 행만 다룬다.

### 1. 드라이버 (`server/db.js`)

`pg` → `mysql2/promise`. `rows(sql, params)` · `one(sql, params)` 두 함수 뒤에 SQL 이 다 숨어 있어
교체 지점은 여기 하나다. 연결 옵션에 넣을 것:

```js
{ timezone: "Z",            // DATETIME 을 UTC 로 읽고 쓴다. 화면의 KST 변환은 지금 그대로
  namedPlaceholders: true,  // 같은 값을 두 번 쓰는 쿼리가 많다 (아래 3절)
  supportBigNumbers: true, bigNumberStrings: false }
```

읽는 쪽에서 두 가지를 맞춘다.
- **JSON 컬럼**(`lounge.intro_att`, `lounge_digest.payload`, 그리고 `JSON_ARRAYAGG` 결과)은 문자열로 온다 → `JSON.parse`.
  `rows()` 안에서 컬럼 이름으로 골라 파싱하거나, 쿼리에서 별칭을 `*_json` 으로 통일해 일괄 파싱.
- **BOOLEAN** 은 0/1 로 온다 → `present.js` 가 `=== true` 로 비교하는 곳이 있으면 `!!` 로.

### 2. 패턴별 치환표

| Postgres | 곳 | MariaDB |
|---|---|---|
| `$1, $2 …` | 전부 | `?` 또는 `:name` |
| `count(*)::int`, `x::bigint` 등 캐스트 | queries 22 · writes 8 | 지운다. 정수는 그대로 숫자로 온다 |
| `$3::timestamptz IS NULL OR (p.created_at, p.id) < ($3, $4)` (커서 페이징) | queries 85–86 | `:at IS NULL OR (p.created_at, p.id) < (:at, :id)` — 행 비교는 MariaDB 도 된다 |
| `$6::bigint[] IS NULL OR p.id = ANY($6)` | queries 87 · 193 | 배열이 비면 조건을 문자열에서 빼고, 있으면 `p.id IN (?)` (mysql2 가 배열을 펼친다) |
| `ILIKE` | queries 147–164 | `LIKE` — utf8mb4_unicode_ci 가 대소문자를 무시한다 |
| `json_agg(json_build_object(…) ORDER BY …)` | queries 11 · 31 · 74 · 76 · 134 · 136 · 220 | `JSON_ARRAYAGG(JSON_OBJECT(…) ORDER BY …)`. 행이 없으면 NULL 이므로 `COALESCE(…, JSON_ARRAY())` |
| `count(*) FILTER (WHERE c)` | queries 221 · 253–255 | `SUM(c)` (조건이 0/1 로 계산된다) · `COUNT(DISTINCT CASE WHEN c THEN x END)` |
| `now() - interval '15 seconds'` | writes 100 · 246 | `NOW(6) - INTERVAL 15 SECOND` |
| `now() - ($2 \|\| ' days')::interval` | queries 226 · 242 · writes 821 | `NOW(6) - INTERVAL :days DAY` |
| `INSERT … RETURNING id` | writes 128 · 270 · 377 · 514 | 그대로 (10.5+). 또는 `result.insertId` |
| `INSERT … ON CONFLICT (…) DO UPDATE SET …` | writes 441 · 482 · 491 · 549 · 605 · 841 | `INSERT … ON DUPLICATE KEY UPDATE col = VALUES(col)` |
| `INSERT … ON CONFLICT DO NOTHING RETURNING post_id` (첫 조회 판정) | writes 577 | `INSERT IGNORE … RETURNING post_id` — 이미 있으면 빈 결과 |
| `ON CONFLICT (lounge_id, week) DO UPDATE SET published = false` | writes 553 | `ON DUPLICATE KEY UPDATE published = FALSE` |
| `UPDATE … RETURNING view_count` / `quota_per, used` / `muted_until` | writes 581 · 715 · 822 | **MariaDB 는 UPDATE 에 RETURNING 이 없다.** UPDATE 뒤 SELECT 한 번 |
| `coalesce · least · greatest` | writes 549 등 | 그대로 |
| `WITH got AS (…)` | queries 224 | 그대로 (10.2+) |
| `BEGIN / COMMIT / ROLLBACK` | writes 3곳 | `conn.beginTransaction()` / `commit()` / `rollback()` — 풀에서 커넥션 하나를 꺼내 같은 커넥션으로 |
| `true / false` 리터럴 | 여러 곳 | 그대로 |

### 3. 같은 파라미터를 두 번 쓰는 쿼리

Postgres 는 `$3` 을 여러 번 써도 값은 하나다. `?` 는 자리마다 값이 필요하다. 해당 쿼리:
`posts()`(queries 85–87, `$3`·`$4`·`$6`), `search()`(147–151, 토큰마다 4번), `searchComments()`(164, 2번),
`ranking()`(226·242, `$2`). `namedPlaceholders: true` 로 `:at`, `:tok0` 처럼 이름을 쓰면 원문 구조를 그대로 둘 수 있다.

### 4. 시드 (`db/make-seed.js`)

`node db/make-seed.js --mariadb > db/seed.mariadb.sql` 로 MariaDB 판 시드를 만든다.
샘플 라운지의 데이터를 MariaDB 에서 그대로 본다. 이식 뒤 운영 데이터는 프드프 원본 표에서 오므로
시드는 개발 · 검증용이다.

### 5. 완전 이식 뒤에 지울 것

- `ext_*` 표 9개 → 프드프 원본 표(회원 · 강의 · 구매 · 시청 · 피드백권 · 라이브)를 직접 읽는다.
  읽는 SQL 은 `server/account.js` 한 파일에 있다. 그 파일의 SELECT 만 원본 표 이름으로 바꾼다.
- `server/index.js` 의 `viewer()` — 프드프 세션에서 사용자 id 를 꺼낸다. SSO 필요 없음.
- Supabase Storage(`server/storage.js`) → 프드프 스토리지.

## 검증 순서

1. `schema.mariadb.sql` + `mariadb-smoke.sql` 통과 (끝남)
2. `db.js` 교체 → `seed.mariadb.sql` 적재 → 서버 기동 → 커뮤니티 · 강의 · 랭킹 · 관리 5탭이 뜨는지
3. 글쓰기 · 댓글 · 반응 · 과제 제출 · 수정 · 삭제 · 피드백권 지급 · 정지 — 쓰기 경로 전부 한 번씩
4. 검색(한글 부분 일치), 커서 페이징(글 31편 이상), 게시 두 번 누름(client_key)
