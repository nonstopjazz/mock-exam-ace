# Security & Architecture Backlog

> **Mainline switched back to GSAT product development on 2026-08-26.**
>
> The security audit is **closed as an activity**, not because everything is fixed but because the
> items that could be fixed without touching another live application have been. What remains is
> recorded here and waits for a deliberate decision — it does not queue itself into the next
> conversation.

---

## 🛑 The interrupt rule

**A new finding may interrupt product development ONLY if it meets one of these three:**

1. It **directly causes a Production data leak**.
2. It **allows an unauthorised admin operation**.
3. It **causes an immediate Production failure**.

**Everything else is recorded here and left alone.** Do not widen scope. Do not start an
investigation because something looks adjacent to a known issue. Notice it, write it down, carry on.

> The bar is deliberately high. Two CRITICAL findings (§9.1, §9.2) are knowingly left open below and
> **do not** meet it, because acting on them without the owning application's maintainer would break
> a live system. "Severe" and "interrupt-worthy" are different questions.

---

## Open items

Source of truth for the findings: `docs/PRODUCTION_SCHEMA_AUDIT.md` §9.

### 🔴 Phase 0.5B-B — blocked on the shared LMS/Writing application

Both need the owning application's maintainer before anything is changed. Acting alone breaks a live
system.

| # | Item | Why it is blocked |
|---|---|---|
| **9.1** | **11 `public` tables with RLS DISABLED, full `anon` CRUD grants, zero policies** — `users`, `assignments`, `assignment_submissions`, `student_tasks`, `courses`, `course_lessons`, `user_course_access`, `learning_progress_stats`, `vocabulary_sessions`, `exam_records`, `exam_types`. `public.users.is_admin` is **world-writable** | Enabling RLS with no policies flips them to deny-all and breaks the owning app. 🛑 A blanket `REVOKE ALL … FROM anon` was **withdrawn** — those anonymous flows have never been analysed |
| **9.2** | **All 8 storage buckets are `public = true`**, including `essays` and `Essays` (student work). `essays_select_policy` grants LIST to `{public}`; insert/update/delete policies have **no owner predicate**, so any authenticated user can overwrite or delete any student's essay file | Flipping `public` to false breaks any hard-coded public URL the writing app relies on. Must first establish how teachers and the AI currently read essays |
| **9.4** | `invite_tokens` and `tokens` readable by `anon` — `"Anyone can validate tokens" USING (is_active = true)`. Every active invite code is enumerable | Possible cross-application caller |
| **9.5** | `claim_pack_with_token(text,text)` accepts `p_site` and **never references it**, so a pack claimed on TOEIC/Kids silently lands as `'gsat'`. Both 1-arg and 2-arg overloads exist | Possible cross-application caller. Also needs a decision on back-fixing rows already mis-tagged |
| **9.8** | `notifications` policy named "Service role can insert" actually applies to `{public}` with `WITH CHECK (true)` | LMS-owned |
| — | **Shared LMS/Writing security model** — the per-table policy design these all depend on | 💬 Conversation with the maintainer |
| — | **Storage bucket cleanup** — the private/public model for all 8 buckets | Same |

### 🟠 Identity

| Item | State |
|---|---|
| **9.6** Five parallel admin authorization mechanisms | Deferred to **Phase 1**. `is_admin()` hard-codes one email; `app_admins`; inline `auth.jwt()->>'email'`; `raw_user_meta_data->>'role'` (**inert — 0 users hold it**); `public.users.is_admin` (RLS off, unenforced) |
| **Identity migration / consolidation** | Still blocked on the identity-root question: do the LMS `student_id` columns reference `auth.users.id` or `public.users.id`? 🛑 **Do not create `user_roles` or any global role table.** ✅ **No longer blocks `/learn`** — `docs/IDENTITY_ARCHITECTURE_CHECKPOINT.md` (2026-08-27) decouples the two by anchoring all new work on `auth.users.id`. The LMS root stays unanswered until the two applications must actually share data |

### 🟡 A2 — remaining `SECURITY DEFINER` hardening

**9.7**: A1 pinned `search_path` on `admin_grant_premium` and `admin_revoke_premium`. **Four remain:**

- `claim_pack_with_token(text,text)` — ⚠️ `%ROWTYPE` resolves at compile time, so under `search_path = ''` it needs `public.invite_tokens%rowtype`, `public.packs%rowtype`, `public.user_pack_claims%rowtype`, and `public.is_premium_member(...)` qualified
- `get_all_word_progress`
- `is_premium_member`
- `upsert_word_progress(8-arg)`

