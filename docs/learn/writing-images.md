# 拍照作文（Phase 2）上線手冊

> 學生拍照上傳作文 → 系統辨識文字 → 學生校對 → 送出。
> 照片是暫時性的佐證，長期紀錄是文字與批改結果。

---

## 保存策略（產品決策，2026-09）

| 東西 | 保存 | 何時消失 |
|---|---|---|
| 手機原檔（`writing-raw`） | 暫存 | 條件齊備後的下一次清理，通常送出後 24 小時內 |
| 正規化封存圖（`writing-archive`） | 60 天 | 送出後滿 60 天，自動 |
| OCR 衍生圖 | 不存在 | 只在記憶體，從不落地 |
| 原始 OCR 文字（`writing_ocr_runs.raw_text`） | **永久** | 不刪 |
| 學生確認後的正式文字（`writing_texts`） | **永久** | 不刪 |
| 頁序與影像 metadata（`writing_images`） | **永久** | 不刪（檔案刪了，紀錄還在） |
| 棄置草稿的檔案 | 30 天 | 草稿放置滿 30 天，原檔與封存圖一起帶走 |

**處理失敗時什麼都不刪。** 正規化失敗、沒有成功的辨識、正式文字沒落地、還沒送出 ——
任一成立，清理工作就掃不到它。判斷全部寫在
`writing_images_cleanup_candidates()` 裡，不接受任何 client 傳來的「可以刪了」。

圖片刪除之後，作文與批改**完全不受影響**：報告、評語、字數、AI 分析讀的都是
`writing_texts`。畫面上只是不再出現「原始照片」這個區塊。

---

## 上線順序（順序不能換）

### 1. 🔴 五份 SQL：先在 gsat-staging 執行並確認，再在 production 執行

依這個順序（有相依）：

```
1. create_writing_ocr_runs.sql
2. create_writing_images.sql
3. relax_writing_image_checks.sql      ← 外鍵指向 1
4. create_writing_image_rpcs.sql
5. create_writing_image_buckets.sql    ← 只能在真正的 Supabase 專案執行
```

跑完之後自己看一眼：

```sql
-- bucket 必須是私有的
SELECT id, public, file_size_limit FROM storage.buckets
 WHERE id IN ('writing-raw','writing-archive');

-- 五條政策，roles 全部是 {authenticated}
SELECT policyname, cmd, roles FROM pg_policies
 WHERE schemaname='storage' AND tablename='objects'
   AND policyname LIKE 'Writing:%' ORDER BY policyname;

-- 五支函式：search_path 釘住，anon 沒有 EXECUTE
SELECT p.proname, p.prosecdef, p.proconfig,
       has_function_privilege('anon', p.oid, 'EXECUTE') AS anon_can_execute
  FROM pg_proc p JOIN pg_namespace n ON n.oid = p.pronamespace
 WHERE n.nspname='public'
   AND p.proname IN ('create_writing_image_draft','register_writing_image',
                     'submit_writing_image_essay','writing_images_cleanup_candidates',
                     'writing_images_mark_deleted');
-- anon_can_execute 必須全部是 false
```

### 2. 環境變數（你自己在 Vercel 設，不要貼給任何人）

| 變數 | 用途 |
|---|---|
| `GOOGLE_VISION_API_KEY` | Cloud Vision REST。建議在 Google Cloud Console 建一把**只限 Cloud Vision API** 的金鑰 |
| `CRON_SECRET` | 已經有了（`send-daily-reminders` 在用）。清理端點沿用同一把 |

沒設 `GOOGLE_VISION_API_KEY` 時，處理端點回 503 並顯示「辨識服務尚未設定，請聯絡老師」——
不會留下半套資料。

### 3. 前端旗標

`src/config/features.ts` 的 `writing_images` 已經是 `enabled`。
**SQL 沒跑完就部署前端，學生按「拍照上傳」會失敗**，所以順序是：SQL → 部署。

---

## 正規化參數要先校準

程式裡的起點是長邊 **2200 px**、JPEG **q84**（`api/writing-images-process.ts`）。
這兩個數字**上線前要用真實學生手寫頁驗過**：

1. 找 10 張真實的手寫作業照片（不同光線、不同筆、有鉛筆的）
2. 跑 2000 / 2200 / 2400 px × q78 / 84 / 88 共九組
3. 每組記錄：檔案大小、辨識出的文字與正確文字的差異
4. 選**最小的、且辨識品質與原圖沒有可測差異**的那一組

