# 프드프 라운지

강의별 수강생 커뮤니티. 기획을 화면으로 옮긴 **프로토타입**과, 그것을 실제로 돌리는
**서버 · 스키마 · 시드 · API 계약**이 한 저장소에 있다. 빌드 도구는 쓰지 않는다.

- 라이브: https://pudufu-lounge.vercel.app (샘플 라운지, 개발용 고정 사용자)
- 프드프 개발자라면 [`docs/HANDOFF.md`](docs/HANDOFF.md) 부터

## 문서

| 문서 | 무엇 | 누가 읽나 |
|---|---|---|
| [`docs/HANDOFF.md`](docs/HANDOFF.md) | 프드프 연동 안내 — 구조 한 장, 연결 vs 이식, 결정할 것 | 프드프 개발자 (첫 문서) |
| [`docs/API.md`](docs/API.md) | 프드프에 요청하는 API 6개(1부) + 라운지 자체 API(2부). 맨 아래 "정해진 것 / 아직" 이 합의서 | 개발자 |
| [`docs/RULES.md`](docs/RULES.md) | 화면을 봐도 알 수 없는 동작 규칙 — 권한 · 피드백권 · 정지/만료 · 카테고리. 줄마다 코드 근거 | 개발자 · 운영 |
| [`docs/MIGRATION-MARIADB.md`](docs/MIGRATION-MARIADB.md) | 프드프 DB(MariaDB)로 옮길 때 남은 일. 패턴별 치환표 | 이식 담당 |
| [`DESIGN.md`](DESIGN.md) | 디자인 토큰. 프드프 3.0 디자인 가이드 준수판 | 디자인 · 프런트 |

## 파일

| 파일 | 내용 |
|---|---|
| `lounge-web-prototype.html` | **프로토타입이자 앱의 마크업.** 커뮤니티 · 강의 · 강의실 · 랭킹 · 관리. 하단에 스펙 시트(설계 이유) |
| `web/src/lounge.css` | 스타일 **원본**. Tailwind `@theme` 토큰 + 컴포넌트 |
| `web/assets/lounge.css` | 빌드 결과. **프로토타입과 앱이 같은 파일을 쓴다** |
| `web/assets/lounge.js` | 화면과 동작 전부. 〃 |
| `web/assets/data-mock.js` | 예시 데이터. 앱에서는 서버가 같은 모양으로 채운다 |
| `server/index.js` | 라우터. `viewer()` 가 로그인(아직 고정 사용자), `allowed()` 가 읽기 문 |
| `server/present.js` | DB 행 → `window.LOUNGE_DATA` |
| `server/writes.js` | 모든 쓰기와 **권한 판정**. `docs/RULES.md` 의 원본 |
| `server/queries.js` | SQL 전부. 흩어지면 DB 를 바꿀 때 찾아다녀야 한다 |
| `server/account.js` | **프드프와의 경계.** 프드프를 아는 유일한 파일 |
| `server/unfurl.js` | 본문 주소 → 링크 카드. 내부 주소(SSRF) 차단, 7초 상한 |
| `server/storage.js` | 파일 업로드 서명(Supabase Storage). 파일은 서버를 지나지 않는다 |
| `server/render.js` | 마크업에 서버 데이터를 끼우고, 자산 주소에 내용 해시를 붙인다 |
| `db/schema.sql` · `db/seed.sql` | PostgreSQL 스키마(표 24개) · 시드 |
| `db/migrate-2026-09-sections.sql` | 라이브 DB 를 주차 → 섹션 · 레슨 구조로 옮기는 마이그레이션 (한 번만) |
| `db/schema.mariadb.sql` · `db/seed.mariadb.sql` · `db/mariadb-smoke.sql` | MariaDB 판. 13.0.2 에서 검증 |
| `db/make-seed.js` | `data-mock.js` → 시드. `--mariadb` 로 MariaDB 판 |
| `lounge-prototype.html` | 460px 모바일 컬럼 선행 버전. 웹 버전으로 대체됨 |

## 프로토타입은 스테이징이다

기능을 바꿀 때는 **프로토타입에서 먼저 확인하고** 확정되면 배포한다. 서버 없이 파일만 열면
도니까 가장 싸게 볼 수 있다.

그러려면 두 벌이 되면 안 된다. 그래서 CSS 와 클라이언트 JS 는 **한 벌만** 두고 프로토타입과
앱이 같이 쓴다. 다른 것은 데이터가 어디서 오느냐뿐이다.

```
프로토타입   data-mock.js  →  window.LOUNGE_DATA  →  lounge.js
앱           서버           →  window.LOUNGE_DATA  →  lounge.js
```

`lounge.js` 는 둘 중 어느 쪽인지 알지 못한다. 프로토타입의 상단 우측 **역할 전환기**(수강생 · 강사 ·
관리자)는 데모 장치다. 앱에서 역할은 `lounge_member` 가 정하고 서버가 판정한다.

