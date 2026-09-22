# 프드프 라운지 · API 계약

라운지는 **별도 서비스로 돌고** 계정·구매·시청 기록·강의만 프드프에서 받아 온다.
그래서 API 가 두 종류다.

| | 방향 | 누가 만드나 |
|---|---|---|
| **1부** | 라운지 → 프드프 | **프드프 개발자.** 이것만 해주면 나머지는 라운지가 만든다 |
| **2부** | 브라우저 → 라운지 | 라운지 |

---

## 1부 · 프드프에 요청하는 것

다섯 개뿐이다. 라운지 전체를 개발해 달라는 게 아니라 **이 다섯 개만** 열어주면 된다.

인증은 서버 간 호출이므로 공유 시크릿 헤더 하나로 충분하다.
`X-Lounge-Key: <시크릿>`

### ① SSO — 로그인

별도 도메인이라 쿠키가 안 넘어간다. 라운지에 로그인 안 된 사람이 오면 프드프로
보내고, 프드프가 확인해서 돌려보낸다.

```
GET  https://pudufu.net/sso/authorize?redirect_uri=<라운지 주소>&state=<임의값>
     → 로그인돼 있으면  <redirect_uri>?code=<일회용 코드>&state=<그대로>
     → 아니면 프드프 로그인 화면을 먼저 보여주고 끝나면 위와 같이

POST https://pudufu.net/sso/token
     { "code": "..." }
     → { "user_id": 1234, "nickname": "김선주", "expires_in": 3600 }
```

코드는 한 번만 쓰이고 1분 안에 만료되면 된다. 라운지는 받은 `user_id` 로
자기 세션을 만든다. **비밀번호는 라운지가 보지 않는다.**

> 프드프에 이미 OAuth 나 이와 비슷한 게 있으면 그걸 그대로 쓰면 된다.
> 위 모양은 없을 경우의 최소 형태다.

### ② 구매 — 기수와 만료일

```
GET  /api/lounge/purchases?user_id=1234
     → [ { "course_id": 1, "cohort": 3, "purchased_at": "...", "expires_at": "..." } ]
```

기수는 프드프가 판정해서 내려준다. 라운지는 그대로 표시만 한다.

### ③ 시청 기록 — 진도 · 이어보기 · 현재 섹션

```
GET  /api/lounge/watch?user_id=1234&course_id=1
     → [ { "lesson_id": 7, "watched_sec": 184, "is_complete": true, "watched_at": "..." } ]

GET  /api/lounge/watch?course_id=1&since=2026-09-01T00:00:00Z        (③b · 있으면 좋다)
     → [ { "user_id": 1234, "lesson_id": 7, "watched_sec": 184, "is_complete": true, "watched_at": "..." }, … ]
```

- `is_complete` = 끝까지 봤다(100%). 레슨 완료의 진실이다. 섹션 % = 완료 레슨 / 레슨.
- `watched_sec` = 어디까지 봤나. 이어보기와 레슨 안 진도 막대에 쓴다. 비율은 라운지가 `duration_sec` 으로 계산한다.
- `watched_at` = 마지막으로 본 시각. 가장 최근인 레슨이 '이어보기' 다.
- ③b 는 모든 멤버의 기록을 한 번에 받는 것 — 대시보드의 '지금 어느 섹션에 있나' 를 하루 한 번 맞추는 데 쓴다.
  없으면 라운지가 멤버마다 ③ 을 부른다(200명이면 200회 · 하루 한 번).

**시청 기록의 원본은 언제나 프드프다.** 라운지 뷰어에서 영상을 봐도 기록은
프드프로 간다(→ ⑥). 두 곳에 쌓이면 진도가 갈라지고, 현재 섹션이 시청 기록 기준이라
대시보드 전체가 틀어진다.

### ④ 피드백권 잔여

```
GET  /api/lounge/passes?user_id=1234&course_id=1
     → { "quota_per": 3, "period": "week", "period_start": "...", "used": 1 }
```

권의 소유와 지급은 프드프 소관이다. 라운지는 잔여를 읽고, 쓴 사실은 자기
`feedback_pass_use` 에 남긴다.

### ⑤ 강의 구조 — 섹션 · 레슨 · 영상 · 타임라인 · 교안

