-- =====================================================
-- Lexical Model Phase 1 資料層測試
--
-- ⚠️ psql 專用（用到 \set / \echo）。不要貼進 Supabase SQL Editor。
--
-- 執行方式（本機臨時資料庫，勿指向正式環境）：
--   createdb lex
--   psql -v ON_ERROR_STOP=1 -d lex -f supabase/tests/_local_harness.sql
--   psql -v ON_ERROR_STOP=1 -d lex -f supabase/migrations/create_user_profiles_table.sql
--   psql -v ON_ERROR_STOP=1 -d lex -f supabase/schema.sql
--   ... （其餘 baseline 與 lexical migration，順序見 docs/lexical/phase1.md）
--   psql -v ON_ERROR_STOP=1 -d lex -f supabase/tests/lexical_phase1_test.sql
--
-- 重點不在快樂路徑，而在：
--   * 跨學生隔離（RLS）
--   * 「不安全就不合併」真的沒有合併
--   * attempt 與 mastery 真的分離
--   * 舊表真的沒有被動到
-- =====================================================

\set ON_ERROR_STOP on
\pset tuples_only on
\pset format unaligned

CREATE OR REPLACE FUNCTION t_assert(cond BOOLEAN, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  IF cond THEN RAISE NOTICE 'PASS  %', label;
  ELSE RAISE EXCEPTION 'FAIL  %', label; END IF;
END $$;

CREATE OR REPLACE FUNCTION t_expect_error(stmt TEXT, label TEXT) RETURNS VOID
LANGUAGE plpgsql AS $$
BEGIN
  EXECUTE stmt;
  RAISE EXCEPTION 'FAIL  % （預期要失敗，但成功了）', label;
EXCEPTION WHEN OTHERS THEN
  IF SQLERRM LIKE 'FAIL %' THEN RAISE; END IF;
  RAISE NOTICE 'PASS  % （擋下：%）', label, left(SQLERRM, 50);
END $$;


-- =====================================================
-- 清場：讓這支測試可以重複執行
-- =====================================================
DELETE FROM lexical_attempts;
DELETE FROM student_lexical_mastery;
DELETE FROM lexical_unresolved_relations;
DELETE FROM lexical_relations;
DELETE FROM lexical_pack_items;
DELETE FROM lexical_legacy_map;
DELETE FROM lexical_items;
DELETE FROM user_word_progress;
DELETE FROM pack_items;
DELETE FROM user_pack_claims;
DELETE FROM packs;
DELETE FROM level_words;
DELETE FROM user_profiles WHERE user_id IN (SELECT id FROM auth.users WHERE email LIKE 'lex-%@test');
DELETE FROM auth.users WHERE email LIKE 'lex-%@test';


-- =====================================================
-- Fixtures
-- =====================================================
INSERT INTO auth.users (id, email) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001', 'lex-a@test'),   -- 學生 A
  ('bbbbbbbb-0000-0000-0000-000000000002', 'lex-b@test'),   -- 學生 B
  ('cccccccc-0000-0000-0000-000000000003', 'lex-t@test');   -- 老師（pack 擁有者）

-- 官方題庫：-sist 家族 + 一個片語 + 一組同形異義 + 一列壞資料
INSERT INTO level_words (id, word, ipa, translation, part_of_speech, example, example_translation,
                         synonyms, antonyms, level, difficulty, category, tags, extra_notes) VALUES
  ('2936','persist','/pərˈsɪst/','堅持、持續','v.','She decided to persist.','她決定堅持。',
   '{"insist","nonexistent-word"}','{"quit"}',5,'advanced','動詞','{"學測","Level 5"}','備註'),
  ('4954','insist','/ɪnˈsɪst/','堅持、堅決主張','v.','She insisted on it.','她堅持。',
   '{"persist"}','{"yield"}',2,'beginner','動詞','{"學測","Level 2"}',NULL),
  ('1339','consist','/kənˈsɪst/','由…組成','v.','It consists of parts.','由部分組成。',
   '{}','{}',4,'intermediate','動詞','{"Level 4"}',NULL),
  ('0821','quit','/kwɪt/','放棄','v.','He quit.','他放棄了。',
   '{}','{}',3,'intermediate','動詞','{"Level 3"}',NULL),
  ('2255','artificial intelligence','/ˌɑːrtɪˈfɪʃl/','人工智慧','n.','AI is transforming industries.','AI 正在改變產業。',
   '{}','{}',5,'advanced','名詞','{"科技"}',NULL),
  -- 同形異義：同一個 lemma 兩個詞性 → 之後用來製造 ambiguous
  ('7001','book','/bʊk/','書','n.','I read a book.','我讀了一本書。','{}','{}',2,'beginner','名詞','{}',NULL),
  ('7002','book','/bʊk/','預訂','v.','I will book a room.','我要訂房。','{}','{}',4,'intermediate','動詞','{}',NULL),
  -- 詞性正規化用：題庫一律是 n. / v. 這種縮寫記法
  ('7010','atmosphere','/ˈætməsfɪr/','氣氛','n.','The atmosphere was tense.','氣氛緊張。','{}','{}',4,'intermediate','名詞','{}',NULL),
  ('7011','absorb','/əbˈzɔːrb/','吸收','v.','Plants absorb water.','植物吸收水分。','{}','{}',4,'intermediate','動詞','{}',NULL),
  ('7012','give up','/ɡɪv ʌp/','放棄','v.','Do not give up.','不要放棄。','{}','{}',3,'beginner','動詞','{}',NULL),
  ('7013','ozone','/ˈoʊzoʊn/','臭氧','n.','The ozone layer.','臭氧層。','{}','{}',5,'advanced','名詞','{}',NULL),
  ('7014','dissolve','/dɪˈzɑːlv/','溶解','v.','Sugar dissolves.','糖會溶解。','{}','{}',4,'intermediate','動詞','{}',NULL),
  ('7015','verify','/ˈverɪfaɪ/','驗證','v.','Verify the result.','驗證結果。','{}','{}',5,'advanced','動詞','{}',NULL),
  -- 壞資料：空字串
  ('9999','   ',NULL,NULL,NULL,NULL,NULL,'{}','{}',2,NULL,NULL,'{}',NULL);

-- 兩個 pack，都會收錄同一個 canonical 的 persist
INSERT INTO packs (id, title, created_by, is_public, is_active) VALUES
  ('11111111-1111-1111-1111-111111111111','GSAT Level 5','cccccccc-0000-0000-0000-000000000003',false,true),
  ('22222222-2222-2222-2222-222222222222','Amy Week 3','cccccccc-0000-0000-0000-000000000003',false,true);

INSERT INTO user_pack_claims (user_id, pack_id, site) VALUES
  ('aaaaaaaa-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','gsat'),
  ('aaaaaaaa-0000-0000-0000-000000000001','22222222-2222-2222-2222-222222222222','gsat');

INSERT INTO pack_items (id, pack_id, word, definition, part_of_speech, example_sentence, sort_order) VALUES
  -- 唯一命中 + 詞性相符 → exact_safe_match（掛到既有的 canonical persist）
  ('dddddddd-0000-0000-0000-000000000001','11111111-1111-1111-1111-111111111111','persist','堅持','v.','Persist!',1),
  -- 同一個字出現在第二個 pack，也應該指到【同一個】canonical item
  ('dddddddd-0000-0000-0000-000000000002','22222222-2222-2222-2222-222222222222','persist','堅持不懈','v.','Keep going.',1),
  -- lemma 命中兩個候選（book n./v.）→ ambiguous_match，不得合併
  ('dddddddd-0000-0000-0000-000000000003','11111111-1111-1111-1111-111111111111','book','預約',NULL,'Book it.',2),
  -- 題庫沒有這個字 → new_item_created
  ('dddddddd-0000-0000-0000-000000000004','11111111-1111-1111-1111-111111111111','sustainability','永續性','n.','Sustainability matters.',3),
  -- 唯一命中但 pack 這筆沒詞性 → 不得合併，列 ambiguous
  ('dddddddd-0000-0000-0000-000000000005','11111111-1111-1111-1111-111111111111','consist','組成',NULL,'Consists of.',4),
  -- 壞資料
  ('dddddddd-0000-0000-0000-000000000006','11111111-1111-1111-1111-111111111111','  ','空的',NULL,NULL,5),
  -- ── 詞性寫法不同，但講的是同一件事 → 應該合併 ──────────────
  -- noun ↔ n.
  ('dddddddd-0000-0000-0000-000000000007','11111111-1111-1111-1111-111111111111','atmosphere','氣氛','noun','The atmosphere.',6),
  -- verb ↔ v.
  ('dddddddd-0000-0000-0000-000000000008','11111111-1111-1111-1111-111111111111','absorb','吸收','verb','Absorb it.',7),
  -- noun phrase ↔ n.，而且文字真的是多字
  ('dddddddd-0000-0000-0000-000000000009','11111111-1111-1111-1111-111111111111','artificial intelligence','人工智慧','noun phrase','AI.',8),
  -- verb phrase ↔ v.，文字也真的是多字
  ('dddddddd-0000-0000-0000-00000000000a','11111111-1111-1111-1111-111111111111','give up','放棄','verb phrase','Never give up.',9),
  -- ── 不可以合併的三種 ───────────────────────────────────────
  -- 一筆掛兩個詞性
  ('dddddddd-0000-0000-0000-00000000000b','11111111-1111-1111-1111-111111111111','dissolve','溶解','v.n.','Dissolve it.',10),
  -- 沒有明確等價詞性的寫法
  ('dddddddd-0000-0000-0000-00000000000c','11111111-1111-1111-1111-111111111111','verify','驗證','phr.','Verify.',11),
  -- 單字被誤標成 noun phrase：題庫的 ozone 是 n.，若粗暴映射就會被合併掉
  ('dddddddd-0000-0000-0000-00000000000d','11111111-1111-1111-1111-111111111111','ozone','臭氧','noun phrase','Ozone.',12),
  -- 題庫沒有這個字，但詞性【認得出來】→ 新建項目時必須存老師原本寫的 noun，
  --    不是正規化後的 NOUN。這一筆是「正規化只用於比對」唯一驗得到的地方。
  ('dddddddd-0000-0000-0000-00000000000e','11111111-1111-1111-1111-111111111111','biodiversity','生物多樣性','noun','Biodiversity matters.',13);

-- 舊進度：用來證明 migration 不會動到它
INSERT INTO user_word_progress (user_id, word_id, mastery_level, next_review_time, review_count, correct_count, source)
VALUES ('aaaaaaaa-0000-0000-0000-000000000001','2936',3,1700000000000,5,4,'level');

\echo ''
\echo '=== 跑 Phase 7 / 8 migration ==='
\ir ../migrations/migrate_level_words_to_lexical.sql
\ir ../migrations/migrate_pack_items_to_lexical.sql
\ir ../migrations/migrate_lexical_relations_from_arrays.sql


\echo ''
\echo '--- A. Phase 7a：level_words 匯入 ---'
SELECT t_assert((SELECT count(*) FROM lexical_items WHERE legacy_level_word_id IS NOT NULL) = 13,
  'A1 七列有效 level_words 都建立了 canonical 項目（空字串那列不算）');
SELECT t_assert((SELECT item_type FROM lexical_items WHERE legacy_level_word_id='2255') = 'phrase',
  'A2 含空白的 artificial intelligence 判定為 phrase');
SELECT t_assert((SELECT item_type FROM lexical_items WHERE legacy_level_word_id='2936') = 'word',
  'A3 單字 persist 判定為 word');
SELECT t_assert((SELECT level FROM lexical_items WHERE legacy_level_word_id='2936') = 5,
  'A4 level 有帶過來（前端篩選器要用）');
SELECT t_assert((SELECT tags FROM lexical_items WHERE legacy_level_word_id='2936') @> ARRAY['學測'],
  'A5 tags 有帶過來');
SELECT t_assert((SELECT match_method FROM lexical_legacy_map WHERE legacy_source='level_word' AND legacy_id='9999')
  = 'manual_review_required',
  'A6 空字串那列列為 manual_review_required，沒有建立 canonical 項目');
SELECT t_assert((SELECT lexical_item_id FROM lexical_legacy_map WHERE legacy_source='level_word' AND legacy_id='9999') IS NULL,
  'A7 manual_review_required 的列沒有指向任何項目');

\echo ''
\echo '--- B. Phase 7a 冪等性 ---'
\ir ../migrations/migrate_level_words_to_lexical.sql
SELECT t_assert((SELECT count(*) FROM lexical_items WHERE legacy_level_word_id IS NOT NULL) = 13,
  'B1 重跑 migration 不會產生第二份');

\echo ''
\echo '--- C. Phase 7b：pack_items 的四個分類 ---'
SELECT t_assert((SELECT match_method FROM lexical_legacy_map WHERE legacy_source='pack_item'
                 AND legacy_id='dddddddd-0000-0000-0000-000000000001') = 'exact_safe_match',
  'C1 persist + v. 唯一命中且詞性相符 → exact_safe_match');
SELECT t_assert((SELECT match_method FROM lexical_legacy_map WHERE legacy_source='pack_item'
                 AND legacy_id='dddddddd-0000-0000-0000-000000000003') = 'ambiguous_match',
  'C2 book 命中兩個候選 → ambiguous_match（不合併）');
SELECT t_assert((SELECT match_method FROM lexical_legacy_map WHERE legacy_source='pack_item'
                 AND legacy_id='dddddddd-0000-0000-0000-000000000004') = 'new_item_created',
  'C3 題庫沒有的 sustainability → new_item_created');
SELECT t_assert((SELECT match_method FROM lexical_legacy_map WHERE legacy_source='pack_item'
                 AND legacy_id='dddddddd-0000-0000-0000-000000000005') = 'ambiguous_match',
  'C4 consist 唯一命中但 pack 沒詞性 → 不合併，列 ambiguous');
SELECT t_assert((SELECT match_method FROM lexical_legacy_map WHERE legacy_source='pack_item'
                 AND legacy_id='dddddddd-0000-0000-0000-000000000006') = 'manual_review_required',
  'C5 空字串 pack item → manual_review_required');

-- 「不得無條件靠字串合併」的核心證據
SELECT t_assert(
  (SELECT lexical_item_id FROM lexical_legacy_map WHERE legacy_source='pack_item'
     AND legacy_id='dddddddd-0000-0000-0000-000000000003')
  NOT IN (SELECT id FROM lexical_items WHERE legacy_level_word_id IN ('7001','7002')),
  'C6 ambiguous 的 book 另建新項目，沒有被併進 book(n.) 或 book(v.)');
SELECT t_assert(
  (SELECT lexical_item_id FROM lexical_legacy_map WHERE legacy_source='pack_item'
     AND legacy_id='dddddddd-0000-0000-0000-000000000005')
  <> (SELECT id FROM lexical_items WHERE legacy_level_word_id='1339'),
  'C7 沒詞性的 consist 沒有被併進官方的 consist');

\echo ''
\echo '--- C2. 詞性正規化：只影響比對，不改任何欄位 ---'

-- 函式本身
SELECT t_assert(lexical_normalise_pos('noun','atmosphere')      = 'NOUN', 'N1 noun → NOUN');
SELECT t_assert(lexical_normalise_pos('n.','atmosphere')        = 'NOUN', 'N2 n. → NOUN');
SELECT t_assert(lexical_normalise_pos('  NOUN  ','atmosphere')  = 'NOUN', 'N3 大小寫與前後空白不影響');
SELECT t_assert(lexical_normalise_pos('verb','absorb')          = 'VERB', 'N4 verb → VERB');
SELECT t_assert(lexical_normalise_pos('adjective','x')          = 'ADJ',  'N5 adjective → ADJ');
SELECT t_assert(lexical_normalise_pos('noun phrase','a b')      = 'NOUN', 'N6 noun phrase + 多字 → NOUN');
SELECT t_assert(lexical_normalise_pos('verb phrase','give up')  = 'VERB', 'N7 verb phrase + 多字 → VERB');
SELECT t_assert(lexical_normalise_pos('noun phrase','ozone')    IS NULL,  'N8 單字被標成 noun phrase → NULL（不合併）');
SELECT t_assert(lexical_normalise_pos('noun phrase',NULL)       IS NULL,  'N9 沒有文字可驗證時不採用片語標籤');
SELECT t_assert(lexical_normalise_pos('v.n.','dissolve')          IS NULL,  'N10 v.n. 一筆兩個詞性 → NULL');
SELECT t_assert(lexical_normalise_pos('n./v.','dissolve')         IS NULL,  'N11 n./v. → NULL');
SELECT t_assert(lexical_normalise_pos('noun / verb','x')        IS NULL,  'N12 noun / verb → NULL');
SELECT t_assert(lexical_normalise_pos('phr.','verify')            IS NULL,  'N13 phr. 沒有等價詞性 → NULL');
SELECT t_assert(lexical_normalise_pos('phrasal verb','give up') IS NULL,  'N14 phrasal verb 先不映射');
SELECT t_assert(lexical_normalise_pos('idiom','a b')            IS NULL,  'N15 idiom 先不映射');
SELECT t_assert(lexical_normalise_pos('collocation','a b')      IS NULL,  'N16 collocation 先不映射');
SELECT t_assert(lexical_normalise_pos('expression','a b')       IS NULL,  'N17 expression 先不映射');
SELECT t_assert(lexical_normalise_pos('',  'x')                 IS NULL,  'N18 空字串 → NULL');
SELECT t_assert(lexical_normalise_pos(NULL,'x')                 IS NULL,  'N19 NULL → NULL');

-- 走完整 migration 之後的實際分類
SELECT t_assert((SELECT match_method FROM lexical_legacy_map WHERE legacy_source='pack_item'
                 AND legacy_id='dddddddd-0000-0000-0000-000000000007') = 'exact_safe_match',
  'N20 pack 的 noun 對上題庫的 n. → 合併');
SELECT t_assert((SELECT match_method FROM lexical_legacy_map WHERE legacy_source='pack_item'
                 AND legacy_id='dddddddd-0000-0000-0000-000000000008') = 'exact_safe_match',
  'N21 pack 的 verb 對上題庫的 v. → 合併');
SELECT t_assert((SELECT match_method FROM lexical_legacy_map WHERE legacy_source='pack_item'
                 AND legacy_id='dddddddd-0000-0000-0000-000000000009') = 'exact_safe_match',
  'N22 noun phrase + 相同多字 lemma → 合併');
SELECT t_assert((SELECT match_method FROM lexical_legacy_map WHERE legacy_source='pack_item'
                 AND legacy_id='dddddddd-0000-0000-0000-00000000000a') = 'exact_safe_match',
  'N23 verb phrase + 相同多字 lemma → 合併');
SELECT t_assert((SELECT match_method FROM lexical_legacy_map WHERE legacy_source='pack_item'
                 AND legacy_id='dddddddd-0000-0000-0000-00000000000b') = 'ambiguous_match',
  'N24 v.n. → 不合併');
SELECT t_assert((SELECT match_method FROM lexical_legacy_map WHERE legacy_source='pack_item'
                 AND legacy_id='dddddddd-0000-0000-0000-00000000000c') = 'ambiguous_match',
  'N25 phr. 沒有對照 → 不合併');
SELECT t_assert((SELECT match_method FROM lexical_legacy_map WHERE legacy_source='pack_item'
                 AND legacy_id='dddddddd-0000-0000-0000-00000000000d') = 'ambiguous_match',
  'N26 單字被誤標成 noun phrase → 不合併');

-- 合併的那幾筆，確實指向題庫【原本那一列】，不是新建的
SELECT t_assert(
  (SELECT lexical_item_id FROM lexical_legacy_map WHERE legacy_source='pack_item'
     AND legacy_id='dddddddd-0000-0000-0000-000000000007')
  = (SELECT id FROM lexical_items WHERE legacy_level_word_id='7010'),
  'N27 atmosphere 併進題庫原本的那一列（不是另建）');
SELECT t_assert(
  (SELECT lexical_item_id FROM lexical_legacy_map WHERE legacy_source='pack_item'
     AND legacy_id='dddddddd-0000-0000-0000-000000000009')
  = (SELECT id FROM lexical_items WHERE legacy_level_word_id='2255'),
  'N28 artificial intelligence 併進題庫原本的那一列');

-- 不合併的那幾筆，沒有被塞進題庫那一列
SELECT t_assert(
  (SELECT lexical_item_id FROM lexical_legacy_map WHERE legacy_source='pack_item'
     AND legacy_id='dddddddd-0000-0000-0000-00000000000d')
  <> (SELECT id FROM lexical_items WHERE legacy_level_word_id='7013'),
  'N29 誤標的 ozone 另建新項目，沒有被併進官方的 ozone');

-- 🛑 正規化【只用於比對】：原始欄位與 item_type 都不能被改寫
SELECT t_assert((SELECT part_of_speech FROM lexical_items i
                  JOIN lexical_legacy_map m ON m.lexical_item_id = i.id
                 WHERE m.legacy_id='dddddddd-0000-0000-0000-00000000000d') = 'noun phrase',
  'N30 新建項目保留老師原本寫的 noun phrase，沒有被改成 n.');
SELECT t_assert((SELECT item_type FROM lexical_items i
                  JOIN lexical_legacy_map m ON m.lexical_item_id = i.id
                 WHERE m.legacy_id='dddddddd-0000-0000-0000-00000000000d') = 'word',
  'N31 誤標成 noun phrase 的單字，item_type 仍然是 word');
SELECT t_assert((SELECT part_of_speech FROM lexical_items WHERE legacy_level_word_id='7010') = 'n.',
  'N32 被合併的題庫項目，原始詞性仍然是 n.（沒有被 pack 的 noun 覆寫）');
-- 🛑 M4 型的錯誤（把正規化結果寫回欄位）只有這一筆驗得到：
--    biodiversity 的 noun 認得出來（正規化成 NOUN），而且它是新建的項目。
SELECT t_assert((SELECT part_of_speech FROM lexical_items i
                  JOIN lexical_legacy_map m ON m.lexical_item_id = i.id
                 WHERE m.legacy_id='dddddddd-0000-0000-0000-00000000000e') = 'noun',
  'N34 新建項目存的是老師原本寫的 noun，不是正規化後的 NOUN');
SELECT t_assert((SELECT match_method FROM lexical_legacy_map WHERE legacy_source='pack_item'
                 AND legacy_id='dddddddd-0000-0000-0000-00000000000e') = 'new_item_created',
  'N35 biodiversity 題庫沒有 → new_item_created');
SELECT t_assert((SELECT item_type FROM lexical_items WHERE legacy_level_word_id='2255') = 'phrase',
  'N33 多字項目的 item_type 仍然是 phrase，沒有因為正規化而遺失');

\echo ''
\echo '--- D. Phase 3：同一個 canonical item 可以在多個 pack ---'
SELECT t_assert(
  (SELECT lexical_item_id FROM lexical_legacy_map WHERE legacy_source='pack_item' AND legacy_id='dddddddd-0000-0000-0000-000000000001')
  = (SELECT lexical_item_id FROM lexical_legacy_map WHERE legacy_source='pack_item' AND legacy_id='dddddddd-0000-0000-0000-000000000002'),
  'D1 兩個 pack 裡的 persist 指向同一個 canonical item');
SELECT t_assert((SELECT count(DISTINCT pack_id) FROM lexical_pack_items
                 WHERE lexical_item_id = (SELECT id FROM lexical_items WHERE legacy_level_word_id='2936')) = 2,
  'D2 同一個 canonical persist 同時掛在兩個 pack 底下');

\echo ''
\echo '--- E. Phase 8：關係匯入，不猜 ---'
SELECT t_assert(EXISTS (
  SELECT 1 FROM lexical_relations r
  JOIN lexical_items s ON s.id = r.source_item_id
  JOIN lexical_items t ON t.id = r.target_item_id
  WHERE s.legacy_level_word_id='2936' AND t.legacy_level_word_id='4954' AND r.relation_type='synonym'),
  'E1 persist --synonym--> insist 建立成功（唯一命中）');
SELECT t_assert(EXISTS (
  SELECT 1 FROM lexical_unresolved_relations u
  JOIN lexical_items s ON s.id = u.source_item_id
  WHERE s.legacy_level_word_id='2936' AND u.raw_target='nonexistent-word' AND u.reason='no_match'),
  'E2 題庫裡沒有的同義詞 → 寫進 unresolved（no_match），沒有亂猜');
SELECT t_assert(EXISTS (
  SELECT 1 FROM lexical_relations r
  JOIN lexical_items s ON s.id = r.source_item_id
  JOIN lexical_items t ON t.id = r.target_item_id
  WHERE s.legacy_level_word_id='2936' AND t.legacy_level_word_id='0821' AND r.relation_type='antonym'),
  'E3 persist --antonym--> quit 建立成功');
SELECT t_assert(NOT EXISTS (
  SELECT 1 FROM lexical_relations r WHERE r.source_item_id = r.target_item_id),
  'E4 沒有自我參照的關係');

\echo ''
\echo '--- F. 相容公式與既有前端一致（不是新演算法）---'
SELECT t_assert(lexical_compat_next_mastery(3::SMALLINT, NULL, 'forgot') = 1, 'F1 forgot：3 → 1（-2，照程式碼不照註解）');
SELECT t_assert(lexical_compat_next_mastery(1::SMALLINT, NULL, 'forgot') = 0, 'F2 forgot 下限是 0');
SELECT t_assert(lexical_compat_next_mastery(3::SMALLINT, NULL, 'hard')   = 2, 'F3 hard：-1');
SELECT t_assert(lexical_compat_next_mastery(3::SMALLINT, NULL, 'easy')   = 4, 'F4 easy：+1');
SELECT t_assert(lexical_compat_next_mastery(6::SMALLINT, TRUE, NULL)     = 6, 'F5 答對上限是 6');
SELECT t_assert(lexical_compat_next_mastery(3::SMALLINT, TRUE, NULL)     = 4, 'F6 答對：+1');
SELECT t_assert(lexical_compat_next_mastery(3::SMALLINT, FALSE, NULL)    = 2, 'F7 答錯：-1');
SELECT t_assert(lexical_compat_next_mastery(0::SMALLINT, FALSE, NULL)    = 0, 'F8 答錯下限是 0');
SELECT t_assert(lexical_compat_review_interval(1::SMALLINT) = INTERVAL '10 minutes', 'F9 L1 = 10 分鐘');
SELECT t_assert(lexical_compat_review_interval(6::SMALLINT) = INTERVAL '30 days',    'F10 L6 = 30 天');


\echo ''
\echo '=== 以下切換成已登入學生身分 ==='
SET ROLE authenticated;
SET app.uid = 'aaaaaaaa-0000-0000-0000-000000000001';
SET app.is_admin = 'false';

\echo ''
\echo '--- G. Quick Quiz：答對，寫 attempt + 動 mastery ---'
SELECT t_assert((record_lexical_attempt(
    p_exercise_type   => 'quick_quiz',
    p_skill_dimension => 'meaning',
    p_legacy_source   => 'level_word',
    p_legacy_id       => '2936',
    p_correct         => true,
    p_response_time_ms=> 3200
  ) ->> 'recorded')::BOOLEAN,
  'G1 level word 的 quick_quiz 有記錄成功');
SELECT t_assert((SELECT response_time_ms FROM lexical_attempts
                 WHERE exercise_type='quick_quiz' ORDER BY occurred_at DESC LIMIT 1) = 3200,
  'G2 response_time_ms 有落地（舊系統整個沒有保存）');
SELECT t_assert((SELECT skill_dimension FROM lexical_attempts
                 WHERE exercise_type='quick_quiz' ORDER BY occurred_at DESC LIMIT 1) = 'meaning',
  'G3 skill_dimension = meaning，與 exercise_type 分開記錄');
SELECT t_assert((SELECT mastery_level FROM student_lexical_mastery m
                 JOIN lexical_items i ON i.id=m.lexical_item_id
                 WHERE i.legacy_level_word_id='2936') = 1,
  'G4 mastery 0 → 1');

\echo ''
\echo '--- H. Pack quiz：走同一支 RPC ---'
SELECT t_assert((record_lexical_attempt(
    p_exercise_type   => 'quick_quiz',
    p_skill_dimension => 'meaning',
    p_legacy_source   => 'pack_item',
    p_legacy_id       => 'dddddddd-0000-0000-0000-000000000001',
    p_correct         => true,
    p_pack_id         => '11111111-1111-1111-1111-111111111111'
  ) ->> 'recorded')::BOOLEAN,
  'H1 pack item 的 quick_quiz 有記錄成功');
SELECT t_assert((SELECT mastery_level FROM student_lexical_mastery m
                 JOIN lexical_items i ON i.id=m.lexical_item_id
                 WHERE i.legacy_level_word_id='2936') = 2,
  'H2 pack 的 persist 與 level 的 persist 累積到【同一份】mastery（0→1→2）');
SELECT t_assert((SELECT count(*) FROM student_lexical_mastery m
                 JOIN lexical_items i ON i.id=m.lexical_item_id
                 WHERE i.legacy_level_word_id='2936') = 1,
  'H3 同一個 canonical item 只有一列 mastery，不論從哪個來源練的');

\echo ''
\echo '--- I. 第二個 pack 的同一個字，mastery 仍然只有一份（驗證第 8 項）---'
SELECT record_lexical_attempt(
  p_exercise_type=>'quick_quiz', p_skill_dimension=>'meaning',
  p_legacy_source=>'pack_item', p_legacy_id=>'dddddddd-0000-0000-0000-000000000002',
  p_correct=>true, p_pack_id=>'22222222-2222-2222-2222-222222222222');
SELECT t_assert((SELECT count(*) FROM student_lexical_mastery m
                 JOIN lexical_items i ON i.id=m.lexical_item_id
                 WHERE i.legacy_level_word_id='2936') = 1,
  'I1 出現在兩個 pack，mastery 仍然只有一列');
SELECT t_assert((SELECT mastery_level FROM student_lexical_mastery m
                 JOIN lexical_items i ON i.id=m.lexical_item_id
                 WHERE i.legacy_level_word_id='2936') = 3,
  'I2 三次答對累積到同一列（0→1→2→3）');
SELECT t_assert((SELECT count(DISTINCT pack_id) FROM lexical_attempts
                 WHERE pack_id IS NOT NULL) = 2,
  'I3 attempt 仍然分別記下是從哪個 pack 練的');

\echo ''
\echo '--- J. Spelling：attempt_count 與 used_hint ---'
SELECT record_lexical_attempt(
  p_exercise_type=>'spelling', p_skill_dimension=>'form_recall',
  p_legacy_source=>'level_word', p_legacy_id=>'4954',
  p_correct=>false, p_response_time_ms=>18000, p_attempt_count=>3, p_used_hint=>true);
SELECT t_assert((SELECT attempt_count FROM lexical_attempts WHERE exercise_type='spelling') = 3,
  'J1 spelling 的 attempt_count 有落地');
SELECT t_assert((SELECT used_hint FROM lexical_attempts WHERE exercise_type='spelling') IS TRUE,
  'J2 用過提示這件事有落地（舊系統完全沒記）');
SELECT t_assert((SELECT skill_dimension FROM lexical_attempts WHERE exercise_type='spelling') = 'form_recall',
  'J3 spelling 的能力面向是 form_recall，不是 meaning');

\echo ''
\echo '--- K. Fill blank 與 Synonym/Antonym 的能力面向 ---'
SELECT record_lexical_attempt(
  p_exercise_type=>'fill_blank', p_skill_dimension=>'context',
  p_legacy_source=>'level_word', p_legacy_id=>'1339', p_correct=>true, p_response_time_ms=>5400);
SELECT t_assert((SELECT skill_dimension FROM lexical_attempts WHERE exercise_type='fill_blank') = 'context',
  'K1 fill_blank → context');
SELECT record_lexical_attempt(
  p_exercise_type=>'synonym_antonym', p_skill_dimension=>'lexical_connection',
  p_legacy_source=>'level_word', p_legacy_id=>'2936', p_correct=>true, p_response_time_ms=>4100);
SELECT t_assert((SELECT skill_dimension FROM lexical_attempts WHERE exercise_type='synonym_antonym') = 'lexical_connection',
  'K2 synonym_antonym → lexical_connection');

\echo ''
\echo '--- L. Match：誤點留證據，但不動 mastery（驗證第 5 項）---'
SELECT set_config('app.mastery_before',
  (SELECT mastery_level FROM student_lexical_mastery m JOIN lexical_items i ON i.id=m.lexical_item_id
   WHERE i.legacy_level_word_id='4954')::TEXT, false);
SELECT record_lexical_attempt(
  p_exercise_type=>'match', p_skill_dimension=>'meaning',
  p_legacy_source=>'level_word', p_legacy_id=>'4954',
  p_correct=>false, p_response_time_ms=>900, p_attempt_count=>1,
  p_apply_mastery=>false,
  p_metadata=>'{"wrong_pair": true}'::jsonb);
SELECT t_assert((SELECT count(*) FROM lexical_attempts WHERE exercise_type='match') = 1,
  'L1 配對誤點有留下 attempt（舊系統完全不落地）');
SELECT t_assert((SELECT affected_mastery FROM lexical_attempts WHERE exercise_type='match') IS FALSE,
  'L2 這筆 attempt 標記為沒有影響 mastery');
SELECT t_assert((SELECT mastery_level FROM student_lexical_mastery m JOIN lexical_items i ON i.id=m.lexical_item_id
                 WHERE i.legacy_level_word_id='4954')::TEXT = current_setting('app.mastery_before'),
  'L3 誤點【沒有】改變 mastery —— attempt 與 mastery 確實分離');
SELECT t_assert((SELECT response_time_ms FROM lexical_attempts WHERE exercise_type='match') = 900,
  'L4 配對的反應時間有落地');

\echo ''
\echo '--- M. Flashcard：曝光不是客觀答對（驗證第 6 項）---'
SELECT record_lexical_attempt(
  p_exercise_type=>'flashcard', p_skill_dimension=>'self_assessment',
  p_legacy_source=>'level_word', p_legacy_id=>'2255',
  p_correct=>NULL, p_apply_mastery=>false,
  p_metadata=>'{"event":"exposure"}'::jsonb);
SELECT t_assert((SELECT correct FROM lexical_attempts WHERE exercise_type='flashcard'
                 AND metadata->>'event'='exposure') IS NULL,
  'M1 翻卡曝光的 correct 是 NULL，不會被當成答對');
SELECT t_assert((SELECT skill_dimension FROM lexical_attempts WHERE exercise_type='flashcard'
                 AND metadata->>'event'='exposure') = 'self_assessment',
  'M2 flashcard 的能力面向是 self_assessment，不是客觀測驗');
SELECT t_assert(NOT EXISTS (SELECT 1 FROM student_lexical_mastery m JOIN lexical_items i ON i.id=m.lexical_item_id
                            WHERE i.legacy_level_word_id='2255'),
  'M3 純曝光完全沒有建立 mastery 列');

-- Mark as Known：保留舊行為（+1），但明確標成 self-assessment
SELECT record_lexical_attempt(
  p_exercise_type=>'flashcard', p_skill_dimension=>'self_assessment',
  p_legacy_source=>'level_word', p_legacy_id=>'2255',
  p_correct=>NULL, p_self_rating=>'easy',
  p_metadata=>'{"event":"mark_as_known"}'::jsonb);
SELECT t_assert((SELECT mastery_level FROM student_lexical_mastery m JOIN lexical_items i ON i.id=m.lexical_item_id
                 WHERE i.legacy_level_word_id='2255') = 1,
  'M4 Mark as Known 仍然 +1（相容層保留舊行為）');
SELECT t_assert((SELECT correct FROM lexical_attempts WHERE metadata->>'event'='mark_as_known') IS NULL,
  'M5 但它的 correct 仍然是 NULL —— 是自評證據，不是客觀測驗證據');
SELECT t_assert((SELECT correct_count FROM student_lexical_mastery m JOIN lexical_items i ON i.id=m.lexical_item_id
                 WHERE i.legacy_level_word_id='2255') = 0,
  'M6 自評不計入 correct_count（correct_count 只算客觀答對）');

\echo ''
\echo '--- N. SRS：self_rating 與 reveal 前時間 ---'
SELECT record_lexical_attempt(
  p_exercise_type=>'srs', p_skill_dimension=>'self_assessment',
  p_legacy_source=>'level_word', p_legacy_id=>'1339',
  p_correct=>NULL, p_self_rating=>'forgot', p_response_time_ms=>7300);
SELECT t_assert((SELECT self_rating FROM lexical_attempts WHERE exercise_type='srs') = 'forgot',
  'N1 SRS 的自評有落地');
SELECT t_assert((SELECT response_time_ms FROM lexical_attempts WHERE exercise_type='srs') = 7300,
  'N2 reveal 前的思考時間有落地');
SELECT t_assert((SELECT mastery_level FROM student_lexical_mastery m JOIN lexical_items i ON i.id=m.lexical_item_id
                 WHERE i.legacy_level_word_id='1339') = 0,
  'N3 forgot 讓 mastery 從 1 掉到 0（1-2 = -1 → 夾到 0）');

\echo ''
\echo '--- O. next_review_at 是 timestamptz 且算得對 ---'
-- 不寫死天數：直接驗 next_review_at 與該列 mastery_level 的間隔表一致。
-- （persist 在 K2 又答對過一次，寫死天數會隨測試順序而錯。）
SELECT t_assert((SELECT count(*) FROM student_lexical_mastery m
                 WHERE m.next_review_at IS NOT NULL
                   AND m.next_review_at NOT BETWEEN
                       m.last_review_at + lexical_compat_review_interval(m.mastery_level) - INTERVAL '5 seconds'
                   AND m.last_review_at + lexical_compat_review_interval(m.mastery_level) + INTERVAL '5 seconds'
                ) = 0,
  'O1 每一列的 next_review_at 都等於 last_review_at + 該 mastery 的相容間隔');
SELECT t_assert((SELECT mastery_level FROM student_lexical_mastery m JOIN lexical_items i ON i.id=m.lexical_item_id
                 WHERE i.legacy_level_word_id='2936') = 4,
  'O1b persist 累積 4 次答對後 mastery = 4');
SELECT t_assert(pg_typeof((SELECT next_review_at FROM student_lexical_mastery LIMIT 1))::TEXT = 'timestamp with time zone',
  'O2 欄位型別確實是 timestamptz');

\echo ''
\echo '--- P. 未對應的 legacy id 不會讓頁面爆掉 ---'
SELECT t_assert((record_lexical_attempt(
    p_exercise_type=>'quick_quiz', p_skill_dimension=>'meaning',
    p_legacy_source=>'pack_item', p_legacy_id=>'dddddddd-0000-0000-0000-000000000006',
    p_correct=>true) ->> 'reason') = 'UNMAPPED',
  'P1 manual_review_required 的 item 回 UNMAPPED，不丟錯');
SELECT t_assert((record_lexical_attempt(
    p_exercise_type=>'quick_quiz', p_skill_dimension=>'meaning',
    p_legacy_source=>'level_word', p_legacy_id=>'does-not-exist',
    p_correct=>true) ->> 'recorded')::BOOLEAN IS FALSE,
  'P2 完全不存在的 id 也只是回 recorded=false');

\echo ''
\echo '--- Q. RLS：學生之間互相看不到（驗證第 10 項）---'
SELECT t_assert((SELECT count(*) FROM student_lexical_mastery) > 0, 'Q1 學生 A 看得到自己的 mastery');
SELECT t_assert((SELECT count(*) FROM lexical_attempts) > 0,         'Q2 學生 A 看得到自己的 attempt');

SET app.uid = 'bbbbbbbb-0000-0000-0000-000000000002';
SELECT t_assert((SELECT count(*) FROM student_lexical_mastery) = 0, 'Q3 學生 B 看不到學生 A 的 mastery');
SELECT t_assert((SELECT count(*) FROM lexical_attempts) = 0,        'Q4 學生 B 看不到學生 A 的 attempt');

SELECT t_expect_error(
  $$INSERT INTO student_lexical_mastery (student_id, lexical_item_id, mastery_level)
    VALUES ('bbbbbbbb-0000-0000-0000-000000000002',
            (SELECT id FROM lexical_items LIMIT 1), 6)$$,
  'Q5 學生無法直接寫 mastery（沒有 grant，也沒有政策）');
SELECT t_expect_error(
  $$UPDATE student_lexical_mastery SET mastery_level = 6$$,
  'Q6 學生無法直接改 mastery');
SELECT t_expect_error(
  $$INSERT INTO lexical_attempts (student_id, lexical_item_id, exercise_type, skill_dimension)
    VALUES ('bbbbbbbb-0000-0000-0000-000000000002',
            (SELECT id FROM lexical_items LIMIT 1), 'quick_quiz', 'meaning')$$,
  'Q7 學生無法直接寫 attempt（只能走 RPC）');
SELECT t_expect_error(
  $$DELETE FROM lexical_attempts$$,
  'Q8 學生無法刪除 attempt 紀錄');

-- 學生 B 用 RPC 寫自己的，只會寫到自己頭上
SELECT record_lexical_attempt(
  p_exercise_type=>'quick_quiz', p_skill_dimension=>'meaning',
  p_legacy_source=>'level_word', p_legacy_id=>'2936', p_correct=>true);
SELECT t_assert((SELECT count(*) FROM student_lexical_mastery) = 1,
  'Q9 學生 B 透過 RPC 只建立自己那一列');
SELECT t_assert((SELECT student_id FROM student_lexical_mastery) = 'bbbbbbbb-0000-0000-0000-000000000002',
  'Q10 RPC 用的是 auth.uid()，呼叫端無法指定別人');

\echo ''
\echo '--- R. anon 完全讀不到 ---'
SET ROLE anon;
SELECT t_expect_error($$SELECT count(*) FROM lexical_items$$,            'R1 anon 讀不到 lexical_items');
SELECT t_expect_error($$SELECT count(*) FROM student_lexical_mastery$$,  'R2 anon 讀不到 mastery');
SELECT t_expect_error($$SELECT count(*) FROM lexical_attempts$$,         'R3 anon 讀不到 attempt');
SELECT t_expect_error($$SELECT count(*) FROM lexical_relations$$,        'R4 anon 讀不到 relations');

\echo ''
\echo '--- S. 舊表沒有被動到（驗證第 9 項）---'
RESET ROLE;
SELECT t_assert((SELECT count(*) FROM user_word_progress) = 1,
  'S1 user_word_progress 的列數完全沒變');
SELECT t_assert((SELECT mastery_level FROM user_word_progress WHERE word_id='2936') = 3,
  'S2 舊的 mastery_level 沒有被改');
SELECT t_assert((SELECT next_review_time FROM user_word_progress WHERE word_id='2936') = 1700000000000,
  'S3 舊的 Unix 毫秒時間沒有被改');
SELECT t_assert((SELECT count(*) FROM level_words) = 14,
  'S4 level_words 一列都沒有被刪');
SELECT t_assert((SELECT count(*) FROM pack_items) = 14,
  'S5 pack_items 一列都沒有被刪');
SELECT t_assert((SELECT synonyms FROM level_words WHERE id='2936') @> ARRAY['insist'],
  'S6 level_words.synonyms 原始 text[] 完全沒被動過（回滾後可重建）');

\echo ''
\echo '--- T. Migration report ---'
SELECT t_assert((SELECT count(*) FROM lexical_migration_report WHERE legacy_source='pack_item') >= 3,
  'T1 pack_item 至少落在三個分類');
SELECT t_assert((SELECT count(*) FROM lexical_migration_needs_review) = 7,
  'T2 需要人工確認的有 7 筆（pack 5 ambiguous + pack 1 manual + level_word 1 manual）');
SELECT t_assert((SELECT count(*) FROM lexical_migration_needs_review WHERE legacy_source='pack_item') = 6,
  'T2b 其中 pack_item 佔 6 筆');
SELECT t_assert((SELECT count(*) FROM lexical_duplicate_candidates) >= 1,
  'T3 重複 lemma 有被列出來（book 有三份）');
SELECT t_assert((SELECT count(*) FROM lexical_unresolved_relations_report) >= 1,
  'T4 未解決的關係有被列出來');

\echo ''
\echo '=== 全部通過 ==='
