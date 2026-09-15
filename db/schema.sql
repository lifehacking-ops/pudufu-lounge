-- =============================================================================
-- 프드프 라운지 · 스키마 (PostgreSQL 14+)
--
-- 라운지는 프드프와 별도 서비스로 돈다. 계정 · 구매 · 시청 기록 · 강의만
-- 프드프에서 받아 오고 나머지는 전부 여기 있다.
--
-- 규약
--   · 시각은 timestamptz. 앱은 UTC 로 접속한다 (SET TIME ZONE 'UTC')
--   · 삭제는 deleted_at 으로 한다. 물리 삭제하지 않는다
--   · 외래키는 라운지 테이블끼리만 건다. 프드프에서 온 값(user_id, course_id)에는
--     절대 걸지 않는다 — 우리 DB 가 아니라 남의 사실이다
--   · 나중에 MySQL 로 되돌릴 수 있게 Postgres 전용 문법을 아껴 쓴다.
--     DISTINCT ON · 배열 타입 · RETURNING 남용을 피한다
--
-- 두 덩어리로 나뉜다
--   1부  라운지 테이블   라운지가 소유한다. 원본이 여기 있다
--   2부  ext_* 캐시      프드프에서 받아 온 것. 원본은 저쪽이고 여기는 사본이다.
--                        절대 여기서 고치지 않는다 — 고쳐야 할 값은 프드프에 있다
-- =============================================================================

-- 한글 부분 일치 검색용. Supabase 에는 이미 들어 있다.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

DROP TABLE IF EXISTS post_report, lounge_week, lounge_digest, feedback_pass_use, post_view, reaction,
  comment, attachment, post_answer, post, lounge_category, category,
  lounge_member, lounge CASCADE;
DROP TABLE IF EXISTS ext_live, ext_feedback_pass, ext_watch, ext_purchase,
  ext_mission, ext_lesson, ext_week, ext_course, ext_user CASCADE;
DROP TYPE IF EXISTS lounge_role, chip_placement, attachment_kind,
  reaction_target, pass_period CASCADE;
DROP FUNCTION IF EXISTS touch_updated_at CASCADE;

CREATE TYPE lounge_role     AS ENUM ('student', 'instructor', 'admin');
CREATE TYPE chip_placement  AS ENUM ('show', 'more');
CREATE TYPE attachment_kind AS ENUM ('image', 'link', 'youtube', 'video');
CREATE TYPE reaction_target AS ENUM ('post', 'comment');
CREATE TYPE pass_period     AS ENUM ('week', 'month');

-- updated_at 을 손으로 챙기지 않는다. MySQL 의 ON UPDATE CURRENT_TIMESTAMP 자리.
CREATE FUNCTION touch_updated_at() RETURNS trigger AS $fn$
BEGIN
  NEW.updated_at = now();
  RETURN NEW;
END;
$fn$ LANGUAGE plpgsql;


-- =============================================================================
-- 1부 · 라운지
-- =============================================================================

-- 라운지 ---------------------------------------------------------------------
-- 강의 하나에 라운지 하나. 한 강의의 모든 기수가 여기 섞인다.

CREATE TABLE lounge (
  id         bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id  bigint       NOT NULL UNIQUE,
  name       varchar(120) NOT NULL,
  intro      text,
  todo       text,
  banner_url varchar(500),
  is_active  boolean      NOT NULL DEFAULT true,
  created_at timestamptz  NOT NULL DEFAULT now(),
  updated_at timestamptz  NOT NULL DEFAULT now()
);
COMMENT ON COLUMN lounge.course_id IS '프드프 강의 id. 우리 테이블이 아니므로 FK 를 걸지 않는다';
COMMENT ON COLUMN lounge.todo      IS '소개 카드의 오늘 할 일. 한 줄에 하나. 배열 타입을 쓰지 않는다';
CREATE TRIGGER lounge_touch BEFORE UPDATE ON lounge
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- 라운지 멤버 ----------------------------------------------------------------
-- 역할이 여기 붙는다. 계정이 아니라 라운지 단위다.
-- 만료되어도 행을 지우지 않는다. 만료는 상태일 뿐이고, 지우면 그 사람이 쓴
-- 글의 맥락이 끊긴다.

