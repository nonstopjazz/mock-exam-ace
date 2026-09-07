# GSAT 英文學習平台 — 系統稽核報告 (Platform Audit)

> **稽核日期**：2026-08-23
> **稽核範圍**：`nonstopjazz/mock-exam-ace` repository（commit `6e7c0a9`）
> **稽核目的**：在擴充為 Teacher / Student / Parent 學習平台之前，完整理解現有系統
> **重要前提**：本次稽核**未修改任何程式碼、schema、migration、RLS policy 或 UI**。所有結論來自 repository 靜態分析。

---

## 0. 稽核方法與可信度說明 (Scope & Confidence)

本報告的分析**僅基於 repository 內的檔案**。以下限制會影響部分結論的確定性，請務必先閱讀：

| 限制 | 影響 |
|------|------|
| 沒有 Supabase 專案的實際連線權限 | 無法驗證線上實際的 table 結構、RLS policy、function 定義 |
| `supabase/migrations/` **不是**由 Supabase CLI 管理的正式 migration 目錄 | 檔名沒有 timestamp 前綴，沒有 `supabase/config.toml`，也沒有 migration 版本表。這些檔案更像是「手動貼到 SQL Editor 執行的腳本集」 |
| **有 20 個 table 在程式碼中被使用，但 repository 內完全沒有它們的 DDL** | 這些 table 的欄位、索引、RLS 只能從查詢語句反推（見 §2.3） |
| 另一個 writing application 共用同一個 Supabase project | 該 app 的 schema **不在本 repo 內**，本報告無法直接稽核，只能提出「必須先做 schema discovery」的行動項 |

> **⚠️ 因此，在進入 Phase 1 實作之前，第一件必做的事是：對線上 Supabase 執行一次完整的 schema dump（`information_schema` + `pg_policies` + `pg_proc`），與本報告對照。** 詳見 §10.1。

---

## 1. Current Architecture（現有架構）

### 1.1 技術棧總覽

這是一個**純前端 SPA + Supabase BaaS** 的架構，沒有自有的 application server。

```
┌─────────────────────────────────────────────────────────┐
│  Browser (React 18 SPA)                                  │
│  ├── react-router-dom v6  (client-side routing)          │
│  ├── zustand + persist    (localStorage 狀態)             │
│  ├── shadcn/ui + Radix + Tailwind                        │
│  └── @supabase/supabase-js (anon key，直接打 DB)          │
└───────────────┬─────────────────────┬───────────────────┘
                │                     │
                │ PostgREST / RPC     │ /api/* (Vercel Functions)
                │ (受 RLS 保護)        │ (service_role key)
                ▼                     ▼
┌─────────────────────────────┐  ┌──────────────────────────┐
│  Supabase                    │  │ Vercel Serverless        │
│  ├── Postgres + RLS          │  │ ├── send-daily-reminders │
│  ├── Auth (Google + Email)   │  │ │   (cron 0 12 * * *)    │
│  ├── Storage × 4 buckets     │  │ └── generate-pack-audio  │
│  └── Edge Function × 1       │  │     (Google TTS)         │
└─────────────────────────────┘  └──────────────────────────┘
```

### 1.2 Framework / Build

| 項目 | 內容 |
|------|------|
| Build tool | **Vite 5.4** + `@vitejs/plugin-react-swc` |
| Language | TypeScript 5.8（**`strict: false`、`strictNullChecks: false`、`noImplicitAny: false`**） |
| Framework | **React 18.3**（純 CSR，無 SSR / RSC） |
| Routing | **react-router-dom 6.30**，全部路由在 `src/App.tsx` 靜態宣告，**無 lazy loading / code splitting** |
| Deploy | **Vercel**（`vercel.json`：SPA rewrite + 1 個 cron job） |
| 專案起源 | **Lovable.dev** 生成（`README.md`、`lovable-tagger` plugin） |
| 開發歷史 | 113 commits，2026-01-24 ~ 2026-06-25 |

### 1.3 Routing 結構

`src/App.tsx`（220 行）以三種 gate 包裝路由：

| Gate | 檔案 | 行為 |
|------|------|------|
| `ProtectedRoute` | `src/components/auth/ProtectedRoute.tsx` | 未登入 → 導向 `/login?returnUrl=…` |
| `RequireAdmin` | `src/components/auth/RequireAdmin.tsx` | 非 admin → 顯示「權限不足」畫面 |
| `PhaseGate` | `src/components/gates/PhaseGate.tsx` | `site_settings.current_phase < requiredPhase` → 顯示 `LockedPage` |

**路由分組：**

| 群組 | 路徑 | 保護方式 | 資料來源 |
|------|------|----------|----------|
| 公開 | `/`, `/blog`, `/blog/:slug`, `/login`, `/auth/callback`, `/claim/:token` | 無 | Supabase（blog）／Mock（home） |
| 單字練習 | `/practice/vocabulary/*`（srs, flashcards, quiz, spelling, fill-blank, match, synonym-antonym, collections, weak-words, pack/:packId） | `ProtectedRoute` | **Supabase（真實）** |
| 遊戲化 | `/practice/quests`, `/achievements`, `/shop`, `/profile` | `PhaseGate(1)` + `ProtectedRoute` | **全部 hardcoded 假資料** |
| 模考 | `/exams`, `/exam`, `/exam/result/:id`, `/exam/explanation/:id` | `PhaseGate(2)` | **全部 Mock + localStorage** |
| 儀表板 | `/dashboard` | `PhaseGate(2)` | **全部 Mock** |
| 作文 | `/essay` | `PhaseGate(2)` | **全部 Mock，含假的 AI 批改** |
| 後台 | `/admin`, `/admin/{packs,tokens,blog,exams,settings,users}` | `RequireAdmin` | **Supabase（真實）** |
| Legacy 後台 | `/admin/{upload,course-management,…}` × 9 | **僅 `!IS_PRODUCTION`，無任何權限檢查** | 混合 |

> **關鍵發現 A**：`/dashboard/result-summary` 這條路由**沒有任何 gate**（`ProtectedRoute`、`PhaseGate` 都沒有），且內容是完整的假成績單。任何人都能直接開啟。

### 1.4 State Management

系統有 **4 套並行的狀態管理機制**，彼此沒有統一：

| 機制 | 位置 | 用途 | 持久化 |
|------|------|------|--------|
| **zustand + persist** | `src/store/vocabularyStore.ts`（569 行） | 單字進度、SRS 計算、篩選條件、streak | `localStorage['vocabulary-storage']` |
| **zustand + persist** | `src/store/examStore.ts`（252 行） | 模考作答狀態 | `localStorage['exam-storage']` |
| **React Context** | `AuthContext`, `PhaseContext` | 登入 session、站台 phase | 無（每次重載重抓） |
| **各 hook 自帶 `useState`** | `src/hooks/*.ts` × 15 | 每個 hook 自己 fetch + 自己管 loading/error | 無 |

> **關鍵發現 B**：**`@tanstack/react-query` 已安裝、`QueryClientProvider` 已掛載在 `App.tsx`，但整個 codebase 沒有任何一處使用 `useQuery` / `useMutation`。** 這是一個純粹的死依賴 + 死 Provider。所有資料抓取都是手寫 `useEffect + useState`，沒有快取、沒有 request 去重、沒有背景 revalidate。

### 1.5 UI Library

- **shadcn/ui**（`components.json`，style: default，48 個元件在 `src/components/ui/`）
- **Radix UI** 25 個 primitive packages
- **Tailwind CSS 3.4** + `tailwindcss-animate` + `@tailwindcss/typography`
- 自訂 design token 在 `tailwind.config.ts`（含 `success` / `warning` 語意色）
- Icon：`lucide-react`
- Toast：**同時存在 `sonner` 與 shadcn `toast` 兩套**，`App.tsx` 兩個 Toaster 都掛載

### 1.6 主要 Dependencies 與重複／未使用情形

| 類別 | 套件 | 狀態 |
|------|------|------|
| 資料抓取 | `@tanstack/react-query` | ❌ **完全未使用**（僅掛 Provider） |
| 圖表 | `chart.js` + `react-chartjs-2` | ✅ 使用中（Dashboard, ExamResult, GrammarDoughnut） |
| 圖表 | `recharts` | ⚠️ 僅被 `src/components/ui/chart.tsx` 引用，而該檔案**沒有任何頁面使用** → 實質死碼 |
| 富文字編輯器 | `@blocknote/*` × 3 | ✅ 使用中（`BlockNoteEditor.tsx` → `BlogAdmin`） |
| 富文字編輯器 | `@tiptap/*` × 8 | ❌ **`RichTextEditor.tsx` 存在但無人 import** → 8 個套件死依賴 |
| Excel | `xlsx@0.18.5` | ⚠️ 放在 **`devDependencies`**，卻被 `src/` 的 production 程式碼 import（見 §6.4） |
| 表單 | `react-hook-form` + `zod` + `@hookform/resolvers` | ⚠️ 極少使用，多數表單是手寫 `useState` |
| Push | `web-push` | ✅ 使用中（Vercel API） |

---

## 2. Current Database Model（現有資料模型）

### 2.1 Repository 內有 DDL 的 Tables（10 個）

