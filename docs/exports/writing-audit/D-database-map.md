# D. Writing-related database map

## 表一覽

| Table | DDL 在 repo | 角色 |
|---|---|---|
| `writing_submissions` | ✅ | 作文本體（標題／題目／日期／狀態） |
| `writing_texts` | ✅ | 文字內容，**append-only**，最新一列為準 |
| `writing_analyses` | ✅ | ★ **AI 分析結果全部在這裡**（JSONB）＋ 佇列租約 ＋ telemetry |
| `writing_teacher_reviews` | ✅ | 老師按過「完成檢閱」（1:1） |
| `writing_teacher_feedback` | ✅ | 老師手寫講評（1:1，選填） |
| `writing_images` | ✅ | 照片作文原圖／封存圖 |
| `writing_ocr_runs` | ✅ | Google Vision OCR 執行紀錄 |
| `learn_classes` / `learn_class_members` | ✅ | 班級與名冊（**不屬 writing 模組，但 class filter 靠它**） |
| `push_subscriptions` | ✅ | Web Push 訂閱（唯一的通知管道） |

**沒有** assignment/prompt 主表 —— 題目是 `writing_submissions.essay_topic` 的**自由文字**。
**沒有** rubric score 表 —— 等第在 `writing_analyses.overall_evaluation` JSONB 裡。
**沒有** error/correction 的關聯表 —— 全部在 `writing_analyses.error_analysis` JSONB 裡。

---

## 1. `writing_submissions`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | UUID PK | |
| `student_id` | UUID | **FK → auth.users** ON DELETE CASCADE |
| `submission_type` | TEXT | `'text'` \| `'image'`（`relax_writing_image_checks.sql` 放寬） |
| `title` | TEXT NOT NULL | 非空 |
| `essay_topic` | TEXT NULL | ⚠️ **自由文字，沒有題庫** |
| `essay_date` | DATE | 預設今天 |
| `student_notes` | TEXT NULL | |
| `status` | TEXT | `'DRAFT'` \| `'SUBMITTED'` |
| `submitted_at` | TIMESTAMPTZ | CHECK：SUBMITTED 必有、DRAFT 必無 |
| `created_at` / `updated_at` | TIMESTAMPTZ | |

**Trigger**：`trg_writing_submissions_guard_immutable` —— 送出後不可改。
**讀寫者**：`submit_writing_essay()`、`writing_admin_queue()`、`writing_student_essay_cards()`、`useEssays.ts`

---

## 2. `writing_texts`

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | UUID PK | |
| `essay_id` | UUID | FK → writing_submissions CASCADE |
| `content` | TEXT NOT NULL | |
| `provenance` | TEXT | `'TYPED'` \| `'OCR'` \| `'OCR_CORRECTED'` |
| `char_count` | INTEGER | **GENERATED ALWAYS STORED** |
| `word_count` | INTEGER | 由 `add_writing_texts_word_count.sql` 加入 |
| `created_by` / `created_at` | | |

**Trigger**：`trg_writing_texts_guard_append_only` —— 只能新增，不能改不能刪。

---

## 3. ★ `writing_analyses` —— 這一張是核心

| 欄位 | 型別 | 說明 |
|---|---|---|
| `id` | UUID PK | |
| `essay_id` | UUID | FK → writing_submissions CASCADE |
| `status` | TEXT | `QUEUED` → `ANALYZING` → `ANALYZED` → `COMPLETED` / `FAILED` |
| `requested_by` / `requested_at` | | 誰按的、什麼時候 |
| `started_at` / `completed_at` / `failed_at` / `analyzed_at` | TIMESTAMPTZ | |
| `error_detail` / `failed_pass` / `validation_issues` | | 診斷 |
| `attempt_count` | INTEGER | |
| `provider` / `model` | TEXT | `'deepseek'` / `'deepseek-chat'` |
| `taxonomy_version` | TEXT | 預設 `'writing-v1'`，程式送 `'writing-v2'` |
| `analysis_version` | INTEGER | 重跑 = 插入新列，版次 +1 |
| 🟨 `competency_analysis` | **JSONB** | Axis 1：5 類 × 23 skill |
| 🟨 `error_analysis` | **JSONB** | ★ **Axis 2：findings[] + 全 17 code 的 coverage[]** |
| 🟨 `high_score_feature_analysis` | **JSONB** | Axis 3：29 feature |
| `overall_evaluation` / `strengths` / `needs_work` / `next_steps` | JSONB | 綜合層 |
| `synthesis_*`（6 欄） | | 綜合層狀態機 |
| `stage1_telemetry` / `synthesis_telemetry` | JSONB | 逐支逐次量測 |
| `stage1_progress` | JSONB | 四支 pass 的進度，支援跨請求續跑 |
| `lease_expires_at` / `lease_worker_id` / `queue_batch_id` / `queue_attempts` | | 佇列租約 |