🛑 **Inventory each individually. Do not bulk-edit.** Extension objects, temp tables and deliberate late binding each change the right answer.

Also in A2: **9.9** `upsert_word_progress` 6-arg overload is broken — its `ON CONFLICT (user_id, word_id)` targets a dropped constraint. Latent: the live path uses the 8-arg version.

### 🟢 §9.13 — the three sub-items A1-5 did not close

§9.13 is a **bundle of six**. A1-5 closed three (token RNG, dev panel, `.gitignore`).

| Sub-item | Severity | Note |
|---|---|---|
| `/dashboard/result-summary` ungated | 🟡 **MEDIUM** | Sits in the **reserved `/exam` domain** — needs explicit owner approval to touch |
| 9 legacy admin routes gated only by `!IS_PRODUCTION` | 🟢 LOW | Same reserved-domain consideration |
| Unauthenticated blog analytics inserts | 🟢 LOW | ⚠️ **Never in A1 scope and not on any other deferred list.** This one has no home yet |

### 🟡 Product / analytics, not security

| Item | Note |
|---|---|
| **9.10** Divergent SRS semantics | Level words: client-computed, mastery cap 6, `next_review_time BIGINT`. Pack items: server-computed, cap 5, mastered ≥ 4, `next_review_at TIMESTAMPTZ`. Both track pack items. Phase 3 — analytics will force the question. 📎 Full mechanism in `docs/learn/VOCABULARY_ARCHITECTURE.md` §2.5 |
| 🆕 **Vocabulary duplicates progress per pack** | `pack_items.word` is free text with no canonical link, and every progress key contains `pack_id`, so one word in three packs is three progress records and three cards in one review session. ✅ **Vocabulary v1 architecture frozen 2026-08-29 and the design phase is TEMPORARILY CLOSED** — `docs/learn/VOCABULARY_ARCHITECTURE.md` §1.2. 🛑 **Off the active design mainline**; no migration proposed or approved |
| 🆕 🔍 **BEFORE VOCABULARY MIGRATION** — a checkpoint, not a task queue | Everything vocabulary still needs is parked here and 🛑 **none of it interrupts taxonomy design**: (a) the pack progress read/write key mismatch — loaded under `pack:<pack_id>:<word_id>` (`wordProgressSync.ts:23`), written under the bare item id (every practice screen), **static inspection only, no runtime verification** — 🛑 do not fix speculatively, 🛑 **do not open a Production debugging exercise**; (b) the distinct-word overlap measurement (Stage 0) — 🛑 **owner-deprioritised, not now**; (c) mastery algorithm; (d) legacy progress merge policy incl. stage 5 ↔ 6 and schedule conversion; (e) `practice_type` → mastery evidence mapping; (f) anonymous / localStorage progress. 🛑 **Legacy Level 1–6 progress stays untouched.** Does not meet the interrupt rule |
| Cron targeting | Targets purely on `user_stats.last_study_date != today` and never consults `user_word_progress`, so a fully caught-up student still gets a 「回來複習」 nudge. Owner-confirmed as a later product improvement |
| `assignments` / `assignment_submissions` / `student_tasks` redesign | 0.5B-B / Phase 4. 🛑 These exist with live data — **do not design a replacement** |

---

## Closed — do not reopen

| Finding | Closed by | Date |
|---|---|---|
| **9.3** premium functions: no authorization, `EXECUTE` to PUBLIC + `anon` | A1-1 / A1-2 | 2026-08-26 |
| **9.11** TTS endpoint: `service_role`, no authentication | A1-3a | 2026-08-26 |
| **9.12** cron endpoint open when `CRON_SECRET` unset | A1-4 | 2026-08-26 |
| **9.15** premium revocation silently fails | A1-6 (code) + Phase C (data) | 2026-08-26 / 2026-08-27 |
| §9.13 token RNG · dev panel · `.gitignore` | A1-5a / 5c / 5b | 2026-08-26 |
| Pre-existing large-pack TTS timeout | A1-3b | 2026-08-26 |

Full record: `docs/PHASE_0_5B_A1_PLAN.md` §12 · `docs/phase-0.5b/STAGING_RESULTS.md`

---