| Table | 定義檔 | 主要欄位 | RLS |
|-------|--------|----------|-----|
| `packs` | `schema.sql` + `add_skill_type_to_packs.sql` + `add_premium_memberships.sql` | `id`, `title`, `description`, `theme`, `difficulty`, `created_by→auth.users`, `is_public`, `is_active`, `is_premium`, `skill_type` | ✅ 6 條 policy |
| `pack_items` | `schema.sql` + `add_audio_to_pack_items.sql` | `id`, `pack_id→packs`, `word`, `definition`, `part_of_speech`, `example_sentence`, `phonetic`, `sort_order`, `audio_url`, `example_audio_url` | ✅ 4 條 policy |
| `invite_tokens` | `schema.sql` | `id`, `pack_id→packs`, `created_by`, `token UNIQUE`, `max_uses`, `current_uses`, `expires_at`, `is_active` | ⚠️ 5 條（見 §6.1） |
| `user_pack_claims` | `schema.sql` + `add_site_to_user_pack_claims.sql` | `id`, `user_id→auth.users`, `pack_id→packs`, `claimed_via_token`, `progress`, `last_studied_at`, `site`, UNIQUE(user_id, pack_id, site) | ✅ 4 條 policy |
| `user_profiles` | `create_user_profiles_table.sql` | `id`, `user_id→auth.users UNIQUE`, `display_name`, `product`, `grade`, `school` | ⚠️ **只有 SELECT/INSERT/UPDATE，沒有 DELETE policy** |
| `user_stats` | `create_user_stats_table.sql` | `user_id UNIQUE`, `streak_days`, `last_study_date DATE`, `total_review_count`, `total_words_learned` | ✅ 3 條 policy |
| `user_word_progress` | `create_user_word_progress_table.sql` + `unify_word_progress_tracking.sql` | `user_id`, `word_id TEXT`, `mastery_level`, **`next_review_time BIGINT`（Unix ms）**, `review_count`, `correct_count`, `last_review_time BIGINT`, `source`, `pack_id` | ✅ 3 條 policy |
| `level_words` | `create_level_words_table.sql` | `id TEXT PK`, `word`, `ipa`, `translation`, `part_of_speech`, `example`, `example_translation`, `synonyms TEXT[]`, `antonyms TEXT[]`, `level INT`, `difficulty`, `category`, `tags TEXT[]`, `audio_url`, `example_audio_url` | ⚠️ 全公開 SELECT；寫入用 **hardcoded email** |
| `premium_memberships` | `add_premium_memberships.sql` + `fix_premium_memberships_admin_rls.sql` | `user_id`, `granted_at`, `expires_at`, `is_active`, `granted_by`, `notes` | ⚠️ **只有 SELECT policy，沒有 INSERT/UPDATE**（靠 SECURITY DEFINER function 寫入） |
| `push_subscriptions` | `create_push_subscriptions_table.sql` | `user_id`, `endpoint`, `p256dh`, `auth`, UNIQUE(user_id, endpoint) | ✅ 4 條 policy |

**Seed 資料**：`seed_level_{2..6}_words.sql`，共約 2.1 MB SQL，把 5 個 level 的單字灌進 `level_words`。

### 2.2 Repository 內有 DDL 的 Functions（14 個）

| Function | 定義檔 | SECURITY | 內部權限檢查 |
|----------|--------|----------|--------------|
| `claim_pack_with_token(text)` | `schema.sql`, `update_claim_pack_function.sql` | DEFINER | `auth.uid()` |
| `claim_pack_with_token(text, text)` | `add_site_to_user_pack_claims.sql` **和** `add_premium_memberships.sql` **（兩個衝突版本）** | DEFINER | `auth.uid()` |
| `generate_short_token(int)` | `schema.sql` | INVOKER | 無（未被前端使用） |
| `get_user_profile()` | `create_user_profiles_table.sql` | DEFINER | `auth.uid()` |
| `upsert_user_profile(...)` | 同上 | DEFINER | `auth.uid()` |
| `is_admin()` | 同上 | DEFINER | **hardcoded `nonstopjazz@gmail.com`** |
| `admin_get_all_users(...)` | 同上 | DEFINER | ✅ 呼叫 `is_admin()` |
| `admin_get_user_stats()` | 同上 | DEFINER | ✅ 呼叫 `is_admin()` |
| `update_user_streak(int, int)` | `create_user_stats_table.sql` | DEFINER | `auth.uid()` |
| `get_user_stats()` | 同上 | DEFINER | `auth.uid()` |
| `upsert_word_progress(...)` | `create_user_word_progress_table.sql` + `unify_…` | DEFINER | `auth.uid()` |
| `get_all_word_progress()` | 同上 | DEFINER | `auth.uid()` |
| `is_premium_member(uuid)` | `add_premium_memberships.sql` | DEFINER | 無（純查詢） |
| `admin_grant_premium(uuid, ts, text)` | 同上 | DEFINER | ❌ **完全沒有權限檢查**（見 §6.1） |
| `admin_revoke_premium(uuid)` | 同上 | DEFINER | ❌ **完全沒有權限檢查** |

### 2.3 程式碼有使用、但 Repository 內**沒有 DDL** 的 Tables（20 個）

這是本次稽核最重要的結構性風險之一。以下 table 從查詢語句反推：

| Table | 使用位置 | 從查詢反推的欄位 |
|-------|----------|------------------|
| `app_admins` | `src/hooks/useAdmin.ts:78` | `user_id` |
| `site_settings` | `PhaseContext`, `useSiteSettings`, `SiteSettings.tsx` | `id TEXT PK`（'gsat'/'toeic'/'kids'/'main'）, `navigation_tabs JSONB`, `current_phase SMALLINT`, `updated_at`, `updated_by` |
| `pack_images` | `useUserPacks.ts`, `PacksAdmin.tsx` | `id`, `pack_id`, `image_url`, `is_cover`, `sort_order` |
| `pack_item_progress` | `usePackItemProgress.ts`, `useUserPacks.ts` | `user_id`, `pack_id`, `item_id`, `mastery_level`, `review_count`, `correct_count`, **`next_review_at TIMESTAMPTZ`**, `last_review_at` |
| `exams` | `useExam.ts` | `id TEXT`, `title`, `year`, `month`, `difficulty`, `total_score`, `duration_minutes`, `notes`, `status`, `created_at`, `updated_at` |
| `vocabulary_questions` | `useExam.ts` | `exam_id`, `question_number`, `question_text`, `option_a..d`, `correct_answer`, `explanation`, `level_tag`, `topic_tags[]`, `score` |
| `question_groups` | `useExam.ts` | `id TEXT`, `exam_id`, `group_type`, `group_order`, `title`, `content`, `content_image`, `content_translation`, `option_count`, `option_list`, `structure_option_a..e`, `article_type`, `chart_description`, `topic_tags[]` |
| `group_questions` | `useExam.ts` | `group_id`, `question_number`, `blank_number`, `question_text`, `option_a..d`, `options_type`, `correct_answer`, `explanation`, `mixed_type`, `grammar_small/medium/large`, `level_tag`, `phrase_tag`, `question_type_tag`, `score` |
| `translation_questions` | `useExam.ts` | `exam_id`, `question_number`, `chinese_text`, `reference_answer`, `scoring_criteria`, `explanation`, `grammar_tags[]`, `level_tag`, `phrase_tag`, `topic_tags[]`, `score` |
| **`essay_questions`** | `useExam.ts` | `exam_id`, `question_number`, `prompt`, `prompt_image`, `essay_type`, `word_count_requirement`, `scoring_criteria`, `sample_essay`, `writing_tips`, `error_type_tags[]`, `topic_tags[]`, `score` |
| `exam_attempts` | `useExam.ts` | `user_id`, `exam_id`, `started_at`, `submitted_at`, `time_spent_seconds`, `vocabulary_score`, `cloze_score`, `contextual_score`, `structure_score`, `reading_score`, `mixed_score`, `translation_score`, `essay_score`, `total_score`, `status` |
| `exam_user_answers` | `useExam.ts` | `attempt_id`, `vocabulary_question_id`, `group_question_id`, `translation_question_id`, `essay_question_id`, `user_answer`, `time_spent_seconds` |
| `exam_statistics` | `useExam.ts` | **應為 VIEW**：`id`, `title`, `year`, `status`, `vocab_count`, `*_group_count`, `translation_count`, `essay_count`, `attempt_count` |
| `blog_posts` | `useBlog.ts` | slug, title, content, category, … |
| `blog_categories` | `useBlog.ts` | — |
| `blog_likes` / `blog_bookmarks` / `blog_shares` / `blog_page_views` | `useBlog.ts` | `post_id`, `user_id` |
| `blog_post_stats` | `useBlog.ts` | **應為 VIEW** |

**同樣缺 DDL 的 3 個 RPC**：`update_pack_item_progress(p_pack_id, p_item_id, p_is_correct, p_response)`、`get_pack_statistics(p_pack_id)`、`get_weak_words(p_pack_id, p_limit)`。

### 2.4 Storage Buckets（4 個，皆無 policy 定義在 repo）

| Bucket | 用途 | 寫入者 |
|--------|------|--------|
| `pack-images` | 單字包封面 | `PacksAdmin.tsx`（前端 anon key） |
| `pack-audio` | TTS 發音 mp3 | Vercel API / Edge Function（service_role） |
| `blog-images` | 部落格圖片 | `useBlog.ts`（前端 anon key） |
| `exam-images` | 題目／文章圖片 | `ExamQuestionsEditor.tsx`（前端 anon key） |

### 2.5 現有資料模型 ER 概觀

```
auth.users ─┬─→ user_profiles      (1:1, product/grade/school)
            ├─→ user_stats         (1:1, streak/總複習數)
            ├─→ user_word_progress (1:N, level+pack 單字 SRS ← BIGINT 時間)
            ├─→ pack_item_progress (1:N, pack 單字 SRS ← TIMESTAMPTZ)  ⚠️ 與上者重疊
            ├─→ user_pack_claims   (1:N, ×site)
            ├─→ premium_memberships(1:N)
            ├─→ push_subscriptions (1:N)
            ├─→ app_admins         (0..1)   ⚠️ 無 DDL
            └─→ exam_attempts      (1:N)    ⚠️ 無 DDL，且前端從未寫入

packs ──┬─→ pack_items ─→ (audio_url)
        ├─→ pack_images
        └─→ invite_tokens ─→ user_pack_claims

level_words (獨立字庫，~2.1MB seed)

exams ──┬─→ vocabulary_questions
        ├─→ question_groups ─→ group_questions
        ├─→ translation_questions
        └─→ essay_questions        ← ⭐ 未來 writing 整合的關鍵接點

site_settings (per-site: navigation_tabs, current_phase)
blog_* (7 張表)
```

---

## 3. Current Authentication Model（現有認證模型）

### 3.1 認證流程

**Provider**：Supabase Auth，`src/lib/supabase.ts` 用 `VITE_SUPABASE_URL` + `VITE_SUPABASE_ANON_KEY` 建立 singleton client（預設設定：`persistSession` + `autoRefreshToken` 皆為 supabase-js 預設開啟，session 存在 `localStorage`）。

支援 3 種登入方式（`src/contexts/AuthContext.tsx`）：

1. **Google OAuth** — `signInWithOAuth({ provider: 'google', redirectTo: origin + '/auth/callback' })`
2. **Email + Password** — `signInWithPassword`（註冊最低密碼長度僅前端檢查 6 字元）
3. **Password Reset** — `resetPasswordForEmail({ redirectTo: origin + '/auth/reset-password' })`

> **關鍵發現 C**：`resetPassword` 導向 `/auth/reset-password`，但 **`App.tsx` 完全沒有註冊這條路由** → 使用者點重設密碼信件後會落到 404 (`NotFound`)。密碼重設功能實質上是壞的。

### 3.2 Session 生命週期