CREATE TABLE lounge_member (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lounge_id      bigint      NOT NULL REFERENCES lounge (id),
  user_id        bigint      NOT NULL,
  role           lounge_role NOT NULL DEFAULT 'student',
  cohort         smallint,
  joined_at      timestamptz NOT NULL,
  expires_at     timestamptz,
  last_seen_at   timestamptz,

  -- 프드프 시청 기록에서 계산한 값의 캐시. 원본이 아니다.
  -- 하루 한 번 동기화면 충분하다(대시보드가 오늘 아침 기준으로만 맞으면 된다).
  week           smallint    NOT NULL DEFAULT 1,
  week_synced_at timestamptz,

  /* 돈을 낸 사람을 쫓아낼 수는 없다. 읽기는 두고 쓰기만 멈춘다.
     기한이 지나면 저절로 풀린다 — 영구 정지는 사실상 환불 문제가 된다. */
  muted_until    timestamptz,
  muted_reason   varchar(200),

  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lounge_id, user_id)
);
COMMENT ON COLUMN lounge_member.cohort     IS '구매 데이터에서 판정. 스태프는 NULL';
COMMENT ON COLUMN lounge_member.expires_at IS 'NULL 이면 무기한(스태프)';

CREATE INDEX ix_member_role ON lounge_member (lounge_id, role);
-- 이탈 위험 명단
CREATE INDEX ix_member_seen ON lounge_member (lounge_id, last_seen_at);
-- 주차별 이탈 퍼널
CREATE INDEX ix_member_week ON lounge_member (lounge_id, week);
CREATE INDEX ix_member_user ON lounge_member (user_id);
CREATE TRIGGER member_touch BEFORE UPDATE ON lounge_member
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- 카테고리 -------------------------------------------------------------------
-- 전역 풀이다. 어느 라운지에 어떻게 놓이는지는 lounge_category 가 정한다.
--
-- is_system 은 이름 뒤에 동작이 붙어 있다는 뜻이다. '과제'에는 주차별 미션
-- 양식이, 피드백권 카테고리에는 권 소모가 묶여 있어서 지우면 기능이 같이 죽는다.

CREATE TABLE category (
  id            bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  name          varchar(40) NOT NULL,
  is_system     boolean     NOT NULL DEFAULT false,
  pass_required boolean     NOT NULL DEFAULT false,
  created_at    timestamptz NOT NULL DEFAULT now(),
  updated_at    timestamptz NOT NULL DEFAULT now(),
  deleted_at    timestamptz
);
COMMENT ON COLUMN category.pass_required IS '피드백권을 쓰는 카테고리';

-- 살아 있는 같은 이름은 하나뿐, 지워진 것은 여럿 남아도 된다.
-- 부분 인덱스 한 줄로 끝난다. MySQL 이라면 생성 컬럼을 따로 두어야 한다.
CREATE UNIQUE INDEX uq_category_live ON category (name) WHERE deleted_at IS NULL;
CREATE TRIGGER category_touch BEFORE UPDATE ON category
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- 라운지별 카테고리 배치 ------------------------------------------------------
-- 행이 없으면 '미사용'이다. 미사용 카테고리는 그 라운지에서 필터에도 안 뜨고
-- 글도 못 쓴다.
--
-- 쓰기 권한을 여기 둔 이유 — 권한은 라운지에 붙기 때문이다. 학원마케팅
-- 라운지에서 공지를 잠가도 올인원 AI 라운지는 영향을 받으면 안 된다.
-- 관리자 컬럼은 두지 않는다. 관리자는 항상 쓸 수 있다.