큰 변경 전에는 되돌릴 지점을 남긴다: `git tag savepoint/<주제>`. 롤백은 `git reset --hard savepoint/<주제>`.

```
open lounge-web-prototype.html          # file:// 로도 열린다
python3 -m http.server 4100             # 유튜브 임베드는 로컬 서버로
```

## 스타일 — Tailwind, 프드프 3.0 가이드

3.0 이 Tailwind 를 쓰므로 같은 어휘를 쓴다. 가이드의 토큰(색 · Radius 6단계 · Shadow · text 스케일 ·
Breakpoint 1024/768/480)을 `@theme` 에 등록했고, 아이콘은 Lucide 경로를 `icon()` 으로 인라인한다.
표는 [`DESIGN.md`](DESIGN.md).

`.post` `.chip` `.seg` 처럼 **이름이 있는 컴포넌트는 클래스로 둔다.** 컴포넌트 층에는 직접 hex ·
px 글자 크기 · 격자 밖 간격이 없어야 한다(`DESIGN.md` 0절의 grep 감사).

```
npm install
npm run css          한 번 빌드 (배포용은 --minify)
npm run css:watch    고칠 때마다
```

빌드 결과를 저장소에 같이 넣는다. 프로토타입이 스테이징이라 **파일만 열면 돈다**를 지켜야 하기
때문이다. 자산 주소에 내용 해시가 붙으므로(`lounge.css?v=…`) 배포 뒤 캐시 문제는 없다.
로컬에서 화면이 그대로면 강력 새로고침(`⌘⇧R`).

## DB

**PostgreSQL** 이다. 운영은 Supabase 를 쓰되 **관리형 Postgres + Storage 로만** 쓴다 — Auth · RLS ·
클라이언트 직결은 쓰지 않는다. 그래야 어디로든 옮길 수 있다(MariaDB 판이 이미 있다).

라운지는 둘이다. `LOUNGE_ID=1` 학원마케팅 올인원 강의 **(샘플)** — 기본값, 시연용 데이터.
`LOUNGE_ID=4` 학원마케팅 올인원 강의 — 실사용, 비어 있음. 카테고리 풀과 계정은 공유한다.

```
createdb lounge
npm run db:reset                 # 스키마 + 시드 (로컬)
npm run seed                     # data-mock.js 를 고쳤으면 시드 재생성
npm run seed:mariadb             # MariaDB 판 시드
```

### Supabase 연결

1. **New project** → 리전 `Northeast Asia (Seoul)`
2. **Project Settings → Database → Connection string** 두 가지

   | | 포트 | 쓰는 곳 |
   |---|---|---|
   | Direct connection | `5432` | 스키마 · 시드 적용 |
   | Transaction pooler | `6543` | **Vercel 앱 실행** |

3. `.env.example` → `.env`, **5432** 주소로 `npm run db:push`
4. Vercel 환경 변수에 **6543** 주소: `vercel env add DATABASE_URL production`

서버리스는 호출마다 인스턴스가 살았다 죽어서 직접 연결로는 한도에 닿는다. 풀러(6543)가 막아 준다.
마이그레이션은 트랜잭션이 길어 직접 연결(5432)을 쓴다.

시드는 불러오는 시점 기준 상대 시각이라 며칠 뒤에 넣어도 '어제 올라온 글'이 그대로 말이 된다.

### MariaDB (프드프 이식용)

```
mariadb lounge < db/schema.mariadb.sql
mariadb lounge < db/seed.mariadb.sql
mariadb lounge < db/mariadb-smoke.sql      # 마지막 줄 SMOKE OK
```

스키마 · 시드 · 스모크까지 검증됐다. 남은 것은 SQL 변환 — [`docs/MIGRATION-MARIADB.md`](docs/MIGRATION-MARIADB.md).

## 서버

```
npm install
npm run dev                     http://localhost:4000
DEV_USER_ID=26 npm run dev      관리자 시점
LOUNGE_ID=4 npm run dev         실사용 라운지
```

프레임워크를 쓰지 않는다. 서버가 하는 일이 셋뿐이다 — 로그인 확인, DB 에서 화면 데이터 만들기,
쓰기 받기. 렌더는 `lounge.js` 가 브라우저에서 한다.

- **DB 주소가 없으면 데모로 돈다.** 목업을 내려주고 쓰기는 받지 않는다.
- 첫 화면은 글 30편 + 고정 글. 다음 묶음은 `/l/posts?at&id`, 검색은 `/l/search`(서버), 글 하나는 `/l/posts/:id`.
- 강의는 **섹션 → 레슨**(프드프 구조 그대로). 진도는 시청에서 나오고, 과제 · 자료는 관리자가 레슨에 붙인다(`docs/RULES.md` 3절).
  라이브 DB 를 이 구조로 옮기는 파일은 `db/migrate-2026-09-sections.sql` — `db:push` 는 데이터를 지우므로 라이브에 쓰지 않는다.
