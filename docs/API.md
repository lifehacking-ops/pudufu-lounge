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

### ③ 시청 기록 — 주차 계산용

```
GET  /api/lounge/watch?user_id=1234&course_id=1
     → [ { "lesson_id": 7, "watched_at": "...", "is_complete": true } ]
```

**시청 기록의 원본은 언제나 프드프다.** 라운지 뷰어에서 영상을 봐도 기록은
프드프로 간다(→ ⑥). 두 곳에 쌓이면 진도가 갈라지고, 주차가 시청 기록 기준이라
대시보드 전체가 틀어진다.

### ④ 피드백권 잔여

```
GET  /api/lounge/passes?user_id=1234&course_id=1
     → { "quota_per": 3, "period": "week", "period_start": "...", "used": 1 }
```

권의 소유와 지급은 프드프 소관이다. 라운지는 잔여를 읽고, 쓴 사실은 자기
`feedback_pass_use` 에 남긴다.

### ⑤ 강의 구조 — 주차 · 강 · 영상 · 교안

```
GET  /api/lounge/course/1
     → {
         "course_id": 1, "title": "...", "weeks": 8,
         "lessons": [
           { "id": 7, "week": 3, "seq": 1, "chapter": "콘텐츠 5기둥",
             "title": "...", "duration": "4:20",
             "video_url": "https://customer-xxx.cloudflarestream.com/<uid>/iframe",
             "doc": "교안 본문 …" }
         ],
         "missions": [
           { "week": 3, "title": "3주차 미션 · …", "seq": 1,
             "question": "…", "hint": "…" }
         ]
       }
```

영상은 **Cloudflare Stream 의 허용 도메인 목록에 라운지 도메인을 추가**하면
그대로 재생된다. 별도 처리가 필요 없다.

교안 본문이 통합 검색의 대상이므로 텍스트로 내려와야 한다.

### ⑥ 시청 기록 기록 (선택)

라운지 뷰어에서 본 것을 프드프에 남긴다. ③의 짝이다.

```
POST /api/lounge/watch
     { "user_id": 1234, "lesson_id": 7, "is_complete": true }
```

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
GET  /l/{lounge}/course/{week}        주차 상세 + 미션 양식 + 내 제출 여부
GET  /l/{lounge}/admin/dashboard      강사 · 관리자
GET  /l/{lounge}/admin/members        관리자
```

### 쓰기

```
POST   /l/{lounge}/posts              { category_id, title, body, week, answers[], attachments[] }
PATCH  /l/{lounge}/posts/{id}         본인 글
DELETE /l/{lounge}/posts/{id}         관리자
POST   /l/{lounge}/posts/{id}/comments    { body, parent_id }
DELETE /l/{lounge}/comments/{id}
PUT    /l/{lounge}/posts/{id}/reactions   { emoji }      토글
POST   /l/{lounge}/uploads                이미지 → Supabase Storage
```

### 관리

```
PATCH  /l/{lounge}/admin/members/{user_id}     { role }
PUT    /l/{lounge}/admin/categories            배치와 쓰기 권한 한 번에
POST   /l/{lounge}/admin/categories            { name }
DELETE /l/{lounge}/admin/categories/{id}       미사용 + 글 0건일 때만
GET    /l/{lounge}/admin/digest?date=          어제 요약
```

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
| 프드프 → 라운지 변경 통지 | 지금은 라운지가 주기적으로 당겨 온다(pull). 웹훅은 나중에 |