```
App 掛載
  └─ AuthProvider useEffect
       ├─ supabase.auth.getSession()  → setUser/setSession
       │    └─ if user: useVocabularyStore.getState().loadProgress()
       └─ supabase.auth.onAuthStateChange(...)  → 同上
```

`AuthContext` 對外提供：`user`, `session`, `loading`, `signInWithGoogle`, `signInWithEmail`, `signUpWithEmail`, `signOut`, `resetPassword`。

### 3.3 Supabase Auth ↔ Application Profile 的連結方式

**沒有 trigger。** `auth.users` 與 `user_profiles` 之間**沒有 `on auth.users AFTER INSERT` 的自動建檔機制**。Profile 是**懶建立（lazy）**的：

```
使用者註冊 → auth.users 有資料，user_profiles 無資料
   ↓
呼叫 rpc('get_user_profile') → { success: true, has_profile: false, profile: null }
   ↓
GradeSelectionModal 提示使用者填年級
   ↓
rpc('upsert_user_profile', {p_product, p_grade, p_display_name, p_school})
   ↓  ON CONFLICT (user_id) DO UPDATE
user_profiles 才被建立
```

**後果**：`user_profiles` 的資料完整性無法保證。`admin_get_all_users` 用 `LEFT JOIN` 就是為了容忍這件事。**這對未來的 Teacher/Parent 平台是嚴重問題** — 你無法保證「每個 auth 使用者都有一筆 profile 可以掛角色」。

### 3.4 Authorization（授權）— **兩套互相矛盾的 admin 判斷**

| 機制 | 實作位置 | 判斷依據 | 使用者 |
|------|----------|----------|--------|
| **機制 1：`app_admins` 表** | `src/hooks/useAdmin.ts` | `SELECT user_id FROM app_admins WHERE user_id = auth.uid()` | `RequireAdmin`, `UserStatus`（前端 UI gate） |
| **機制 2：hardcoded email** | `is_admin()` SQL function | `SELECT email FROM auth.users WHERE id = auth.uid()` → `= 'nonstopjazz@gmail.com'` | `admin_get_all_users`, `admin_get_user_stats`, `premium_memberships` 的 admin RLS |
| **機制 3：inline hardcoded email** | `create_level_words_table.sql` 的 3 條 RLS | `EXISTS (SELECT 1 FROM auth.users WHERE auth.uid()=id AND email='nonstopjazz@gmail.com')` | `level_words` 寫入 |

> **關鍵發現 D**：把某人加進 `app_admins` 只會讓前端 UI 解鎖，**不會**讓他通過 `is_admin()`，也**不會**讓他能寫 `level_words`。反之，`nonstopjazz@gmail.com` 即使不在 `app_admins` 裡也擁有全部 SQL 層權限。這是三套不同步的權限來源。

### 3.5 前端 Gate 是 UI-only，真正的邊界在 RLS

`RequireAdmin` 只是渲染時的分支，任何人都能直接呼叫 `supabase.from(...)`。實際安全邊界完全依賴 RLS：

- `packs` 的 INSERT policy 是 `auth.uid() = created_by` → **任何登入使用者都能建立 pack**，`/admin/packs` 的 admin gate 沒有 DB 層對應。
- `invite_tokens` 的 INSERT policy 是「pack owner」→ 任何人建立自己的 pack 後就能發 token。
- `site_settings` 的 RLS **不在 repo 內** → 無法確認 `updatePhase()`（切換全站 phase！）是否真的只有 admin 能執行。**這是必須立即向線上 DB 確認的第一優先事項。**

---

## 4. Existing Features（現有功能盤點）

### 4.1 功能成熟度總表

| 功能 | 路由 | 資料來源 | 成熟度 |
|------|------|----------|--------|
| **單字 SRS 複習** | `/practice/vocabulary/srs` | Supabase `level_words` + `user_word_progress` | 🟢 **正式上線** |
| **翻卡 / 快測 / 拼字 / 填空 / 配對 / 同反義** | `/practice/vocabulary/{flashcards,quiz,spelling,fill-blank,match,synonym-antonym}` | 同上 | 🟢 **正式上線** |
| **單字包（Pack）領取與學習** | `/claim/:token`, `/practice/vocabulary/pack/:id` | `packs`/`pack_items`/`invite_tokens`/`user_pack_claims`/`pack_item_progress` | 🟢 **正式上線** |
| **弱點單字** | `/practice/vocabulary/weak-words` | `user_word_progress`（level）+ `get_weak_words` RPC（pack） | 🟢 上線 |
| **學習統計 / streak** | 各處 | `user_stats` + `update_user_streak` | 🟡 上線但邏輯重複（§6.3） |
| **Web Push 每日提醒** | — | `push_subscriptions` + Vercel cron | 🟢 上線 |
| **TTS 發音生成** | 後台 | Google TTS → `pack-audio` bucket | 🟡 上線但無鑑權（§6.1） |
| **Blog / 學習專欄** | `/blog`, `/blog/:slug` | `blog_*` 7 張表（含按讚、書籤、分享、瀏覽統計） | 🟢 上線 |
| **會員 Premium** | 後台 | `premium_memberships` | 🔴 有嚴重權限漏洞（§6.1） |
| **後台：Pack / Token / Blog / Exam / User / Site 管理** | `/admin/*` | Supabase | 🟢 上線 |
| **試卷題庫管理（含 Excel 批次匯入）** | `/admin/exams`, `/admin/exams/:id/questions` | `exams` + 5 張題目表 | 🟢 **上線（後台端）** |
| **模考作答** | `/exam` | **`MOCK_EXAM_PAPER` 硬編碼 + `examStore` localStorage** | 🔴 **Demo** |
| **模考列表** | `/exams` | **`PAST_EXAMS`/`MOCK_EXAMS` 硬編碼陣列** | 🔴 **Demo** |
| **模考結果 / 詳解** | `/exam/result/:id`, `/exam/explanation/:id` | **`MOCK_EXAM_PAPER` + localStorage** | 🔴 **Demo** |
| **學習儀表板** | `/dashboard` | **`MOCK_QUESTION_TYPE_SCORES` 等 4 組假資料** | 🔴 **Demo** |
| **成績單** | `/dashboard/result-summary` | **檔案內 inline 假資料，且無任何 gate** | 🔴 **Demo** |
| **作文 + AI 批改** | `/essay` | **`MOCK_ESSAY_PROMPTS` + `setTimeout(2000)` 回傳 `MOCK_GRADING_RESPONSE`** | 🔴 **Demo（假 AI）** |
| **遊戲化：任務地圖 / 成就 / 商店 / 檔案** | `/practice/{quests,achievements,shop,profile}` | **全部檔案內 hardcoded 陣列** | 🔴 **Demo** |
| **影片課程** | `/courses`, `/course/:id`, `/drip-course/:id` | **`mockCourses` 硬編碼** | 🔴 **Demo** |
| **聽力 / 口說活動** | — | **不存在**（無 `MediaRecorder`、無 `SpeechRecognition`、無聽力題型） | ⚫ **無** |

### 4.2 ⭐ 最重要的結構性發現：兩套互不相通的 Exam 系統

這是擴充平台前**必須先解決**的核心矛盾：

```
【後台 / Admin 端】                      【學生 / Student 端】
ExamAdmin.tsx                            ExamList.tsx
ExamQuestionsEditor.tsx                  ExamNew.tsx
      ↓                                  ExamResult.tsx
useExam.ts (1059 行)                     ExamExplanation.tsx
      ↓                                        ↓
Supabase 真實資料                        examStore.ts (zustand)
  exams                                        ↓
  vocabulary_questions                   localStorage['exam-storage']
  question_groups                              ↑
  group_questions                        src/data/mock-exam.ts
  translation_questions                    (MOCK_EXAM_PAPER, 643 行)
  essay_questions                        src/data/mock-exam-list.ts
                                         src/types/exam.ts
```

**證據：**
- `src/hooks/useExam.ts` 匯出的 `useExamAttempt()` 與 `useUserExamHistory()` — 這兩個 hook 是**唯二**會寫入／讀取 `exam_attempts` 與 `exam_user_answers` 的程式碼，而全 codebase grep 結果顯示：**沒有任何頁面 import 它們**。它們是死碼。
- 學生端 4 個頁面全部 fallback 到 `MOCK_EXAM_PAPER`：`const paper = examPaper || MOCK_EXAM_PAPER;`
- 兩邊的型別系統完全不同：`src/types/exam.ts`（前端 discriminated union，`ExamPaper`/`Question`/`StudentAnswer`）vs `src/hooks/useExam.ts`（DB 對應的扁平 interface，`FullExam`/`VocabularyQuestion`/`QuestionGroup`）。**兩者之間沒有任何轉換層。**

> **結論**：`exam_attempts` / `exam_user_answers` 這兩張表**幾乎確定是空的**（沒有任何生產路徑寫入）。這對「quiz / school exam / mock exam analytics」的規劃是好消息（沒有歷史包袱要遷移），也是壞消息（沒有任何真實作答資料可用）。

### 4.3 ⭐ 第二重要發現：作文（Writing）現況

| 面向 | 現況 |
|------|------|
| 題庫 | ✅ **`essay_questions` 表已存在且後台可管理**（prompt, prompt_image, essay_type, word_count_requirement, scoring_criteria, sample_essay, writing_tips, error_type_tags, topic_tags, score） |
| 學生作答 UI | 🔴 `src/pages/Essay.tsx`（539 行）**完全用 `MOCK_ESSAY_PROMPTS`**，與 `essay_questions` 無關 |
| 提交儲存 | 🔴 **不存在**。沒有任何 table 儲存學生的作文內容 |
| AI 批改 | 🔴 **假的**。`handleGrade()` 只是 `setTimeout(2000)` 後回傳 `MOCK_GRADING_RESPONSE` |
| 教師批改 | 🔴 不存在 |
| 已定義的批改資料結構 | ✅ **`src/data/mock-essay.ts` 已定義完整的 `EssayGradingResponse`**：`overall_score`, `level`, `summary`, `rubric{TaskResponse, Coherence, LexicalResource, Grammar, Creativity}`, `strengths[]`, `weaknesses[]`, `highlights[{start,end,type,severity,note,suggestion}]`, `suggestions{sentence_fixes[], paragraph_comments[], top_advice[]}` |

> **對整合另一個 writing application 的意義**：本 repo **有 UI 與 rubric 型別，但沒有任何 writing 的持久化 schema**。這正好是「優先 reuse 既有 schema」最理想的情境 — **不需要遷移任何資料，只需要把 `Essay.tsx` 接到對方既有的 table 上。** 前提是先做 schema discovery（§10.1）。