CREATE TABLE lounge_category (
  lounge_id            bigint         NOT NULL REFERENCES lounge (id),
  category_id          bigint         NOT NULL REFERENCES category (id),
  placement            chip_placement NOT NULL DEFAULT 'show',
  sort                 smallint       NOT NULL DEFAULT 0,
  student_can_write    boolean        NOT NULL DEFAULT true,
  instructor_can_write boolean        NOT NULL DEFAULT true,
  created_at           timestamptz    NOT NULL DEFAULT now(),
  updated_at           timestamptz    NOT NULL DEFAULT now(),
  PRIMARY KEY (lounge_id, category_id)
);
COMMENT ON COLUMN lounge_category.placement IS 'show = 기본 노출, more = 필터 더보기 안';

CREATE INDEX ix_lc_place    ON lounge_category (lounge_id, placement, sort);
CREATE INDEX ix_lc_category ON lounge_category (category_id);
CREATE TRIGGER lc_touch BEFORE UPDATE ON lounge_category
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- 글 -------------------------------------------------------------------------
-- author_name 은 작성 시점 닉네임의 스냅샷이다. 닉네임을 바꿔도 과거 글의
-- 이름은 그대로 남는다. 표시는 author_name, 판정과 집계는 전부 user_id 다.
--
-- reaction_count / comment_count 는 파생값이지만 컬럼으로 둔다. 추천순 정렬이
-- 실제 기능이고, 매번 집계하면 인덱스를 못 탄다. 쓰기 경로에서 같이 갱신하고
-- 주기적으로 재계산한다.

CREATE TABLE post (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lounge_id      bigint       NOT NULL REFERENCES lounge (id),
  category_id    bigint       NOT NULL REFERENCES category (id),
  user_id        bigint       NOT NULL,
  author_name    varchar(60)  NOT NULL,
  title          varchar(200) NOT NULL,
  body           text,
  week           smallint,
  is_pinned      boolean      NOT NULL DEFAULT false,
  reaction_count integer      NOT NULL DEFAULT 0,
  comment_count  integer      NOT NULL DEFAULT 0,
  view_count     integer      NOT NULL DEFAULT 0,
  created_at     timestamptz  NOT NULL DEFAULT now(),
  updated_at     timestamptz  NOT NULL DEFAULT now(),
  edited_at      timestamptz,
  deleted_at     timestamptz,
  deleted_by     bigint
);
COMMENT ON COLUMN post.author_name IS '작성 시점 닉네임 스냅샷';
COMMENT ON COLUMN post.body        IS '평문. 리치 텍스트 아님';
COMMENT ON COLUMN post.week        IS '과제 글만. 그 외 NULL';
COMMENT ON COLUMN post.edited_at   IS '사용자가 고친 시각. updated_at 과 다르다';

CREATE INDEX ix_post_feed   ON post (lounge_id, is_pinned DESC, created_at DESC) WHERE deleted_at IS NULL;
CREATE INDEX ix_post_cat    ON post (lounge_id, category_id, created_at DESC)    WHERE deleted_at IS NULL;
CREATE INDEX ix_post_hot    ON post (lounge_id, reaction_count DESC)             WHERE deleted_at IS NULL;
CREATE INDEX ix_post_mine   ON post (user_id, created_at DESC)                   WHERE deleted_at IS NULL;
-- 과제 제출 여부 · 미제출 명단
CREATE INDEX ix_post_submit ON post (lounge_id, category_id, week, user_id)      WHERE deleted_at IS NULL;
-- 어제 올라온 글 집계
CREATE INDEX ix_post_recent ON post (lounge_id, created_at);
-- 한글 부분 일치. ILIKE '%…%' 가 인덱스를 탄다.
CREATE INDEX ix_post_trgm_title ON post USING gin (title gin_trgm_ops);
CREATE INDEX ix_post_trgm_body  ON post USING gin (body gin_trgm_ops);

CREATE TRIGGER post_touch BEFORE UPDATE ON post
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- 과제 미션 답변 --------------------------------------------------------------
-- 질문 문구도 같이 저장한다. 나중에 미션 양식이 바뀌어도 그때 무엇에 답한
-- 글이었는지 남아야 한다.

