# Content Factory & Digital Content Types v1

> **Written:** 2026-08-31 · **Status:** ✅ **DECIDED v1 — 9 core Content Types + the relationship
> principles**
>
> 🟡 **DOCUMENTATION ONLY.** No table, no schema, no migration, no RLS, no API, no component, no
> workflow, no Content Library implementation.

---

## 1. The decision that shapes everything else

> 🛑 **Content creation and content delivery are separate concerns.**

The working assumption used to be *"a Lesson is created, then homework is generated for it."*
**That is not the primary mode.** The primary mode is:

```
Specification / Prompt
        ↓
Workflow bulk generation          ← 100, 500, or many items at once
        ↓
Digital Content Library
        ↓
referenced by  ·  Lesson  ·  Homework  ·  Assignment  ·  Program
```

**Content is authored into a library. Delivery references it later.** Those are different acts, at
different times, by different actors, at wildly different volumes.

🛑 **The consequence, stated as a rule:** a Content Asset is **never copied per Lesson**. The same
asset serves many classes, students, Lessons and Programs by **reference**. Copying would fragment
exactly what the library exists to consolidate — the same mistake the vocabulary system made by
duplicating a word per pack (`docs/learn/VOCABULARY_ARCHITECTURE.md`).

✅ This is consistent with, and an elaboration of, `LEARNING_DOMAIN_MODEL.md` §3: **a Content Asset
sits outside `Program → Module → Lesson → Activity` and is referenced by Activities.**

### 1.1 Two generation modes, coexisting

| Mode | Shape | Status |
|---|---|---|
| **Bulk generation** | spec / prompt → workflow → many assets → Library | ✅ **the primary mode today** |
| **Lesson-specific generation** | read this week's material → workflow → tailored assets → **Library** → Assignment | ✅ a future addition |

⚠️ **Note where the arrow points in the second mode**: lesson-specific content still lands **in the
Library** and is *then* assigned. 🛑 It does not get written directly into a Lesson. Both modes end
in the same place, which is what keeps one library rather than two.

---

## 2. The 9 core Digital Content Types — DECIDED v1

| # | Type | 中文 | Typically covers |
|---|---|---|---|
| **1** | **Reading Article** | 閱讀文章 | Topic articles · news-style · expository · argumentative · story. Multiple difficulty and length versions. May specify Theme / Level / Reading Skill |
| **2** | **Question Set** | 題組 | MCQ · reading comprehension · listening items · answers · explanations · **distractor rationale** · Primary Skill · Secondary Skill · question type · difficulty |
| **3** | **Vocabulary Set** | 單字集 | Thematic · core · advanced · phrases · collocations · word families · example sentences · Chinese gloss · usage context · graded lists |
| **4** | **Listening Material** | 聽力素材 | Dialogue · monologue · lecture · interview · situational scripts · difficulty variants · TTS script. Pairs with a Question Set |
| **5** | **Writing Prompt** | 寫作題目 | Essay · picture writing · email · chart writing · narrative · thematic prompts · guiding questions · requirements · graded versions |
| **6** | **Translation Set** | 翻譯教材 | 中翻英 · 英翻中 · sentence-pattern translation · thematic translation · translation targeting a given Grammar / Vocabulary point · reference answers · **acceptable alternatives** · common errors |
| **7** | **Grammar Lesson / Practice** | 文法教材／練習 | Explanation · examples · contrastive examples · common errors · MCQ · error correction · sentence transformation · translation practice · items graded per Grammar Skill |
| **8** | **Model Answer / Sample Response** | 範文／示範答案 | Mid / high / advanced versions · essays · speaking samples · translation samples · paragraph-by-paragraph analysis · **Error Tags** · **High-Score Features** · why it scores well |
| **9** | **Review / SRS Set** | 複習／間隔複習教材 | Day 1 / 3 / 7 / 14 review · redo of missed items · variant items · retrieval practice · weakness targeting · vocabulary SRS · *same skill, different surface form* |

**Type 8 connects directly to the frozen Writing taxonomy** — its Error Tags and High-Score Features
come from `docs/learn/writing-taxonomy/Writing_Taxonomy_v1.xlsx`, not from a new vocabulary.