## Standing rules for all new `/learn` work

These are not backlog items. They are constraints on everything built from here.

| Rule | |
|---|---|
| **New tables** | **RLS ON by default**, with policies written at the same time. Never a table with RLS enabled and no policies, and never one with RLS off |
| **New storage buckets** | **Private by default.** Serve through signed URLs, never `getPublicUrl` on private data |
| **Identity** | 🛑 **Do not introduce another users/identity table.** There are already too many |
| **`SECURITY DEFINER`** | Avoid unless genuinely required. If used: pin `search_path`, and `REVOKE` down to the minimum `EXECUTE` |
| **Shared LMS/Writing tables and public buckets** | 🛑 **Do not depend on them** without explicit owner approval — they carry the open 9.1 / 9.2 problems |
| **Helper functions in `public`** | 🆕 PostgreSQL grants `EXECUTE` to `PUBLIC` on every new function and Supabase does not revoke it. A one-off helper must be **dropped when done**, or created with an explicit `REVOKE`. Two verification helpers were left callable by `anon` during the Production run and dropped at P6 — same shape as 9.3 |
| **`user_profiles` is optional** | 22 Production accounts, **5 profile rows**. Never `INNER JOIN` through it in a way that drops a class member from a roster |

**The identity model for all `/learn` work is decided:** `docs/IDENTITY_ARCHITECTURE_CHECKPOINT.md`.

**The `/learn` product & competency model is specified:** `docs/learn/LEARNING_DOMAIN_MODEL.md`
(2026-08-29, revised the same day after an owner ruling on eight open items). 🛑 Its §15 carries
**five** BLOCKED decisions and marks every taxonomy except Grammar, Reading, Listening and Speaking
as PROVISIONAL. ⚠️ The old **Speaking / Writing ↔ Grammar** blocker is now the **Cross-domain
Production Evidence Policy** (renamed 2026-08-30): *may specific evidence extracted from speech or
writing update Grammar or Vocabulary mastery, and if so when, with what confidence and weight?*
🛑 **It is not a taxonomy blocker and must never be used to hold the Speaking or Writing taxonomy in
PROVISIONAL.** Standing rule meanwhile: a rubric score resolvable to no specific Skill updates no
Skill.

🆕 **UNMEASURED ≠ WEAK** — a Skill a task never elicited is **not measured**, never weak / zero /
low. A 50-word birthday card says nothing about *Complex Structure Control*; an absent High-Score
Feature says nothing about ability.
✅ **None of them blocks the next design stage** — each gates a specific later capability. **Do not complete a
taxonomy, seed skill data, or build an entity whose governing decision is still blocked.**

Standing rules that now bind all `/learn` work:

| Rule | |
|---|---|
| **Naming** | `word_level` (`MOE_1`…`MOE_6`, `BEYOND`) · `difficulty` · `cefr_level` · `grade`. 🛑 **Never a bare `level`** |
| **Evidence** | Derives from **question / assessable-item** tags. 🛑 An Activity's skill tag never converts its responses into evidence wholesale |
| **Rubrics** | 🛑 A Speaking/Writing rubric grammar score is **not** Grammar Domain mastery. Only evidence resolvable to a specific Skill updates that Skill |
| **Asset versions** | 🛑 A content version that has produced evidence is **immutable**; changes fork a new version and responses point at the exact version answered |
| **Access** | 🛑 A teaching relationship grants **no** Program access. Enrollment is the only source |
| **Primary Skill** | 🆕 **Exactly one** per scorable item — 🛑 never multiple. The Primary is what most directly determines a correct answer |
| **Secondary Skill** | 🆕 🛑 Produces **no equal-weight evidence** while the mastery algorithm is unfrozen. Treat as tagging / analysis metadata |
| **Skill codes** | 🆕 🛑 **Opaque identifiers — never parse a code to derive its Category.** `GRAM_G7_…` embedding `G7` is a mnemonic, not relational data. Use the declared taxonomy relationship |
| **Vocabulary v1** | 🆕 **Item-centric, architecture frozen 2026-08-29** (`VOCABULARY_ARCHITECTURE.md` §1.2). Canonical identity is a **headword** (no sense ontology); `level_words` is the evolution starting point, 🛑 **never a parallel canonical system**; one Collection concept for all set types; mastery is `learner × canonical_word` with `Recognition` / `Production` only; SRS gives **one due date per word** regardless of collections; 🛑 Practice Type is event metadata, never a mastery axis; 🛑 normalization is trim / case / Unicode only — **no silent morphological merge** |