- 쓰기는 `server/writes.js` 가 권한을 **다시** 판정한다. 화면의 `can()` 은 무엇을 보여줄지만 정한다.
- 게시 두 번 눌러도 한 편: 15초 안 같은 글 검사 + 화면이 붙이는 `client_key` 유니크.
- 본문 주소는 `http://` 없이도 카드가 된다. 쓰는 동안 미리 보이고, 게시 뒤 `/l/posts/:id/card` 가 따로 편다 —
  남의 서버가 느려도 게시가 기다리지 않는다. 내부 주소는 카드를 만들지 않는다.
- 뒤로가기는 라운지 안에서 움직인다 — 탭 · 강의실(섹션 · 레슨 · 과제) · 열린 글이 주소(`?t=` `?s=` `?l=` `?k=` `?p=`)에 남는다.
- **로그인은 아직 개발용 고정 사용자다.** SSO 가 붙으면 `server/index.js` 의 `viewer()` 한 곳만 바뀐다.

## 파일 보관

Supabase Storage `lounge` 버킷 — 사진 10MB · 영상 50MB(mp4 · webm · mov) · PDF, 글 하나에 10개.
**파일은 서버를 통과하지 않는다** — 서버가 서명된 주소만 내주고 브라우저가 바로 올린다.
`.env` 의 `SUPABASE_SERVICE_KEY` 는 서버에만 둔다. 브라우저로 내려보내면 누구나 남의 파일을 지울 수 있다.

## 배포

```
git push                        # 저장소
vercel --prod --yes             # 라이브
```

배포 뒤 `curl -s https://pudufu-lounge.vercel.app/ | grep -o 'lounge.js?v=[0-9a-f]*'` 가 로컬
`md5 -q web/assets/lounge.js | cut -c1-8` 과 같으면 새 자산이 나가고 있는 것이다.

## 어디에 만드나

라운지는 **프드프와 별도 서비스**로 돈다. 계정 · 구매 · 시청 기록 · 강의 · 피드백권만 프드프에서
받아 오고 나머지는 전부 라운지가 갖는다(`docs/RULES.md` 9절). 그래서 프드프 개발자에게 요청할 것은
**API 6개 + 로그인**이다(`docs/API.md` 1부). 프드프 안으로 완전히 이식하는 길도 열어 두었다 —
프드프를 아는 코드가 `account.js` 한 파일이라 지울 곳이 분명하다. 둘의 비교는 `docs/HANDOFF.md` 3절.

## 기획 출처

노션 `Skool.com 에서 프드프로 가져올만한 자산`. 커뮤니티 본질 정의부터 P1 여덟 항목까지.
프로토타입 하단 스펙 시트에 P1 항목과 화면 요소의 대응표, 그리고 설계 판단 11개의 이유가 있다.

핵심은 **게시판을 필터로 대체**하는 것이다. 현재 라운지 좌측 사이드바의 게시판을 없애고,
카테고리 · 보기 · 회차 · 정렬을 동시에 걸 수 있는 필터 칩으로 옮겼다. 화면 전환이 사라지고 조합이 생긴다.

## 세 시점

| 역할 | 보이는 것 |
|---|---|
| 수강생 | 커뮤니티 · 강의 · 랭킹. 글쓰기 창에 공지 · 챌린지 없음 |
| 강사 | + 관리 탭의 대시보드 (피드백 요청 · 오늘 챙길 사람 · 어제 올라온 글) |
| 관리자 | + 강의 · 과제(섹션 게시 · 레슨별 과제 · 자료) · 수강생 관리(역할 · 피드백권 · 정지) · 필터 관리 · 게시물 관리 · 어제 요약 복사 |

역할은 **계정이 아니라 라운지에** 붙는다. 멤버 정보(닉네임 · 기수 · 만료)는 프드프 것을 그대로 따르고
라운지에서 고치지 않는다. 강퇴는 없다 — 돈을 낸 사람을 쫓아낼 수는 없다. 대신 **활동 정지**(읽기는 두고
쓰기만, 최대 90일, 자동 해제).

`어제 커뮤니티 요약`은 카카오가 봇 연결을 막아 자동 발송이 안 되므로, 문장을 만들어 두고 관리자가
`복사`해서 오픈채팅방에 붙여넣는다.

## 주의

Noto Sans KR 은 Google Fonts 에서 받는다. CSP 로 외부 스타일시트를 막는 환경에서는 폴백으로 떨어진다.
샘플 라운지의 이름과 수치는 전부 예시 데이터다.