### 4.4 Teacher / Class / Parent 相關功能

**完全不存在。** 全 codebase grep 沒有任何 `teacher`, `class`, `classroom`, `parent`, `guardian`, `assignment`, `homework`, `roster` 的實體、表或路由。使用者模型目前是**扁平的單一角色（學生／admin）**。

---

## 5. Existing Reusable Assets（可重用資產）

### 5.1 ✅ 可直接重用（不需修改）

| 類別 | 資產 | 重用方式 |
|------|------|----------|
| **UI 元件** | `src/components/ui/*` × 48（shadcn/ui 完整套件，含 `sidebar`, `chart`, `form`, `table`, `carousel`） | Teacher/Parent dashboard 直接沿用，視覺一致性零成本 |
| **Auth 基礎建設** | `AuthContext`, `ProtectedRoute`, `useAuthAction`, `Login.tsx`, `AuthCallback.tsx` | 三種角色共用同一套登入 |
| **權限 Gate 模式** | `RequireAdmin`（含 loading/denied 狀態） | 直接複製成 `RequireTeacher` / `RequireParent` |
| **Phase / Feature Flag** | `PhaseContext`, `PhaseGate`, `LockedPage`, `src/config/features.ts` | 新功能可先掛 `PhaseGate(3)` 灰度上線 |
| **多站台識別** | `useSiteIdentifier`（hostname → gsat/toeic/kids）、`src/config/product.ts` | 角色平台可 per-site 啟用 |
| **音檔播放** | `useAudioPlayer`（單例 audio、播放狀態） | listening activity 直接可用 |
| **圖表** | `chart.js` + `react-chartjs-2` 已整合，`Dashboard.tsx` 有 Bar/Line 範例，`GrammarDoughnut` 有 doughnut 範例 | 三種 dashboard 的圖表基底 |
| **Excel 批次匯入** | `BatchUploadDialog.tsx`（515 行）+ `scripts/generate-exam-template.ts`（557 行）+ `EXCEL_TEMPLATE_README.md` | **可直接改造成「批次匯入學生名單／班級名冊」** |
| **Web Push** | `usePushSubscription` + `push_subscriptions` + `api/send-daily-reminders.ts` + `public/sw.js` | 「作業到期提醒」「家長週報」的現成管道 |
| **編輯器** | `BlockNoteEditor.tsx` | 教師寫作業說明／回饋 |
| **頭像** | `useAvatar` + `public/avatars/*.webp` × 9 | 學生／教師頭像（但需搬到 DB，見 §6.3） |

### 5.2 ✅ 可重用的 Database 資產

| 資產 | 為何可重用 |
|------|------------|
| **`level_words`（~2.1 MB 字庫）** | 完整的 6 級單字庫含 IPA/例句/同反義/tags/audio_url。**任何角色的 vocabulary analytics 都應建構在這之上** |
| **`user_word_progress`** | 已有 `source`/`pack_id` 的多來源設計，且已有 mastery/review/correct count → **vocabulary review analytics 的現成事實表** |
| **`exams` + 5 張題目表** | 完整的學測題型建模（單字／克漏字／文意選填／篇章結構／閱讀／混合／翻譯／作文），含 `level_tag`, `topic_tags[]`, `grammar_small/medium/large`, `question_type_tag` → **quiz / exam analytics 的維度欄位已經備齊** |
| **`exam_attempts`（分項計分欄位）** | 已有 `vocabulary_score`, `cloze_score`, `contextual_score`, `structure_score`, `reading_score`, `mixed_score`, `translation_score`, `essay_score`, `total_score` → **reading / analytics 的分項基礎已存在**，只是沒人寫入 |
| **`exam_user_answers`** | 已有 4 種 question_id 的 polymorphic 設計 |
| **`essay_questions`** | writing submission 的題目端已完備 |
| **`packs` / `pack_items` / `invite_tokens` / `user_pack_claims`** | **`invite_tokens` 的「發碼 → 領取 → 綁定使用者」機制可以直接改造成「班級邀請碼」** — 這是本系統最有價值的可重用機制之一 |
| **`premium_memberships`** | 有效期 + 撤銷 + 授予者 + 備註的模式，可直接複製成「教師授權」「班級訂閱」 |
| **`site_settings`** | per-site JSONB 設定 + phase，角色平台可沿用 |

### 5.3 ⚠️ 可重用但**必須先修**的資產

| 資產 | 問題 | 修法方向 |
|------|------|----------|
| `useAdmin` / `is_admin()` | 三套權限來源不同步 | 統一成單一 role 來源（見 §8.2） |
| `user_profiles` | 無自動建檔 trigger | 加 `on auth.users` trigger（Phase 1） |
| `claim_pack_with_token` | 兩個衝突定義 | 先查線上實際版本，再收斂 |
| `useExam.ts` | 1059 行、含死碼、無 react-query | 拆分 + 接上學生端 |
| `src/types/exam.ts` ↔ `useExam.ts` 型別 | 兩套並存無轉換層 | 補 adapter |

---

## 6. Risks / Technical Debt（風險與技術債）

### 6.1 🔴 安全風險（Security Risks）— 需優先處理

| # | 嚴重度 | 問題 | 位置 | 說明 |
|---|--------|------|------|------|
| **S1** | 🔴 **Critical** | **Premium 權限可自我授予** | `add_premium_memberships.sql` | `admin_grant_premium(p_user_id, p_expires_at, p_notes)` 是 `SECURITY DEFINER` 但**函式內完全沒有 `is_admin()` 檢查**。任何登入使用者只要執行 `supabase.rpc('admin_grant_premium', { p_user_id: <自己的 uid> })` 就能永久授予自己 Premium。`admin_revoke_premium` 同樣可撤銷任何人的資格。 |
| **S2** | 🔴 **Critical** | **TTS 端點無鑑權** | `api/generate-pack-audio.ts`、`supabase/functions/generate-pack-audio/index.ts` | 兩者都用 `SUPABASE_SERVICE_ROLE_KEY`，但**沒有任何 auth / admin 驗證**（Edge Function 連 `verify_jwt` 設定都沒在 repo 內）。任何人 `POST {pack_id, force:true}` 即可無限消耗 Google TTS 配額、覆寫 Storage 檔案、以 service_role 更新 `pack_items`。 |
| **S3** | 🟠 **High** | **所有邀請碼可被任意列舉** | `schema.sql` invite_tokens RLS | policy `"Anyone can validate tokens" ... USING (is_active = true)` 允許**任何人（含未登入 anon）** `SELECT *` 取得**全部**啟用中的 token。付費／精華單字包的邀請碼形同公開。正確做法是用 `SECURITY DEFINER` function 驗證單一 token，而非開放 SELECT。 |
| **S4** | 🟠 **High** | **`admin_grant_premium` 缺 RLS 補位** | `premium_memberships` | 該表只有 SELECT policy，沒有 INSERT/UPDATE policy。搭配 S1 的無檢查 DEFINER function，等於權限完全由那個有漏洞的函式把關。 |
| **S5** | 🟠 **High** | **`site_settings` 的 RLS 未知** | 無 DDL | `useSiteSettings.updatePhase()` 直接 `UPDATE site_settings SET current_phase`。若該表沒有 admin-only 的 UPDATE policy，**任何登入使用者都能解鎖全站所有 Phase 2 功能**。必須立即向線上 DB 確認。 |
| **S6** | 🟡 **Medium** | **後台 gate 僅存在於 UI** | `RequireAdmin` | `packs` 的 INSERT policy 是 `auth.uid() = created_by`，任何登入者都能建 pack、進而發 token。DB 層沒有 admin 概念。 |
| **S7** | 🟡 **Medium** | **Dev mode 可在 production 開啟** | `DevPhaseSwitcher.tsx` | `?devmode=true` 會寫入 `localStorage['dev_mode_enabled']` 並在 production 顯示開發者面板。雖然註解寫「completely removed in production builds」，但實際上 `isDevModeEnabled()` 明確支援 production 啟用。（影響僅限視覺模擬，不改路由，故列 Medium。） |
| **S8** | 🟡 **Medium** | **未受保護的成績單路由** | `App.tsx` `/dashboard/result-summary` | 唯一沒有任何 gate 的內部頁面。目前只暴露假資料，但一旦接真實資料就是資料外洩。 |
| **S9** | 🟡 **Medium** | **邀請碼用 `Math.random()` 產生** | `TokensAdmin.tsx:91` | 非密碼學安全的隨機源；`generate_short_token()` SQL function 存在卻未被使用（且該函式的參數名 `length` 遮蔽了內建 `length()`，本身可能有問題）。 |
| **S10** | 🟢 Low | `.gitignore` 未含 `.env` | `.gitignore` | 只有 `*.local`，`.env` 不在忽略清單。目前**未發現任何密鑰被提交**（已驗證），但存在誤提交風險。 |

### 6.2 🔴 Schema 一致性問題（Schema Inconsistencies）

