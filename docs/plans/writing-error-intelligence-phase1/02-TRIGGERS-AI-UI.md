# Trigger / AI / UI（交付項 8 / 9 / 10 + §A / §B / §G / §H / §I）

> ## ⚠️ 優先順序已於 2026-09-20 修訂
>
> 本文件的**資料架構結論仍然有效**，但「第一版要做什麼」已經改變。
> 請先讀 **[`04-PHASE-1A-REVISION.md`](./04-PHASE-1A-REVISION.md)**。
>
> 重點差異：Phase 1A 的主軸從 Persistent Error Detection 改為 **Error Finder**
> （一次出現即可查到），`student_writing_error_profiles` / `writing_error_alerts` /
> weekly cron / AI digest 全部延後到 1B / Phase 2，且 **D1–D7 都不再是動工的 blocker**。



## 8. Weekly trigger architecture（§G-2）

### 沿用既有基礎建設，不新建

| 要什麼 | 用既有的什麼 |
|---|---|
| 排程 | **Vercel cron**（`vercel.json` 已有三條） |
| 端點驗證 | `CRON_SECRET` + `timingSafeEqual`（`send-daily-reminders.ts` 的既有樣板） |
| 通知管道 | Web Push + `writing_reminder_push_targets()` |
| 「沒事不送」 | 既有原則，照抄 |

### 建議的 cron 項目

```json
{ "path": "/api/writing-error-weekly-scan", "schedule": "0 1 * * 1" }
```
UTC 週一 01:00 ＝ **台北週一早上 9 點**。老師一週開始時看到，不是週末被打擾。
⚠️ 時區換算要注意：`0 1 * * 1` UTC 對台北是週一 09:00，day-of-week 不跨日，安全。

### 端點做什麼（全部 deterministic，這一步不呼叫 AI）

```
1. 驗 CRON_SECRET
2. 找出「上週有新 COMPLETED 分析」的學生
     → 只重算這些人的 profile，不是全站重算
3. 對每個人 writing_refresh_error_profile() → writing_evaluate_error_alerts()
4. 統計這一輪建立了幾則 alert
5. 若 > 0 → Web Push 給老師（「本週有 N 位學生出現反覆錯誤」）
   若 = 0 → 什麼都不送（既有原則）
6. AI 摘要【不在這裡做】。alert 已經建好，ai_summary 之後補
```

### 為什麼 AI 不在 cron 裡跑

1. Vercel cron 有 `maxDuration` 限制，N 個 alert × 一次 DeepSeek 會超時
2. AI 失敗不該讓整個 weekly scan 失敗
3. 既有的 worker 鏈（kickWorker）本來就是為這種情況設計的

➡️ cron 結束前 `kickWorker(0, '/api/writing-error-digest-worker')`，讓摘要在背景慢慢補。
**這是重用既有的 `api/_lib/workerKick.ts`，不是新 infrastructure。**

---

## 9. Manual trigger reuse plan（§G-3）

### 完全沿用，不重建

| 既有元件 | 在新功能怎麼用 |
|---|---|
| `Set<string>` 勾選 + 全選 | 從勾 essay 改成勾 **student**（Student view 裡） |
| `<BatchAnalyzeDialog>` | **原封不動**。它的 props 是 `{open, count, estimate, loading, onConfirm, onCancel}`，與勾的是什麼無關 |
| `writing_analysis_cost_estimate()` | ⚠️ **不能直接用**（見下） |
| `queue.busy` / `Loader2` / toast 分級 | 照抄 |
| `describeEnqueue()` 的「講清楚為什麼被跳過」 | 照抄模式 |
| `kickWorker` 鏈 | 照用 |

### 兩個老師動作

| 動作 | 位置 | 做什麼 |
|---|---|---|
| **Analyze Selected Students** | Student view 勾選後 | 對選中學生的**現有 profile** 產生 AI 跨篇摘要。不重跑任何單篇分析 |
| **Analyze Writing History** | 單一學生詳情 | 同上，範圍是這一位 |

🛑 **兩個動作都不會重跑單篇 essay 分析。** 它們只消費已經存在的 findings。
這點在 UI 文案要講明白，否則老師會以為在重新批改、擔心花錢。

### ⚠️ 成本估算不能沿用現有函式

