# Lexical Phase 1 —— production 唯讀預演

🟢 **這個目錄裡的查詢全部唯讀**，可以在 production 直接執行，不會寫入任何東西。

目的：在跑九支 migration【之前】，先算出它們會產生什麼結果。
判定邏輯逐條複寫自 migration 本身，改動 migration 時這裡也要跟著改。

| 檔案 | 對應的 migration | 回答什麼 |
|---|---|---|
| `01-pack-classification.sql` | `migrate_pack_items_to_lexical.sql` | 1120 筆 pack item 會分成幾類 |
| `02-ambiguous-detail.sql` | 同上 | 仍然無法合併的每一筆，以及原因 |
| `03-relations.sql` | `migrate_lexical_relations_from_arrays.sql` | 會建立多少關係、多少解不開 |

## 已知的偏差，判讀時要記得

1. **迴圈累積**：真正的 migration 是逐筆處理，前面插入的項目會成為後面那一筆的
   候選。同一個 lemma 在 pack 裡出現兩次時，第二筆的實際分類可能與預測不同。
   `01` 會一併回報這種重複有幾筆。

2. **關係解析發生在 pack 匯入【之後】**（順序 6 → 7 → 8）。所以沒合併成功的
   pack item 會讓 lemma 多一份，原本「唯一命中」的關係就變成 ambiguous。
   `03` 已經把這件事算進去 —— 只數 level_words 的版本會高估「可建立」的數量。
