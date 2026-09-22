-- 샘플 라운지(lounge 1)에 레슨별 과제 · 자료 샘플을 보탠다. web/assets/data-mock.js 가 원본. 이미 있으면 건너뛴다.
-- 라이브: psql "$DATABASE_URL" -v ON_ERROR_STOP=1 -q -f db/patch-sample-lesson-extras.sql
BEGIN;
INSERT INTO lesson_task (lounge_id, lesson_id, seq, title, questions)
  SELECT 1, (SELECT l.id FROM ext_lesson l JOIN ext_section s ON s.id=l.section_id JOIN lounge g ON g.course_id=s.course_id WHERE g.id=1 AND s.seq=3 AND l.seq=3), 2, '내 글 다섯 개를 5기둥으로 분류하기', '[{"q":"최근 올린 글 다섯 개를 전문가 · 철학 · 증거 · 신뢰 · 상품 중 어디에 넣나요?","hint":"예: 1) 증거 2) 상품 3) 상품 4) 신뢰 5) 어디에도 안 들어감"},{"q":"비어 있는 기둥은 무엇이고, 다음 글은 어느 기둥으로 쓰나요?","hint":"예: 철학이 비어 있어서 ''왜 숙제를 적게 내는가'' 를 씁니다"}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM lesson_task x WHERE x.lounge_id=1 AND x.lesson_id=(SELECT l.id FROM ext_lesson l JOIN ext_section s ON s.id=l.section_id JOIN lounge g ON g.course_id=s.course_id WHERE g.id=1 AND s.seq=3 AND l.seq=3) AND x.title='내 글 다섯 개를 5기둥으로 분류하기' AND x.deleted_at IS NULL);
INSERT INTO lesson_task (lounge_id, lesson_id, seq, title, questions)
  SELECT 1, (SELECT l.id FROM ext_lesson l JOIN ext_section s ON s.id=l.section_id JOIN lounge g ON g.course_id=s.course_id WHERE g.id=1 AND s.seq=3 AND l.seq=3), 3, '이번 주 올릴 글 3편 제목 정하기', '[{"q":"학부모가 밤에 검색할 말로 제목 세 개를 적어보세요.","hint":"예: 초4 수학 포기, 언제부터 학원 보내야 할까"}]'::jsonb
  WHERE NOT EXISTS (SELECT 1 FROM lesson_task x WHERE x.lounge_id=1 AND x.lesson_id=(SELECT l.id FROM ext_lesson l JOIN ext_section s ON s.id=l.section_id JOIN lounge g ON g.course_id=s.course_id WHERE g.id=1 AND s.seq=3 AND l.seq=3) AND x.title='이번 주 올릴 글 3편 제목 정하기' AND x.deleted_at IS NULL);
INSERT INTO lesson_material (lounge_id, lesson_id, seq, kind, url, label)
  SELECT 1, (SELECT l.id FROM ext_lesson l JOIN ext_section s ON s.id=l.section_id JOIN lounge g ON g.course_id=s.course_id WHERE g.id=1 AND s.seq=1 AND l.seq=3), 0, 'file', 'https://example.com/files/intro-6-sentences.pdf', '학원 소개 6문장 워크시트 (PDF)'
  WHERE NOT EXISTS (SELECT 1 FROM lesson_material x WHERE x.lounge_id=1 AND x.lesson_id=(SELECT l.id FROM ext_lesson l JOIN ext_section s ON s.id=l.section_id JOIN lounge g ON g.course_id=s.course_id WHERE g.id=1 AND s.seq=1 AND l.seq=3) AND x.label='학원 소개 6문장 워크시트 (PDF)' AND x.deleted_at IS NULL);
INSERT INTO lesson_material (lounge_id, lesson_id, seq, kind, url, label)
  SELECT 1, (SELECT l.id FROM ext_lesson l JOIN ext_section s ON s.id=l.section_id JOIN lounge g ON g.course_id=s.course_id WHERE g.id=1 AND s.seq=2 AND l.seq=2), 1, 'link', 'https://smartplace.naver.com/', '네이버 스마트플레이스 관리 페이지'
  WHERE NOT EXISTS (SELECT 1 FROM lesson_material x WHERE x.lounge_id=1 AND x.lesson_id=(SELECT l.id FROM ext_lesson l JOIN ext_section s ON s.id=l.section_id JOIN lounge g ON g.course_id=s.course_id WHERE g.id=1 AND s.seq=2 AND l.seq=2) AND x.label='네이버 스마트플레이스 관리 페이지' AND x.deleted_at IS NULL);