`writing_analysis_cost_estimate()` 是依**單篇四支 pass** 的實測 telemetry 算的。
跨篇 digest 的 input 形狀完全不同（見 §H，大約只有單篇的 1/10）。

➡️ 需要一支 `writing_error_digest_cost_estimate(p_count)`，**同樣依實測 telemetry**（第一批跑完才有樣本）。
在有樣本之前回 `sample_size = 0`，`BatchAnalyzeDialog` 既有邏輯已經處理這種情況（「估不出來也照樣開框 —— 確認本身比數字更重要」）。

---

## §H. AI cross-essay analysis —— compact digest

### 送什麼（不送全文）

```
學生：{display_name}
已分析作文：7 篇 · 總字數 1,340

近期 5 篇（新到舊）：
  E1  2026-09-18  180 words
      WRITE_ERR_ARTICLE x3
      WRITE_ERR_SV_AGREEMENT x1
  E2  2026-09-11  210 words
      WRITE_ERR_ARTICLE x2
  E3  2026-09-04  165 words
      （無）
  E4  ...
  E5  ...

本次聚焦：WRITE_ERR_ARTICLE（未加冠詞）
  出現於 5 篇中的 4 篇 · 共 9 次 · 0.67 次/百字
  狀態：PERSISTENT（由規則引擎判定）

代表性例句（3 則，取自不同作文）：
  1. "I went to park with my friend."      → "I went to the park with my friend."
  2. "She is best student in class."       → "She is the best student in the class."
  3. "We visited museum last Sunday."      → "We visited the museum last Sunday."
```

**估算**：約 300–500 tokens input，遠低於單篇分析（作文全文 + 17 code 定義 + boundary rules）。

### 代表性 quote 怎麼選（deterministic，不讓 AI 挑）

```
規則：同一 error_code 下，
  · 盡量取自不同 essay（多樣性優先）
  · 每篇最多 1 則
  · 上限 3 則
  · 依 essay_submitted_at DESC（近期優先）
  · quote 長度 > 200 字元的截斷並標記
```
寫成 SQL，存進 `evidence_summary.sample_finding_ids`。
**AI 收到的是已經選好的句子**，它不決定哪些例句有代表性。

### AI 的輸出契約

```ts
interface ErrorDigestResult {
  readonly summary: string;        // 跨篇摘要，2–3 句，teacher-facing
  readonly teaching_suggestion: string;  // 教學建議，具體可操作
  readonly taxonomy_version: string;
}
```

**驗證**（沿用 `analysisContract.ts` 的 validate 模式）：
- 必須是 JSON
- `summary` / `teaching_suggestion` 非空
- ⚠️ **不接受任何數字宣稱**。若 summary 裡出現與 `evidence_summary` 不符的數字，驗證擋下並重試
  （理由：數字是規則引擎的事實，AI 複述錯了就是在說謊）

### 🛑 AI 明確不做的三件事

1. **不決定是否通知老師** —— alert 在 AI 被呼叫之前就已經存在
2. **不產生 count / frequency / trend / status** —— 那些是 `evidence_summary` 給它的輸入
3. **不讀作文全文** —— 只讀 digest 與挑好的 quote

---

## §I. Persistent alert

### alert 的生命週期

```
規則引擎判定 PERSISTENT/REPEATED 且 confidence=HIGH
        │
        ▼
INSERT writing_error_alerts (ai_summary = NULL, ai_status = 'PENDING')
        │        ★ 這一刻 alert 就已經存在且可見。AI 還沒跑
        │
        ├──► admin UI 立刻看得到（顯示 evidence_summary 的 deterministic 內容）
        │
        └──► digest worker 撈 ai_status='PENDING' → DeepSeek → UPDATE ai_summary
                 失敗 → ai_status='FAILED'，alert 仍然在，仍然有 evidence_summary
```

### 防重複打擾

```sql
-- 已有未處理的同 (student, error_code) alert → 不重複建
UNIQUE (student_id, error_code) WHERE dismissed_at IS NULL AND reviewed_at IS NULL
```
加上 `profiles.last_alerted_at` 的冷卻期（建議 7 天，**待定**）。

老師 dismiss 之後，若狀況再度惡化，冷卻期過了可以再建一則新的 —— 但那是**新的一列**，保留了歷史。