壓過頭的代價不是「圖片醜一點」，是辨識變差、學生得整篇重打。
目標是平均 0.5–1.5 MB／頁。

---

## Staging 驗收清單

| # | 驗什麼 | 通過條件 |
|---|---|---|
| 1 | 正常流程 | 拍 2 張 → 辨識 → 改幾個字 → 送出 → 詳情頁看得到文字與照片 |
| 2 | provenance | 不改字的那篇是 `OCR`，改過字的是 `OCR_CORRECTED` |
| 3 | 別人的照片讀不到 | 學生 B 拿 A 的 signed URL 路徑 → 讀不到；URL 過期後失效 |
| 4 | bucket 非公開 | 用 public URL 格式直接存取 → 失敗 |
| 5 | 壞檔 | 上傳一個改名成 .jpg 的文字檔 → 該頁失敗、送出鈕停用、原檔留著 |
| 6 | 辨識失敗可重試 | 暫時把金鑰改錯 → 顯示可重試、封存圖留著；第 4 次辨識被擋 |
| 7 | 60 天到期 | 把 `submitted_at` 改成 61 天前 → `?dryRun=1` 看名單 → 真跑 → 只有封存圖消失，文字與報告完好 |
| 8 | 原檔提早刪 | 正常送出一篇後跑清理 → 原檔消失、封存圖與文字都在 |
| 9 | 條件未滿足不刪 | 造一篇辨識失敗的、一篇沒送出的 → 清理一個都不刪 |
| 10 | 字數 | OCR 文字送出後，卡片上的字數與 `countWords()` 一致 |

資料庫層的行為已經有自動測試（46 項）：

```bash
createdb wimg
psql -d wimg -f tests/sql/_writing_local_harness.sql
psql -d wimg -c "CREATE TABLE user_profiles (user_id UUID PRIMARY KEY REFERENCES auth.users(id), display_name TEXT);"
for f in create_writing_submissions create_writing_texts add_writing_texts_word_count \
         create_writing_ocr_runs create_writing_images relax_writing_image_checks \
         create_writing_image_rpcs; do psql -d wimg -f supabase/migrations/$f.sql; done
psql -d wimg -f tests/sql/writing_images_test.sql
```

---

## 清理工作

`/api/writing-images-cleanup`，Vercel Cron 每天 03:20（台灣時間）跑一次。

```
?dryRun=1   只列出要刪什麼，不真的刪
```

**上線後先用 dryRun 跑幾天**，確認名單裡只有該刪的東西，再讓它真的刪。
（真跑是預設行為，dryRun 要自己加參數；排程呼叫的是真跑。若想先觀察，
把 `vercel.json` 裡的路徑暫時加上 `?dryRun=1`。）

一次最多 200 個檔案，跑不完隔天繼續。順序固定是**先刪 Storage、成功後才標記資料庫** ——
反過來會留下資料庫說刪了、檔案還在的孤兒。

---

## 為什麼是這樣做的（幾個容易被「優化」掉的決定）

**原檔由瀏覽器直傳 Storage，不走 API。**
Vercel serverless 的請求本文上限約 4.5 MB，10 MB 的手機照片穿不過去。

**`register_writing_image()` 一定要驗路徑歸屬。**
伺服器是用 service-role 去 Storage 取檔的，那把鑰匙繞過 Storage 的 RLS。
路徑若能亂填，學生就能讓伺服器把別人的作文抓來辨識，再寫進自己的作文裡。

**provenance 由資料庫比對決定，不由 client 宣稱。**
client 說「我沒改」本來就可以說謊。`submit_writing_image_essay()` 直接比對
送出的文字與 `raw_text`。

**沒有逐詞座標表。**
ilearn 的設計有 `essay_ocr_tokens`（每個字的四邊形框）。在「圖片 60 天後刪除」
的前提下，那些座標會指向一張不存在的圖。要做「在原圖上標出錯誤位置」，
得先改保存策略——那就回到成本沒有上界的老路。

**不碰 ilearn 的 `essays` / `Essays` bucket。**
那兩個是公開的、任何登入者都能覆寫，而且有 86 筆線上作文正在用
（`docs/learn/security-followups.md` 第 1 項）。修它要與 ilearn 的維護者一起規劃；
寫作系統開自己的私有 bucket，那個既有問題不會因為這次上線而擴大。

**圖片草稿不可由學生刪除。**
`writing_images` 是 Storage 檔案的唯一索引。列被刪掉，檔案就永遠留在 bucket 裡
沒有人找得到。不要的草稿放著，30 天後清理工作會連同檔案一起帶走。