CREATE TABLE post_answer (
  id       bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id  bigint       NOT NULL REFERENCES post (id) ON DELETE CASCADE,
  seq      smallint     NOT NULL,
  question varchar(300) NOT NULL,
  answer   text         NOT NULL,
  UNIQUE (post_id, seq)
);
COMMENT ON COLUMN post_answer.question IS '작성 시점 질문 스냅샷';


-- 첨부 -----------------------------------------------------------------------
-- youtube 는 url 만 저장하고 임베드는 클라이언트가 만든다.
-- 영상은 Cloudflare Stream 에 있고 허용 도메인으로 막혀 있다.

CREATE TABLE attachment (
  id      bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id bigint          NOT NULL REFERENCES post (id) ON DELETE CASCADE,
  kind    attachment_kind NOT NULL,
  url     varchar(1000)   NOT NULL,
  label   varchar(300),
  sort    smallint        NOT NULL DEFAULT 0
);
COMMENT ON COLUMN attachment.label IS '캡션 또는 링크 제목';
CREATE INDEX ix_attach_post ON attachment (post_id, sort);


-- 댓글 -----------------------------------------------------------------------
-- 답글은 한 단계까지만. parent_id 가 있는 행은 parent_id 를 가질 수 없다
-- (앱에서 강제한다. 제약으로는 표현하지 않는다).

CREATE TABLE comment (
  id             bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  post_id        bigint      NOT NULL REFERENCES post (id) ON DELETE CASCADE,
  parent_id      bigint      REFERENCES comment (id) ON DELETE CASCADE,
  user_id        bigint      NOT NULL,
  author_name    varchar(60) NOT NULL,
  body           text        NOT NULL,
  reaction_count integer     NOT NULL DEFAULT 0,
  created_at     timestamptz NOT NULL DEFAULT now(),
  updated_at     timestamptz NOT NULL DEFAULT now(),
  deleted_at     timestamptz,
  deleted_by     bigint
);
COMMENT ON COLUMN comment.parent_id IS 'NULL 이면 원댓글';

CREATE INDEX ix_comment_post   ON comment (post_id, created_at) WHERE deleted_at IS NULL;
CREATE INDEX ix_comment_parent ON comment (parent_id, created_at);
-- 강사가 어제 남긴 피드백 수
CREATE INDEX ix_comment_user   ON comment (user_id, created_at);
CREATE INDEX ix_comment_trgm   ON comment USING gin (body gin_trgm_ops);

CREATE TRIGGER comment_touch BEFORE UPDATE ON comment
  FOR EACH ROW EXECUTE FUNCTION touch_updated_at();


-- 반응 -----------------------------------------------------------------------
-- 글과 댓글을 같이 받는다. 대상이 둘이라 외래키를 걸 수 없다.
-- 삭제는 앱이 맞춰서 지운다.

CREATE TABLE reaction (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  target_kind reaction_target NOT NULL,
  target_id   bigint          NOT NULL,
  user_id     bigint          NOT NULL,
  emoji       varchar(16)     NOT NULL,
  created_at  timestamptz     NOT NULL DEFAULT now(),
  UNIQUE (target_kind, target_id, user_id, emoji)
);
COMMENT ON COLUMN reaction.emoji IS '한 종류씩. 👍 🔥 👏 …';

CREATE INDEX ix_reaction_target ON reaction (target_kind, target_id);
-- 반응한 글 필터
CREATE INDEX ix_reaction_user   ON reaction (user_id, target_kind);


-- 조회 -----------------------------------------------------------------------
-- 사람 단위로 한 번만 센다. post.view_count 는 이 표의 수다.

CREATE TABLE post_view (
  post_id   bigint      NOT NULL REFERENCES post (id) ON DELETE CASCADE,
  user_id   bigint      NOT NULL,
  viewed_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);