**Indexes**
```
writing_analyses_one_active_per_essay  UNIQUE（一篇同時只能有一個 active 分析）
idx_writing_analyses_latest            (essay_id, analysis_version DESC)
idx_writing_analyses_pending
idx_writing_analyses_claimable         worker 認領用
idx_writing_analyses_batch             (queue_batch_id)
```

🛑 **沒有任何針對 `error_analysis` 的 GIN 索引。**

**Trigger**：`writing_analyses_guard_immutable_trigger`
- 已完成／已失敗的列**不可修改**（重跑必須插新列）
- 狀態轉移只允許合法路徑
- `ANALYZED`/`COMPLETED` 之後三個 axis 欄位**凍結**

**RLS**：只開放 admin 讀。學生一律經 `writing_student_analysis()` / `writing_student_essay_cards()` 策展函式。

---

## 4. `writing_teacher_reviews` / `writing_teacher_feedback`

```sql
writing_teacher_reviews (
  essay_id UUID PRIMARY KEY REFERENCES writing_submissions,   -- 1:1
  reviewed_by UUID NOT NULL REFERENCES auth.users,
  reviewed_at TIMESTAMPTZ NOT NULL DEFAULT now()
)
writing_teacher_feedback (
  id UUID PK, essay_id UUID UNIQUE REFERENCES writing_submissions,  -- 1:1
  body TEXT NOT NULL, author_id UUID NOT NULL,
  created_at, updated_at
)
```
⚠️ 兩者都是**每篇最多一筆**。`teacher_reviewed` 是布林事實（有沒有那一列），不是欄位。

---

## 5. 班級關係

```sql
learn_class_members (
  id UUID PK,
  class_id   UUID REFERENCES learn_classes CASCADE,
  student_id UUID REFERENCES auth.users CASCADE,
  joined_at, left_at,          -- ★ 軟移除
  created_by,
  UNIQUE (class_id, student_id)
)
```

- **一個學生可以屬於多個班級** → `writing_admin_queue()` 用 `array_agg(c.name)` 回傳 `class_names[]`
- class filter 的實際 query path：`writing_admin_queue()` 內的 LATERAL
  `learn_class_members m JOIN learn_classes c ON c.id = m.class_id WHERE m.student_id = s.student_id AND c.status = 'ACTIVE'`
  ⚠️ **只過濾 `c.status = 'ACTIVE'`，沒有過濾 `m.left_at IS NULL`** —— 已退出班級的學生，他的舊作文仍然會被算進那個班
- ⚠️ **沒有 teacher → class → student 的權限限制**。所有老師端函式都是 `is_admin()` 全有或全無；`is_admin()` 本身又是硬編碼單一 email

---

## 6. 全部 writing 相關 RPC（34 支）

| 分類 | 函式 |
|---|---|
| 送件 | `submit_writing_essay` · `submit_writing_image_essay` · `create_writing_image_draft` · `register_writing_image` |
| 老師端 | `writing_admin_queue` · `writing_admin_analysis` · `writing_queue_summary` · `writing_set_teacher_reviewed` · `writing_upsert_teacher_feedback` · `writing_teacher_feedback_for` |
| 學生端 | `writing_student_essay_cards` · `writing_student_analysis` |
| 佇列 | `writing_enqueue_analysis` · `writing_enqueue_analysis_batch` · `writing_queue_claim` · `writing_queue_release` · `writing_queue_ensure_analysis` · `writing_queue_begin_synthesis` · `writing_retry_synthesis` |
| 成本 | `writing_analysis_usage` · `writing_analysis_cost_estimate` · `writing_daily_analysis_cap` · `writing_daily_analysis_used` |
| 通知 | `writing_pending_digest` · `writing_pending_summary_internal` · `writing_reminder_push_targets` |
| 圖片 | `writing_images_cleanup_candidates` · `writing_images_mark_deleted` |
| Trigger fn | `writing_analyses_guard_immutable` · `writing_submissions_guard_immutable` · `writing_texts_guard_append_only` · `writing_ocr_runs_guard_final` · `writing_images_touch_updated_at` · `writing_teacher_feedback_touch` |

**全部都有 `SET search_path = ''`，全部 `REVOKE ALL FROM PUBLIC, anon`。** 這個模組的安全衛生明顯優於 vocabulary 模組。

---

## 7. Production schema 與 repo 不一致的部分

**writing 模組本身：沒有不一致。** 34 支 RPC、9 張表全部有 DDL 在 repo，全部有 rollback。

⚠️ 但 `/admin/writing` **間接依賴**兩個沒有 DDL 的東西：
- `learn_display_name()` —— `writing_admin_queue()` 用它組學生姓名（定義在 `create_learn_classes_tasks.sql`，✅ 有）
- `is_admin()` —— ✅ 有（`create_user_profiles_table.sql`），但硬編碼單一 email

上一次 vocabulary 稽核列出的 5 張無 DDL 的表（`pack_item_progress` 等）與 writing 無關。
