# gsat-staging 環境說明

> 2026-11 起，`gsat-staging`（ref `cwymrzcovgobfqxtithn`）已從付費組織搬到 **Supabase 免費組織**。
> 網址、金鑰、資料都沒有變，只是改成免費方案。

## 流程不變

所有 migration 一樣是：**先在 gsat-staging 執行並確認，再在 production 執行。**

## 搬到免費組織後要注意的事

1. **可能已自動暫停。** 免費專案一段時間沒有使用會被暫停。
   跑 migration 或驗證腳本之前，先到 Supabase 後台打開 gsat-staging，
   若顯示 Paused，按 **Restore project**，等它恢復完成再執行 SQL。
2. **容量與功能較少。** 免費方案的資料庫容量較小，也沒有時間點還原（PITR）等付費功能。
   staging 只放測試資料，不要把 production 的大量資料匯進來。
3. **不要升級回付費。** 這個組織刻意維持免費；付費組織的額度留給正式網站使用。
   需要更大規格時，先跟網站擁有者確認。
4. **在後台找它要切換組織。** 在 Supabase 後台左上角的組織選單切到免費組織，才看得到 gsat-staging。
