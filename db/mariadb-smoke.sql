-- =============================================================================
-- MariaDB 변환 검증 · 스키마를 올린 DB 에서 돌린다 (빈 DB 든 시드가 든 DB 든)
--
--   mariadb lounge < db/schema.mariadb.sql
--   mariadb lounge < db/mariadb-smoke.sql
--
-- Postgres 판이 기대던 동작이 MariaDB 에서도 같은지 하나씩 확인한다.
-- 각 절은 SELECT 로 결과를 내고, 어긋나면 마지막 줄의 SIGNAL 이 멈춘다.
-- 만드는 행은 전부 '검증·' 이름을 달고, 끝나면 그것만 지운다 — 몇 번 돌려도 같고 시드 데이터는 건드리지 않는다.
-- =============================================================================

SET time_zone = '+00:00';

-- 준비 ---------------------------------------------------------------------
-- 앞선 실행이 중간에 멈췄으면 검증 행이 남아 있다. 먼저 치운다 — 그래야 몇 번을 돌려도 같다.
SET @L0 = (SELECT id FROM lounge WHERE course_id = 9001);
DELETE FROM post WHERE lounge_id = @L0;
DELETE FROM lounge_member WHERE lounge_id = @L0;
DELETE FROM lounge_week WHERE lounge_id = @L0;
DELETE FROM lounge_category WHERE lounge_id = @L0;
DELETE FROM lounge WHERE id = @L0;
DELETE FROM category WHERE name LIKE '검증·%';

INSERT INTO lounge (course_id, name, intro_att) VALUES (9001, '검증 라운지', '[{"kind":"link","url":"https://example.com","label":"예"}]');
SET @L = LAST_INSERT_ID();
INSERT INTO category (name, is_system) VALUES ('검증·과제', TRUE), ('검증·자유', FALSE);
SET @CAT = (SELECT id FROM category WHERE name = '검증·자유');

-- 1. 살아 있는 카테고리 이름은 하나뿐 (부분 유니크 인덱스의 대체) ---------------
--    같은 이름을 다시 넣으면 막혀야 하고, 지운 뒤에는 들어가야 한다.
SET @dup = 0;
INSERT IGNORE INTO category (name) VALUES ('검증·자유');
SET @dup = ROW_COUNT();            -- 0 이면 막힌 것
UPDATE category SET deleted_at = NOW(6) WHERE name = '검증·자유' AND deleted_at IS NULL;
INSERT INTO category (name) VALUES ('검증·자유');   -- 지운 뒤라 들어가야 한다
SELECT '1 uq_category_live' AS chk, @dup AS dup_inserted, count(*) AS live_now
  FROM category WHERE name = '검증·자유' AND deleted_at IS NULL;
SET @CAT = (SELECT id FROM category WHERE name = '검증·자유' AND deleted_at IS NULL);
INSERT INTO lounge_category (lounge_id, category_id) VALUES (@L, @CAT);

-- 2. client_key : 같은 열쇠는 한 번, NULL 은 여럿 ----------------------------
INSERT INTO post (lounge_id, category_id, user_id, author_name, title, client_key)
  VALUES (@L, @CAT, 7, '박현종', '첫 글', 'k-1');
SET @P1 = LAST_INSERT_ID();
INSERT IGNORE INTO post (lounge_id, category_id, user_id, author_name, title, client_key)
  VALUES (@L, @CAT, 7, '박현종', '첫 글 (두 번 누름)', 'k-1');
SET @twin = ROW_COUNT();
INSERT INTO post (lounge_id, category_id, user_id, author_name, title, client_key)
  VALUES (@L, @CAT, 8, '김선주', '열쇠 없음 1', NULL), (@L, @CAT, 9, '정해린', '열쇠 없음 2', NULL);
SELECT '2 client_key' AS chk, @twin AS twin_inserted, count(*) AS null_keys FROM post WHERE client_key IS NULL;

-- 3. INSERT … RETURNING (writes.js 의 createPost · createComment · addCategory) -
INSERT INTO comment (post_id, user_id, author_name, body) VALUES (@P1, 8, '김선주', '첫 댓글') RETURNING id AS returned_id;

-- 4. INSERT IGNORE … RETURNING = Postgres 의 ON CONFLICT DO NOTHING RETURNING (첫 조회 판정)
INSERT IGNORE INTO post_view (post_id, user_id) VALUES (@P1, 8) RETURNING post_id AS first_view;
INSERT IGNORE INTO post_view (post_id, user_id) VALUES (@P1, 8) RETURNING post_id AS second_view_should_be_empty;

-- 5. ON DUPLICATE KEY UPDATE = ON CONFLICT DO UPDATE (주차 마감 · 게시 여부) -----
INSERT INTO lounge_week (lounge_id, week, due_at) VALUES (@L, 3, '2026-09-19 09:00:00')
  ON DUPLICATE KEY UPDATE due_at = VALUES(due_at);
INSERT INTO lounge_week (lounge_id, week, due_at) VALUES (@L, 3, '2026-09-20 09:00:00')
  ON DUPLICATE KEY UPDATE due_at = VALUES(due_at);
SELECT '5 upsert' AS chk, count(*) AS rows_should_be_1, max(due_at) AS due FROM lounge_week WHERE lounge_id = @L;