🔜 **Six of seven domains are closed.** Grammar ✅ · Reading ✅ · Vocabulary ✅ (architecture
temporarily closed) · Listening ✅ · Speaking ✅ · Writing ✅ · **Exam / Academic Skills 🛑 BLOCKED on
the owner — the only domain left.** The mainline therefore moves to **Learning Objective spec** →
Evidence / Mastery Model → Competency DB schema. Then Learning Objective spec → Evidence / Mastery model → Competency DB
schema. 🛑 **Vocabulary migration work does not interrupt this line.**

**Writing taxonomy source of truth:** `docs/learn/writing-taxonomy/Writing_Taxonomy_v1.xlsx`

**Writing 分析品質加固（v2，已設計未實作）：**
`docs/learn/writing-v2-quality-hardening.md` —— Error Finding Critic 與跨軸調和兩層後處理。
2026-09-05 產品決策：v1 不做，因為要多付 14–26 秒 AI 處理時間，而老師會在給學生看之前
親自審閱。v1 明確接受偶發的 Error code 誤標、correction 措辭不佳、以及不影響整體有效性的
跨軸張力。

⚠️ 重新評估的觸發條件：**報告變成未經老師審閱就直接呈現給學生**。
那三項「可接受的瑕疵」是建立在人工複核之上的，複核一旦消失，前提就不成立。
— **three separate axes, all DECIDED v1** (frozen 2026-08-30): Competency (5 Categories + **23
Skills**), Error (**16 Tags**), High-Score Feature (5 Categories + **29 Features**) · 20 tagging
rules. 🛑 **Only the Competency axis is a competency taxonomy** — an Error Tag is not a Skill and a
Feature is not a Skill. 🛑 No Competency Micro-skill. 🆕 **High-Score Sub-skill layer is ACTIVE
INTERNAL v1** (2026-08-30, superseding the earlier "detection criteria only" ruling): **146
Sub-skills** (H1 27 · H2 20 · H3 31 · H4 32 · H5 36), `visibility = OWNER_ONLY`,
`detection_enabled = true`, 🛑 `mastery_enabled = false`. ✅ All 12 ambiguous splits resolved by the
owner; **no `NEEDS_OWNER_REVIEW` remains**.
🛑 **No `student × Sub-skill` mastery**; 🛑 it does **not** make Writing Competency four levels;
🛑 visibility ≠ existence — opening them later flips a flag, never rebuilds identity. 🛑 A feature finding is never `present = true` — it needs `feature_code` +
`quality` (`EFFECTIVE` / `PARTIALLY_EFFECTIVE` / `MISUSED`) + `evidence_span` + `reason`, and **only
`EFFECTIVE` is positive evidence**. 🛑 A Feature is **not** a mastery axis.
🛑 `WRITE_ERR_GRAMMAR_OTHER` is fallback only. 🛑 **W4 ≠ Grammar Domain · Writing Lexical ≠
Vocabulary learner-word mastery.**

**Speaking taxonomy source of truth:** `docs/learn/speaking-taxonomy/Speaking_Taxonomy_v1.xlsx`
— **4 Categories (S1–S4) + 19 Skills, both DECIDED v1** (frozen 2026-08-29) · 12 tagging rules.
🛑 No Micro-skill; 🛑 **Overall Intelligibility is a derived metric, not a 20th Skill**. The
assessable unit is the **rubric evidence, not the recording**. 🛑 Task Type and task metadata are
never Skills. 🛑 **Accent is not a target** · 🛑 fluency ≠ speed · 🛑 lexical range ≠ hard words.
⚠️ Interaction evidence is conditional — *no evidence* means **not measured**, never *weak*.
🛑 **Speaking S3 ≠ Grammar Domain**: a 70% speaking grammar score writes nothing to
`Grammar → Tenses`.

**Listening taxonomy source of truth:** `docs/learn/listening-taxonomy/Listening_Taxonomy_v1.xlsx`
— **4 Categories (L1–L4) + 18 Skills, both DECIDED v1** (frozen 2026-08-29) · 11 tagging rules.
🛑 No Micro-skill. 🛑 **Accent, speech speed, audio length, speaker count and noise level are
stimulus / difficulty metadata — never Skills.** Stated in the audio → L2; must be inferred → L3.