| # | 問題 | 說明 |
|---|------|------|
| **C1** | **`claim_pack_with_token(text, text)` 有兩個互相衝突的定義** | `add_site_to_user_pack_claims.sql` 的版本會依 `site` 檢查重複並**寫入 `site` 欄位**，但**沒有 premium 檢查**；`add_premium_memberships.sql` 的版本**有 premium 檢查**，但**不檢查也不寫入 `site`**。兩者是同一個簽名的 `CREATE OR REPLACE`，**後執行者覆蓋前者**。由於檔名沒有 timestamp，repository **無法判斷線上實際是哪一版**。<br>→ 若 site 版勝出：精華包的付費門檻形同虛設。<br>→ 若 premium 版勝出：`site` 永遠寫入 default `'gsat'`，多站台領取邏輯壞掉。 |
| **C2** | **`claim_pack_with_token` 同時存在 1-arg 與 2-arg overload** | `schema.sql` / `update_claim_pack_function.sql` 定義 1-arg；後兩個 migration 定義 2-arg（帶 default）。同時存在時，只傳 `p_token` 會造成 Postgres `function is not unique` 錯誤。目前前端一律傳兩個參數所以沒爆，但這是一顆定時炸彈。 |
| **C3** | **兩套並行的 SRS 進度系統** | `user_word_progress`（`next_review_time BIGINT` Unix ms，**SRS 演算法在前端 `vocabularyStore.ts` 計算**）vs `pack_item_progress`（`next_review_at TIMESTAMPTZ`，**SRS 演算法在後端 `update_pack_item_progress` RPC 計算**）。**兩者都在追蹤 pack 單字**（`unify_word_progress_tracking.sql` 已把 `source`/`pack_id` 加進前者），資料會分岔。時間格式也不同（BIGINT vs TIMESTAMPTZ）。 |
| **C4** | **`user_word_progress.word_id` 的外鍵已被移除** | `unify_word_progress_tracking.sql` 明確 `DROP CONSTRAINT user_word_progress_word_id_fkey`，因為 pack item ID 不在 `level_words`。現在 `word_id TEXT` 是**沒有參照完整性的 polymorphic key**，孤兒資料無法被清理。 |
| **C5** | **`is_admin()` vs `app_admins` vs inline email 三套權限** | 見 §3.4。 |
| **C6** | **mastery level 門檻在三處不一致** | `vocabularyStore.filterWords()` 用 `masteryLevel >= 4` 判定 mastered；`getLevelProgress()` / `getOverallProgress()` 用 `>= 5`；`SRS_INTERVALS` 註解說 `6 = mastered`。同一個「精熟」概念有三種定義。 |
| **C7** | **Streak 有前端與後端兩套實作** | `vocabularyStore.updateStreak()`（localStorage）與 `update_user_streak()` RPC（`user_stats`）演算法各自獨立且都會被觸發。`api/send-daily-reminders.ts` 甚至留下註解說明 DB 的 `streak_days` 永遠不會自動歸零，必須在通知時重算 — 這是在下游修補上游的資料正確性問題。 |
| **C8** | **`exam_user_answers` 的 upsert conflict target 寫死** | `useExam.ts:956-959`：無論 `questionType` 是 vocabulary/group/translation/essay，`onConflict` **一律是 `'attempt_id,vocabulary_question_id'`**。對 group/translation/essay 題目的 upsert 行為必然錯誤。（目前無人呼叫，故尚未爆炸。） |
| **C9** | **20 張 table + 3 個 RPC 沒有 DDL** | 見 §2.3。無法 code review、無法重建環境、無法確認 RLS。 |
| **C10** | **`user_profiles` 與 `premium_memberships` 缺 DELETE policy** | 使用者無法自行刪除 profile（GDPR/個資法的刪除權可能有問題）。 |

### 6.3 🟡 重複邏輯（Duplicate Logic）

| # | 重複項 | 位置 |
|---|--------|------|
| **D1** | **`use-toast.ts` 完全相同的兩份**（byte-identical，各 3935 bytes） | `src/hooks/use-toast.ts` ＝ `src/hooks/galaxy/use-toast.ts` |
| **D2** | **TTS 生成邏輯兩份實作** | `api/generate-pack-audio.ts`（Vercel，5 並行）vs `supabase/functions/generate-pack-audio/index.ts`（Edge，序列）。同功能、不同效能、不同錯誤處理，都無鑑權 |
| **D3** | **Phase 定義三份** | `src/config/features.ts`、`src/contexts/PhaseContext.tsx`、`src/hooks/useSiteSettings.ts` 各自宣告 `export type Phase = 0|1|2` |
| **D4** | **Streak 演算法兩份** | 見 C7 |
| **D5** | **Mastered 判定三份** | 見 C6 |
| **D6** | **snake_case → camelCase 轉換手寫 6 次** | `useExam.ts` 的 `transformExam`, `transformVocabularyQuestion`, `transformQuestionGroup`, `transformGroupQuestion`, `transformTranslationQuestion`, `transformEssayQuestion`；`useUserPacks`、`usePackItemProgress`、`useBlog` 又各自手寫一遍 |
| **D7** | **兩套 Toast 系統並存** | `sonner` + shadcn `toast`，`App.tsx` 同時掛載兩個 Toaster |
| **D8** | **`ProgressBar` / `NavLink` 各兩份** | `src/components/ProgressBar.tsx`（re-export）+ `src/components/galaxy/ProgressBar.tsx`；`src/components/NavLink.tsx` + `src/components/galaxy/NavLink.tsx` |
| **D9** | **兩套模考型別系統** | `src/types/exam.ts` vs `src/hooks/useExam.ts`，見 §4.2 |
| **D10** | **`GRADE_OPTIONS`（useUserProfile）與 `product.ts` 的產品設定重疊** | 兩處都在定義「這個產品有哪些使用者」 |

### 6.4 🟡 其他技術債

| # | 項目 | 影響 |
|---|------|------|
| **T1** | **`strict: false` + `strictNullChecks: false` + `noImplicitAny: false`** | 全 codebase 有 46 處顯式 `: any`，實際隱式 any 更多。重構時 TypeScript 幾乎不提供保護 |
| **T2** | **~3.7 MB 靜態單字資料被靜態 import 進 bundle** | `src/data/vocabulary/level{2..6}.ts` 合計 3.7 MB。雖然 runtime 已改讀 Supabase，但 `VocabularyHub.tsx` 與 `VocabularySelector.tsx` **靜態** import `VOCABULARY_LEVELS` / `TOTAL_WORDS`（`src/data/vocabulary/index.ts` 在 top-level import 全部 5 個 level 檔）→ **整包仍被打進 main bundle** |
| **T3** | **零 code splitting** | `App.tsx` 靜態 import 全部 60+ 頁面。加上 T2，首屏 bundle 極大 |
| **T4** | **`@tanstack/react-query` 完全未使用** | 見 §1.4。所有資料抓取無快取、無去重、元件切換就重打 API |
| **T5** | **`@tiptap/*` × 8 套件死依賴** | `RichTextEditor.tsx` 無人使用 |
| **T6** | **`recharts` 實質死依賴** | 只被無人使用的 `ui/chart.tsx` 引用 |
| **T7** | **`xlsx@0.18.5` 放在 devDependencies 卻被 production code import** | ① 打包語意錯誤；② SheetJS 0.18.5 有已知的 prototype pollution (CVE-2023-30533) 與 ReDoS (CVE-2024-22363)，且 npm 上的 `xlsx` 已停止更新（修補版只在 SheetJS 自家 CDN）。此套件直接解析使用者上傳的檔案 |
| **T8** | **`useAvatar` 只存 localStorage** | 換裝置／換瀏覽器頭像就變。且 `nonstopjazz@gmail.com` 的特殊頭像是 hardcoded 在前端 |
| **T9** | **`/auth/reset-password` 路由不存在** | 見 §3.3 |
| **T10** | **無任何測試** | 沒有 test runner、沒有測試檔、CI 只有 lint |
| **T11** | **9 條 legacy admin 路由僅靠 `!IS_PRODUCTION` 隱藏** | 沒有 `RequireAdmin` 包裝 |
| **T12** | **`useExam.ts` 單檔 1059 行**、`BlogAdmin.tsx` 953 行、`PacksAdmin.tsx` 938 行 | 難以維護與 review |
| **T13** | **`README.md` 仍是 Lovable 樣板** | 沒有本專案的架構說明、環境變數清單、部署說明 |
| **T14** | **`.env.example` 不完整** | 只列 2 個變數，但實際使用到 `VITE_SITE_ID`, `VITE_APP_PRODUCT`, `VITE_VAPID_PUBLIC_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `VAPID_*`, `CRON_SECRET`, `GOOGLE_TTS_API_KEY` |
| **T15** | **`supabase/migrations/` 不是真的 migration 系統** | 檔名無 timestamp、無 `config.toml`、無版本追蹤。這是 C1/C2 問題的根因 |

---

## 7. Missing Capabilities（缺失能力）

以未來平台需求對照現況：

| 需求 | 現況 | 缺口 |
|------|------|------|
| **Teacher** | ⚫ 不存在 | 無 teacher 實體、無角色系統、無教師後台 |
| **Class** | ⚫ 不存在 | 無班級實體、無名冊、無班級生命週期（學期/封存） |
| **Student** | 🟡 部分 | 有 `auth.users` + `user_profiles`（product/grade/school），但**無 student 角色標記、無「屬於哪個班」** |
| **Parent / Guardian** | ⚫ 不存在 | 無家長帳號、無家長視角 |
| **Teacher ↔ Student** | ⚫ 不存在 | 無關聯表、無授權範圍（教師能看哪些學生的哪些資料） |
| **Class ↔ Student** | ⚫ 不存在 | 無 enrollment 表 |
| **Parent ↔ Student** | ⚫ 不存在 | 無 guardian link、無同意/驗證機制（**未成年人資料，需特別注意個資合規**） |
| **Assignment management** | ⚫ 不存在 | 無作業實體、無指派、無到期日、無提交狀態 |
| **Completion tracking** | 🟡 部分 | 有單字層級的 progress，但**無「作業完成度」概念** |
| **Quiz analytics** | 🟡 部分 | 有 quiz 練習頁但**結果不落庫**（只更新單字 mastery，不記錄每次測驗） |
| **School exam analytics** | ⚫ 不存在 | 無「校內考試」實體（現有 `exams` 是模考題庫） |
| **Mock exam analytics** | 🔴 斷鏈 | 題庫在 DB、作答在 localStorage、儀表板是假資料（§4.2） |
| **Vocabulary review analytics** | 🟢 **資料齊全** | `user_word_progress` + `pack_item_progress` 有完整事實資料，但**沒有任何 analytics 視圖／聚合／教師端呈現** |
| **Listening activity analytics** | ⚫ 不存在 | 無聽力題型、無聽力活動、僅有 `useAudioPlayer` 單字發音 |
| **Reading activity analytics** | 🟡 部分 | `question_groups.group_type = 'reading'` 題型存在、`exam_attempts.reading_score` 欄位存在，但**無資料寫入、無閱讀時長追蹤** |
| **Speaking activity analytics** | ⚫ 不存在 | 無錄音、無 `MediaRecorder`、無評分 |
| **Writing submission** | 🔴 缺持久化 | 有題庫（`essay_questions`）與 UI，**無任何儲存學生作文的 table** |
| **AI writing feedback** | 🔴 假的 | `setTimeout` mock。但 **rubric 型別已完整定義**（§4.3） |
| **Teacher writing feedback** | ⚫ 不存在 | — |
| **Student dashboard** | 🔴 假的 | `Dashboard.tsx` 全 mock |
| **Parent dashboard** | ⚫ 不存在 | — |
| **Teacher dashboard** | ⚫ 不存在 | — |

**橫向缺失（跨所有需求）：**

- ⚫ **無 role / permission 模型**（只有 binary admin）
- ⚫ **無 organization / school / tenant 層級**（`site_settings` 是站台不是租戶）
- ⚫ **無 audit log**（誰改了誰的成績、誰看了誰的資料）
- ⚫ **無 notification 系統**（只有單一用途的每日 push cron）
- ⚫ **無 analytics 聚合層**（沒有 materialized view、沒有 rollup 表、沒有時序事實表）
- ⚫ **無測試**

---

## 8. Proposed Future Architecture（建議的未來架構）

> 以下是**建議**，尚未實作。核心原則：**reuse over replacement、保持 backward compatibility、不破壞現有正式上線的單字功能。**

### 8.1 架構原則

1. **保留 SPA + Supabase 架構。** 現階段沒有理由引入 Next.js 或自有 backend；教師／家長的資料隔離需求可由 RLS + `SECURITY DEFINER` function 滿足。
2. **加法優先，不動既有表。** 所有新表用 additive migration；既有表只加 nullable 欄位，不改型別、不刪欄位、不改既有 policy 的語意（除非是修 §6.1 的安全漏洞）。
3. **`auth.users` 維持唯一身分來源。** Teacher / Student / Parent 都是 `auth.users`，用 role 表區分，**不建立三套獨立帳號系統**。
4. **重用 `invite_tokens` 的發碼模式。** 「班級邀請碼」與「單字包邀請碼」概念一致，應共用心智模型（但用獨立的表，避免污染既有邏輯）。
5. **Analytics 走「事實表 + 視圖」而非即時 join。** 教師端要看 30 個學生 × 多維度，不能靠前端 N+1 查詢。
6. **Writing 一律 reuse 對方 app 的既有 schema。** 在 schema discovery 完成前，**不建立任何 essay/writing 相關的新表**。

### 8.2 建議的身分與權限模型

```
                    auth.users  (單一身分來源)
                         │
                         ▼
                   user_profiles          ← 既有表，加 trigger 保證必定存在
                         │
                         ▼
                    user_roles            ← 新表：(user_id, role, scope_id)
                    role ∈ {student, teacher, parent, admin}
                         │
        ┌────────────────┼────────────────┐
        ▼                ▼                ▼
   classes          class_members    guardian_links
   (班級)           (學生⇄班級)       (家長⇄學生)
        │                                  │
        └──→ class_teachers                └──→ 需 consent 驗證
             (教師⇄班級，含 role: owner/co-teacher)
