# 프드프 디자인 시스템 — 라운지 적용판

기준은 **프드프 3.0 디자인 시스템 가이드**(`design-guide.png`, 2026-09). 처음(2026-09-14)에는
`pudufu.net` 에서 추출한 값으로 시작했고, 2026-09-17 에 가이드 기준으로 전수 대조해 맞췄다.
색은 거의 같았고, 그 밖의 축(Radius · Shadow · Z-index · Breakpoint · 아이콘 · 배지 모양)을 고쳤다.

> 한 줄 요약 — Tailwind 기본 그레이 스케일 위에 브랜드 블루 하나. 그림자는 거의 없고
> 면은 흰색, 구분은 1px 회색 선. 서체 하나. 아이콘은 Lucide, 배지는 사각 8px.

---

## 0. 코드에서는

토큰은 `web/src/lounge.css` 의 `@theme` 에 Tailwind 이름으로 등록돼 있다. 값은 거기 한 곳에만
있고, 기존 CSS 가 쓰는 짧은 이름(`var(--brand)`)은 `:root` 별칭으로 잇는다.

| 가이드 | 코드 (`@theme`) | 별칭 (`:root`) | 유틸리티 |
|---|---|---|---|
| primary | `--color-brand` | `--brand` | `bg-brand` `text-brand` |
| primary-hover | `--color-brand-hover` | `--brand-hover` | |
| primary-light | `--color-brand-tint` | `--brand-tint` | |
| primary-lighter | `--color-brand-lighter` | `--brand-lighter` | |
| gray-900 … gray-50 | `--color-ink` `--color-strong` `--color-slate` `--color-mist` `--color-edge` `--color-line` `--color-hair`/`--color-cloud` `--color-canvas` | 같은 이름에서 `color-` 를 뗀 것 | |
| radius xs~full | `--radius-xs` `-sm` `-md` `-lg` `-xl` `-full` | `--radius-ctl`=sm · `--radius-card`=md · `--radius-chip`=full | `rounded-md` |
| shadow | `--shadow-sm` `-card` `-card-hover` `-lg` `-xl` | `--shadow-pop`=lg | `shadow-card` |
| text 스케일 | `--text-2xs` … `--text-4xl` | 확장 `--text-11` `-13` `-15` `-17` `-19` `-22` `-26` | |
| spacing 격자 밖 | — | `--sp-5` `-6` `-7` `-9` `-10` `-11` `-13` `-14` `-18` | |
| transition | — | `--transition-fast` 150ms · `-normal` 200ms · `-slow` 300ms | |
| breakpoint | `--breakpoint-tablet` 1024 · `-mobile` 768 · `-mobile-sm` 480 | | |

**규칙** — 컴포넌트 층(`@layer components`)에는 직접 hex · rgba · px 글자 크기 · 격자 밖 간격이
없어야 한다. 새 규칙은 토큰만 쓰고, 격자 밖 값이 꼭 필요하면 위 확장 토큰에 이유와 함께 추가한다.
감사는 `grep` 으로 한다: `font-size: [0-9]` 0건, `#fff`/`rgba(` 0건, `@media` 는 1024/768/480 만.

---

## 1. 컬러

### 브랜드

| 토큰 | 값 | 쓰임 |
|---|---|---|
| `--brand` | `#1F5AF2` | 주요 버튼, 활성 내비, 링크, 포커스 · 선택 테두리 |
| `--brand-hover` | `#1648D8` | 주요 버튼 hover |
| `--brand-tint` | `#EAF2FF` | 아바타 면, 선택 면, 정보 배지, 비활성 주요 버튼 면 |
| `--brand-lighter` | `#EFF6FF` | 고정 글 배경처럼 더 옅은 면 |

블루는 **하나뿐이고 진한 면으로는 거의 쓰지 않는다.** 대부분은 연한 면에 블루 글자다.

### 중성 — Tailwind gray 그대로

