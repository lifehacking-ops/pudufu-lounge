-- =============================================================================
-- 프드프 라운지 · 스키마 (MariaDB 10.5+ 판)
--
-- db/schema.sql(PostgreSQL) 을 프드프의 DB 인 MariaDB 로 옮긴 것이다. 라운지를
-- 프드프 안으로 이식할 때 이 파일을 쓴다. 두 파일은 표 · 컬럼 · 제약이 같아야
-- 하고, 한쪽을 고치면 다른 쪽도 고친다.
--
-- Postgres → MariaDB 에서 달라진 것 (전수)
--   · CREATE TYPE … AS ENUM          → 컬럼에 ENUM(...) 직접
--   · bigint GENERATED … AS IDENTITY → BIGINT AUTO_INCREMENT
--   · timestamptz                    → DATETIME(6). 시간대가 없으므로 앱이 UTC 로 접속한다
--                                      (mysql2: timezone 'Z'). 화면에서 KST 로 바꾸는 것은 지금과 같다
--   · jsonb                          → JSON (LONGTEXT + json_valid 검사). 문자열로 돌아오므로
--                                      읽는 쪽 db.js 가 JSON.parse 한다
--   · boolean                        → BOOLEAN (= TINYINT(1)). 0/1 로 돌아온다
--   · updated_at 트리거 6개          → ON UPDATE CURRENT_TIMESTAMP(6). 트리거 · 함수 없음
--   · 부분 인덱스 (… WHERE …) 9개     → MariaDB 에는 없다.
--       - 일반 인덱스 7개는 WHERE 만 뗐다. deleted_at 행이 섞여 조금 커지지만 이 규모에서는 무의미
--       - uq_post_client_key · uq_comment_client_key 는 그냥 UNIQUE. MariaDB 도 NULL 은 여럿 허용
--       - uq_category_live(살아 있는 이름만 유일)는 생성 컬럼 live_name 에 UNIQUE
--   · pg_trgm GIN 인덱스 4개          → 없다. LIKE '%…%' 는 스캔한다. 글 수백 편이면 체감 없음.
--                                      필요해지면 FULLTEXT(ngram 파서는 MySQL 전용이라 MariaDB 는 Mroonga)
--   · COMMENT ON COLUMN               → 컬럼 뒤 COMMENT '…'
--   · DROP … CASCADE                  → FOREIGN_KEY_CHECKS 를 잠깐 끄고 지운다
--
-- 규약은 schema.sql 과 같다
--   · 삭제는 deleted_at 으로 한다. 물리 삭제하지 않는다
--   · 외래키는 라운지 테이블끼리만 건다. 프드프에서 온 값(user_id, course_id)에는
--     절대 걸지 않는다 — 이식 뒤에는 프드프의 실제 회원 · 강의 표를 조인하되,
--     FK 를 걸지 말지는 프드프 쪽 규약에 맞춘다
--
-- 2부 ext_* 는 이식 뒤에는 필요 없다. 프드프 안에서는 원본 표를 직접 읽는다.
-- 그래도 여기 남긴 이유 — 단계적으로 옮길 때(라운지 표만 먼저 MariaDB 로) 그대로 쓸 수 있다.
-- =============================================================================

SET NAMES utf8mb4;
SET time_zone = '+00:00';

SET FOREIGN_KEY_CHECKS = 0;
DROP TABLE IF EXISTS post_report, lounge_week, lounge_digest, feedback_pass_use, post_view, reaction,
  comment, attachment, post_answer, post, lounge_category, category,
  lounge_member, lounge;
DROP TABLE IF EXISTS ext_live, ext_feedback_pass, ext_watch, ext_purchase,
  ext_mission, ext_lesson, ext_week, ext_course, ext_user;
SET FOREIGN_KEY_CHECKS = 1;


-- =============================================================================
-- 1부 · 라운지
-- =============================================================================

-- 라운지 ---------------------------------------------------------------------
-- 강의 하나에 라운지 하나. 한 강의의 모든 기수가 여기 섞인다.