**Lesson composition & content production (2026-08-31, documentation only):**
`docs/learn/teaching-blocks/Teaching_Block_Types_v1.md` — 18 Teaching Block Types. 🛑 A Block is
**not** a Skill, **not** a Domain, and **not** a tier inside `Program→Module→Lesson→Activity`;
🛑 its storage is **deliberately undecided**, and 🛑 **Progressive Complexity** applies — no
dozen-field Block, no mandatory teacher metadata.
`docs/learn/content-factory/Digital_Content_Types_v1.md` — 9 core Content Types. 🛑 **Creation and
delivery are separate**; 🛑 an asset is **referenced, never copied per Lesson**; 🛑 bulk generation
is first-class; 🛑 Content Type ≠ Question Type; ⚠️ a *Review / SRS Set* is **content, not a second
SRS scheduler**.

**Reading taxonomy source of truth:** `docs/learn/reading-taxonomy/Reading_Taxonomy_v1.xlsx`
— **6 Categories + 25 Skills, both DECIDED v1** (frozen 2026-08-29) · 10 tagging rules. 🛑 Reading v1
has **no Micro-skill** — do not create any. **Question Type ≠ Skill**: Best Title / EXCEPT /
According to the passage are `question_type` values, not competencies. The 50–100 question pilot is
**optional future validation, never a gate**; revisions go through **versioning (v1.1 / v2)**, never
by editing v1. The workbook's 11 tagging rules (TR-01 … TR-11) and `LEARNING_DOMAIN_MODEL.md` §9
**agree in full** — TR-01 states exactly one Primary Skill, TR-02 the Secondary rule, TR-11 the
opaque-code rule.

**Grammar taxonomy source of truth:** `docs/learn/grammar-taxonomy/Grammar_Skill_Taxonomy_v1.xlsx`
— 10 Categories · **51 Skills with stable codes** (`GRAM_G7_REL_PRON` …) · **234 Micro-skill
candidates** covering all 51 Skills, plus source-material provenance and the binding tagging rules
OD-01…OD-05. The Markdown records structure and principles only; the spreadsheet wins on detail.
🟡 Micro-skills are **PROVISIONAL / CANDIDATE** — usable for tagging, 🛑 not DECIDED, and do not
invent additions.

⚠️ **Known spec ↔ schema gap (§14.1) — now a DECIDED requirement, not an open question.** The owner
ruled on 2026-08-29 that the direct teacher–student relationship is **first-class and independent of
Class**, but the deployed Identity Spine can only express membership through `learn.classes`. A
direct student with no class is invisible to their teacher under the D2 `user_profiles` policy.

**Resolution shape:** a `teacher_student_relationships` table plus a second additive `user_profiles`
SELECT policy scoped to a confirmed direct relationship — the existing guardian policy is the exact
precedent. 🛑 Needs its own owner approval and the same staged staging→Production process the spine
used. Blocks Student Home and any one-to-one flow until then.

✅ **Both owner decisions are DECIDED (2026-08-27):**

| | Decision | Outcome |
|---|---|---|
| **D1** | Namespace | A dedicated **`learn` schema**. `anon` gets no access to it; `authenticated` gets `USAGE` + `SELECT/INSERT/UPDATE` and **no `DELETE`**; schema privilege is a second layer, never a substitute for RLS |
| **D2** | Profile visibility | Additive `SELECT` policies on `user_profiles`, **narrowed**: class owner and confirmed guardian only. 🛑 A student gets nothing from merely sharing a class |

✅ **The identity spine is DEPLOYED to Production (2026-08-28) and the checkpoint is CLOSED.**
`learn` schema · `learn.classes` / `class_members` / `guardian_links` · 10 policies · two additive
`user_profiles` policies. Staging 26/26 + 25/25 + 6/6 with a rehearsed rollback; Production 26/26
with a per-user census showing no visibility change across all 22 accounts.

🛑 **`learn` is NOT in Production's Exposed schemas** — deliberate. `learn.*` cannot be reached from
the browser until that step is taken, and taking it makes the rollback file's Exposed-schemas
pre-step mandatory (an exposed-but-missing schema 503s the **entire** Data API — measured on
staging).

Records: `docs/learn/IDENTITY_SPINE_STAGING_RESULTS.md` · `docs/learn/IDENTITY_SPINE_PRODUCTION_PLAN.md`