```
GET  /api/lounge/course/1
     → {
         "course_id": 1, "title": "...",
         "sections": [ { "id": 31, "seq": 3, "title": "3주차 · 블로그 100개 썼는데, 왜 문의는 0건일까요?" } ],
         "lessons": [
           { "id": 7, "section_id": 31, "seq": 1, "title": "...",
             "duration_sec": 260,
             "video_url": "https://customer-xxx.cloudflarestream.com/<uid>/iframe",
             "description": "0:00 인트로 · 1:26 키워드 · 2:53 정리 …",
             "timeline": [ { "t": 0, "label": "인트로" }, { "t": 86, "label": "키워드" } ],
             "doc": "교안 본문 …" }
         ]
       }
```

- 층은 **섹션 → 레슨**이다. 섹션이 강의 탭의 카드 하나, 레슨이 영상 하나(2~30분). 섹션 제목에 '3주차' 처럼 주차를 글자로 넣어도 된다.
- **레슨 id 는 바뀌지 않아야 한다.** 라운지의 과제 · 자료(`lesson_task` · `lesson_material`)가 이 id 를 가리킨다.
- `description` 은 레슨 설명. 화면에는 보이지 않고 통합 검색에만 쓴다. `timeline` 은 영상 아래 구간 목록(눌러 이동).
- 과제(미션 양식)는 여기 없다 — **라운지 관리자가 레슨에 붙인다.** 프드프는 강의 내용만 준다.
- 어느 섹션을 라운지에서 열지(게시/비공개)도 라운지가 정한다(`lounge_section`).

영상은 **Cloudflare Stream 의 허용 도메인 목록에 라운지 도메인을 추가**하면
그대로 재생된다. 라운지는 Stream SDK 로 시각 이동(타임라인)과 재생 시간을 받는다.

교안 본문과 설명이 통합 검색의 대상이므로 텍스트로 내려와야 한다.

### ⑥ 시청 기록 기록

라운지 뷰어에서 본 것을 프드프에 남긴다. ③의 짝이다. 라운지 플레이어가 15초마다 · 멈출 때 · 끝날 때 보낸다.

```
POST /api/lounge/watch
     { "user_id": 1234, "lesson_id": 7, "seconds": 184, "is_complete": false }
```

- `seconds` = 지금까지 본 가장 먼 위치(초). 프드프는 더 큰 값만 남긴다(뒤로 물러나지 않는다).
- `is_complete` 는 한 번 참이면 거두지 않는다.
- **열어 둘 질문**: 라운지가 Stream iframe 을 직접 넣으므로 재생 이벤트는 라운지 페이지만 본다. "프드프가 시청 시간을 잰다" 는 것은
  (a) 라운지가 여기로 보내 주는 값을 프드프가 저장하는 것, 또는 (b) 프드프가 자기 플레이어 페이지를 두고 라운지가 그것을 iframe 하는 것.
  라운지는 (a) 로 만들어져 있다. (b) 로 가려면 타임라인 시각 이동을 위한 postMessage 약속이 따로 필요하다.

없으면 라운지 뷰어에서 본 것이 진도에 안 잡힌다. **⑤를 열어줄 거면 ⑥도 같이
열어야 짝이 맞는다.**

---

## 2부 · 라운지 자체 API

