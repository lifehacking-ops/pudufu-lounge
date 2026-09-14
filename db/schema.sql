-- =============================================================================
-- 프드프 라운지 · 스키마
--
-- 이 파일은 이식할 때 그대로 간다. 서버 코드가 무엇으로 쓰이든 바뀌지 않는다.
--
-- 규약
--   · MySQL 5.7.6+ / 8.0 양쪽에서 도는 문법만 쓴다
--     (utf8mb4_unicode_ci, ngram FULLTEXT. 8.0 전용 문법은 쓰지 않는다)
--   · 시각은 전부 DATETIME. 앱이 UTC 로 넣고 UTC 로 읽는다
--   · 삭제는 deleted_at 으로 한다. 물리 삭제하지 않는다
--   · 외래키는 라운지 테이블끼리만 건다. 프드프에서 온 데이터(user_id,
--     course_id)에는 절대 걸지 않는다 — 우리 DB 가 아니라 남의 사실이다
--
-- 두 덩어리로 나뉜다
--   1부  라운지 테이블   라운지가 소유한다. 원본이 여기 있다
--   2부  ext_* 캐시      프드프에서 받아 온 것. 원본은 저쪽이고 여기는 사본이다.
--                        절대 여기서 고치지 않는다 — 고쳐야 할 값은 프드프에 있다
-- =============================================================================

SET NAMES utf8mb4;
SET foreign_key_checks = 0;


-- =============================================================================
-- 1부 · 라운지
-- =============================================================================

-- 라운지 ---------------------------------------------------------------------
-- 강의 하나에 라운지 하나. 한 강의의 모든 기수가 여기 섞인다.

DROP TABLE IF EXISTS `lounge`;
CREATE TABLE `lounge` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `course_id`   BIGINT UNSIGNED NOT NULL          COMMENT '2.0 강의 id',
  `name`        VARCHAR(120)    NOT NULL,
  `intro`       TEXT            NULL              COMMENT '소개 카드 본문',
  `banner_url`  VARCHAR(500)    NULL,
  `is_active`   TINYINT(1)      NOT NULL DEFAULT 1,
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lounge_course` (`course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 라운지 멤버 ----------------------------------------------------------------
-- 역할이 여기 붙는다. 계정이 아니라 라운지 단위다.
-- 만료되어도 행을 지우지 않는다. 만료는 상태일 뿐이고, 지우면 그 사람이 쓴
-- 글의 맥락이 끊긴다.