CREATE TABLE lounge (
  id         BIGINT AUTO_INCREMENT PRIMARY KEY,
  course_id  BIGINT       NOT NULL UNIQUE COMMENT '프드프 강의 id. 우리 테이블이 아니므로 FK 를 걸지 않는다',
  name       VARCHAR(120) NOT NULL,
  intro      TEXT,
  todo       TEXT         COMMENT '소개 카드의 오늘 할 일. 한 줄에 하나. 배열 타입을 쓰지 않는다',
  intro_att  JSON         COMMENT '소개글 첨부. 글의 attachment 와 같은 모양을 읽기 전용으로 담는다',
  banner_url VARCHAR(500),
  is_active  BOOLEAN      NOT NULL DEFAULT TRUE,
  created_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 라운지 멤버 ----------------------------------------------------------------
-- 역할이 여기 붙는다. 계정이 아니라 라운지 단위다.
-- 만료되어도 행을 지우지 않는다. 만료는 상태일 뿐이고, 지우면 그 사람이 쓴
-- 글의 맥락이 끊긴다.

CREATE TABLE lounge_member (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  lounge_id      BIGINT      NOT NULL,
  user_id        BIGINT      NOT NULL,
  role           ENUM('student', 'instructor', 'admin') NOT NULL DEFAULT 'student',
  cohort         SMALLINT    COMMENT '구매 데이터에서 판정. 스태프는 NULL',
  joined_at      DATETIME(6) NOT NULL,
  expires_at     DATETIME(6) COMMENT 'NULL 이면 무기한(스태프)',
  last_seen_at   DATETIME(6),

  -- 프드프 시청 기록에서 계산한 값의 캐시. 원본이 아니다.
  -- 하루 한 번 동기화면 충분하다(대시보드가 오늘 아침 기준으로만 맞으면 된다).
  week           SMALLINT    NOT NULL DEFAULT 1,
  week_synced_at DATETIME(6),

  /* 돈을 낸 사람을 쫓아낼 수는 없다. 읽기는 두고 쓰기만 멈춘다.
     기한이 지나면 저절로 풀린다 — 영구 정지는 사실상 환불 문제가 된다. */
  muted_until    DATETIME(6),
  muted_reason   VARCHAR(200),

  created_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_member (lounge_id, user_id),
  CONSTRAINT fk_member_lounge FOREIGN KEY (lounge_id) REFERENCES lounge (id),
  INDEX ix_member_role (lounge_id, role),
  INDEX ix_member_seen (lounge_id, last_seen_at),   -- 이탈 위험 명단
  INDEX ix_member_week (lounge_id, week),           -- 주차별 이탈 퍼널
  INDEX ix_member_user (user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 카테고리 -------------------------------------------------------------------
-- 전역 풀이다. 어느 라운지에 어떻게 놓이는지는 lounge_category 가 정한다.
--
-- is_system 은 이름 뒤에 동작이 붙어 있다는 뜻이다. '과제'에는 주차별 미션
-- 양식이, 피드백권 카테고리에는 권 소모가 묶여 있어서 지우면 기능이 같이 죽는다.

CREATE TABLE category (
  id            BIGINT AUTO_INCREMENT PRIMARY KEY,
  name          VARCHAR(40) NOT NULL,
  is_system     BOOLEAN     NOT NULL DEFAULT FALSE,
  pass_required BOOLEAN     NOT NULL DEFAULT FALSE COMMENT '피드백권을 쓰는 카테고리',
  created_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at    DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  deleted_at    DATETIME(6),

  -- 살아 있는 같은 이름은 하나뿐, 지워진 것은 여럿 남아도 된다.
  -- Postgres 는 부분 인덱스 한 줄이었다. 여기서는 지워지면 NULL 이 되는 생성 컬럼에
  -- UNIQUE 를 건다 — UNIQUE 는 NULL 을 여럿 허용하므로 지워진 것들은 서로 부딪히지 않는다.
  live_name     VARCHAR(40) AS (IF(deleted_at IS NULL, name, NULL)) VIRTUAL,
  UNIQUE KEY uq_category_live (live_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 라운지별 카테고리 배치 ------------------------------------------------------
-- 행이 없으면 '미사용'이다. 미사용 카테고리는 그 라운지에서 필터에도 안 뜨고
-- 글도 못 쓴다.
--
-- 쓰기 권한을 여기 둔 이유 — 권한은 라운지에 붙기 때문이다. 학원마케팅
-- 라운지에서 공지를 잠가도 다른 라운지는 영향을 받으면 안 된다.
-- 관리자 컬럼은 두지 않는다. 관리자는 항상 쓸 수 있다.

CREATE TABLE lounge_category (
  lounge_id            BIGINT      NOT NULL,
  category_id          BIGINT      NOT NULL,
  placement            ENUM('show', 'more') NOT NULL DEFAULT 'show' COMMENT 'show = 기본 노출, more = 필터 더보기 안',
  sort                 SMALLINT    NOT NULL DEFAULT 0,
  student_can_write    BOOLEAN     NOT NULL DEFAULT TRUE,
  instructor_can_write BOOLEAN     NOT NULL DEFAULT TRUE,
  created_at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at           DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (lounge_id, category_id),
  CONSTRAINT fk_lc_lounge   FOREIGN KEY (lounge_id)   REFERENCES lounge (id),
  CONSTRAINT fk_lc_category FOREIGN KEY (category_id) REFERENCES category (id),
  INDEX ix_lc_place    (lounge_id, placement, sort),
  INDEX ix_lc_category (category_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 글 -------------------------------------------------------------------------
-- author_name 은 작성 시점 닉네임의 스냅샷이다. 닉네임을 바꿔도 과거 글의
-- 이름은 그대로 남는다. 표시는 author_name, 판정과 집계는 전부 user_id 다.
--
-- reaction_count / comment_count 는 파생값이지만 컬럼으로 둔다. 추천순 정렬이
-- 실제 기능이고, 매번 집계하면 인덱스를 못 탄다. 쓰기 경로에서 같이 갱신하고
-- 주기적으로 재계산한다.

CREATE TABLE post (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  lounge_id      BIGINT       NOT NULL,
  category_id    BIGINT       NOT NULL,
  user_id        BIGINT       NOT NULL,
  author_name    VARCHAR(60)  NOT NULL COMMENT '작성 시점 닉네임 스냅샷',
  title          VARCHAR(200) NOT NULL,
  body           TEXT         COMMENT '평문. 리치 텍스트 아님',
  week           SMALLINT     COMMENT '과제 글만. 그 외 NULL',
  is_pinned      BOOLEAN      NOT NULL DEFAULT FALSE,
  reaction_count INT          NOT NULL DEFAULT 0,
  comment_count  INT          NOT NULL DEFAULT 0,
  view_count     INT          NOT NULL DEFAULT 0,
  created_at     DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at     DATETIME(6)  NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  edited_at      DATETIME(6)  COMMENT '사용자가 고친 시각. updated_at 과 다르다',
  deleted_at     DATETIME(6),
  deleted_by     BIGINT,
  -- 화면이 글 한 편에 하나 붙이는 열쇠. 같은 열쇠가 두 번 오면 두 번째는 저장되지 않는다.
  -- NULL(열쇠 없는 옛 글 · 서버가 만든 글)은 여럿이어도 된다 — UNIQUE 가 NULL 을 여럿 허용한다.
  client_key     VARCHAR(40)  COMMENT '느린 회선에서 게시를 두 번 눌러도 한 편이 되게 하는 열쇠',
  UNIQUE KEY uq_post_client_key (client_key),
  CONSTRAINT fk_post_lounge   FOREIGN KEY (lounge_id)   REFERENCES lounge (id),
  CONSTRAINT fk_post_category FOREIGN KEY (category_id) REFERENCES category (id),
  -- Postgres 에서는 deleted_at IS NULL 부분 인덱스였다. 여기서는 전체 인덱스.
  INDEX ix_post_feed   (lounge_id, is_pinned, created_at),
  INDEX ix_post_cat    (lounge_id, category_id, created_at),
  INDEX ix_post_hot    (lounge_id, reaction_count),
  INDEX ix_post_mine   (user_id, created_at),
  INDEX ix_post_submit (lounge_id, category_id, week, user_id),   -- 과제 제출 여부 · 미제출 명단
  INDEX ix_post_recent (lounge_id, created_at)                     -- 어제 올라온 글 집계
  -- 한글 부분 일치(pg_trgm)는 없다. LIKE '%…%' 는 스캔한다.
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 과제 미션 답변 --------------------------------------------------------------
-- 질문 문구도 같이 저장한다. 나중에 미션 양식이 바뀌어도 그때 무엇에 답한
-- 글이었는지 남아야 한다.

CREATE TABLE post_answer (
  id       BIGINT AUTO_INCREMENT PRIMARY KEY,
  post_id  BIGINT       NOT NULL,
  seq      SMALLINT     NOT NULL,
  question VARCHAR(300) NOT NULL COMMENT '작성 시점 질문 스냅샷',
  answer   TEXT         NOT NULL,
  UNIQUE KEY uq_answer (post_id, seq),
  CONSTRAINT fk_answer_post FOREIGN KEY (post_id) REFERENCES post (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 첨부 -----------------------------------------------------------------------
-- youtube 는 url 만 저장하고 임베드는 클라이언트가 만든다.

CREATE TABLE attachment (
  id      BIGINT AUTO_INCREMENT PRIMARY KEY,
  post_id BIGINT        NOT NULL,
  kind    ENUM('image', 'link', 'youtube', 'video') NOT NULL,
  url     VARCHAR(1000) NOT NULL,
  label   VARCHAR(300)  COMMENT '캡션 또는 링크 제목',
  sort    SMALLINT      NOT NULL DEFAULT 0,
  CONSTRAINT fk_attach_post FOREIGN KEY (post_id) REFERENCES post (id) ON DELETE CASCADE,
  INDEX ix_attach_post (post_id, sort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 댓글 -----------------------------------------------------------------------
-- 답글은 한 단계까지만. parent_id 가 있는 행은 parent_id 를 가질 수 없다
-- (앱에서 강제한다. 제약으로는 표현하지 않는다).

CREATE TABLE comment (
  id             BIGINT AUTO_INCREMENT PRIMARY KEY,
  post_id        BIGINT      NOT NULL,
  parent_id      BIGINT      COMMENT 'NULL 이면 원댓글',
  user_id        BIGINT      NOT NULL,
  author_name    VARCHAR(60) NOT NULL,
  body           TEXT        NOT NULL,
  reaction_count INT         NOT NULL DEFAULT 0,
  created_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  updated_at     DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  deleted_at     DATETIME(6),
  deleted_by     BIGINT,
  client_key     VARCHAR(40),
  UNIQUE KEY uq_comment_client_key (client_key),
  CONSTRAINT fk_comment_post   FOREIGN KEY (post_id)   REFERENCES post (id)    ON DELETE CASCADE,
  CONSTRAINT fk_comment_parent FOREIGN KEY (parent_id) REFERENCES comment (id) ON DELETE CASCADE,
  INDEX ix_comment_post   (post_id, created_at),
  INDEX ix_comment_parent (parent_id, created_at),
  INDEX ix_comment_user   (user_id, created_at)   -- 강사가 어제 남긴 피드백 수
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 반응 -----------------------------------------------------------------------
-- 글과 댓글을 같이 받는다. 대상이 둘이라 외래키를 걸 수 없다.
-- 삭제는 앱이 맞춰서 지운다.

CREATE TABLE reaction (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  target_kind ENUM('post', 'comment') NOT NULL,
  target_id   BIGINT      NOT NULL,
  user_id     BIGINT      NOT NULL,
  emoji       VARCHAR(16) NOT NULL COMMENT '한 종류씩. 👍 🔥 👏 …',
  created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_reaction (target_kind, target_id, user_id, emoji),
  INDEX ix_reaction_target (target_kind, target_id),
  INDEX ix_reaction_user   (user_id, target_kind)   -- 반응한 글 필터
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 조회 -----------------------------------------------------------------------
-- 사람 단위로 한 번만 센다. post.view_count 는 이 표의 수다.

CREATE TABLE post_view (
  post_id   BIGINT      NOT NULL,
  user_id   BIGINT      NOT NULL,
  viewed_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT fk_view_post FOREIGN KEY (post_id) REFERENCES post (id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 피드백권 소모 ---------------------------------------------------------------
-- 권의 소유와 잔여는 프드프의 기존 테이블이 갖는다. 여기는 '라운지에서 언제
-- 무엇에 썼는가'만 기록한다. 권은 글을 올리는 시점에 소모된다.
-- post 를 지워도 이 기록은 남아야 하므로 FK 를 걸지 않는다. 소모는 이미 일어난 사실이다.

CREATE TABLE feedback_pass_use (
  id        BIGINT AUTO_INCREMENT PRIMARY KEY,
  lounge_id BIGINT      NOT NULL,
  user_id   BIGINT      NOT NULL,
  post_id   BIGINT      NOT NULL UNIQUE COMMENT '글 하나에 한 번',
  used_at   DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  INDEX ix_pass_user (lounge_id, user_id, used_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 신고 -----------------------------------------------------------------------
-- 알림이 없으므로 신고는 관리자가 게시물 관리에서 본다. 한 사람이 같은 글을
-- 여러 번 신고해도 한 건으로 센다.

CREATE TABLE post_report (
  post_id    BIGINT      NOT NULL,
  user_id    BIGINT      NOT NULL,
  reason     VARCHAR(200),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  PRIMARY KEY (post_id, user_id),
  CONSTRAINT fk_report_post FOREIGN KEY (post_id) REFERENCES post (id) ON DELETE CASCADE,
  INDEX ix_report_recent (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 주차 게시 여부 ---------------------------------------------------------------
-- 강의 내용은 프드프가 갖지만, 어느 주차를 라운지에서 열지는 라운지가 정한다.
-- 행이 없으면 공개로 본다.

CREATE TABLE lounge_week (
  lounge_id  BIGINT      NOT NULL,
  week       SMALLINT    NOT NULL,
  published  BOOLEAN     NOT NULL DEFAULT TRUE,
  due_at     DATETIME(6) COMMENT '과제 마감. NULL 이면 마감 없음 — 카운트다운도 정시·지각 구분도 없다',
  updated_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6) ON UPDATE CURRENT_TIMESTAMP(6),
  PRIMARY KEY (lounge_id, week),
  CONSTRAINT fk_week_lounge FOREIGN KEY (lounge_id) REFERENCES lounge (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 어제 커뮤니티 요약 -----------------------------------------------------------
-- payload 는 줄별 숫자, body 는 카톡에 그대로 붙여넣을 완성된 문장이다.
-- payload 는 읽기만 한다. 안을 뒤져 걸러야 할 값이 생기면 컬럼으로 꺼낸다.

CREATE TABLE lounge_digest (
  id          BIGINT AUTO_INCREMENT PRIMARY KEY,
  lounge_id   BIGINT      NOT NULL,
  digest_date DATE        NOT NULL COMMENT '요약 대상이 된 날(어제)',
  payload     JSON        NOT NULL,
  body        TEXT        NOT NULL COMMENT '복사해서 붙여넣을 문장',
  sent_at     DATETIME(6) COMMENT '관리자가 복사한 시각',
  created_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  UNIQUE KEY uq_digest (lounge_id, digest_date),
  CONSTRAINT fk_digest_lounge FOREIGN KEY (lounge_id) REFERENCES lounge (id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================================
-- 2부 · ext_* 프드프 캐시
--
-- 완전 이식 뒤에는 이 표들 대신 프드프의 원본 표(회원 · 강의 · 구매 · 시청 · 피드백권)를
-- 직접 읽는다. 그때는 이 절을 통째로 지우고 server/account.js 의 SQL 을 원본 표로 바꾼다.
-- 라운지 표만 먼저 옮기는 단계에서는 그대로 쓴다.
-- =============================================================================

CREATE TABLE ext_user (
  id         BIGINT      PRIMARY KEY,
  nickname   VARCHAR(60) NOT NULL COMMENT '라운지는 이것만 쓴다',
  email      VARCHAR(190),
  created_at DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  synced_at  DATETIME(6),
  INDEX ix_user_nick (nickname)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE ext_course (
  id        BIGINT       PRIMARY KEY,
  title     VARCHAR(200) NOT NULL,
  weeks     SMALLINT     NOT NULL DEFAULT 8,
  synced_at DATETIME(6)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 주차 제목. 강의 목록의 카드 제목이 된다.
CREATE TABLE ext_week (
  course_id BIGINT       NOT NULL,
  week      SMALLINT     NOT NULL,
  title     VARCHAR(200) NOT NULL,
  synced_at DATETIME(6),
  PRIMARY KEY (course_id, week)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE ext_lesson (
  id        BIGINT AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT       NOT NULL,
  week      SMALLINT     NOT NULL,
  seq       SMALLINT     NOT NULL,
  chapter   VARCHAR(120) COMMENT '소속 챕터. 검색 결과에 뜬다',
  title     VARCHAR(200) NOT NULL,
  duration  VARCHAR(12),
  video_url VARCHAR(500),
  doc       TEXT         COMMENT '교안 본문. 검색 대상',
  synced_at DATETIME(6),
  UNIQUE KEY uq_lesson (course_id, week, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 프드프의 회차별 미션 양식. 글쓰기 창의 과제 폼이 이걸 읽는다.
CREATE TABLE ext_mission (
  id        BIGINT AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT       NOT NULL,
  week      SMALLINT     NOT NULL,
  title     VARCHAR(200) NOT NULL COMMENT '이번 주 과제 제목',
  seq       SMALLINT     NOT NULL,
  question  VARCHAR(300) NOT NULL,
  hint      VARCHAR(300) COMMENT '입력칸 placeholder',
  synced_at DATETIME(6),
  UNIQUE KEY uq_mission (course_id, week, seq)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 기수와 만료일이 여기서 나온다.
CREATE TABLE ext_purchase (
  id           BIGINT AUTO_INCREMENT PRIMARY KEY,
  user_id      BIGINT      NOT NULL,
  course_id    BIGINT      NOT NULL,
  cohort       SMALLINT    NOT NULL,
  purchased_at DATETIME(6) NOT NULL,
  expires_at   DATETIME(6),
  synced_at    DATETIME(6),
  UNIQUE KEY uq_purchase (user_id, course_id),
  INDEX ix_purchase_course (course_id, cohort)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 시청 기록. 원본은 프드프다. lounge_member.week 는 이 표에서 계산한 값의 캐시일 뿐이다.
CREATE TABLE ext_watch (
  user_id     BIGINT      NOT NULL,
  lesson_id   BIGINT      NOT NULL,
  watched_at  DATETIME(6) NOT NULL DEFAULT CURRENT_TIMESTAMP(6),
  is_complete BOOLEAN     NOT NULL DEFAULT FALSE,
  synced_at   DATETIME(6),
  PRIMARY KEY (user_id, lesson_id),
  INDEX ix_watch_lesson (lesson_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 피드백권 잔여. 소유는 프드프 소관이고 라운지는 읽기만 한다.
CREATE TABLE ext_feedback_pass (
  user_id      BIGINT      NOT NULL,
  course_id    BIGINT      NOT NULL,
  quota_per    SMALLINT    NOT NULL DEFAULT 3 COMMENT '주기당 지급 수',
  period       ENUM('week', 'month') NOT NULL DEFAULT 'week',
  period_start DATE        NOT NULL COMMENT '현재 주기 시작일',
  used         SMALLINT    NOT NULL DEFAULT 0 COMMENT '현재 주기 사용 수',
  synced_at    DATETIME(6),
  PRIMARY KEY (user_id, course_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


CREATE TABLE ext_live (
  id        BIGINT AUTO_INCREMENT PRIMARY KEY,
  course_id BIGINT       NOT NULL,
  title     VARCHAR(200) NOT NULL,
  starts_at DATETIME(6)  NOT NULL,
  synced_at DATETIME(6),
  INDEX ix_live_course (course_id, starts_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