⚠️ **Type 9 is content, not a scheduler.** A Review / SRS Set is *material for* review.
🛑 It must **not** become a second SRS scheduling mechanism — scheduling is keyed on
**learner × canonical word** (`VOCABULARY_ARCHITECTURE.md` §1.2 #11, §7.4), and one word has one due
date regardless of how many sets contain it.

---

## 3. Relationship principles — DECIDED

### 3.1 Article and Question Set are separate

> One **Reading Article** may carry **many** Question Sets — different difficulties, different Skill
> focuses.

🛑 Do not embed questions inside an article. The article is the stimulus; the questions are what is
asked about it, and the same passage is worth asking about in several ways.

### 3.2 Listening Material and Question Set are separate

> Same rule, same reason. One **Listening Material** may be reused by many Question Sets.

### 3.3 🛑 Content Type ≠ Question Type

**MCQ · True/False · Matching · Cloze** are **`question_type` / `activity_type`** — 🛑 not top-level
Content Types.

This is the same rule the taxonomies already enforce: *Best Title* is a `question_type`, not a
Reading Skill (`LEARNING_DOMAIN_MODEL.md` §9.4); Picture Description is a `task_type`, not a Speaking
Skill (§9.14). **Form is not substance**, and promoting every form to a top-level type produces a
library nobody can navigate.

### 3.4 🛑 Content Asset ≠ Skill

Content **may be tagged with target Skills**. It does not *become* a Skill. The competency axis is
independent (§5 of the domain model), and Skills are program-independent while content is not.

### 3.5 The Library is a reusable asset library

> 🛑 **Never bind a Digital Content asset permanently to one Lesson.**

### 3.6 Bulk generation is a first-class use case

🛑 The architecture must **not** assume every asset is hand-created one at a time by a teacher.
Anything that would be painful at 500 assets — a required manual field, a per-Lesson copy, a
one-at-a-time review gate — is a design error, not a detail.

### 3.7 Structured metadata is the direction, not yet the schema

AI-generated content should eventually carry structured metadata: **level · theme · target skill ·
difficulty · question type · answer · explanation · distractor rationale**, and more.

🛑 **Only the direction is recorded. No field list, no schema, no enum is designed here.**

Two rules already decided elsewhere apply the moment such metadata exists, and generation prompts
must respect them:

| | |
|---|---|
| **Exactly one Primary Skill** per scorable item, plus optional Secondaries (§10.2) | 🛑 A generator must not emit two Primaries |
| **Naming** — `word_level` · `difficulty` · `cefr_level` · `grade`; 🛑 never a bare `level` (§7.1) | |

### 3.8 Student activity will later produce evidence

```
Response → Evidence → Analytics → Student / Parent Report
```

🛑 **The Evidence Model and Mastery Model are NOT implemented or designed here.** Both remain
BLOCKED (`LEARNING_DOMAIN_MODEL.md` §15). This line is recorded only so the content architecture is
not built in a way that forecloses it.

---

## 4. ⚠️ One interaction to keep in view

**Bulk generation meets asset versioning.** `LEARNING_DOMAIN_MODEL.md` §3.1 decided that a content
version which has already produced a Student Response or Skill Evidence is **immutable** — changes
fork a new version.

🛑 A future bulk **re**-generation must therefore not overwrite assets that students have already
answered. At 500 items at a time this is easy to do by accident and hard to notice afterwards.
Recorded now; 🛑 no mechanism designed here.

---

## 5. Scope of this document

**This round recorded:** the creation / delivery separation · the two generation modes · the 9 core
Content Types · the eight relationship principles.

🛑 **This round did not:** create a table, change a schema, run a migration, touch Supabase or RLS,
build an API, a component or a workflow, implement the Content Library, or design the Evidence or
Mastery Model.

**Related:** `docs/learn/LEARNING_DOMAIN_MODEL.md` §3 (Content Asset) · §9 (Skill taxonomies) ·
`docs/learn/VOCABULARY_ARCHITECTURE.md` · `docs/learn/writing-taxonomy/` ·
`docs/learn/teaching-blocks/Teaching_Block_Types_v1.md`