DROP TABLE IF EXISTS `lounge_member`;
CREATE TABLE `lounge_member` (
  `id`              BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lounge_id`       BIGINT UNSIGNED NOT NULL,
  `user_id`         BIGINT UNSIGNED NOT NULL      COMMENT '2.0 계정 id',
  `role`            ENUM('student','instructor','admin') NOT NULL DEFAULT 'student',
  `cohort`          SMALLINT UNSIGNED NULL        COMMENT '구매 데이터에서 판정. 스태프는 NULL',
  `joined_at`       DATETIME        NOT NULL,
  `expires_at`      DATETIME        NULL          COMMENT 'NULL 이면 무기한(스태프)',
  `last_seen_at`    DATETIME        NULL,

  -- 2.0 시청 기록에서 계산한 값의 캐시. 원본이 아니다.
  -- 하루 한 번 동기화면 충분하다(대시보드가 오늘 아침 기준으로만 맞으면 된다).
  `week`            TINYINT UNSIGNED NOT NULL DEFAULT 1,
  `week_synced_at`  DATETIME        NULL,

  `created_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`      DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_member` (`lounge_id`, `user_id`),
  KEY `ix_member_role` (`lounge_id`, `role`),
  -- 이탈 위험 명단
  KEY `ix_member_seen` (`lounge_id`, `last_seen_at`),
  -- 주차별 이탈 퍼널
  KEY `ix_member_week` (`lounge_id`, `week`),
  KEY `ix_member_user` (`user_id`),
  CONSTRAINT `fk_member_lounge` FOREIGN KEY (`lounge_id`) REFERENCES `lounge` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 카테고리 -------------------------------------------------------------------
-- 전역 풀이다. 어느 라운지에 어떻게 놓이는지는 lounge_category 가 정한다.
--
-- is_system 은 이름 뒤에 동작이 붙어 있다는 뜻이다. '과제'에는 주차별 미션
-- 양식이, 피드백권 카테고리에는 권 소모가 묶여 있어서 지우면 기능이 같이 죽는다.
--
-- UNIQUE(name, deleted_at) — MySQL 은 UNIQUE 안의 NULL 을 서로 다르게 보므로,
-- 살아 있는 같은 이름은 하나뿐이고 지워진 것은 여럿 남을 수 있다.

DROP TABLE IF EXISTS `category`;
CREATE TABLE `category` (
  `id`            BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `name`          VARCHAR(40)     NOT NULL,
  `is_system`     TINYINT(1)      NOT NULL DEFAULT 0,
  `pass_required` TINYINT(1)      NOT NULL DEFAULT 0  COMMENT '피드백권을 쓰는 카테고리',
  `created_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`    DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`    DATETIME        NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_category_name` (`name`, `deleted_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 라운지별 카테고리 배치 ------------------------------------------------------
-- 행이 없으면 '미사용'이다. 미사용 카테고리는 그 라운지에서 필터에도 안 뜨고
-- 글도 못 쓴다.
--
-- 쓰기 권한을 여기 둔 이유 — 권한은 라운지에 붙기 때문이다. 학원마케팅
-- 라운지에서 공지를 잠가도 올인원 AI 라운지는 영향을 받으면 안 된다.
-- 관리자 컬럼은 두지 않는다. 관리자는 항상 쓸 수 있다.

DROP TABLE IF EXISTS `lounge_category`;
CREATE TABLE `lounge_category` (
  `lounge_id`            BIGINT UNSIGNED NOT NULL,
  `category_id`          BIGINT UNSIGNED NOT NULL,
  -- show = 기본 노출, more = '필터 더보기' 안
  `placement`            ENUM('show','more') NOT NULL DEFAULT 'show',
  `sort`                 SMALLINT        NOT NULL DEFAULT 0,
  `student_can_write`    TINYINT(1)      NOT NULL DEFAULT 1,
  `instructor_can_write` TINYINT(1)      NOT NULL DEFAULT 1,
  `created_at`           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`           DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`lounge_id`, `category_id`),
  KEY `ix_lc_place` (`lounge_id`, `placement`, `sort`),
  KEY `ix_lc_category` (`category_id`),
  CONSTRAINT `fk_lc_lounge`   FOREIGN KEY (`lounge_id`)   REFERENCES `lounge` (`id`),
  CONSTRAINT `fk_lc_category` FOREIGN KEY (`category_id`) REFERENCES `category` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 글 -------------------------------------------------------------------------
-- author_name 은 작성 시점 닉네임의 스냅샷이다. 닉네임을 바꿔도 과거 글의
-- 이름은 그대로 남는다. 표시는 author_name, 판정과 집계는 전부 user_id 다.
--
-- reaction_count / comment_count 는 파생값이지만 컬럼으로 둔다. 추천순 정렬이
-- 실제 기능이고, 매번 집계하면 인덱스를 못 탄다. 쓰기 경로에서 같이 갱신하고
-- 주기적으로 재계산한다.

DROP TABLE IF EXISTS `post`;
CREATE TABLE `post` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lounge_id`      BIGINT UNSIGNED NOT NULL,
  `category_id`    BIGINT UNSIGNED NOT NULL,
  `user_id`        BIGINT UNSIGNED NOT NULL,
  `author_name`    VARCHAR(60)     NOT NULL      COMMENT '작성 시점 닉네임 스냅샷',
  `title`          VARCHAR(200)    NOT NULL,
  `body`           MEDIUMTEXT      NULL          COMMENT '평문. 리치 텍스트 아님',
  `week`           TINYINT UNSIGNED NULL         COMMENT '과제 글만. 그 외 NULL',
  `is_pinned`      TINYINT(1)      NOT NULL DEFAULT 0,
  `reaction_count` INT UNSIGNED    NOT NULL DEFAULT 0,
  `comment_count`  INT UNSIGNED    NOT NULL DEFAULT 0,
  `view_count`     INT UNSIGNED    NOT NULL DEFAULT 0,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `edited_at`      DATETIME        NULL          COMMENT '사용자가 고친 시각. updated_at 과 다르다',
  `deleted_at`     DATETIME        NULL,
  `deleted_by`     BIGINT UNSIGNED NULL,
  PRIMARY KEY (`id`),
  KEY `ix_post_feed`   (`lounge_id`, `deleted_at`, `is_pinned`, `created_at`),
  KEY `ix_post_cat`    (`lounge_id`, `category_id`, `deleted_at`, `created_at`),
  KEY `ix_post_hot`    (`lounge_id`, `deleted_at`, `reaction_count`),
  KEY `ix_post_mine`   (`user_id`, `deleted_at`, `created_at`),
  -- 과제 제출 여부 · 미제출 명단
  KEY `ix_post_submit` (`lounge_id`, `category_id`, `week`, `user_id`),
  -- 어제 올라온 글 집계
  KEY `ix_post_recent` (`lounge_id`, `created_at`),
  CONSTRAINT `fk_post_lounge`   FOREIGN KEY (`lounge_id`)   REFERENCES `lounge` (`id`),
  CONSTRAINT `fk_post_category` FOREIGN KEY (`category_id`) REFERENCES `category` (`id`),
  FULLTEXT KEY `ft_post` (`title`, `body`) /*!50100 WITH PARSER ngram */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 과제 미션 답변 --------------------------------------------------------------
-- 질문 문구도 같이 저장한다. 나중에 미션 양식이 바뀌어도 그때 무엇에 답한
-- 글이었는지 남아야 한다.

DROP TABLE IF EXISTS `post_answer`;
CREATE TABLE `post_answer` (
  `id`        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `post_id`   BIGINT UNSIGNED NOT NULL,
  `seq`       TINYINT UNSIGNED NOT NULL     COMMENT '1부터',
  `question`  VARCHAR(300)    NOT NULL      COMMENT '작성 시점 질문 스냅샷',
  `answer`    TEXT            NOT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_answer` (`post_id`, `seq`),
  CONSTRAINT `fk_answer_post` FOREIGN KEY (`post_id`) REFERENCES `post` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 첨부 -----------------------------------------------------------------------
-- youtube 는 url 만 저장하고 임베드는 클라이언트가 만든다.
-- image 는 업로드된 파일의 주소다(저장소는 미정, 문서 9장).

DROP TABLE IF EXISTS `attachment`;
CREATE TABLE `attachment` (
  `id`       BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `post_id`  BIGINT UNSIGNED NOT NULL,
  `type`     ENUM('image','link','youtube') NOT NULL,
  `url`      VARCHAR(1000)   NOT NULL,
  `label`    VARCHAR(300)    NULL           COMMENT '캡션 또는 링크 제목',
  `sort`     SMALLINT        NOT NULL DEFAULT 0,
  PRIMARY KEY (`id`),
  KEY `ix_attach_post` (`post_id`, `sort`),
  CONSTRAINT `fk_attach_post` FOREIGN KEY (`post_id`) REFERENCES `post` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 댓글 -----------------------------------------------------------------------
-- 답글은 한 단계까지만. parent_id 가 있는 행은 parent_id 를 가질 수 없다
-- (앱에서 강제한다. DB 제약으로는 표현할 수 없다).

DROP TABLE IF EXISTS `comment`;
CREATE TABLE `comment` (
  `id`             BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `post_id`        BIGINT UNSIGNED NOT NULL,
  `parent_id`      BIGINT UNSIGNED NULL       COMMENT 'NULL 이면 원댓글',
  `user_id`        BIGINT UNSIGNED NOT NULL,
  `author_name`    VARCHAR(60)     NOT NULL,
  `body`           TEXT            NOT NULL,
  `reaction_count` INT UNSIGNED    NOT NULL DEFAULT 0,
  `created_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at`     DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `deleted_at`     DATETIME        NULL,
  `deleted_by`     BIGINT UNSIGNED NULL,
  PRIMARY KEY (`id`),
  KEY `ix_comment_post`   (`post_id`, `deleted_at`, `created_at`),
  KEY `ix_comment_parent` (`parent_id`, `created_at`),
  -- 강사가 어제 남긴 피드백 수
  KEY `ix_comment_user`   (`user_id`, `created_at`),
  CONSTRAINT `fk_comment_post`   FOREIGN KEY (`post_id`)   REFERENCES `post` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_comment_parent` FOREIGN KEY (`parent_id`) REFERENCES `comment` (`id`) ON DELETE CASCADE,
  FULLTEXT KEY `ft_comment` (`body`) /*!50100 WITH PARSER ngram */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 반응 -----------------------------------------------------------------------
-- 글과 댓글을 같이 받는다. 대상이 둘이라 외래키를 걸 수 없다.
-- 삭제는 앱이 맞춰서 지운다.

DROP TABLE IF EXISTS `reaction`;
CREATE TABLE `reaction` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `target_type` ENUM('post','comment') NOT NULL,
  `target_id`   BIGINT UNSIGNED NOT NULL,
  `user_id`     BIGINT UNSIGNED NOT NULL,
  `emoji`       VARCHAR(16)     NOT NULL       COMMENT '👍 🔥 👏 … 한 종류씩',
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_reaction` (`target_type`, `target_id`, `user_id`, `emoji`),
  KEY `ix_reaction_target` (`target_type`, `target_id`),
  -- 반응한 글 필터
  KEY `ix_reaction_user`   (`user_id`, `target_type`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 조회 -----------------------------------------------------------------------
-- 사람 단위로 한 번만 센다. post.view_count 는 이 표의 수다.

DROP TABLE IF EXISTS `post_view`;
CREATE TABLE `post_view` (
  `post_id`   BIGINT UNSIGNED NOT NULL,
  `user_id`   BIGINT UNSIGNED NOT NULL,
  `viewed_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`post_id`, `user_id`),
  CONSTRAINT `fk_view_post` FOREIGN KEY (`post_id`) REFERENCES `post` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 피드백권 소모 ---------------------------------------------------------------
-- 권의 소유와 잔여는 2.0 의 기존 테이블이 갖는다. 여기는 '라운지에서 언제
-- 무엇에 썼는가'만 기록한다.
--
-- 권은 글을 올리는 시점에 소모된다. 답이 오지 않아도 이미 나갔다 — 그래서
-- 대시보드의 대기열이 밀리면 안 된다.
--
-- post 를 물리 삭제하면 이 기록이 같이 날아가므로 외래키에 CASCADE 를 걸지
-- 않는다. 소모는 이미 일어난 사실이다.

DROP TABLE IF EXISTS `feedback_pass_use`;
CREATE TABLE `feedback_pass_use` (
  `id`        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lounge_id` BIGINT UNSIGNED NOT NULL,
  `user_id`   BIGINT UNSIGNED NOT NULL,
  `post_id`   BIGINT UNSIGNED NOT NULL,
  `used_at`   DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  -- 글 하나에 한 번
  UNIQUE KEY `uq_pass_post` (`post_id`),
  KEY `ix_pass_user` (`lounge_id`, `user_id`, `used_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 어제 커뮤니티 요약 -----------------------------------------------------------
-- payload 는 줄별 숫자, body 는 카톡에 그대로 붙여넣을 완성된 문장이다.
-- 하루가 지나면 원본 데이터가 움직이므로(글이 지워지는 등) 그날 만든 문장을
-- 그대로 보관한다.

DROP TABLE IF EXISTS `lounge_digest`;
CREATE TABLE `lounge_digest` (
  `id`          BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `lounge_id`   BIGINT UNSIGNED NOT NULL,
  `digest_date` DATE            NOT NULL      COMMENT '요약 대상이 된 날(어제)',
  `payload`     TEXT            NOT NULL      COMMENT 'JSON. 줄별 항목과 수치',
  `body`        TEXT            NOT NULL      COMMENT '복사해서 붙여넣을 문장',
  `sent_at`     DATETIME        NULL          COMMENT '관리자가 복사한 시각',
  `created_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_digest` (`lounge_id`, `digest_date`),
  CONSTRAINT `fk_digest_lounge` FOREIGN KEY (`lounge_id`) REFERENCES `lounge` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- =============================================================================
-- 2부 · ext_* 프드프 캐시
--
-- 라운지는 별도 서비스로 돌고, 계정 · 구매 · 시청 기록 · 강의는 프드프에서
-- 받아 온다. 이 표들은 그 사본이다.
--
--   · 원본은 언제나 프드프다. 여기 값을 고치면 다음 동기화 때 덮인다
--   · 앱은 이 표를 직접 조회하지 않는다. Account 어댑터 한 곳만 읽는다
--   · 로컬 개발에서는 이 표에 시드를 넣어 프드프 없이 돌린다.
--     운영에서는 같은 표를 프드프 API 응답으로 채운다 — 어댑터는 그대로다
--
-- synced_at 은 언제 받아 온 값인지다. 비어 있으면 아직 한 번도 못 받은 것이다.
-- =============================================================================

-- 계정 -----------------------------------------------------------------------

DROP TABLE IF EXISTS `ext_user`;
CREATE TABLE `ext_user` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `nickname`   VARCHAR(60)     NOT NULL      COMMENT '라운지는 이것만 쓴다',
  `email`      VARCHAR(190)    NULL,
  `created_at` DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `synced_at` DATETIME        NULL,
  PRIMARY KEY (`id`),
  KEY `ix_user_nick` (`nickname`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 강의 · 주차 · 강 -------------------------------------------------------------

DROP TABLE IF EXISTS `ext_course`;
CREATE TABLE `ext_course` (
  `id`     BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `title`  VARCHAR(200)    NOT NULL,
  `weeks`  TINYINT UNSIGNED NOT NULL DEFAULT 8,
  `synced_at` DATETIME        NULL,
  PRIMARY KEY (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

DROP TABLE IF EXISTS `ext_lesson`;
CREATE TABLE `ext_lesson` (
  `id`         BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `course_id`  BIGINT UNSIGNED NOT NULL,
  `week`       TINYINT UNSIGNED NOT NULL,
  `seq`        SMALLINT UNSIGNED NOT NULL,
  `chapter`    VARCHAR(120)    NULL           COMMENT '소속 챕터. 검색 결과에 뜬다',
  `title`      VARCHAR(200)    NOT NULL,
  `duration`   VARCHAR(12)     NULL           COMMENT '4:20',
  `video_url`  VARCHAR(500)    NULL,
  `doc`        MEDIUMTEXT      NULL           COMMENT '교안 본문. 검색 대상',
  `synced_at` DATETIME        NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_lesson` (`course_id`, `week`, `seq`),
  FULLTEXT KEY `ft_lesson` (`title`, `doc`) /*!50100 WITH PARSER ngram */
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 주차별 미션 양식 -------------------------------------------------------------
-- 2.0 의 회차별 미션 양식을 그대로 옮긴 것. 글쓰기 창의 과제 폼이 이걸 읽는다.

DROP TABLE IF EXISTS `ext_mission`;
CREATE TABLE `ext_mission` (
  `id`        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `course_id` BIGINT UNSIGNED NOT NULL,
  `week`      TINYINT UNSIGNED NOT NULL,
  `title`     VARCHAR(200)    NOT NULL       COMMENT '이번 주 과제 제목',
  `seq`       TINYINT UNSIGNED NOT NULL,
  `question`  VARCHAR(300)    NOT NULL,
  `hint`      VARCHAR(300)    NULL           COMMENT '입력칸 placeholder',
  `synced_at` DATETIME        NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_mission` (`course_id`, `week`, `seq`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 구매 -----------------------------------------------------------------------
-- 기수와 만료일이 여기서 나온다.

DROP TABLE IF EXISTS `ext_purchase`;
CREATE TABLE `ext_purchase` (
  `id`           BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `user_id`      BIGINT UNSIGNED NOT NULL,
  `course_id`    BIGINT UNSIGNED NOT NULL,
  `cohort`       SMALLINT UNSIGNED NOT NULL,
  `purchased_at` DATETIME        NOT NULL,
  `expires_at`   DATETIME        NULL,
  `synced_at` DATETIME        NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_purchase` (`user_id`, `course_id`),
  KEY `ix_purchase_course` (`course_id`, `cohort`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 시청 기록 -------------------------------------------------------------------
-- 원본은 2.0 이다. 라운지 뷰어에서 영상을 봐도 기록은 여기로 간다.
-- lounge_member.week 는 이 표에서 계산한 값의 캐시일 뿐이다.

DROP TABLE IF EXISTS `ext_watch`;
CREATE TABLE `ext_watch` (
  `user_id`     BIGINT UNSIGNED NOT NULL,
  `lesson_id`   BIGINT UNSIGNED NOT NULL,
  `watched_at`  DATETIME        NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `is_complete` TINYINT(1)      NOT NULL DEFAULT 0,
  `synced_at` DATETIME        NULL,
  PRIMARY KEY (`user_id`, `lesson_id`),
  KEY `ix_watch_lesson` (`lesson_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 피드백권 잔여 ---------------------------------------------------------------
-- 소유는 2.0 소관이다. 라운지는 잔여를 읽기만 하고, 쓴 기록은
-- feedback_pass_use 에 남긴다.

DROP TABLE IF EXISTS `ext_feedback_pass`;
CREATE TABLE `ext_feedback_pass` (
  `user_id`     BIGINT UNSIGNED NOT NULL,
  `course_id`   BIGINT UNSIGNED NOT NULL,
  `quota_per`   TINYINT UNSIGNED NOT NULL DEFAULT 3   COMMENT '주기당 지급 수',
  `period`      ENUM('week','month') NOT NULL DEFAULT 'week',
  `period_start` DATE           NOT NULL              COMMENT '현재 주기 시작일',
  `used`        TINYINT UNSIGNED NOT NULL DEFAULT 0   COMMENT '현재 주기 사용 수',
  `synced_at` DATETIME        NULL,
  PRIMARY KEY (`user_id`, `course_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


-- 라이브 일정 -----------------------------------------------------------------

DROP TABLE IF EXISTS `ext_live`;
CREATE TABLE `ext_live` (
  `id`        BIGINT UNSIGNED NOT NULL AUTO_INCREMENT,
  `course_id` BIGINT UNSIGNED NOT NULL,
  `title`     VARCHAR(200)    NOT NULL,
  `starts_at` DATETIME        NOT NULL,
  `synced_at` DATETIME        NULL,
  PRIMARY KEY (`id`),
  KEY `ix_live_course` (`course_id`, `starts_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;


SET foreign_key_checks = 1;