-- 피드백권 소모 ---------------------------------------------------------------
-- 권의 소유와 잔여는 프드프의 기존 테이블이 갖는다. 여기는 '라운지에서 언제
-- 무엇에 썼는가'만 기록한다.
--
-- 권은 글을 올리는 시점에 소모된다. 답이 오지 않아도 이미 나갔다 — 그래서
-- 대시보드의 대기열이 밀리면 안 된다.
--
-- post 를 지워도 이 기록은 남아야 하므로 CASCADE 를 걸지 않는다.
-- 소모는 이미 일어난 사실이다.

CREATE TABLE feedback_pass_use (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lounge_id bigint      NOT NULL,
  user_id   bigint      NOT NULL,
  post_id   bigint      NOT NULL UNIQUE,
  used_at   timestamptz NOT NULL DEFAULT now()
);
COMMENT ON COLUMN feedback_pass_use.post_id IS '글 하나에 한 번';
CREATE INDEX ix_pass_user ON feedback_pass_use (lounge_id, user_id, used_at);


-- 신고 -----------------------------------------------------------------------
-- 알림이 없으므로 신고는 관리자가 게시물 관리에서 본다. 한 사람이 같은 글을
-- 여러 번 신고해도 한 건으로 센다.

CREATE TABLE post_report (
  post_id    bigint      NOT NULL REFERENCES post (id) ON DELETE CASCADE,
  user_id    bigint      NOT NULL,
  reason     varchar(200),
  created_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (post_id, user_id)
);

CREATE INDEX ix_report_recent ON post_report (created_at);


-- 주차 게시 여부 ---------------------------------------------------------------
-- 강의 내용은 프드프가 갖지만, 어느 주차를 라운지에서 열지는 라운지가 정한다.
-- 그래서 ext_ 가 아니라 여기 있다. 행이 없으면 공개로 본다.

CREATE TABLE lounge_week (
  lounge_id  bigint      NOT NULL REFERENCES lounge (id),
  week       smallint    NOT NULL,
  published  boolean     NOT NULL DEFAULT true,
  updated_at timestamptz NOT NULL DEFAULT now(),
  PRIMARY KEY (lounge_id, week)
);


-- 어제 커뮤니티 요약 -----------------------------------------------------------
-- payload 는 줄별 숫자, body 는 카톡에 그대로 붙여넣을 완성된 문장이다.
-- 하루가 지나면 원본 데이터가 움직이므로(글이 지워지는 등) 그날 만든 문장을
-- 그대로 보관한다.
--
-- payload 는 읽기만 한다. 안을 뒤져 걸러야 할 값이 생기면 컬럼으로 꺼낸다 —
-- jsonb 안을 인덱싱하기 시작하면 MySQL 로 되돌릴 때 생성 컬럼이 필요해진다.

CREATE TABLE lounge_digest (
  id          bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  lounge_id   bigint      NOT NULL REFERENCES lounge (id),
  digest_date date        NOT NULL,
  payload     jsonb       NOT NULL,
  body        text        NOT NULL,
  sent_at     timestamptz,
  created_at  timestamptz NOT NULL DEFAULT now(),
  UNIQUE (lounge_id, digest_date)
);
COMMENT ON COLUMN lounge_digest.digest_date IS '요약 대상이 된 날(어제)';
COMMENT ON COLUMN lounge_digest.body        IS '복사해서 붙여넣을 문장';
COMMENT ON COLUMN lounge_digest.sent_at     IS '관리자가 복사한 시각';


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

CREATE TABLE ext_user (
  id         bigint      PRIMARY KEY,
  nickname   varchar(60) NOT NULL,
  email      varchar(190),
  created_at timestamptz NOT NULL DEFAULT now(),
  synced_at  timestamptz
);
COMMENT ON COLUMN ext_user.nickname IS '라운지는 이것만 쓴다';
CREATE INDEX ix_user_nick ON ext_user (nickname);


CREATE TABLE ext_course (
  id        bigint       PRIMARY KEY,
  title     varchar(200) NOT NULL,
  weeks     smallint     NOT NULL DEFAULT 8,
  synced_at timestamptz
);