```

**權限收斂建議**：把 `is_admin()`、`app_admins`、hardcoded email 三套統一成 `user_roles` 的單一來源，並讓 `is_admin()` 改為查 `user_roles`（**保留函式名稱與簽名**，這樣既有的 8 處呼叫端與 RLS 都不用改 → backward compatible）。

**存取範圍（RLS 語意）**：

| 角色 | 可讀取範圍 |
|------|------------|
| student | 自己的全部資料（現況不變） |
| teacher | 自己任教班級內的學生資料（透過 `class_teachers` → `class_members`） |
| parent | 已驗證綁定的子女資料，**唯讀** |
| admin | 全部 |

建議用 `SECURITY DEFINER` helper function（如 `can_access_student(p_student_id uuid)`）集中判斷，RLS policy 只呼叫它，避免每張表重寫遞迴 join。

### 8.3 建議的 Analytics 架構

現有問題是「事件沒有被記錄」。建議引入**單一統一活動事實表**，而不是為每種活動各建一套：

```
learning_activities  (統一事實表)
  ├── user_id, class_id(nullable), assignment_id(nullable)
  ├── activity_type ∈ {vocabulary, quiz, mock_exam, school_exam,
  │                    listening, reading, speaking, writing}
  ├── source_ref (polymorphic: exam_attempt_id / pack_id / submission_id …)
  ├── started_at, completed_at, duration_seconds
  ├── score, max_score, accuracy
  └── metadata JSONB  (題型分項、level 分佈、錯誤標籤…)
