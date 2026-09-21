# 프드프 개발자에게 — 라운지 연동 안내

라운지는 강의별 수강생 커뮤니티다. **별도 앱으로 이미 돌아가고 있고**(Node.js + PostgreSQL, Vercel),
이제 프드프와 붙이려 한다. 이 문서는 처음 보는 개발자가 30분 안에 전체를 파악하고, 무엇을 결정해야
하는지 알 수 있게 쓴 것이다.

## 1. 먼저 볼 것 (10분)

| 무엇 | 어디 | 왜 |
|---|---|---|
| 돌아가는 화면 | https://pudufu-lounge.vercel.app | 화면 명세 대신. 샘플 데이터, 로그인 없음 |
| 프드프와 주고받는 것 | [`API.md`](API.md) | **1부** 가 프드프에 요청하는 API 6개. 응답 모양까지 있음 |
| 화면에 안 보이는 규칙 | [`RULES.md`](RULES.md) | 권한 · 피드백권 · 정지/만료 · 카테고리. 이식 시 다시 짜야 하는 것 |
| DB | [`../db/schema.sql`](../db/schema.sql) · [`../db/schema.mariadb.sql`](../db/schema.mariadb.sql) | 표 23개. MariaDB 판은 13.0.2 에서 검증됨 |
| MariaDB 로 옮기기 | [`MIGRATION-MARIADB.md`](MIGRATION-MARIADB.md) | 남은 SQL 변환의 치환표 |
| 디자인 토큰 | [`../DESIGN.md`](../DESIGN.md) | 프드프 3.0 가이드 준수. 색 · 라운드 · 아이콘(Lucide) |

## 2. 구조 한 장

```
브라우저  lounge-web-prototype.html + web/assets/lounge.js (프레임워크 없음, 한 파일)
   │  window.LOUNGE_DATA (서버가 HTML 에 끼워 넣음) · /l/* JSON API
서버      server/index.js (라우터) → present.js (DB→화면 데이터) · writes.js (쓰기 + 권한)
   │                                 └ account.js ◀── 프드프를 아는 유일한 파일
DB        PostgreSQL (Supabase)  ·  파일은 Supabase Storage 로 브라우저가 직접 올림
```

- **프드프를 아는 코드는 `server/account.js` 하나다.** 계정 · 구매 · 시청기록 · 피드백권 · 강의를 여기서 받아 온다.
  `PUDUFU_MODE=local` 이면 `ext_*` 캐시 표를 읽고, `remote` 면 같은 함수가 프드프 API 를 부른다. 부르는 쪽은 그대로다.
- 권한 판정은 전부 서버(`writes.js`). 화면의 `can()` 은 무엇을 보여줄지만 정한다.
- 빌드 도구 없음. Tailwind 는 CSS 빌드에만 쓰고 결과물을 저장소에 넣는다.

## 3. 결정할 것 — 두 갈래

| | A. 별도 앱 + 연결 | B. 프드프 안으로 완전 이식 |
|---|---|---|
| 프드프 쪽 일 | API 6개 + SSO | 라운지를 프드프 스택으로 재작성 (`RULES.md` 가 원본) |
| DB | 라운지 Postgres 유지, 캐시 동기화 | MariaDB 하나. `schema.mariadb.sql` + `MIGRATION-MARIADB.md` |
| 배포 · 수정 | 라운지만 따로, 빠름 | 프드프 릴리스에 묶임 |
| 장애 격리 | 분리 | 한 몸 |
| 장기 | 두 시스템 | 하나 (정석) |

**제안**: A 로 먼저 열고, 안정되면 B 는 프드프 팀이 판단. `account.js` 경계 덕분에 B 로 갈 때 지울 것이 분명하다
(`ext_*` 표 9개 + `account.js` 의 SELECT 를 원본 표로).

### A 를 고르면 필요한 것

1. **SSO** — 프드프 로그인 세션을 라운지 도메인이 검증할 수 있게. 공유 도메인 쿠키든 서명 토큰(JWT)이든 프드프 쪽이 편한 방식.
   라운지에서는 `server/index.js` 의 `viewer(req)` 한 함수만 바뀐다 (지금은 개발용 고정 사용자).
2. **API 6개** — `API.md` 1부. 인증은 `X-Lounge-Key` 헤더 하나. 응답 형태는 문서 그대로.
3. **진입점** — 프드프 안에서 라운지로 가는 자리(강의실 버튼 또는 `lounge.pudufu.net`).
4. **운영 주체** — Vercel + Supabase 계정을 넘겨받을지, 자체 인프라로 옮길지.

### B 를 고르면 필요한 것

1. `schema.mariadb.sql` 적재 (끝남) → `db.js` 를 `mysql2` 로 → `queries.js` · `writes.js` SQL 변환 (`MIGRATION-MARIADB.md` 치환표, 2~3일)
2. `server/index.js` 라우트 30여 개를 프드프 프레임워크 규약으로
3. `ext_*` 표 대신 프드프 원본 표를 조인, `viewer()` 는 프드프 세션에서
4. 파일 보관(`storage.js`)을 프드프 스토리지로
5. 화면(`lounge.js` · CSS · 마크업)은 거의 그대로 — 프레임워크 의존이 없다

## 4. 알려 주면 좋은 것

- 프드프의 **프레임워크 · 언어**, **MariaDB 버전**(10.5 이상이면 `RETURNING` · `JSON_ARRAYAGG` 가 그대로 됨)
- 로그인 세션 방식(쿠키? 토큰?), 회원 · 구매 · 강의 표의 대략적 모양
- 스토리지(어디에 파일을 두는지), 배포 방식

## 5. 로컬에서 돌려 보기

```sh
npm install
cp .env.example .env         # DATABASE_URL 등. 값은 따로 전달
npm run db:reset             # 로컬 Postgres 에 스키마 + 시드
npm run dev                  # http://localhost:4000
DEV_USER_ID=26 npm run dev   # 관리자 시점
```

DB 없이도 뜬다 — `DATABASE_URL` 이 없으면 목업 데이터로 돈다. 프로토타입은 `lounge-web-prototype.html` 을 그냥 열면 된다
(상단 우측 역할 전환기로 수강생 · 강사 · 관리자 화면을 오갈 수 있다).

## 6. 이미 검증된 것

- 수강생 200명 · 글 150편 규모, 5폭(390~1280px) 반응형, 콘솔 에러 0
- 게시 두 번 눌러도 한 편(서버 15초 검사 + `client_key` 유니크), 내부 주소(SSRF) 차단, 비회원 잠금
- MariaDB 13.0.2: 스키마 23표 · 시드 · SQL 패턴 14종 스모크 통과

## 7. 소통

- 결정은 이 문서 4절의 답과 함께 `API.md` 맨 아래 **"정해진 것 / 아직 정하지 않은 것"** 에 적는다. 그 절이 합의서다.
- 응답 모양이 문서와 다르면 `API.md` 줄 번호로 짚어 알려 준다.
- `.env` 값(DB 주소 · 키)은 채팅으로 보내지 않는다.
