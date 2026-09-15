/* 프드프 라운지 · 예시 데이터 (프로토타입 전용)
 *
 * 서버 없이 화면을 돌리기 위한 목업이다. 앱에서는 서버가 같은 모양으로
 * window.LOUNGE_DATA 를 채운다.
 *
 * db/make-seed.js 가 이 파일이 아니라 lounge-web-prototype.html 을 읽던 것을
 * 이제 여기서 읽는다. 데이터를 고치면 seed.sql 을 다시 만들어야 한다:
 *
 *     node db/make-seed.js > db/seed.sql
 *
 * 사람 이름과 수치는 전부 예시다.
 */

window.LOUNGE_DATA = {
  members: [
    { name: "김선주", cohort: 3, role: "student", wk: 3, lastDays: 0, joined: 19, first: 2, paid: true },
    { name: "정해린", cohort: 3, role: "student", wk: 3, lastDays: 0, joined: 19, first: 3, paid: true },
    { name: "오승민", cohort: 2, role: "student", wk: 5, lastDays: 1, joined: 33, first: 1, paid: true },
    { name: "한지수", cohort: 3, role: "student", wk: 3, lastDays: 0, joined: 18, first: 4, paid: true },
    { name: "최은영", cohort: 2, role: "student", wk: 4, lastDays: 2, joined: 28, first: 6, paid: true },
    { name: "박민경", cohort: 3, role: "student", wk: 2, lastDays: 1, joined: 13, first: 5, paid: true },
    { name: "박현종", cohort: 3, role: "student", wk: 3, lastDays: 0, joined: 19, first: 3, paid: true },
    { name: "윤서진", cohort: 3, role: "student", wk: 3, lastDays: 1, joined: 18, first: 2, paid: true },
    { name: "장미래", cohort: 3, role: "student", wk: 2, lastDays: 3, joined: 12, first: 8, paid: true },
    { name: "임도현", cohort: 2, role: "student", wk: 5, lastDays: 2, joined: 34, first: 2, paid: true },
    { name: "송가은", cohort: 3, role: "student", wk: 1, lastDays: 9, joined: 11, first: null, paid: true },
    { name: "신우철", cohort: 2, role: "student", wk: 4, lastDays: 1, joined: 27, first: 4, paid: true },
    { name: "강예린", cohort: 3, role: "student", wk: 3, lastDays: 0, joined: 18, first: 1, paid: true },
    { name: "홍수민", cohort: 3, role: "student", wk: 2, lastDays: 4, joined: 13, first: 7, paid: true },
    { name: "배성호", cohort: 2, role: "student", wk: 6, lastDays: 1, joined: 40, first: 1, paid: true },
    { name: "노아름", cohort: 3, role: "student", wk: 3, lastDays: 2, joined: 19, first: 3, paid: true },
    { name: "권태윤", cohort: 3, role: "student", wk: 2, lastDays: 11, joined: 14, first: 9, paid: true },
    { name: "문지호", cohort: 2, role: "student", wk: 4, lastDays: 3, joined: 29, first: 5, paid: true },
    { name: "조은비", cohort: 3, role: "student", wk: 1, lastDays: 14, joined: 15, first: null, paid: true },
    { name: "서다인", cohort: 3, role: "student", wk: 3, lastDays: 1, joined: 18, first: 2, paid: true },
    { name: "황준서", cohort: 2, role: "student", wk: 5, lastDays: 0, joined: 33, first: 3, paid: true },
    { name: "양소희", cohort: 3, role: "student", wk: 2, lastDays: 8, joined: 12, first: 6, paid: true },

    // 어제 들어온 두 사람. 요약 첫 줄의 'n명이 새로 입장했어요'가 여기서 나온다
    { name: "구민재", cohort: 3, role: "student", wk: 1, lastDays: 0, joined: 1, first: null, paid: true },
    { name: "천유나", cohort: 3, role: "student", wk: 1, lastDays: 0, joined: 1, first: null, paid: true },

    { name: "김경원", cohort: 0, role: "instructor", wk: 8, lastDays: 0, joined: 120, first: null, paid: false, lounges: ["academy"] },
    { name: "프드프 관리자", cohort: 0, role: "admin", wk: 8, lastDays: 0, joined: 400, first: null, paid: false, lounges: ["academy", "ai", "ebook"] }
  ],

  posts: [
    { cat: "공지", wk: 0, author: "프드프 관리자", when: "1개월 전", likes: 48, comments: 12, views: 1204, mine: false, liked: false, pinned: true,
      title: "이번 달 명예의 전당에 오른 결과물",
      body: "강사님이 고른 결과물을 이 글 하나에 계속 쌓습니다. 별도 메뉴 없이 최상단 고정." },

    { cat: "과제", wk: 3, author: "김선주", when: "2시간 전", likes: 9, views: 61, mine: false, liked: true,
      reactions: { "🔥": 2 },
      attach: { type: "image", label: "블로그 글 캡처 · 중계동 학부모님이 가장 많이 하신 질문" },
      title: "3주차 과제 올립니다. 학부모가 검색하는 말로 제목을 바꿔봤어요",
      mission: [
        { q: "주인공 학부모가 밤에 검색하는 말 세 개를 적으세요.", a: "중계동 수학학원 / 수포자 학원 / 중2 수학 포기" },
        { q: "학부모가 상담에서 차마 못 묻는 걱정은 무엇인가요?", a: "우리 애만 진도를 못 따라가서 창피당하면 어쩌나. 이걸 대놓고 물어본 학부모는 12년 동안 한 분도 없었습니다." },
        { q: "그 걱정에 먼저 답하는 글의 제목을 지어보세요.", a: "\"우리 애만 못 따라가면 어쩌죠\" — 중계동 학부모님이 가장 많이 하신 질문" }
      ],
      thread: [
        { author: "정해린", when: "1시간 전", text: "제목만 바꿨는데 조회수가 달라지나요? 저는 학원 소식만 올리고 있었네요.", up: 3, replies: [
          { author: "김선주", at: "정해린", when: "50분 전", text: "소식은 아무도 검색을 안 하더라고요. 학부모가 실제로 치는 말로 바꾸니 유입이 붙었습니다.", up: 4, replies: [] },
          { author: "오승민", at: "정해린", when: "40분 전", text: "저도 같은 실수였습니다. 공지 글만 100개였어요.", up: 2, replies: [] },
          { author: "한지수", at: "정해린", when: "35분 전", text: "고민 키워드가 진짜 세더라고요. 수포자로 하나 썼더니 바로 문의 왔습니다.", up: 5, replies: [] },
          { author: "최은영", at: "정해린", when: "20분 전", text: "저희도 이번 주에 바꿔보려고요.", up: 1, replies: [] }
        ] },
        { author: "박민경", when: "30분 전", text: "세 번째 문장이 제일 좋네요. 그대로 따라 쓰고 싶습니다.", up: 0, replies: [] },
        { author: "김경원", when: "어제", staff: true, text: "세 번째 제목, 학부모가 실제로 쓴 말을 그대로 가져온 게 좋습니다. 다만 지역명이 빠졌어요. 중계동을 앞에 붙이면 검색으로도 잡힙니다.", up: 7, replies: [] }
      ] },

    { cat: "콘텐츠 피드백", wk: 3, author: "정해린", when: "4시간 전", likes: 3, views: 44, mine: false, liked: false,
      attach: { type: "link", url: "blog.naver.com/mathplan/223...", title: "중계동 수학학원 — 우리 아이가 수학을 포기한 진짜 이유" },
      title: "블로그 글 제목이 아직 밋밋한 것 같은데 봐주세요",
      body: "고민 키워드를 넣긴 했는데 학부모가 클릭할 만한 제목인지 모르겠습니다.",
      thread: [
        { author: "김선주", when: "3시간 전", text: "진짜 이유 대신 학부모가 쓰는 말을 그대로 넣어보세요. 상담에서 들은 문장이 제일 잘 먹힙니다.", up: 5, replies: [] },
        { author: "김경원", when: "어제", staff: true, text: "제목은 이 정도면 됩니다. 그보다 첫 문단이 학원 소개로 시작해요. 학부모 걱정 한 줄로 바꿔보세요.", up: 4, replies: [] }
      ] },

    { cat: "과제", wk: 3, author: "박현종", when: "6시간 전", likes: 5, views: 38, mine: true, liked: false,
      title: "3주차 과제 늦었지만 올립니다",
      mission: [
        { q: "주인공 학부모가 밤에 검색하는 말 세 개를 적으세요.", a: "상계동 영어학원 / 초등 영어 늦었나 / 파닉스 다시" },
        { q: "학부모가 상담에서 차마 못 묻는 걱정은 무엇인가요?", a: "지금 시작하면 너무 늦은 거 아닌가요. 이 말을 꺼내기 미안해하시더라고요." },
        { q: "그 걱정에 먼저 답하는 글의 제목을 지어보세요.", a: "초등 4학년에 파닉스 다시 시작해도 되나요 — 늦었다고 생각하는 학부모님께" }
      ],
      thread: [] },

    { cat: "공지", wk: 0, author: "프드프 관리자", when: "어제", likes: 14, comments: 1, views: 210, mine: false, liked: true,
      title: "4주차는 수요일 10시에 열립니다",
      body: "이번 주차부터 교안이 강의 아래에 같이 올라갑니다. 검색으로 바로 찾을 수 있습니다." },

    { cat: "등록 인증", wk: 2, author: "오승민", when: "어제", likes: 22, comments: 9, views: 187, mine: false, liked: true,
      reactions: { "🔥": 6, "👏": 3, "GIF": 1 },
      attach: { type: "youtube", url: "https://www.youtube.com/watch?v=d3RNpwbWaJU", title: "플레이스 세팅 전후 비교 화면" },
      title: "플레이스만 고쳤는데 이번 주 문의가 4건 들어왔습니다",
      body: "사진 순서를 공간·수업·아이들로 바꾸고 소개글을 1주차 여섯 문장에서 줄여 붙였습니다. 그게 전부입니다.",
      thread: [
        { author: "한지수", when: "어제", text: "축하드려요. 사진 순서만 바꿔도 그렇게 달라지나요?", up: 4, replies: [] },
        { author: "최은영", when: "어제", text: "저도 오늘 바로 해보겠습니다", up: 2, replies: [] }
      ] },

    { cat: "문구 아이디어", wk: 0, author: "한지수", when: "2일 전", likes: 18, comments: 6, views: 156, mine: false, liked: false,
      title: "안 받을 학생을 적으니 소개글이 확 달라졌어요",
      body: "전교 1등을 안 받는다고 쓰는 게 무섭더니, 그 한 줄 덕에 나머지 다섯 문장이 저절로 나왔습니다.",
      thread: [] },

    { cat: "과제", wk: 2, author: "박현종", when: "3일 전", likes: 7, comments: 3, views: 55, mine: true, liked: false,
      title: "2주차 과제, 플레이스 소개글 줄여봤습니다",
      mission: [
        { q: "'○○동 수학학원'을 검색하면 우리는 몇 번째에 나오나요?", a: "1페이지에 아예 없었습니다. 2페이지 중간에 있더라고요." },
        { q: "학부모가 우리를 놓치는 단계는 어디인가요?", a: "플레이스 목록까지는 오는데 사진에서 나가는 것 같습니다. 교실 사진이 한 장도 없었어요." },
        { q: "1주차 여섯 문장을 줄여 플레이스 소개글을 적어보세요.", a: "영어가 늦었다고 생각하는 초등 고학년이 주인공인 학원입니다. 파닉스부터 다시 잡습니다." }
      ],
      thread: [] },

    /* 피드백권을 써서 올라온 요청들. 답이 없으면 권만 날아간다 */

    { cat: "콘텐츠 피드백", wk: 3, author: "강예린", when: "1일 전", likes: 1, views: 19, mine: false, liked: false,
      attach: { type: "link", url: "blog.naver.com/mathmia/223...", title: "미아 수학학원 — 중2 수학, 지금 포기하면 늦나요" },
      title: "제목은 고쳤는데 첫 문단이 아직 학원 소개입니다",
      body: "고민 키워드로 제목은 바꿨는데 본문 시작을 어떻게 열어야 할지 모르겠습니다. 봐주세요.",
      thread: [] },

    { cat: "콘텐츠 피드백", wk: 5, author: "임도현", when: "2일 전", likes: 2, views: 27, mine: false, liked: false,
      attach: { type: "image", label: "인스타 프로필 화면 캡처" },
      title: "인스타 소개 두 줄인데 뭘 빼야 할지 모르겠습니다",
      body: "수업 과목이랑 지역이랑 경력을 다 넣었더니 읽히지가 않습니다.",
      thread: [] },

    /* 이번 주에 올라온 과제들. 대시보드의 '미제출'과 '답 없는 글'이 여기서 나온다 */

    { cat: "과제", wk: 3, author: "한지수", when: "1일 전", likes: 6, views: 43, mine: false, liked: false,
      title: "3주차 과제, 학부모가 밤에 검색하는 말 찾아봤습니다",
      mission: [
        { q: "주인공 학부모가 밤에 검색하는 말 세 개를 적으세요.", a: "창동 수학학원 / 초6 수학 선행 / 중학교 가기 전 수학" },
        { q: "학부모가 상담에서 차마 못 묻는 걱정은 무엇인가요?", a: "선행을 안 시키면 중학교 가서 뒤처지는 거 아닌지. 다들 시킨다는데 우리만 안 하는 것 같다고 하십니다." },
        { q: "그 걱정에 먼저 답하는 글의 제목을 지어보세요.", a: "선행을 안 시켜도 되나요 — 중학교 가기 전 수학, 창동 학부모님께" }
      ],
      thread: [
        { author: "김경원", when: "어제", staff: true, text: "두 번째 답이 좋습니다. '다들 시킨다는데'가 핵심이에요. 제목에도 그 말을 넣어보세요.", up: 5, replies: [] }
      ] },

    { cat: "과제", wk: 3, author: "강예린", when: "1일 전", likes: 4, views: 31, mine: false, liked: false,
      title: "3주차 과제 올립니다",
      body: "고민 키워드를 찾는 게 지역 키워드보다 훨씬 어려웠습니다. 상담 메모를 다시 뒤져서 세 개 뽑았어요.",
      thread: [] },

    { cat: "과제", wk: 5, author: "오승민", when: "2일 전", likes: 11, views: 68, mine: false, liked: false,
      title: "5주차 과제, 인스타 프로필 고쳐봤습니다",
      body: "소개 첫 줄을 학원 이름에서 '초등 영어가 늦었다고 생각하는 학부모님께'로 바꿨습니다. 팔로워보다 저장이 먼저 늘더라고요.",
      thread: [
        { author: "임도현", when: "2일 전", text: "저장이 늘었다는 게 더 좋은 신호 같은데요. 저도 바꿔보겠습니다.", up: 3, replies: [] }
      ] },

    { cat: "과제", wk: 4, author: "신우철", when: "2일 전", likes: 3, views: 29, mine: false, liked: false,
      title: "4주차 과제, 블로그 3종 세트 중 하나 써봤습니다",
      body: "고민 해결형으로 하나 썼는데 쓰다 보니 결국 학원 자랑이 됐습니다. 다시 씁니다.",
      thread: [] },

    { cat: "과제", wk: 3, author: "윤서진", when: "3일 전", likes: 5, views: 37, mine: false, liked: false,
      title: "3주차 과제 — 논술학원은 고민 키워드가 뭘까 고민했습니다",
      body: "수학이나 영어처럼 점수가 안 보이는 과목이라 학부모 걱정도 막연하더라고요. '글을 못 쓴다'가 아니라 '생각을 정리 못 한다'였습니다.",
      thread: [
        { author: "김선주", when: "3일 전", text: "이 구분이 진짜 좋은데요. 저희도 응용할 수 있을 것 같습니다.", up: 6, replies: [] }
      ] },

    { cat: "과제", wk: 6, author: "배성호", when: "4일 전", likes: 9, views: 58, mine: false, liked: false,
      title: "6주차 과제, 후기 요청 문구 만들었습니다",
      body: "성적이 오른 학생만 찾다가 아무한테도 못 물었습니다. 그냥 다닌 지 6개월 넘은 분들께 보냈더니 세 분이 써주셨어요.",
      thread: [] },

    { cat: "과제", wk: 4, author: "최은영", when: "4일 전", likes: 2, views: 24, mine: false, liked: false,
      title: "4주차 과제 늦게 올립니다",
      body: "블로그 제목 열 개를 뽑아봤는데 여덟 개가 학원 소식이었습니다. 두 개만 남기고 다시 뽑겠습니다.",
      thread: [] },

    { cat: "과제", wk: 5, author: "황준서", when: "5일 전", likes: 7, views: 45, mine: false, liked: false,
      title: "5주차 과제, 릴스 첫 3초 다시 찍었습니다",
      body: "학원 간판부터 보여주던 걸 아이가 문제 푸는 손으로 바꿨습니다. 끝까지 본 비율이 두 배가 됐어요.",
      thread: [
        { author: "오승민", when: "4일 전", text: "손 클로즈업 좋네요. 얼굴 안 나와도 되니 부담도 적고요.", up: 4, replies: [] }
      ] },

    { cat: "과제", wk: 2, author: "서다인", when: "5일 전", likes: 3, views: 26, mine: false, liked: false,
      title: "2주차 과제, 플레이스 사진부터 다 갈았습니다",
      body: "교실 사진이 한 장도 없었습니다. 수업 중 사진은 동의를 받아야 해서 빈 교실이랑 칠판 위주로 찍었어요.",
      thread: [] },

    { cat: "과제", wk: 2, author: "홍수민", when: "6일 전", likes: 4, views: 33, mine: false, liked: false,
      title: "2주차 과제 올립니다. 검색 순위 확인해봤어요",
      body: "'상계동 국어학원'으로 검색하니 2페이지에도 없었습니다. 플레이스 등록 자체가 안 돼 있었네요.",
      thread: [] },

    { cat: "콘텐츠 피드백", wk: 1, author: "최은영", when: "5일 전", likes: 2, comments: 6, views: 40, mine: false, liked: false,
      title: "소개 여섯 문장 중 네 번째가 약한 것 같습니다",
      body: "증거 문장인데 숫자만 나열한 느낌이라 믿음이 안 갈까 걱정입니다.",
      thread: [] },

    { cat: "자유", wk: 0, author: "박민경", when: "6일 전", likes: 8, comments: 2, views: 77, mine: false, liked: false,
      title: "1주차 마치고 남기는 짧은 후기",
      body: "주인공을 정하라는 말이 제일 어려웠습니다. 정하고 나니 그다음이 다 쉬워졌어요.",
      thread: [] },

    { cat: "문구 아이디어", wk: 1, author: "김선주", when: "1주 전", likes: 16, comments: 5, views: 134, mine: false, liked: false,
      title: "상담에서 들은 학부모 말을 그대로 적어두고 있습니다",
      body: "제가 만든 문장보다 학부모가 한 말이 훨씬 잘 걸립니다. 녹음 대신 상담 끝나고 바로 메모합니다.",
      thread: [] }
  ],

  lessons: [
    { wk: 1, chap: "고객 정의", t: "우리 학원의 주인공은 누구인가", d: "5:10", video: true,
      doc: "여러분 학원의 주인공은 어떤 아이입니까. 그리고 뒤집어서, 안 받을 학생을 말할 수 있습니까. 학생을 정하면 학부모도 정해집니다. 그 학부모가 밤에 무엇을 검색하고, 상담 전화에서 무엇을 차마 못 묻는지까지 따라옵니다." },
    { wk: 1, chap: "경쟁사 분석", t: "옆 학원은 뭐라고 말하고 있는가", d: "4:30", video: true,
      doc: "우리 동네 학원 다섯 곳의 소개글을 나란히 놓으면 이름을 가려도 구분이 됩니까. 경쟁 분석의 목적은 이기는 게 아니라 빈자리를 찾는 것입니다. 다들 상위권과 소수정예를 외칠 때 아무도 안 서 있는 자리는 어디인가." },
    { wk: 1, chap: "포지셔닝", t: "학원 소개 6문장 쓰기", d: "6:20", video: false,
      doc: "타겟 선언, 진짜 문제, 우리의 방법, 증거, 차별점 한 방, 다음 행동 제안. 여섯 문장이 전부 주인공 정의에서 흘러나옵니다. 이 여섯 문장이 이후 블로그와 인스타와 상담 멘트의 기초가 됩니다." },

    { wk: 2, chap: "검색 여정", t: "학부모는 어떤 경로로 학원을 찾는가", d: "4:15", video: true,
      doc: "소개받은 학부모도 등록 전에 반드시 하는 행동이 있습니다. 검색입니다. 검색에서 플레이스 목록, 사진과 리뷰 훑기, 블로그 확인, 그리고 문의. 이 여정의 각 단계마다 학부모가 이탈합니다." },
    { wk: 2, chap: "플레이스", t: "플레이스 전면 재세팅", d: "4:05", video: true,
      doc: "상위노출을 결정하는 요소들. 소개글은 새로 쓰는 게 아니라 1주차 여섯 문장을 축약해서 붙이는 것입니다. 사진은 학부모가 확인하고 싶은 것 순서대로 공간, 수업, 아이들. 리뷰는 요청하는 법과 답글 다는 법." },

    { wk: 3, chap: "키워드", t: "학부모는 블로그에서 무엇을 검색하는가", d: "4:20", video: true,
      doc: "학부모는 학원 소식을 검색하지 않습니다. 1주차 주인공 학부모가 밤에 검색하는 말들이 곧 키워드입니다. 지역 키워드와 고민 키워드 두 갈래로 모읍니다." },
    { wk: 3, chap: "블로그 3종 세트", t: "블로그 3종 세트 — 이것부터 쓰면 된다", d: "4:55", video: true,
      doc: "소개하기는 1주차 여섯 문장을 글 한 편으로 풀어낸 것입니다. 학부모 질문 TOP 10은 상담 전화에서 실제로 받는 질문에 미리 답하기. 고객의 언어는 학부모가 차마 못 묻는 걱정을 먼저 꺼내서 답하기." },
    { wk: 3, chap: "콘텐츠 분류", t: "콘텐츠 5기둥 — 올리는 모든 것의 분류함", d: "4:05", video: false,
      doc: "전문가로 실력을 증명하고, 철학으로 왜 이렇게 가르치는지 말하고, 증거로 변화 사례와 후기를 쌓고, 신뢰로 일상과 사람 냄새를 내고, 상품으로 모집과 안내를 합니다. 다섯 중 어디에도 안 들어가면 안 올려도 됩니다." },

    { wk: 4, chap: "프로필", t: "학부모는 3초 안에 판단한다", d: "3:50", video: true,
      doc: "학부모는 피드를 안 내립니다. 프로필 화면 하나 보고 나갈지 말지 정합니다. 프로필 첫 화면에서 보이는 것은 프로필 사진과 소개글과 하이라이트와 최근 게시물 아홉 개입니다." },
    { wk: 4, chap: "계정 세팅", t: "소개글 4줄 공식", d: "4:40", video: false,
      doc: "누구를 위한 학원인지, 뭐가 다른지, 믿을 근거는 무엇인지, 뭘 하면 되는지. 1주차 여섯 문장의 압축판입니다. 여기서도 새로 쓰는 게 아니라 있는 재료를 줄이는 것입니다. 검색되는 이름 짓기도 같이 합니다." },

    { wk: 5, chap: "상담 준비", t: "상담은 예약 순간부터 시작된다", d: "4:10", video: true,
      doc: "예약 응대의 톤, 확인 연락, 오시는 길 안내까지. 학부모는 학원에 도착하기 전에 이미 절반을 판단합니다." },
    { wk: 5, chap: "도착 3분", t: "환영받은 기분 — 도착 후 3분의 설계", d: "5:30", video: true,
      doc: "문 앞까지 나가 기다리기, 환영의 인사, 꽃 한 송이, 메뉴판. 이 학원은 우리를 기다렸구나를 만드는 장치들입니다. 비용은 거의 안 들고 효과는 즉시 나타납니다." },
    { wk: 5, chap: "클로징", t: "등록하시겠어요 — CTA는 문구다", d: "3:45", video: false,
      doc: "클로징을 화법이 아니라 준비된 한 문장으로 합니다. 어물어물 넘기다 연락드릴게요로 끝나는 상담과, 자연스럽게 등록을 묻는 상담의 차이입니다." },

    { wk: 6, chap: "퇴원 징후", t: "갑자기 그만두는 학생은 없다", d: "4:25", video: true,
      doc: "결석과 지각 패턴의 변화, 숙제 질 저하, 학부모 답장 톤의 변화, 요즘 애가 힘들어해서요라는 말. 퇴원은 갑자기 오지 않습니다. 신호를 놓쳤을 뿐입니다." },
    { wk: 6, chap: "소통 체계", t: "학부모 리포트와 소개가 나오는 구조", d: "4:50", video: false,
      doc: "신규 한 명 데려오는 비용보다 재원생 한 명 지키는 비용이 훨씬 쌉니다. 구멍 난 독에 물 붓기를 멈추는 것이 먼저입니다." },

    { wk: 7, chap: "채널 성격", t: "채널 6종 성격표", d: "5:05", video: true,
      doc: "유튜브 롱폼, 쓰레드, 맘카페, 당근, 파워링크, 전단지와 현수막. 각각 누가 보는가, 성과까지 걸리는 시간, 원장 시간 소요, 어떤 학원에 맞는가." },
    { wk: 7, chap: "퍼널", t: "모든 길은 한 곳으로", d: "4:15", video: false,
      doc: "채널을 늘리는 게 성장이 아닙니다. 어설픈 여섯 개보다 제대로 된 두 개입니다. 어느 문으로 들어와도 플레이스와 블로그를 거쳐 문의는 상담 시스템이 받습니다." },

    { wk: 8, chap: "소통 체계", t: "정보가 원장을 거치지 않고도 원장에게 닿게", d: "5:40", video: true,
      doc: "출결, 학생 특이사항, 학부모 컴플레인이 생기면 강사는 어디로 어떤 형식으로 보고하는가. 보고 체계를 일원화하고 양식화합니다. 그래서 원장만 모르는 일이 없게 만듭니다." },
    { wk: 8, chap: "업무 매뉴얼", t: "학원의 결정은 원장이 아니라 원칙이 한다", d: "4:35", video: false,
      doc: "매뉴얼은 두꺼운 문서가 아니라 우리 학원의 원칙 목록입니다. 결석 대응, 보강 규정, 컴플레인 1차 응대, 환불. 원장이 없어도 같은 결정이 나오게 합니다." }
  ],

  weeks: [
    "옆 학원 말고, 왜 우리 학원인데?",
    "원장님 학원, 검색하면 나와요?",
    "블로그 100개 썼는데, 왜 문의는 0건일까요?",
    "선택이 아닌 필수, 학원 인스타",
    "99% 등록으로 이루어지는 상담의 기술",
    "신규 100명보다 더 중요한 재원생 관리",
    "유튜브 · 맘카페 · 당근 채널 확장 전략",
    "원장 수업 없는 학원 시스템 만들기"
  ],

  missions: {
    1: {
      title: "1주차 미션 · 우리 학원의 주인공 정하기",
      qs: [
        { q: "우리 학원의 주인공은 어떤 아이인가요?", hint: "예: 머리가 나쁜 게 아니라 어느 순간 수학을 포기하는 게 편해진 아이" },
        { q: "반대로, 안 받을 학생을 한 줄로 적어보세요.", hint: "예: 저는 전교 1등을 안 받습니다" },
        { q: "둘을 합쳐 우리 학원을 한 문장으로 쓰면?", hint: "옆 학원이 가져다 써도 말이 되면 아직 우리 문장이 아닙니다" }
      ]
    },
    2: {
      title: "2주차 미션 · 플레이스 다시 세팅하기",
      qs: [
        { q: "'○○동 수학학원'을 검색하면 우리는 몇 번째에 나오나요?", hint: "예: 1페이지에 없습니다. 2페이지 중간쯤" },
        { q: "학부모가 우리를 놓치는 단계는 어디인가요?", hint: "검색 → 플레이스 목록 → 사진·리뷰 → 블로그 → 문의 중에서" },
        { q: "1주차 여섯 문장을 줄여 플레이스 소개글을 적어보세요.", hint: "새로 쓰는 게 아니라 있는 걸 줄이는 겁니다" }
      ]
    },
    3: {
      title: "3주차 미션 · 학부모가 검색하는 말로 글 쓰기",
      qs: [
        { q: "주인공 학부모가 밤에 검색하는 말 세 개를 적으세요.", hint: "지역 키워드(○○동 수학학원) + 고민 키워드(수포자 학원)" },
        { q: "학부모가 상담에서 차마 못 묻는 걱정은 무엇인가요?", hint: "예: 우리 애만 못 따라가면 어쩌죠" },
        { q: "그 걱정에 먼저 답하는 글의 제목을 지어보세요.", hint: "하고 싶은 말이 아니라 학부모가 검색하는 질문에 답하는 제목" }
      ]
    },
    4: {
      title: "4주차 미션 · 프로필 4줄 다시 쓰기",
      qs: [
        { q: "지금 우리 계정 프로필 첫 화면에 무엇이 보이나요?", hint: "프사 · 소개글 · 하이라이트 · 최근 게시물 아홉 개" },
        { q: "소개글 4줄을 적어보세요.", hint: "누구를 위한 / 뭐가 다른 / 믿을 근거 / 뭘 하면 되는지" },
        { q: "검색되는 계정 이름으로 바꾼다면?", hint: "예: ○○동수학 매쓰플랜" }
      ]
    },
    5: {
      title: "5주차 미션 · 상담 3분 설계하기",
      qs: [
        { q: "지난달 문의 몇 건 중 몇 건이 등록으로 이어졌나요?", hint: "학생 한 명이 연 120만 원입니다. 숫자로 마주하세요" },
        { q: "학부모가 도착한 뒤 3분 동안 무엇을 하시겠습니까?", hint: "예: 문 앞까지 나가 기다리기 · 꽃 한 송이 · 메뉴판" },
        { q: "등록을 묻는 한 문장을 미리 적어두세요.", hint: "화법이 아니라 준비된 문장입니다. 어물어물 넘기면 연락드릴게요로 끝납니다" }
      ]
    },
    6: {
      title: "6주차 미션 · 퇴원 신호 찾아내기",
      qs: [
        { q: "최근 그만둔 학생에게 미리 어떤 신호가 있었나요?", hint: "결석·지각 패턴, 숙제 질, 학부모 답장 톤" },
        { q: "지금 그 신호가 보이는 학생은 누구인가요?", hint: "퇴원은 갑자기 오지 않습니다. 놓쳤을 뿐입니다" },
        { q: "그 학생에게 이번 주에 무엇을 하시겠습니까?", hint: "예: 개별 면담 10분, 학부모에게 리포트 한 장" }
      ]
    },
    7: {
      title: "7주차 미션 · 채널 두 개만 고르기",
      qs: [
        { q: "주인공 학부모가 실제로 있는 채널은 어디인가요?", hint: "유튜브 · 쓰레드 · 맘카페 · 당근 · 파워링크 · 전단지 중에서" },
        { q: "내가 지속할 수 있는 채널 두 개를 고르세요.", hint: "어설픈 여섯 개보다 제대로 된 두 개" },
        { q: "버리기로 한 채널과 그 이유는?", hint: "버린 이유가 핵심입니다" }
      ]
    },
    8: {
      title: "8주차 미션 · 원장 없이도 도는 원칙 만들기",
      qs: [
        { q: "오늘 하루 원장님을 거쳐 간 결정을 세 개 적어보세요.", hint: "출결 확인, 학부모 답장, 강사 질문, 교재 주문" },
        { q: "그중 다른 사람이 결정해도 되는 것은 무엇인가요?", hint: "1차 판단은 중간 관리자가, 원장에게는 걸러진 것만" },
        { q: "우리 학원 원칙 세 개를 적어보세요.", hint: "결석 대응 · 보강 규정 · 컴플레인 1차 응대 · 환불 중에서" }
      ]
    }
  },

  live: { title: "4주차 라이브 · 인스타 프로필 첨삭", when: "금 20:00", days: 2 },

  categories: [
    { name: "과제", system: true },
    { name: "콘텐츠 피드백", pass: true, system: true },
    { name: "문구 아이디어" },
    { name: "등록 인증" },
    { name: "자유" },
    { name: "공지",   roles: ["instructor", "admin"] },
    { name: "챌린지", roles: ["instructor", "admin"] }
  ],

  lounges: [
    { id: "academy", name: "학원마케팅 올인원 강의",
      show: ["과제", "콘텐츠 피드백", "등록 인증"],
      more: ["문구 아이디어", "자유", "공지"] },
    { id: "ai", name: "올인원 AI",
      show: ["과제", "콘텐츠 피드백"],
      more: ["자유", "공지"] },
    { id: "ebook", name: "전자책 수익화",
      show: ["과제", "등록 인증", "자유"],
      more: ["공지"] }
  ],

  leaderboard: {
    "7":   [["김선주", "1,935"], ["정해린", "1,555"], ["오승민", "1,094"], ["박현종", "820"], ["한지수", "640"]],
    "30":  [["김선주", "11,161"], ["오승민", "8,396"], ["정해린", "7,526"], ["한지수", "5,140"], ["박현종", "4,902"]],
    "all": [["오승민", "46,282"], ["김선주", "37,652"], ["최은영", "36,140"], ["정해린", "31,088"], ["박현종", "24,510"]]
  },

  passes: {
    "콘텐츠 피드백": { left: 3, per: 3, note: "주 3회 · 관리자 지급" }
  }
};