```

三種 dashboard 都建構在這張表 + 少數幾個聚合 view 之上，而不是各自去 join 十幾張明細表。**既有的 `user_word_progress` 與 `pack_item_progress` 維持不動**，額外寫一筆 activity 事件（雙寫），確保現有功能零影響。

### 8.4 建議的前端演進

| 項目 | 建議 |
|------|------|
| 資料層 | **啟用已安裝的 `@tanstack/react-query`**，新功能一律用它；既有 hook 逐步遷移（不強制一次改完） |
| 路由 | 依角色分區：`/student/*`, `/teacher/*`, `/parent/*`，既有路由**全部保留**（backward compatible），`/practice/*` 等維持原樣 |
| Gate | 新增 `RequireRole role="teacher"`，沿用 `RequireAdmin` 的既有模式 |
| Code splitting | 新的三個角色區塊一律用 `React.lazy`，同時把既有的重頁面（Dashboard、Exam、Blog admin）改 lazy |
| 型別 | 為新表產生 Supabase types（`supabase gen types typescript`），逐步取代手寫 transform |
| 靜態單字資料 | 把 `VocabularyHub` / `VocabularySelector` 對 `@/data/vocabulary` 的靜態 import 改成從 Supabase 或常數計算 → 可從 bundle 移除 3.7 MB |

---

## 9. Proposed Database Changes（建議的資料庫變更）

> ⚠️ **以下全部是提案，本次稽核未建立任何 migration。** 所有變更都是 **additive**；沒有任何 `DROP TABLE` / `DROP COLUMN` / 既有欄位型別變更。

### 9.1 修補既有問題（Phase 1 必做，安全性）

| # | 變更 | 類型 | 破壞性 |
|---|------|------|--------|
| F1 | 在 `admin_grant_premium` / `admin_revoke_premium` 內加入 `IF NOT is_admin() THEN RETURN error` | `CREATE OR REPLACE FUNCTION`（簽名不變） | ❌ 無 |
| F2 | 為 `generate-pack-audio` 兩個端點加入 admin 驗證（Bearer JWT → `is_admin()`） | 程式碼 | ❌ 無（除了現在的匿名呼叫者會被擋，這正是目的） |
| F3 | 收斂 `invite_tokens` 的 SELECT policy：移除 `USING (is_active = true)` 的全表開放，改為僅 owner 可讀；token 驗證改走既有的 `claim_pack_with_token` DEFINER function | `DROP POLICY` + `CREATE POLICY` | ⚠️ **需先確認沒有前端在直接 SELECT invite_tokens 做驗證**（`TokensAdmin` 有 SELECT，但那是 owner 視角，符合新 policy） |
| F4 | 確認並補上 `site_settings` 的 admin-only UPDATE policy | 視線上現況 | ⚠️ 若目前是開放的，收緊後只有 admin 能改 phase（正確行為） |
| F5 | 收斂 `claim_pack_with_token`：合併 site + premium 兩版邏輯成單一 2-arg 版本；`DROP FUNCTION claim_pack_with_token(text)`（1-arg） | `CREATE OR REPLACE` + `DROP FUNCTION` | ⚠️ **必須先確認線上沒有其他 app 在呼叫 1-arg 版**（writing app 也共用此 project！） |
| F6 | 為 `user_profiles` 補 DELETE policy | `CREATE POLICY` | ❌ 無 |
| F7 | 加入 `on auth.users AFTER INSERT` trigger 自動建立 `user_profiles` | `CREATE TRIGGER` | ❌ 無（`upsert_user_profile` 的 `ON CONFLICT` 讓它冪等） |
| F8 | 為既有沒有 profile 的使用者補建 profile（一次性 backfill） | `INSERT … ON CONFLICT DO NOTHING` | ❌ 無 |

### 9.2 新增：角色與關聯（Phase 2）

| 新表 | 用途 | 關鍵欄位（提案） |
|------|------|------------------|
| `user_roles` | 角色 | `user_id→auth.users`, `role`, `granted_at`, `granted_by`, `is_active`, UNIQUE(user_id, role) |
| `classes` | 班級 | `id`, `name`, `site`, `school`, `academic_year`, `owner_teacher_id`, `is_archived`, `created_at` |
| `class_teachers` | 教師⇄班級 | `class_id`, `teacher_id`, `role`（owner/co_teacher）, UNIQUE(class_id, teacher_id) |
| `class_members` | 學生⇄班級 | `class_id`, `student_id`, `joined_at`, `status`（active/left）, UNIQUE(class_id, student_id) |
| `class_invite_tokens` | 班級邀請碼（**沿用 `invite_tokens` 的欄位設計**） | `class_id`, `token UNIQUE`, `max_uses`, `current_uses`, `expires_at`, `is_active` |
| `guardian_links` | 家長⇄學生 | `guardian_id`, `student_id`, `relationship`, `status`（pending/verified/revoked）, `verified_at`, UNIQUE(guardian_id, student_id) |

配套 helper function（`SECURITY DEFINER`）：`has_role(role text)`、`can_access_student(student_id uuid)`、`teacher_class_ids()`。

### 9.3 新增：作業與活動（Phase 3）

| 新表 | 用途 |
|------|------|
| `assignments` | `class_id`, `created_by`, `title`, `description`, `activity_type`, `target_ref`（pack_id / exam_id / essay_question_id）, `due_at`, `is_published` |
| `assignment_targets` | 指派給個別學生（可選，支援差異化派題） |
| `assignment_submissions` | `assignment_id`, `student_id`, `status`（not_started/in_progress/submitted/graded）, `submitted_at`, `score`, `activity_id` |
| `learning_activities` | §8.3 的統一事實表 |

### 9.4 Writing 整合（⚠️ 待 schema discovery）

**本報告不提出任何 writing 相關的新表。** 理由：另一個 writing application 已在同一個 Supabase project 中運作，其 schema 不在本 repo，**在確認它已有什麼之前建立新表，違反「prefer reuse over replacement」原則，且極可能造成資料重複。**

必須先完成的 discovery（§10.1），至少要回答：
1. 對方是否已有 `essay_submissions` / `writing_submissions` 之類的表？欄位為何？
2. 對方的 AI 批改結果如何儲存？（JSONB？分欄？）是否與本 repo `mock-essay.ts` 的 `EssayGradingResponse` 結構相容？
3. 對方是否已有題目表？與本 repo 的 `essay_questions` 是同一張還是各自一張？
4. 對方的 `user_id` 是否也指向同一個 `auth.users`？

**只有在確認缺口之後**，才提出「加 nullable 欄位」（如 `class_id`, `assignment_id`, `teacher_feedback`, `teacher_reviewed_at`）的 additive 提案。

### 9.5 建議引入正式的 Migration 管理

現有 `supabase/migrations/` 的檔名沒有 timestamp，是 C1/C2 的根因。建議：

1. 先對線上 DB 做完整 schema dump，作為 baseline
2. 導入 Supabase CLI（`supabase/config.toml` + `supabase migration new`），檔名帶 timestamp
3. **既有的 SQL 檔一律保留不動**（它們是歷史紀錄），新變更一律走新機制

---

## 10. Migration Risks（遷移風險）

### 10.1 🔴 最高風險：共用 Supabase Project

**這是整個計畫最大的單一風險。** 另一個 writing application 與本 app 共用同一個 Postgres database。任何 DDL 變更都是**跨應用的**。

| 風險 | 影響 | 緩解 |
|------|------|------|
| 修改共用 function 簽名（如 `is_admin()`、`claim_pack_with_token`） | **另一個 app 可能立即中斷** | 只做 `CREATE OR REPLACE`，**絕不改簽名**；`DROP FUNCTION` 前必須先確認呼叫端 |
| 新表命名衝突 | migration 失敗或誤覆蓋 | **Phase 1 第一步就是完整 schema dump**；新表可考慮前綴（如 `lp_` for learning platform）或使用獨立 schema |
| 收緊 RLS 影響對方 app | 對方讀不到資料 | 每次改 policy 前先確認該表是否被對方使用 |
| 兩邊各自建 migration，順序衝突 | 見 C1 | 統一 migration 管道，或至少建立變更通報流程 |

> **行動項 M0（阻斷性）：在寫任何一行 migration 之前，必須先取得完整的線上 schema：**
> ```sql
> -- 需在 Supabase SQL Editor 執行並保存結果
> SELECT table_schema, table_name, column_name, data_type, is_nullable, column_default
>   FROM information_schema.columns WHERE table_schema='public' ORDER BY 2,ordinal_position;
> SELECT * FROM pg_policies WHERE schemaname='public';
> SELECT p.proname, pg_get_function_identity_arguments(p.oid), p.prosecdef
>   FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace WHERE n.nspname='public';
> SELECT * FROM storage.buckets;
> SELECT conname, conrelid::regclass, pg_get_constraintdef(oid) FROM pg_constraint
>   WHERE connamespace='public'::regnamespace;
> ```
> **並與本報告 §2 對照，特別確認：`claim_pack_with_token` 實際是哪一版、`site_settings` 的 RLS、以及 writing app 的所有表。**

### 10.2 其他遷移風險

| # | 風險 | 說明 | 緩解 |
|---|------|------|------|
| **R1** | **修 §6.1 安全漏洞會改變現有行為** | 修 S1 後，目前若有人已用漏洞自我授予 premium，修補後這些紀錄仍然有效 | 修補時同步稽核 `premium_memberships` 中 `granted_by` 為 null 或非 admin 的紀錄 |
| **R2** | **收緊 `invite_tokens` RLS 可能破壞領取流程** | 需確認 `ClaimPack.tsx` 是否有直接 SELECT token 的路徑 | 已確認 `ClaimPack.tsx` 只呼叫 RPC，風險低；但 `TokensAdmin.tsx` 有 SELECT，需保留 owner 讀取 |
| **R3** | **統一 SRS（C3）會涉及資料合併** | `user_word_progress` 與 `pack_item_progress` 對同一個 pack item 可能有兩筆不同的進度 | **Phase 1 不做**。先並存 + 雙寫，等 analytics 上線後再決定 canonical source |
| **R4** | **`user_word_progress.word_id` 無外鍵，孤兒資料** | 合併時難以判斷哪些 word_id 已失效 | 先寫一個 read-only 的資料健檢查詢（不修改資料） |
| **R5** | **接通模考真實流程會讓 `exam_attempts` 首次有資料** | 該表的 RLS 未知（無 DDL） | 接通前必須先確認／補上 RLS，否則學生可能讀到別人的作答 |
| **R6** | **加入 `auth.users` trigger 需 elevated 權限** | Supabase 上 `auth` schema 的 trigger 需要特定權限 | 用 Supabase Dashboard 或 service_role 執行；先在 staging 驗證 |
| **R7** | **RLS 遞迴 / 效能** | teacher → class_teachers → class_members → student data 是三層 join，若寫成 policy 內的 subquery，大班級會慢 | 用 `SECURITY DEFINER` helper function + 適當索引；上線前做 `EXPLAIN ANALYZE` |
| **R8** | **無測試、無 staging** | 任何 schema 變更都是直接對 production | **Phase 1 應建立一個 staging Supabase project**，這比任何功能都優先 |
| **R9** | **`localStorage` 既有資料** | `vocabulary-storage` / `exam-storage` 中有使用者的既有進度 | 任何 store 結構變更都要保留舊 key 的相容讀取（zustand `persist` 的 `migrate` 選項） |
| **R10** | **家長帳號涉及未成年人個資** | Parent ↔ Student 綁定若無驗證機制，可能造成未授權存取未成年人資料 | 綁定必須有 `pending → verified` 流程（學生或教師確認），不可單靠家長輸入學生 email |

---

## 11. Recommended Implementation Phases（建議實作階段）

### Phase 0 — Discovery & Stabilization（1～2 週）｜**不加任何功能**

| # | 工作 | 產出 |
|---|------|------|
| 0.1 | **完整線上 schema dump**（§10.1 的 M0） | `docs/SCHEMA_BASELINE.sql` |
| 0.2 | **稽核 writing application 的 schema** | `docs/WRITING_APP_SCHEMA.md` — 明確列出可 reuse 的表與缺口 |
| 0.3 | **建立 staging Supabase project** | 可安全測試 migration 的環境 |
| 0.4 | **修補 §6.1 的 S1 / S2 / S3 / S5** | 4 個安全修補（見 §9.1 F1–F4） |
| 0.5 | **確認並收斂 `claim_pack_with_token`**（C1/C2） | 單一權威版本 |
| 0.6 | **導入 Supabase CLI migration 管理** | `supabase/config.toml` + timestamp migration |
| 0.7 | 補上缺失的 20 張表 DDL（從線上反向產生） | repository 與 production 一致 |

> **Phase 0 是不可跳過的。** 沒有 0.1 與 0.2，後續所有 schema 決策都是猜測。

### Phase 1 — Identity & Roles（2～3 週）

| # | 工作 |
|---|------|
| 1.1 | `auth.users` → `user_profiles` 自動建檔 trigger + backfill（F7/F8） |
| 1.2 | 建立 `user_roles` 表 + `has_role()` helper |
| 1.3 | 把 `is_admin()` 內部改查 `user_roles`（**保留簽名**），`app_admins` 資料遷入 `user_roles`，移除 hardcoded email（C5） |
| 1.4 | 前端 `useAdmin` 改用統一來源；新增 `RequireRole` 元件 |
| 1.5 | 修 `/auth/reset-password` 路由（T9）、為 `/dashboard/result-summary` 加 gate（S8） |
| 1.6 | 啟用 `react-query` 於新程式碼；移除死依賴（`@tiptap/*`, `recharts`, `RichTextEditor.tsx`, 重複的 `use-toast.ts`） |

### Phase 2 — Class & Relationships（3～4 週）

| # | 工作 |
|---|------|
| 2.1 | `classes` / `class_teachers` / `class_members` / `class_invite_tokens` 表 + RLS |
| 2.2 | `guardian_links` 表 + 驗證流程（pending → verified） |
| 2.3 | `can_access_student()` / `teacher_class_ids()` helper + 效能驗證 |
| 2.4 | 教師端：建班、發邀請碼、名冊管理（**重用 `TokensAdmin` 與 `BatchUploadDialog` 的既有模式**） |
| 2.5 | 家長端：綁定子女流程 |

### Phase 3 — 接通真實學習資料（3～4 週）｜**平台價值的關鍵**

| # | 工作 |
|---|------|
| 3.1 | **把學生端模考接到真實 Supabase**（§4.2）：寫 `useExam.ts` ↔ `types/exam.ts` 的 adapter，讓 `ExamNew`/`ExamResult` 讀真實 `exams`，作答寫入 `exam_attempts`/`exam_user_answers`（修 C8 的 onConflict bug）。**`MOCK_EXAM_PAPER` 保留為 fallback，確保向後相容** |
| 3.2 | 建立 `learning_activities` 統一事實表；vocabulary / quiz / exam 完成時雙寫 |
| 3.3 | 把 `Dashboard.tsx` 的 mock 換成真實聚合查詢 |
| 3.4 | Quiz 結果落庫（目前只更新 mastery，不記錄測驗本身） |

### Phase 4 — Assignments（3～4 週）

`assignments` / `assignment_submissions` + 教師派題 UI + 學生作業列表 + 完成度追蹤 + 到期提醒（**重用既有 push 基礎建設**）。

### Phase 5 — Writing 整合（2～3 週）｜**依賴 Phase 0.2 的結論**

把 `Essay.tsx` 從 mock 接到 **writing application 既有的 schema**；接真實 AI 批改；加入教師批改（optional teacher feedback）。**新增欄位一律 nullable、additive。**

### Phase 6 — Dashboards（3～4 週）

Student / Teacher / Parent 三種 dashboard，全部建構在 `learning_activities` + 聚合 view 之上。

### Phase 7 — 新活動類型（未定）

Listening / Speaking activity（全新建置，無既有資產可重用；Speaking 需評估錄音儲存成本與未成年人語音資料的合規要求）。

---

## 12. Phase 1 Implementation Proposal（下一步的實作提案）

> **⚠️ 本節僅為提案。本次稽核未修改任何程式碼、未建立任何 migration、未變更任何 Supabase 設定。**

### 12.1 為什麼 Phase 1 是「Identity & Roles」而不是先做 Teacher UI

1. **所有後續功能都依賴角色。** Class、Assignment、Dashboard 的 RLS 都要問「這個人是什麼角色」。先蓋房子再挖地基會導致全面返工。
2. **現有的三套 admin 判斷（§3.4）已經是 bug 來源。** 在其上疊加 teacher/parent 只會讓問題指數成長。
3. **`user_profiles` 的懶建立（§3.3）會讓角色掛載失敗。** 必須先保證「每個 auth 使用者都有 profile」。
4. **修安全漏洞不能等。** S1（自我授予 premium）與 S2（無鑑權 TTS）是正在生效的漏洞。

### 12.2 Phase 1 範圍（明確的 in / out）

**In scope：**
- ✅ Phase 0 的全部 discovery 與安全修補
- ✅ `user_profiles` 自動建檔 trigger + backfill
- ✅ `user_roles` 表 + `has_role()` helper
- ✅ `is_admin()` 內部改實作（**簽名不變**）
- ✅ 前端 `useAdmin` 統一 + `RequireRole` 元件
- ✅ 死碼／死依賴清理
- ✅ 兩個既有 bug 修補（reset-password 路由、result-summary gate）

**Out of scope（明確不做）：**
- ❌ 不建 `classes` / `guardian_links`（Phase 2）
- ❌ 不動模考／作文／dashboard 的 mock（Phase 3/5/6）
- ❌ 不合併兩套 SRS（C3，風險太高，暫時並存）
- ❌ 不重構 `useExam.ts`（Phase 3 一併處理）
- ❌ **不建立任何 writing 相關的表**（等 Phase 0.2）

### 12.3 Phase 1 具體工作項

#### A. Discovery（**阻斷性，必須最先完成**）

| # | 工作 | 驗收 |
|---|------|------|
| A1 | 執行 §10.1 的 5 段 SQL，輸出 `docs/SCHEMA_BASELINE.sql` | 檔案存在且涵蓋 public schema 全部物件 |
| A2 | 比對 baseline 與本報告 §2，記錄所有差異 | `docs/SCHEMA_DIFF.md` |
| A3 | **列出 writing application 的所有表／function**，判定哪些可 reuse | `docs/WRITING_APP_SCHEMA.md` |
| A4 | 確認 `claim_pack_with_token` 線上實際版本 | 明確記錄在 A2 |
| A5 | 確認 `site_settings` 與 `exam_attempts` 的 RLS | 明確記錄在 A2 |
| A6 | 建立 staging project 並還原 baseline | staging 可用 |

#### B. 安全修補（可與 A 並行準備，但需在 staging 驗證後才上 production）

| # | 變更 | 檔案（提案） | 破壞性 |
|---|------|--------------|--------|
| B1 | `admin_grant_premium` / `admin_revoke_premium` 加 `is_admin()` 檢查 | 新 migration | 無 |
| B2 | `api/generate-pack-audio.ts` + Edge Function 加 admin JWT 驗證 | 程式碼 | 匿名呼叫會被擋（預期） |
| B3 | `invite_tokens` SELECT policy 收斂為 owner-only | 新 migration | 需 A2 確認無其他呼叫端 |
| B4 | `site_settings` UPDATE policy 收斂為 admin-only | 新 migration | 依 A5 結果 |
| B5 | `claim_pack_with_token` 合併為單一 2-arg 版（site + premium 邏輯都在），並確認是否可 drop 1-arg | 新 migration | 需 A3/A4 確認 writing app 未使用 |
| B6 | `/dashboard/result-summary` 加 `ProtectedRoute` + `PhaseGate(2)` | `src/App.tsx` | 無 |

#### C. Identity 基礎建設

| # | 變更 | 說明 |
|---|------|------|
| C1 | `handle_new_user()` trigger function + `on auth.users AFTER INSERT` | 自動建立 `user_profiles`（product 由 `raw_user_meta_data` 或 default `'gsat'`） |
| C2 | Backfill：`INSERT INTO user_profiles (user_id, product) SELECT id, 'gsat' FROM auth.users … ON CONFLICT DO NOTHING` | 冪等 |
| C3 | `user_roles` 表 + RLS（使用者可讀自己的 role，只有 admin 可寫） | 新表 |
| C4 | `has_role(p_role text)` SECURITY DEFINER helper | 新 function |
| C5 | 把 `app_admins` 的 user_id 遷入 `user_roles(role='admin')`；`nonstopjazz@gmail.com` 也一併寫入 | **保留 `app_admins` 表不刪**（backward compatible） |
| C6 | `CREATE OR REPLACE FUNCTION is_admin()` → 內部改查 `user_roles`，**簽名與回傳型別完全不變** | 8 個既有呼叫端（含 RLS）自動受惠，零改動 |
| C7 | `level_words` 的 3 條 hardcoded-email RLS 改為 `is_admin()` | 消除第三套權限來源 |

> **關鍵設計**：C6 讓 `is_admin()` 成為唯一權威。因為簽名不變，`admin_get_all_users`、`admin_get_user_stats`、`premium_memberships` 的 admin policy、以及未來的 B1 修補，全部自動使用新的 role 來源。**這是 reuse over replacement 的具體實踐。**

#### D. 前端

| # | 變更 | 說明 |
|---|------|------|
| D1 | `useAdmin` 改為呼叫 `rpc('is_admin')`（取代直接查 `app_admins`） | 與後端同源；保留既有的 5 分鐘 module-level cache |
| D2 | 新增 `useRoles()` hook（回傳 `{ roles, isAdmin, isTeacher, isParent, isStudent }`） | 為 Phase 2 鋪路 |
| D3 | 新增 `RequireRole` 元件（**直接複製 `RequireAdmin` 的結構**） | 保留 `RequireAdmin` 不刪，改為 `<RequireRole role="admin">` 的 wrapper |
| D4 | 修 `/auth/reset-password` 路由 | 新增頁面 + 路由 |
| D5 | 死碼清理：刪 `src/hooks/galaxy/use-toast.ts`（與 `src/hooks/use-toast.ts` 完全相同）、`src/components/editor/RichTextEditor.tsx`；移除 `@tiptap/*` × 8、`recharts` | 需確認 `ui/chart.tsx` 是否保留 |
| D6 | 啟用 `react-query`：D1/D2 的新 hook 用 `useQuery` 實作，作為後續遷移的範本 | 不動既有 hook |

#### E. 驗收條件（Definition of Done）

1. `docs/SCHEMA_BASELINE.sql`、`docs/SCHEMA_DIFF.md`、`docs/WRITING_APP_SCHEMA.md` 三份文件存在且經過 review
2. 以非 admin 帳號呼叫 `admin_grant_premium` 回傳 `UNAUTHORIZED`
3. 匿名 POST `/api/generate-pack-audio` 回傳 401
4. 匿名 `SELECT * FROM invite_tokens` 回傳 0 筆
5. 新註冊使用者在 `auth.users` 建立後，`user_profiles` 立即有對應資料
6. 把某測試帳號加入 `user_roles(role='admin')` 後，該帳號同時通過前端 gate **與** `is_admin()` SQL function
7. **既有的單字練習、單字包領取、Blog、後台全部功能無迴歸**（手動 smoke test 清單）
8. `npm run build` 成功、`npm run lint` 無新增錯誤
9. Bundle size 有量測基準（為 Phase 3 的 code splitting 建立對照）

### 12.4 Phase 1 不做但需要追蹤的事項

以下項目已記錄但刻意延後，避免 Phase 1 範圍膨脹：

| 項目 | 延後到 | 理由 |
|------|--------|------|
| 兩套 SRS 合併（C3） | Phase 3 之後 | 涉及資料合併，風險高，且不阻擋角色系統 |
| `mastery level` 三種門檻統一（C6） | Phase 3 | 屬於 analytics 語意，與 dashboard 一起處理 |
| Streak 前後端統一（C7） | Phase 3 | 同上 |
| 3.7 MB 靜態單字移出 bundle（T2） | Phase 3 | 需驗證 `VOCABULARY_LEVELS` 的所有使用點 |
| Code splitting（T3） | Phase 3 | 與 T2 一起做效益最大 |
| `useExam.ts` 拆分（T12） | Phase 3 | 與「接通真實模考」一起重構 |
| `xlsx` 套件升級／替換（T7） | Phase 2 | 與批次匯入名冊功能一起評估 |
| 測試框架導入（T10） | Phase 2 | Phase 1 以手動 smoke test 為主 |
| `useAvatar` 搬到 DB（T8） | Phase 2 | 與 profile 擴充一起做 |

---

## 附錄 A：關鍵檔案索引

| 主題 | 檔案 |
|------|------|
| 路由總覽 | `src/App.tsx` |
| Supabase client | `src/lib/supabase.ts` |
| 認證 | `src/contexts/AuthContext.tsx`, `src/components/auth/*` |
| 權限 | `src/hooks/useAdmin.ts`, `supabase/migrations/create_user_profiles_table.sql`（`is_admin()`） |
| Phase gate | `src/contexts/PhaseContext.tsx`, `src/components/gates/*`, `src/config/features.ts` |
| 單字 SRS（前端） | `src/store/vocabularyStore.ts`, `src/lib/wordProgressSync.ts`, `src/lib/levelWords.ts` |
| 單字包 | `src/hooks/useUserPacks.ts`, `src/hooks/usePackItemProgress.ts` |
| 模考（後台，真實） | `src/hooks/useExam.ts` |
| 模考（學生端，Mock） | `src/store/examStore.ts`, `src/data/mock-exam.ts`, `src/types/exam.ts` |
| 作文（Mock） | `src/pages/Essay.tsx`, `src/data/mock-essay.ts` |
| 儀表板（Mock） | `src/pages/Dashboard.tsx`, `src/data/mock-analytics.ts` |
| Blog | `src/hooks/useBlog.ts` |
| Serverless | `api/send-daily-reminders.ts`, `api/generate-pack-audio.ts` |
| Edge Function | `supabase/functions/generate-pack-audio/index.ts` |
| Schema | `supabase/schema.sql`, `supabase/migrations/*.sql` |

## 附錄 B：環境變數清單（從程式碼反推，`.env.example` 未涵蓋全部）

| 變數 | 使用位置 | 必要性 |
|------|----------|--------|
| `VITE_SUPABASE_URL` | `src/lib/supabase.ts` | ✅ 必要（已在 `.env.example`） |
| `VITE_SUPABASE_ANON_KEY` | 同上 | ✅ 必要（已在 `.env.example`） |
| `VITE_SITE_ID` | `useSiteIdentifier.ts` | 選用（本機開發） |
| `VITE_APP_PRODUCT` | `src/config/product.ts` | 選用（default `GSAT`） |
| `VITE_VAPID_PUBLIC_KEY` | `usePushSubscription.ts` | Push 功能必要 |
| `SUPABASE_SERVICE_ROLE_KEY` | 兩個 Vercel API + Edge Function | Server 端必要 |
| `SUPABASE_URL` | Vercel API fallback | Server 端 |
| `VAPID_PUBLIC_KEY` / `VAPID_PRIVATE_KEY` / `VAPID_EMAIL` | `api/send-daily-reminders.ts` | Push 必要 |
| `CRON_SECRET` | 同上 | 建議設定（未設定時完全不驗證！） |
| `GOOGLE_TTS_API_KEY` | 兩個 TTS 端點 | TTS 必要 |

> ⚠️ `api/send-daily-reminders.ts` 的 cron 驗證是 `if (cronSecret && ...)` — **若 `CRON_SECRET` 未設定，端點完全開放**，任何人都能觸發全站推播。建議一併在 Phase 1 修補。