| 토큰 | 값 | Tailwind | 쓰임 |
|---|---|---|---|
| `--ink` | `#111827` | gray-900 | 제목 · 본문 |
| `--strong` | `#374151` | gray-700 | 본문 강조 |
| `--slate` | `#6B7280` | gray-500 | 보조 텍스트. **가장 많이 쓰인다** |
| `--mist` | `#9CA3AF` | gray-400 | 메타 · 플레이스홀더 · 아이콘 |
| `--edge` | `#D1D5DB` | gray-300 | 버튼 테두리 |
| `--line` | `#E5E7EB` | gray-200 | 구분선 |
| `--hair` `--cloud` | `#F3F4F6` | gray-100 | 카드 테두리 · 입력 배경 · 말풍선 · 트랙 |
| `--canvas` | `#F9FAFB` | gray-50 | 페이지 배경 · hover 면 |
| `--surface` | `#FFFFFF` | — | 카드 면 |

gray-600(`#4B5563`)은 가이드가 비표준으로 못 박아 쓰지 않는다. 반투명이 필요하면
`color-mix(in srgb, var(--ink) 45%, transparent)` 처럼 토큰에서 섞는다 — rgba 리터럴을 새로 적지 않는다.

### 의미색 — 연한 면 + 진한 글자 쌍

| 의미 | 글자 | 면 | hover |
|---|---|---|---|
| 경고 · 지각 (`--late`) | `#D97706` | `#FFFBEB` | |
| 완료 · 정시 (`--ok`) | `#16A34A` | `#F0FDF4` | |
| 에러 · 지우기 (`--danger`) | `#EF4444` | `#FEF2F2` | `#DC2626` |

의미색은 **항상 연한 면 + 같은 계열 진한 글자 쌍**으로 쓰고 테두리를 두르지 않는다.
확인 상자 `.gate` 는 `data-tone="error|info|ok"` 로 성격을 나눈다(기본은 경고).

---

## 2. 타이포그래피

- 서체 하나 : **Noto Sans KR**, 폴백 `-apple-system, system-ui, "Segoe UI"`
- 굵기는 400 · 500 · 600 · 700 네 단계
- 자간 조정 없음

가이드 스케일은 10 · 12 · 14 · 16 · 18 · 20 · 24 · 30 · 36 (`--text-2xs` … `--text-4xl`).
라운지는 목록 밀도를 지키기 위해 **확장 토큰 일곱 개**를 더 쓴다. 값은 `lounge.css` `:root` 에 이유와 함께 있다.

| 역할 | 토큰 | 크기 / 굵기 |
|---|---|---|
| 페이지 타이틀 · 관리 제목 | `--text-22` | 22 / 700 |
| 게시물 상세 제목 | `--text-xl` | 20 / 700 |
| 게시물 제목 | `--text-lg` | 18 / 700 |
| 카드 제목 | `--text-15` | 15 / 700 |
| 본문 · 입력 | `--text-sm` | 14 / 400 |
| 보조 · 칩 · 댓글 | `--text-13` | 13 / 400~600 |
| 메타 · 배지 | `--text-xs` | 12 / 400~600 |
| kicker · 표 머리 | `--text-11` | 11 / 600 |
| 아주 작은 표시 | `--text-2xs` | 10 / 600 |

직접 `px` 는 컴포넌트 층에 없다. 엄격안으로 갈 때는 확장 토큰 값만 바꾸면 된다.

---

## 3. 라운드 (6단계)

| 토큰 | 값 | 쓰임 |
|---|---|---|
| `--radius-xs` | 4px | 체크 상자, 코드, 검색 강조, 케밥 단추 |
| `--radius-sm` | 8px | 입력, 작은 컨트롤, **배지**, 뷰어 이미지 |
| `--radius-md` | 12px | **카드**, 버튼, 드롭다운, 말풍선, 댓글 입력 |
| `--radius-lg` | 16px | 배너 등 큰 면 (예약) |
| `--radius-xl` | 24px | **모달** |
| `--radius-full` | 9999px | 칩, 아바타, 반응, 세그먼트 |

진도 막대의 `2px` 는 가이드가 허용한 예외로 그대로 둔다.

---

## 4. 그림자 (6단계)

카드의 경계는 **1px `--hair` 테두리**가 맡고, 그림자는 떠 있는 것에만 붙는다.