-- 주차 제목. 강의 목록의 카드 제목이 된다.
CREATE TABLE ext_week (
  course_id bigint       NOT NULL,
  week      smallint     NOT NULL,
  title     varchar(200) NOT NULL,
  synced_at timestamptz,
  PRIMARY KEY (course_id, week)
);


CREATE TABLE ext_lesson (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id bigint       NOT NULL,
  week      smallint     NOT NULL,
  seq       smallint     NOT NULL,
  chapter   varchar(120),
  title     varchar(200) NOT NULL,
  duration  varchar(12),
  video_url varchar(500),
  doc       text,
  synced_at timestamptz,
  UNIQUE (course_id, week, seq)
);
COMMENT ON COLUMN ext_lesson.chapter IS '소속 챕터. 검색 결과에 뜬다';
COMMENT ON COLUMN ext_lesson.doc     IS '교안 본문. 검색 대상';
CREATE INDEX ix_lesson_trgm ON ext_lesson USING gin (doc gin_trgm_ops);


-- 프드프의 회차별 미션 양식. 글쓰기 창의 과제 폼이 이걸 읽는다.
CREATE TABLE ext_mission (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id bigint       NOT NULL,
  week      smallint     NOT NULL,
  title     varchar(200) NOT NULL,
  seq       smallint     NOT NULL,
  question  varchar(300) NOT NULL,
  hint      varchar(300),
  synced_at timestamptz,
  UNIQUE (course_id, week, seq)
);
COMMENT ON COLUMN ext_mission.title IS '이번 주 과제 제목';
COMMENT ON COLUMN ext_mission.hint  IS '입력칸 placeholder';


-- 기수와 만료일이 여기서 나온다.
CREATE TABLE ext_purchase (
  id           bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  user_id      bigint      NOT NULL,
  course_id    bigint      NOT NULL,
  cohort       smallint    NOT NULL,
  purchased_at timestamptz NOT NULL,
  expires_at   timestamptz,
  synced_at    timestamptz,
  UNIQUE (user_id, course_id)
);
CREATE INDEX ix_purchase_course ON ext_purchase (course_id, cohort);


-- 시청 기록. 원본은 프드프다. 라운지 뷰어에서 봐도 기록은 그쪽으로 간다.
-- lounge_member.week 는 이 표에서 계산한 값의 캐시일 뿐이다.
CREATE TABLE ext_watch (
  user_id     bigint      NOT NULL,
  lesson_id   bigint      NOT NULL,
  watched_at  timestamptz NOT NULL DEFAULT now(),
  is_complete boolean     NOT NULL DEFAULT false,
  synced_at   timestamptz,
  PRIMARY KEY (user_id, lesson_id)
);
CREATE INDEX ix_watch_lesson ON ext_watch (lesson_id);


-- 피드백권 잔여. 소유는 프드프 소관이고 라운지는 읽기만 한다.
CREATE TABLE ext_feedback_pass (
  user_id      bigint      NOT NULL,
  course_id    bigint      NOT NULL,
  quota_per    smallint    NOT NULL DEFAULT 3,
  period       pass_period NOT NULL DEFAULT 'week',
  period_start date        NOT NULL,
  used         smallint    NOT NULL DEFAULT 0,
  synced_at    timestamptz,
  PRIMARY KEY (user_id, course_id)
);
COMMENT ON COLUMN ext_feedback_pass.quota_per    IS '주기당 지급 수';
COMMENT ON COLUMN ext_feedback_pass.period_start IS '현재 주기 시작일';
COMMENT ON COLUMN ext_feedback_pass.used         IS '현재 주기 사용 수';


CREATE TABLE ext_live (
  id        bigint GENERATED ALWAYS AS IDENTITY PRIMARY KEY,
  course_id bigint       NOT NULL,
  title     varchar(200) NOT NULL,
  starts_at timestamptz  NOT NULL,
  synced_at timestamptz
);
CREATE INDEX ix_live_course ON ext_live (course_id, starts_at);