### Web Push 只是通道

push payload 只帶「有 N 則新 insight」+ 連到 `/admin/writing?tab=alerts`。
**不在 push 裡帶內容** —— 通知會過期、會被清掉，真正的 insight 必須在 UI 裡查得到。

---

## 10. `/admin/writing` 最小 UI 改動（§A + §B）

### 不另開頁面：同一路由，三個 tab

```
/admin/writing                         ← 預設 tab=essays，與現在完全一樣
/admin/writing?tab=students            ← 新
/admin/writing?tab=alerts              ← 新
```

用既有的 `@/components/ui/tabs`。**三個 tab 共用同一組 filter bar**（班級／時間／錯誤），
filter 值放 **URL query**（順便解掉「重新整理就回預設」這個既有小毛病）。

### Essay view（現有）的改動

| 改什麼 | 幅度 |
|---|---|
| filter bar 多一個 **Error multiselect** | 新元件（`ui/command` + `ui/popover` 組成），~120 行 |
| `visible` 的 `useMemo` 多一個條件 | **3 行**：`if (errorFilter.length && !errorFilter.some(c => row.error_codes?.includes(c))) return false;` |
| 每列多一排 error badge | ~10 行，用既有 `ERROR_TAG_BY_CODE.get(code)?.zh` 與既有 badge tone |
| 其餘 5 個 filter / 勾選 / 批次 / 統計卡 | **零改動** |

> Error multiselect 的顯示 label 一律走 `ERROR_TAG_BY_CODE`，**不自己寫中文字串**。

### Student view（新 tab）

```
┌─ 共用 filter bar（班級 / 時間 / Error multiselect）────────────┐
│                                                              │
│ ☐ 全選    已選 3 位   [分析選取的學生 (3)]                     │
│ ─────────────────────────────────────────────────────────── │
│ ☐ 王小明   高二A          [未加冠詞 ×9] [SV 一致 ×3]           │
│           7 篇已分析 · 近 5 篇有 4 篇出現   PERSISTENT  ▸      │
│ ☐ 李小華   高二A、週六班   [拼寫錯誤 ×4]                       │
│           4 篇已分析 · 近 4 篇有 2 篇出現   REPEATED    ▸      │
└──────────────────────────────────────────────────────────────┘
```

- 版型**完全沿用** Essay view 的 `divide-y` 清單 + Checkbox + bulk toolbar
- `▸` 展開或連到學生詳情（建議用既有 `ui/accordion` 就地展開，不換頁）
- 資料來源：`writing_admin_error_students(p_class, p_from, p_to, p_error_codes[])`

### 你舉的那個例子怎麼走

> 班級：高二A · 時間：最近 30 天 · Error：`WRITE_ERR_ARTICLE` → 列出學生

```sql
-- writing_admin_error_students 的核心
SELECT f.student_id, learn_display_name(f.student_id) AS name,
       count(*) AS occurrences,
       count(DISTINCT f.essay_id) AS essays_with_error
  FROM writing_error_findings f
 WHERE f.error_code = ANY (p_error_codes)
   AND f.essay_submitted_at >= p_from
   AND (p_class_id IS NULL OR EXISTS (
         SELECT 1 FROM learn_class_members m
          WHERE m.student_id = f.student_id
            AND m.class_id = p_class_id
            AND m.left_at IS NULL        -- ★ 新函式從一開始就正確，見 §J
       ))
 GROUP BY f.student_id
 ORDER BY occurrences DESC;
```
吃 `(error_code, essay_submitted_at DESC)` 索引。

### 下一階段的「最近 N 篇中至少 M 篇」

這個查詢形狀不同（需要先取每個學生的最近 N 篇，再判斷）。
**建議直接讀 `student_writing_error_profiles`**：
```sql
WHERE recent_essay_count_with_error >= M AND recent_sample_size >= N
```
profile 表就是為了讓這種查詢變成單表掃描而存在的。

### Alerts view（新 tab）

最簡版：時間排序的清單，每則顯示 `evidence_summary` 的事實 + `ai_summary`（若有）+ 已讀／關閉按鈕。
`ai_status = 'PENDING'` 時顯示「摘要生成中」，**不要讓整則 alert 消失**。