INSERT INTO lesson_material (lounge_id, lesson_id, seq, kind, url, label)
  SELECT 1, (SELECT l.id FROM ext_lesson l JOIN ext_section s ON s.id=l.section_id JOIN lounge g ON g.course_id=s.course_id WHERE g.id=1 AND s.seq=3 AND l.seq=1), 2, 'link', 'https://keywordtool.io/', '키워드 조사 도구'
  WHERE NOT EXISTS (SELECT 1 FROM lesson_material x WHERE x.lounge_id=1 AND x.lesson_id=(SELECT l.id FROM ext_lesson l JOIN ext_section s ON s.id=l.section_id JOIN lounge g ON g.course_id=s.course_id WHERE g.id=1 AND s.seq=3 AND l.seq=1) AND x.label='키워드 조사 도구' AND x.deleted_at IS NULL);
INSERT INTO lesson_material (lounge_id, lesson_id, seq, kind, url, label)
  SELECT 1, (SELECT l.id FROM ext_lesson l JOIN ext_section s ON s.id=l.section_id JOIN lounge g ON g.course_id=s.course_id WHERE g.id=1 AND s.seq=3 AND l.seq=2), 3, 'file', 'https://example.com/files/blog-3-templates.pdf', '블로그 3종 세트 템플릿 (PDF)'
  WHERE NOT EXISTS (SELECT 1 FROM lesson_material x WHERE x.lounge_id=1 AND x.lesson_id=(SELECT l.id FROM ext_lesson l JOIN ext_section s ON s.id=l.section_id JOIN lounge g ON g.course_id=s.course_id WHERE g.id=1 AND s.seq=3 AND l.seq=2) AND x.label='블로그 3종 세트 템플릿 (PDF)' AND x.deleted_at IS NULL);
INSERT INTO lesson_material (lounge_id, lesson_id, seq, kind, url, label)
  SELECT 1, (SELECT l.id FROM ext_lesson l JOIN ext_section s ON s.id=l.section_id JOIN lounge g ON g.course_id=s.course_id WHERE g.id=1 AND s.seq=3 AND l.seq=3), 4, 'file', 'https://example.com/files/content-5-pillars.pdf', '콘텐츠 5기둥 분류표 (PDF)'
  WHERE NOT EXISTS (SELECT 1 FROM lesson_material x WHERE x.lounge_id=1 AND x.lesson_id=(SELECT l.id FROM ext_lesson l JOIN ext_section s ON s.id=l.section_id JOIN lounge g ON g.course_id=s.course_id WHERE g.id=1 AND s.seq=3 AND l.seq=3) AND x.label='콘텐츠 5기둥 분류표 (PDF)' AND x.deleted_at IS NULL);
INSERT INTO lesson_material (lounge_id, lesson_id, seq, kind, url, label)
  SELECT 1, (SELECT l.id FROM ext_lesson l JOIN ext_section s ON s.id=l.section_id JOIN lounge g ON g.course_id=s.course_id WHERE g.id=1 AND s.seq=3 AND l.seq=3), 5, 'link', 'https://www.naver.com/', '학부모 질문 TOP 10 예시 모음'
  WHERE NOT EXISTS (SELECT 1 FROM lesson_material x WHERE x.lounge_id=1 AND x.lesson_id=(SELECT l.id FROM ext_lesson l JOIN ext_section s ON s.id=l.section_id JOIN lounge g ON g.course_id=s.course_id WHERE g.id=1 AND s.seq=3 AND l.seq=3) AND x.label='학부모 질문 TOP 10 예시 모음' AND x.deleted_at IS NULL);
DO $$ DECLARE t int; m int; BEGIN SELECT count(*) INTO t FROM lesson_task WHERE lounge_id=1 AND deleted_at IS NULL; SELECT count(*) INTO m FROM lesson_material WHERE lounge_id=1 AND deleted_at IS NULL; RAISE NOTICE '샘플 라운지 과제 % · 자료 % (10 · 6 이어야 한다)', t, m; END $$;
COMMIT;