브라우저가 라운지 서버에 거는 것. 화면 규칙은 프로토타입과
[개발 전달 문서](https://app.notion.com/p/3db863c5ee8f812fa9dae7247b6d379b) 5장에 있다.

### 규칙

- 응답은 JSON. 성공은 `200`, 권한 없음은 `403`, 없는 것은 `404`
- **권한은 서버가 판정한다.** 클라이언트의 `can()` 은 무엇을 보여줄지만 정한다.
  모든 쓰기 요청은 서버에서 다시 검사한다
- 시각은 `at`(ISO 8601)과 `when`("3일 전") 둘 다 내려준다. 클라이언트는 표시만 한다
- 삭제는 전부 소프트 삭제
- 작성자는 `user_id` 로 판정하고 `author_name` 으로 표시한다

### 읽기

```
GET  /l/{lounge}                      라운지 홈. 페이지 렌더 + 초기 데이터 주입
GET  /l/{lounge}/posts                피드
       ?category=&view=mine|reacted&sort=new|hot&cursor=
GET  /l/{lounge}/posts/{id}           글 상세 + 댓글
GET  /l/{lounge}/search?q=            글 · 댓글 · 강의 · 멤버 한 번에
GET  /l/{lounge}/course               강의 목록 (⑤의 캐시)
(강의 구조 · 과제 · 자료 · 내 시청 기록은 첫 화면 데이터(sections)에 실린다)
GET  /l/{lounge}/admin/dashboard      강사 · 관리자
GET  /l/{lounge}/admin/members        관리자
```

### 쓰기 — 만들어져 있다

```
POST   /l/posts                    { cat, title, body, taskId, mission[], attach, overwrite, key }
PATCH  /l/posts/{id}               본인 글만
DELETE /l/posts/{id}               이 라운지 관리자만
POST   /l/posts/{id}/comments      { body, parentId }   답글은 한 단계까지
DELETE /l/comments/{id}            본인 또는 관리자
PUT    /l/posts/{id}/reactions     { emoji }            토글
PUT    /l/posts/{id}/pinned        { pinned }           관리자. 최대 3개
POST   /l/posts/{id}/view          사람 단위로 한 번만 센다
PUT    /l/lessons/{id}/watch       { seconds, complete } 시청 위치 → 프드프(⑥). 15초마다 · 멈출 때 · 끝날 때
POST   /l/unfurl                   { url }              붙여넣은 주소를 카드로
POST   /l/uploads                  { type, size }       올려도 되는 주소를 받는다
POST   /l/posts/{id}/report        { reason }           남의 글만
PUT    /l/comments/{id}/reactions  { emoji }            토글
POST   /l/uploads                  이미지 → Supabase Storage (아직)
```

**권한은 `server/writes.js` 가 다시 판정한다.** 브라우저가 보내는 것은 무엇이든
거짓일 수 있으므로 클라이언트의 `can()` 을 믿지 않는다. 실제로 수강생 계정으로
`DELETE /l/posts/1` 을 부르면 `403 관리자만 지울 수 있습니다` 가 온다.

검사하는 것:

| | 규칙 |
|---|---|
| 멤버 | 이 라운지의 `lounge_member` 여야 한다 |
| 카테고리 | 이 라운지에 **놓여 있어야** 한다. 미사용 카테고리는 아무도 못 쓴다 |
| 역할 | `lounge_category` 의 쓰기 권한을 본다 |
| 만료 | 과제 제출과 피드백권 사용만 막고, 글·댓글·반응은 그대로 연다 |
| 피드백권 | 잔여를 프드프에서 읽고, 없으면 거절한다 |
| 답글 | 답글의 답글은 원댓글에 붙인다. 한 단계에서 멈춘다 |

### 랭킹

**받은 이모지만 센다.** 글을 몇 개 썼는지 · 댓글을 몇 개 달았는지는 보지 않는다.
많이 쓴 사람이 아니라 남에게 가닿은 사람이 위로 온다.

| 규칙 | |
|---|---|
| 세는 것 | 내 글과 내 댓글에 달린 반응 |
| 빼는 것 | 내가 내 글에 누른 것. 혼자 올릴 수 있으면 순위가 아니다 |
| 대상 | 수강생만. 강사 공지에 반응이 몰리면 순위가 뒤집힌다 |
| 동점 | 같은 등수로 본다 |
| 기간 | 7일 · 30일 · 전체 |

우측 레일의 `활동량 리더보드` 도 **같은 수**를 쓴다. 한 제품에 순위가 둘이면
어느 쪽을 믿어야 할지 알 수 없다.

### 클라이언트가 보내는 방식

```
글 · 과제 · 수정 · 삭제   서버가 받아 준 뒤에 화면에 반영한다
반응                      먼저 반영하고 실패하면 되돌린다 — 딸깍이 기다리면 딸깍이 아니다
```

실패는 조용히 지나가지 않는다. 화면 맨 위에 무엇이 안 됐는지 적고 새로고침을
권한다. 화면과 DB 가 어긋난 채로 두면 무엇이 사실인지 알 수 없게 된다.

### 글 옆 메뉴

수정 · 상단 고정 · 삭제는 **케밥 메뉴**(세로 점 셋) 안에 있다. 셋을 늘어놓으면
조작 버튼이 본문보다 먼저 눈에 든다. 자주 하는 일이 아니므로 한 겹 접는다.

| 항목 | 누구에게 |
|---|---|
| 수정 | 내 글 |
| 상단 고정 / 고정 해제 | 관리자 |
| 삭제 | 관리자 |

피드 카드와 글 상세가 **같은 메뉴**를 쓴다. 자리가 달라도 할 수 있는 일은 같아야 한다.

### 관리 — 만들어져 있다

이 라운지를 맡은 **관리자만**. 역할이 계정이 아니라 라운지에 붙으므로 옆 강의
관리자는 여기를 만지지 못한다.

```
PATCH  /l/admin/members/{userId}             { role }
POST   /l/admin/categories                   { name }
DELETE /l/admin/categories/{id}
PUT    /l/admin/categories/{id}/placement    { placement: show|more|off }
PUT    /l/admin/categories/{id}/rights       { student, instructor }
PUT    /l/admin/sections/{id}/published       { published }
POST   /l/admin/lessons/{id}/tasks            { title, qs[] }            레슨에 과제 붙이기
PATCH  /l/admin/tasks/{id}                    { title, qs[] }
DELETE /l/admin/tasks/{id}                                                제출 글이 있으면 거절
POST   /l/admin/lessons/{id}/materials        { kind: file|link, url, label }
DELETE /l/admin/materials/{id}
POST   /l/admin/sections                      { title }                  로컬(PUDUFU_MODE=local) 전용
POST   /l/admin/lessons                       { sectionId, title, duration, videoUrl, description, timeline[], doc }   로컬 전용
GET    /l/sync-sections                       관리자만. 시청 기록으로 '현재 섹션' 재계산(하루 한 번)
PATCH  /l/admin/categories/{id}                { name }        이름 변경
POST   /l/admin/members/{userId}/passes        { count }       피드백권 지급
PUT    /l/admin/members/{userId}/muted         { days, reason } 0 이면 해제
PUT    /l/admin/lounge                         { name, intro, banner }
GET    /l/admin/digest?date=                 어제 요약 (아직)
```

서버가 막는 것:

| | 규칙 |
|---|---|
| 마지막 관리자 | 내릴 수 없다. 내리면 아무도 이 라운지를 못 만진다 |
| 카테고리 이름 | 살아 있는 것끼리 중복 불가. `전체` 는 필터 바가 쓰는 이름이라 막는다 |
| 카테고리 삭제 | 기본 기능이 아니고 · 글이 없고 · 어느 라운지도 안 쓸 때만 |
| 기본 노출 | 7개까지. 칩 줄이 접히면 필터가 있다는 사실 자체가 안 보인다 |
| 관리자 쓰기 권한 | 칸을 두지 않는다. 관리자는 항상 쓸 수 있다 |

되돌리기가 필요한 자리가 하나 있다. **자기 자신을 내리려다 거절당하면** 화면
권한까지 같이 되돌려야 한다 — 안 그러면 서버는 거절했는데 관리 탭이 사라진
채로 남는다.

---

## 초기 데이터 주입

라운지는 서버 렌더 MPA 다. 첫 페이지는 **HTML 에 데이터를 같이 실어 보낸다.**

```html
<script>window.LOUNGE_DATA = { /* 서버가 채운다 */ };</script>
<script src="/assets/lounge.js"></script>
```

프로토타입은 같은 자리에 `data-mock.js` 를 놓는다. **`lounge.js` 는 둘 중
어느 쪽인지 알지 못한다** — 그래서 기능을 프로토타입에서 먼저 확인하고 그대로
앱에 쓸 수 있다.

`window.LOUNGE_DATA` 의 모양은 `web/assets/data-mock.js` 가 곧 명세다.

---

## 정해진 것

| 항목 | 결정 |
|---|---|
| 서버 | **Node.js.** 대시보드 집계와 어제 요약 생성 로직이 `lounge.js` 에 있으므로, 서버도 JS 면 같은 함수를 써서 화면과 cron 이 같은 숫자를 낸다 |
| DB | **PostgreSQL** (Supabase). 단 **관리형 Postgres + Storage 로만** 쓴다 |
| 쓰지 않는 것 | Supabase Auth · RLS · 클라이언트 직결. 셋 다 나중에 옮길 때 통째로 재작성 대상이 되고, 특히 클라이언트 직결은 `LOUNGE_DATA` 이음새를 깬다 |
| 이미지 | Supabase Storage |

## 아직 정하지 않은 것

| 항목 | 상태 |
|---|---|
| 알림 | 프드프에 체계가 없다. 1차 범위 밖 |
| 강퇴 | **두지 않는다.** 돈을 낸 사람을 쫓아낼 수는 없다. 대신 **활동 정지** — 읽기는 두고 쓰기만 멈추고, 기한(최대 90일)이 지나면 저절로 풀린다 |
| 내 서재 · 라운지 전환 | 만들 예정. 지금은 자리만 있다 |
| 프드프 → 라운지 변경 통지 | 지금은 라운지가 주기적으로 당겨 온다(pull). 웹훅은 나중에 |
| 시청 시간을 누가 재나 | 라운지 플레이어가 ⑥으로 보내는 것으로 만들어져 있다(위 ⑥). 프드프가 자기 플레이어로 재려면 (b) 로 바꿔야 한다 — 개발자 확인 필요 |
| ③b 전체 시청 기록 | 있으면 일일 동기화가 1회 호출. 없으면 멤버별 반복 |