-- 6. UPDATE 뒤 값 읽기 (Postgres 는 UPDATE … RETURNING 이었다. MariaDB 는 두 문장) -
UPDATE post SET view_count = view_count + 1 WHERE id = @P1;
SELECT '6 update-then-select' AS chk, view_count FROM post WHERE id = @P1;

-- 7. updated_at 이 저절로 갱신되는가 (트리거 대신 ON UPDATE) ------------------
SELECT SLEEP(0.01);
UPDATE post SET title = '첫 글 (고침)' WHERE id = @P1;
SELECT '7 on-update' AS chk, updated_at > created_at AS touched FROM post WHERE id = @P1;

-- 8. JSON 집계 = json_agg(json_build_object(…) ORDER BY …) --------------------
INSERT INTO post_answer (post_id, seq, question, answer) VALUES (@P1, 2, '둘째 질문', '둘째 답'), (@P1, 1, '첫 질문', '첫 답');
SELECT '8 json_arrayagg' AS chk,
       JSON_ARRAYAGG(JSON_OBJECT('seq', a.seq, 'q', a.question, 'a', a.answer) ORDER BY a.seq) AS answers
  FROM post_answer a WHERE a.post_id = @P1;
-- 행이 없을 때는 NULL 이 오므로 COALESCE 로 '[]' 를 준다 (queries.js 의 coalesce(json_agg…, '[]'))
SELECT '8b empty' AS chk, COALESCE(JSON_ARRAYAGG(JSON_OBJECT('e', emoji)), JSON_ARRAY()) AS emojis
  FROM reaction WHERE target_id = -1;

-- 9. FILTER (WHERE …) = SUM(CASE …) (railStats) --------------------------------
INSERT INTO lounge_member (lounge_id, user_id, role, cohort, joined_at, last_seen_at)
  VALUES (@L, 7, 'admin', NULL, NOW(6), NOW(6)), (@L, 8, 'student', 3, NOW(6), NOW(6)), (@L, 9, 'student', 2, NOW(6), NOW(6) - INTERVAL 3 DAY);
SELECT '9 filter' AS chk,
       SUM(role = 'student') AS students,
       SUM(last_seen_at >= NOW(6) - INTERVAL 1 DAY) AS today,
       COUNT(DISTINCT cohort) AS cohorts
  FROM lounge_member WHERE lounge_id = @L;

-- 10. 복합 커서 페이징 : (created_at, id) < (?, ?) 행 비교 --------------------
SELECT '10 row-compare' AS chk, count(*) AS older_than_p1
  FROM post p WHERE (p.created_at, p.id) < ((SELECT created_at FROM post WHERE id = @P1), @P1);

-- 11. IN (…) = ANY($ids) · CTE · LIKE 대소문자 무시 ------------------------------
WITH got AS (SELECT id FROM post WHERE id IN (@P1, @P1 + 1, @P1 + 2))
SELECT '11 cte-in-like' AS chk, count(*) AS n_in,
       (SELECT count(*) FROM post WHERE title LIKE '%글%') AS n_like,
       (SELECT count(*) FROM post WHERE author_name LIKE '%박%') AS n_like2
  FROM got;

-- 12. 정지 기한 = now() + ($2 || ' days')::interval -----------------------------
SET @days = 7;
UPDATE lounge_member SET muted_until = NOW(6) + INTERVAL @days DAY, muted_reason = '검증' WHERE lounge_id = @L AND user_id = 9;
SELECT '12 interval' AS chk, DATEDIFF(muted_until, NOW(6)) AS days_ahead FROM lounge_member WHERE lounge_id = @L AND user_id = 9;

-- 13. JSON 컬럼 왕복 ------------------------------------------------------------
SELECT '13 json' AS chk, JSON_VALID(intro_att) AS valid, JSON_EXTRACT(intro_att, '$[0].kind') AS kind FROM lounge WHERE id = @L;

-- 14. 15초 쌍둥이 검사 = created_at > now() - interval '15 seconds' ---------------
SELECT '14 twin-window' AS chk, count(*) AS recent
  FROM post WHERE user_id = 7 AND title = '첫 글 (고침)' AND deleted_at IS NULL AND created_at > NOW(6) - INTERVAL 15 SECOND;

-- 판정 --------------------------------------------------------------------------
SET @ok = (@dup = 0) AND (@twin = 0)
      AND (SELECT count(*) FROM lounge_week WHERE lounge_id = @L) = 1
      AND (SELECT view_count FROM post WHERE id = @P1) = 1
      AND (SELECT updated_at > created_at FROM post WHERE id = @P1);
SELECT IF(@ok, 'SMOKE OK', 'SMOKE FAILED') AS result;

-- 청소 --------------------------------------------------------------------------
DELETE FROM post WHERE lounge_id = @L;              -- answer · comment · view 는 CASCADE
DELETE FROM lounge_member WHERE lounge_id = @L;
DELETE FROM lounge_week WHERE lounge_id = @L;
DELETE FROM lounge_category WHERE lounge_id = @L;
DELETE FROM lounge WHERE id = @L;
DELETE FROM category WHERE name LIKE '검증·%';

-- 위 result 줄이 SMOKE OK 여야 한다.
