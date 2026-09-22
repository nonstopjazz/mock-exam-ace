-- =====================================================
-- Lexical Model：migration report 視圖
--
-- 🟢 只要在 production 執行一次。前置：所有 migrate_* 跑完。
--
-- 這些是【唯讀視圖】，不動任何資料。跑完 migration 之後查這幾支就知道
-- 有多少東西需要人工處理。
-- =====================================================

-- ── 1. 四個分類的統計 ──────────────────────────────
CREATE OR REPLACE VIEW lexical_migration_report AS
SELECT
  m.legacy_source,
  m.match_method,
  count(*) AS item_count
FROM lexical_legacy_map m
GROUP BY m.legacy_source, m.match_method;

COMMENT ON VIEW lexical_migration_report IS
  'Phase 7 的四分類統計：exact_safe_match / new_item_created / ambiguous_match / manual_review_required。';


-- ── 2. 需要人工看的 pack item 明細 ─────────────────
CREATE OR REPLACE VIEW lexical_migration_needs_review AS
SELECT
  m.legacy_source,
  m.legacy_id,
  m.match_method,
  m.candidate_count,
  m.note,
  i.display_form,
  i.part_of_speech,
  i.item_type
FROM lexical_legacy_map m
LEFT JOIN lexical_items i ON i.id = m.lexical_item_id
WHERE m.match_method IN ('ambiguous_match', 'manual_review_required');

COMMENT ON VIEW lexical_migration_needs_review IS
  '需要人工確認的項目。ambiguous_match 已經建立了獨立的新項目（沒有破壞資料），人工確認後才決定是否合併。';


-- ── 3. 同一個 lemma 有多份 canonical 項目 ──────────
--
-- 這是 ambiguous_match 的必然結果，也是這次刻意留下的技術債：
-- 寧可重複，不要錯誤合併。
CREATE OR REPLACE VIEW lexical_duplicate_candidates AS
SELECT
  i.lemma,
  count(*)                                   AS item_count,
  array_agg(i.id          ORDER BY i.created_at) AS item_ids,
  array_agg(coalesce(i.part_of_speech, '(無)')
                          ORDER BY i.created_at) AS parts_of_speech,
  bool_or(i.legacy_level_word_id IS NOT NULL)    AS has_official_item
FROM lexical_items i
GROUP BY i.lemma
HAVING count(*) > 1;

COMMENT ON VIEW lexical_duplicate_candidates IS
  '同一個 lemma 有多份 canonical 項目。多半來自 pack item 無法安全合併時另建新項目。合併是人工決定，資料庫不自動做。';


-- ── 4. 未解決的關係 ────────────────────────────────
CREATE OR REPLACE VIEW lexical_unresolved_relations_report AS
SELECT
  u.relation_type,
  u.reason,
  count(*) AS relation_count
FROM lexical_unresolved_relations u
WHERE u.resolved_at IS NULL
GROUP BY u.relation_type, u.reason;

COMMENT ON VIEW lexical_unresolved_relations_report IS
  'Phase 8 無法安全建立的關係統計。no_match = 題庫裡沒有這個字；ambiguous_match = 有多個候選。';


-- ── 5. 新舊進度並存的對照 ──────────────────────────
--
-- 驗證用：確認 user_word_progress 沒有消失，而且新表的數字對得上。
CREATE OR REPLACE VIEW lexical_progress_coexistence AS
SELECT
  'user_word_progress'      AS source,
  count(*)                  AS row_count,
  count(DISTINCT user_id)   AS student_count
FROM user_word_progress
UNION ALL
SELECT
  'student_lexical_mastery',
  count(*),
  count(DISTINCT student_id)
FROM student_lexical_mastery
UNION ALL
SELECT
  'lexical_attempts',
  count(*),
  count(DISTINCT student_id)
FROM lexical_attempts;

COMMENT ON VIEW lexical_progress_coexistence IS
  '新舊進度表並存狀況。user_word_progress 的列數在本批 migration 前後應該完全不變。';


-- =====================================================
-- 權限：報表只給 admin
-- =====================================================

REVOKE ALL ON lexical_migration_report              FROM PUBLIC, anon, authenticated;
REVOKE ALL ON lexical_migration_needs_review        FROM PUBLIC, anon, authenticated;
REVOKE ALL ON lexical_duplicate_candidates          FROM PUBLIC, anon, authenticated;
REVOKE ALL ON lexical_unresolved_relations_report   FROM PUBLIC, anon, authenticated;
REVOKE ALL ON lexical_progress_coexistence          FROM PUBLIC, anon, authenticated;