| 토큰 | 값 | 쓰임 |
|---|---|---|
| `--shadow-sm` | `0 1px 2px rgb(0 0 0/.05)` | |
| `--shadow-card` | `0 1px 3px rgb(0 0 0/.06)` | 카드 기본 |
| `--shadow-card-hover` | `0 4px 8px rgb(0 0 0/.10)` | 카드 hover, 사진 줄 화살표 |
| `--shadow-lg` | `0 4px 16px rgb(0 0 0/.10)` | 드롭다운 · 케밥 메뉴 |
| `--shadow-xl` | `0 20px 60px rgb(0 0 0/.15)` | 모달 |

---

## 5. Z-index 계층

| 층 | 값 | 라운지 |
|---|---|---|
| 페이지 안 sticky | 1~10 | 필터바 10, 상세 머리 2 |
| 드롭다운 | 20 | 라운지 메뉴, 카테고리 고르개, 케밥 메뉴, '복사됨' 쪽지 |
| 고정 헤더 | 100 (+10) | 탭 100, 상단바 110 |
| 모달 | 400 (+10) | 게시물 상세 400, 확대 뷰어 410 |

필터바를 드롭다운(20) 아래(10)에 두는 이유 — 글쓰기 창의 카테고리 메뉴가 그 위로 열려야 한다.

---

## 6. 브레이크포인트 · 간격

`max-width` 셋만 쓴다: **1024**(태블릿, 한 열) · **768**(모바일, 상단바 접기 · 카드 1열) · **480**(작은 모바일).

간격은 4px 격자(4 · 8 · 12 · 16 · 20 · 24 · 32 · 48 · 64). 격자 밖 값은 `--sp-*` 확장 토큰으로만 쓴다.
전환은 `--transition-fast/normal/slow`(150 · 200 · 300ms).

---

## 7. 컴포넌트

### 버튼

| 종류 | 규칙 |
|---|---|
| 주요 `.btn-primary` | `--brand` 면, 흰 글자, **12px**, hover `--brand-hover`, 비활성 `--brand-tint` 면 + `--mist` 글자 |
| 외곽 `.btn-sec` | 흰 면, 1px `--edge`, 12px, hover `--canvas` 면 |
| 유령 `.btn-ghost` | 글자만 |

### 배지 `.badge`

**사각 8px** · 12/600 · 패딩 `2px 8px` · 테두리 없음. 색 쌍은 `.b-ontime` `.b-late` `.b-live` `.b-none` `.b-pin`.
알약(`--radius-full`)은 칩 · 아바타 · 반응 · 세그먼트에만.

### 입력

`--radius-sm` 8px. 회색 면(`--cloud`) 또는 흰 면 + 1px 테두리, 포커스에 `--brand` 테두리.
댓글 입력만 말풍선과 짝이라 12px.

### 카드

흰 면 · 12px · 1px `--hair` · 패딩 20px · hover 시 `--shadow-card-hover`.

### 아이콘

Lucide 경로를 `lounge.js` 의 `icon(name, size)` 로 인라인한다(라이브러리 없음). 선 2, `currentColor`,
`aria-hidden`; 뜻은 감싸는 버튼의 `aria-label` 이 말한다. 재생 아이콘만 채운 삼각형.

---

## 8. 가져오지 않은 것 — 현재 라운지의 정보구조

`/community` 는 좌측에 게시판 목록을 두고, 글쓰기는 화면 하단 고정 바에 있다. 이것은 기획 7장이
**문제로 지목한 구조**다. 그래서 라운지는 **시각 언어만 가져오고 정보구조는 기획안을 따른다.**

| 축 | pudufu.net | 라운지 |
|---|---|---|
| 색 · 서체 · 라운드 · 그림자 | 3.0 가이드 | 〃 |
| 게시판 사이드바 | 좌측에 4개 | 없음. 필터 칩으로 대체 |
| 글쓰기 위치 | 하단 고정 바 | 피드 최상단, 도착 즉시 |
| 라운지 범위 | 전 강의가 하나에 섞임 | 강의별로 분리, 상단 토글로 전환 |
