# `/learn` Learning Domain Model

> **Written:** 2026-08-29 · **Revised:** 2026-08-29 (Grammar Skill Taxonomy v1 supplied by the owner)
> **Status:** 🟡 **DESIGN SPEC ONLY — no table, no migration, no seed data, no frontend, no
> Production change.**
>
> This document records **owner decisions**. It is the vocabulary the `/learn` product is built in,
> and the place to check before naming anything.
>
> 🛑 Three rules govern how it is used:
> 1. Where a term is **owner-defined**, it is used **verbatim** — including the Chinese pedagogical
>    terminology. Linguistic convention does not override it.
> 2. Anything marked **PROVISIONAL** or **BLOCKED** must **not** be completed, frozen, or seeded by
>    anyone but the owner. Guessing the rest of a taxonomy is the failure mode this document exists
>    to prevent.
> 3. §14 lists genuine gaps found while writing this. They are reported, not resolved.

---

## 1. The two axes

The whole model rests on one idea: **content and competency are different dimensions, and they cross
rather than nest.**

```
   CONTENT AXIS  (what a student works through)
   Program → Module → Lesson → Activity
                        │        │
                        │        └── references ──► Content Asset  (outside the hierarchy)
                        │
                        └── declares ──► Learning Objective ──► Skill
                                                                  ▲
   COMPETENCY AXIS  (what a student becomes able to do)           │
   Domain → Category → Skill → Micro-skill ────────────────────────┘
```

A `Skill` is **stable, reusable and cross-program**. A `Lesson` is **a place where that skill is
taught**. The same skill is reached from many lessons in many programs; the same lesson develops
several skills. Neither owns the other.

---

## 2. Content axis — strict definitions

> **Status: DECIDED.**

### 2.1 Program

> A learning product created by the **platform owner**, which a **teacher activates for a student**.

Examples: 國中英文 · 高中英文 · 學測英文 · SAT · KET / PET · 兒童英文.

- Students **cannot** self-join a Program they have not been granted.
- A Program is a *product*, not a class, not a cohort, not a term.
- Programs are authored centrally; teachers do not create them.

### 2.2 Module

> A group of Lessons within a Program sharing a **theme, competency focus, or stage of learning**.

🛑 **A Module is not a week.** It must not be modelled, named, or rendered as a fixed calendar unit.
Pacing is an Assignment concern (§4.3), not a structural one.

⚠️ **Naming hazard.** The shared LMS application has `courses` / `course_lessons` organised into
*weeks*, with live data. Those tables are **not ours** and are **not** the model here. See §13.4.

### 2.3 Lesson

> A set of Activities sharing common **Learning Objectives**, forming one complete learning unit.

A Lesson is **not**:
- a single video,
- a single article,
- a fixed classroom period.

A Lesson is the level at which Learning Objectives are declared (§6). It is the smallest unit that
means something pedagogically on its own.

### 2.4 Activity

> The **smallest teaching activity** that can independently produce student behaviour, progress, or
> evidence.

"Independently produces evidence" is the test. If it cannot generate a response, a completion, or an
observation, it is not an Activity — it is presentation, and belongs in a Content Asset.

Activity kinds recorded by the owner:

`video` · `reading` · `vocabulary` · `flashcards` · `SRS review` · `quiz` · `multiple choice` ·
`fill-in-the-blank` · `matching` · `spelling` · `listening` · `shadowing` · `speaking recording` ·
`writing` · `exam practice`

🛑 **`exam practice` is a boundary.** The `/exam` domain (`exams`, `exam_attempts`,
`exam_user_answers`, and the five question tables) is **RESERVED**. A `/learn` exam-practice Activity
may *link to* or *launch* that domain, but must not extend, restyle, or write to its schema. See
`docs/CURRENT_PLATFORM_HANDOFF.md` §2.1.

---

## 3. Content Asset

> **Status: DECIDED.**

> A Content Asset is **outside** the Program → Module → Lesson → Activity hierarchy. An Activity
> **references** it.

Asset kinds recorded: `article` · `video` · `vocabulary list` · `question` · `question set` ·
`grammar note` · `infographic` · `audio` · `image` · `writing prompt`.

**The reuse requirement is the whole point.** One asset must be referenceable from many Programs,
Lessons and Activities. Therefore:

- An asset is **never owned by** a Program. It has no parent in the curriculum tree.
- An asset carries **no position, no ordering, no due date**. Those belong to the referencing
  Activity or Assignment.
- Editing an asset changes it **everywhere** it is referenced. This is the intended behaviour and
  also the main risk — see the versioning question in §14.6.

---

## 4. Relationship · Enrollment · Assignment — three separate things

> **Status: DECIDED** that they are separate. **Some mechanics are BLOCKED** — see §14.1.

The single most important structural decision in this document. Conflating any two of these is how
learning platforms become unfixable.

| Concept | Answers | Changes when |
|---|---|---|
| **Relationship** | *Who teaches whom?* | A teacher takes on or releases a student |
| **Enrollment** | *Which Program may this student use?* | A teacher activates or withdraws a product |
| **Assignment** | *What must this student complete, by when?* | Weekly teaching happens |

### 4.1 Relationship — who teaches whom

Two shapes are **both first-class**:

```
  Teacher ──────────────────────────► Student        direct relationship
  Teacher ──► Class ──► Students                     grouped
```

> 🛑 **A one-to-one student must not be forced into a class of one.**

- **Class is optional grouping.** It is *not* the required container for a Student Home.
- The same student may simultaneously be: a teacher's direct student, a member of one or more
  Classes, and enrolled in one or more Programs. None implies the others.

### 4.2 Enrollment — which Program a student may use

Enrollment is the **entitlement**. Without it a student cannot open a Program.

Enrollment is **per student**, not per class. A class may be a convenient way to grant it in bulk,
but the grant that matters is the one attached to the student — otherwise removing a student from a
class would silently revoke access to work they have already done.

### 4.3 Assignment — what to complete, by when

Assignment carries the teaching intent: **what content, for whom, by when**.

- It may target an individual student or a class, but it **resolves to individual students**.
- It may point at a Lesson, an Activity, or a set of them.
- It is **not** required for a student to work: an enrolled student can study a Program without any
  assignment existing. Assignment adds direction and a deadline, not access.

### 4.4 Progress — a fourth, derived thing

Progress is **not** one of the three. It is **derived from student activity**, not declared by a
teacher.

> Enrollment says *may*. Assignment says *should*. Progress says *did*.

An Assignment's completion state is a **view over** progress, not a separate truth. Progress exists
whether or not an assignment does.

---

## 5. Competency axis

> **Status: structure DECIDED. Content mostly PROVISIONAL or BLOCKED — see §7–§9.**

```
Domain → Category → Skill → Micro-skill
```

### 5.1 Skills are program-independent

🛑 **A Skill must never be duplicated per Program.**

`Reading → Inference` exists **once**, and is reached from 國中英文, 高中英文, GSAT and SAT alike.

Do **not** create:

```
❌ 國中推論     ❌ 高中推論     ❌ 學測推論
```

Differences between those contexts are expressed by **difficulty · level · context · evidence**, not
by forking the taxonomy. A forked taxonomy makes cross-program mastery unmeasurable, which is the
one thing this axis exists to provide.

### 5.2 The seven Domains

> **Status: DECIDED.**

1. Vocabulary
2. Grammar
3. Reading
4. Listening
5. Speaking
6. Writing
7. Exam / Academic Skills

🛑 **Only Grammar's first-level Categories are frozen** (§8). Everything else is PROVISIONAL or
BLOCKED. **Do not complete any other taxonomy.**

### 5.3 Categories need not be mutually exclusive

> **Status: DECIDED — an explicit owner ruling.**

The owner's teaching taxonomy **does not require first-level Categories to be disjoint**. Where two
Categories legitimately touch the same grammar (G1 Adjective Clause vs G7 Relative Clause is the
worked example, §8.9), **both are kept**.

🛑 Do not merge, delete, or "clean up" one of them to make the taxonomy tidy. Overlap is resolved at
**tagging** time by Primary / Secondary Skill (§10), not at taxonomy time.

---

## 6. Learning Objective

> **Status: concept DECIDED. Format PROVISIONAL. No implementation this round.**

> A **Learning Objective** is a specific, observable, measurable outcome a student should achieve
> **in a particular Lesson**.

**A Learning Objective is not a Skill.**

| | Skill | Learning Objective |
|---|---|---|
| Scope | Platform-wide | One Lesson |
| Lifetime | Stable, reusable | Rewritten as lessons are revised |
| Belongs to | The competency taxonomy | The curriculum |
| Example | `Reading → Inference` | "Students can infer a writer's attitude from word choice in a 200-word opinion paragraph, correctly in 4 of 5 items" |

Relationship: **`Lesson → Learning Objectives → Skills`.**

A Lesson's skill coverage is therefore **derived** through its objectives, not declared directly.
(Whether an Activity may additionally tag skills its Lesson's objectives do not cover is open —
§14.5.)

Proposed phrasing shape — **concept only, not a schema**:

> Students can **[observable action]** **[skill / content]** **[condition]** **[success criterion]**

---

## 7. Vocabulary — two dimensions

> **Status: the two-dimension decision is DECIDED. Its place in the Domain→Category→Skill→Micro-skill
> hierarchy is OPEN — see §14.3.**

Vocabulary carries at least **two independent dimensions**:

### A. Word Level — a property of the word

`Level 1` · `Level 2` · `Level 3` · `Level 4` · `Level 5` · `Level 6` · `Beyond`

Levels 1–6 follow the **教育部字彙分級** and match the site's six existing vocabulary packs.

### B. Learner Mastery Type — a property of the *learner–word pair*

`Recognition` · `Production`

🛑 **Recognition / Production is not a peer of Level 1–6.** They are different kinds of fact:

> A Level 4 word may be **recognition** vocabulary for one student and already at **production**
> mastery for another. The word's level does not change; the learner's relationship to it does.

⚠️ **Naming collision to avoid at implementation time.** "Level" here means a Ministry vocabulary
band. "Level" elsewhere in this document (§5.1) means generic difficulty. Two different concepts —
they must not share a field name.

---

## 8. Grammar taxonomy — owner-defined, use verbatim

> **Status: DECIDED at Category and Skill level.** 10 Categories · **51 Skills**, each with a stable
> code. Micro-skill is **not yet populated** — see §8.13.
>
> 📎 **The detailed taxonomy's source of truth is the spreadsheet, not this document:**
> **`docs/learn/grammar-taxonomy/Grammar_Skill_Taxonomy_v1.xlsx`** (Grammar Skill Taxonomy v1 Draft,
> supplied by the owner 2026-08-29).
>
> This section records the **structure and the design principles**. It deliberately does **not**
> re-transcribe the 51 skills or the ~274 source mappings — two copies of a taxonomy diverge, and the
> spreadsheet wins by definition.

### 8.1 What the spreadsheet contains

| Sheet | Contents |
|---|---|
| `README` | Version framing, the 10 categories, the G1/G7 and G3/G4 boundaries, terminology rules |
| `Skill_Summary` | **The taxonomy proper** — 51 Skills: category code, Chinese and English names, stable Skill code, source counts, suggested school stage, status |
| `Skill_Taxonomy` | Intended for Micro-skills. ⚠️ **Currently empty** — §8.13 |
| `高中原始對照` | 182 senior-high source topics mapped to canonical Category + Skill, each with an Action |
| `國中目錄對照` | 92 junior-high 會考 syllabus headings, mapped the same way |
| `待審核` | **CLOSED** — no pending decisions remain |
| `最新版修正` | The 7 renames from the previous draft to this one |
| `Owner_Decisions` | **OD-01 … OD-05**, the binding tagging rules (§8.12) |

`docs/learn/grammar-taxonomy/Skill_Summary.csv` is a **generated, greppable extract** of the
`Skill_Summary` sheet, kept so the taxonomy is diffable in git. 🛑 It is a convenience copy, **not**
seed data and **not** for import. If it disagrees with the spreadsheet, the spreadsheet is right.

### 8.2 The ten Categories — DECIDED, frozen, verbatim

🛑 **Use the owner's pedagogical terminology exactly.** Do not translate it back into linguistic
convention, do not "correct" it, do not substitute a more standard name.

| ID | Category (Chinese — formal) | English | Skills |
|---|---|---|---|
| **G1** | 句子與結構一致 | Sentence Structure & Agreement | 7 |
| **G2** | 名詞、代名詞與限定詞 | Nouns, Pronouns & Determiners | 5 |
| **G3** | 動詞、時態與語態 | Verbs, Tenses & Voice | 8 |
| **G4** | 助動詞 | Auxiliary Verbs | 2 |
| **G5** | 形容詞、副詞與比較 | Adjectives, Adverbs & Comparison | 5 |
| **G6** | 介係詞與連接詞 | Prepositions & Conjunctions | 4 |
| **G7** | 關係子句與關係詞 | Relative Clauses & Relative Words | 5 |
| **G8** | 不定詞、動名詞與分詞 | Infinitives, Gerunds & Participles | 4 |
| **G9** | 條件與假設 | Conditionals & Subjunctive | 4 |
| **G10** | 疑問、否定與特殊句構 | Questions, Negation & Special Structures | 7 |
| | | **Total** | **51** |

> ✅ **A discrepancy flagged in the previous revision of this document is now resolved.** G7's formal
> name is **「關係子句與關係詞」**, confirmed by the spreadsheet's `README` and `最新版修正` sheets.
> 「關係詞」 is a short display form only.

### 8.3 Skill codes are the stable identifier

Every skill carries a code of the form **`GRAM_G{n}_{NAME}`** — e.g. `GRAM_G7_REL_PRON`,
`GRAM_G3_PASSIVE_TENSE`, `GRAM_G10_INDIRECT_Q`.

🛑 **The code is the identity, not the Chinese label.** Names may be reworded for teaching or UI; the
code must not change once evidence has been recorded against it. Any future `skill` table keys on the
code, never on a display name.

### 8.4 G1 — clause types and sentence function

G1 covers sentence structure, sentence elements, agreement, and **clause types and clause functions**.

Its clause classification is **名詞子句 Noun Clauses · 形容詞子句 Adjective Clauses ·
副詞子句 Adverb Clauses**, and the organising question is:

> **What function does this clause serve in the whole sentence?**

A Noun Clause functions as a noun; an Adjective Clause functions adjectivally; an Adverb Clause
functions adverbially.

🛑 The full relative system lives in **G7**, not here.

### 8.5 G3 — 時態 and 語態

🛑 **All twelve forms are 時態** in the owner's taxonomy: 現在簡單式 · 現在進行式 · 現在完成式 ·
現在完成進行式 · 過去簡單式 · 過去進行式 · 過去完成式 · 過去完成進行式 · 未來簡單式 ·
未來進行式 · 未來完成式 · 未來完成進行式.

🛑 **Do not introduce a 「體 / Aspect」 taxonomy.** The category is **「動詞、時態與語態」**, never
「動詞、時態與體」.

🛑 **Passive voice is G3.** Three of G3's eight skills are voice skills
(`GRAM_G3_VOICE`, `GRAM_G3_PASSIVE_TENSE`, `GRAM_G3_PASSIVE_PAT`).

### 8.6 G4 — auxiliaries only

G4 handles auxiliaries and `modal + have p.p.` — two skills, `GRAM_G4_AUX` and `GRAM_G4_AUX_PERF`.

🛑 **Passive voice does not belong to G4.**

### 8.7 G6 and G8 — name rules

🛑 G6 is **「介係詞與連接詞」**.
🛑 G8 is **「不定詞、動名詞與分詞」** — **never** 「非限定動詞」 in taxonomy or UI.

### 8.8 G7 — the relative system in depth

G7's five skills cover Relative Clauses · Relative Pronouns · Relative Adverbs · Compound Relatives ·
Special Rules for Relative Words.

### 8.9 The G1 / G7 overlap — the governing principle

> **G1's Adjective Clause** is learned at the level of *clause type and sentence function*.
> **G7's Relative Clause** is learned at the level of *full relative structure and relative-word use*.

🛑 **The overlap is intentional and permitted. Do not merge or delete either to force disjointness.**

It is resolved per **question**, by Primary Skill:

| The question asks the student to… | Primary Skill | Secondary |
|---|---|---|
| identify that *who lives next door* functions adjectivally | **`GRAM_G1_ADJ_CLAUSE`** | — |
| choose between `who / whom / which / that` | **`GRAM_G7_REL_PRON`** | optionally `GRAM_G1_ADJ_CLAUSE` |
| analyse the full structure of the relative clause | **`GRAM_G7_REL_CLAUSE`** | optionally `GRAM_G1_ADJ_CLAUSE` |

Worked sentence: *The man who lives next door is my teacher.*

### 8.10 G10 — two distinct skills, never merged

| Skill code | Term | Meaning |
|---|---|---|
| `GRAM_G10_INDIRECT_Q` | **Indirect Questions** | 間接問句 |
| `GRAM_G10_REPORTED` | **Reported Speech** | 間接引語 |

🛑 The name **「間接引句」 is forbidden** — it is ambiguous between the two.
🛑 **Do not merge them.**

### 8.11 Source mappings and the Action vocabulary

The two 對照 sheets trace every canonical Skill back to the teaching material it came from — 182
senior-high topics and 92 junior-high headings. Actions observed across them:

| Action | Meaning | Count |
|---|---|---|
| `KEEP` | retained as-is | 179 |
| `MERGE` | folded into an existing skill | 63 |
| `ADD` | newly added | 20 |
| `REMAP` | moved to a different skill | 7 |
| `CROSS-TAG` | suggests a cross-domain / cross-skill tag | 3 |
| `MOVE` | moved out of Grammar entirely | 2 |
| `REVIEW` | awaiting a teacher ruling | **0 — none remain** |

**This traceability is worth preserving in the eventual schema.** It is what will let a teacher ask
"where did this skill come from, and what did it use to be called?" — and it is the audit trail for
any future taxonomy revision.

### 8.12 Owner Decisions OD-01 … OD-05 — binding tagging rules

> **Status: DECIDED.** These are not commentary. They are the rules that settle recurring tagging
> arguments, and they must be honoured by anything that tags questions.

| ID | Rule |
|---|---|
| **OD-01** | **特殊動詞** (`say/speak/tell`, `see/look/watch`, `spend/cost/take/pay` …) → Primary **`GRAM_G3_VERB_USAGE`**. 🛑 Do **not** dual-tag by default; add a `Vocabulary → Usage & Collocation` secondary **only** when the question genuinely tests lexical usage or collocation |
| **OD-02** | **情緒動詞／情緒形容詞** → Primary **`GRAM_G5_PART_ADJ`**. 🛑 Do **not** routinely add a G8 secondary; add it only when the question really tests participle formation, syntax, or participial construction |
| **OD-03** | **`there be`** → **`GRAM_G1_SENT_PAT`**. Here/There inversion and locative inversion stay in **`GRAM_G10_INVERSION`**. No fixed secondary tag |
| **OD-04** | **基數／序數** stay in **`GRAM_G2_QUANT`** — *not* under adjectives, despite the junior-high textbook's arrangement |
| **OD-05** | **Vocabulary / 片語** items are **moved out of Grammar**; the source record is kept with action `MOVE`. 🛑 Do **not** create a catch-all 「單字」 or 「片語」 Grammar skill. They wait for the Vocabulary taxonomy |

**The shared principle across OD-01 and OD-02:** *do not dual-tag by default.* A secondary skill is
earned by what the question actually demands, never added because two topics are related. This is the
same discipline §10 states in general, and these are its two worked precedents.

### 8.13 ⚠️ Micro-skill is not yet populated

The spreadsheet's `Skill_Taxonomy` sheet is intended for the Micro-skill level, but currently holds
only a malformed header row (`Micro Code` repeated 12 times) and **no data**.

So the taxonomy is decided **three levels deep** — Domain → Category → Skill — and the fourth level
is **empty**.

🛑 **Do not populate it.** The §8.9 example (`Grammar → G7 → 關係代名詞 → who / whom / whose /
which / that`) shows the *shape* a micro-skill takes, not permission to write them. Tag at Skill
level until the owner supplies Micro-skills.

⚠️ Also worth the owner's attention: **`GRAM_G1_ADJ_CLAUSE` has 0 junior-high and 0 senior-high
source records** ("待補來源") — every adjective-clause item in both source materials was filed under
the relative-clause topics that became G7. The skill is doctrinally required by §8.9, but currently
has no material behind it. Not an error; a gap the owner may want to fill.

## 9. The other Domains — placeholders only

> 🛑 **PROVISIONAL. First-level direction only. Do NOT complete, freeze, or seed these.**

| Domain | First-level direction (PROVISIONAL) |
|---|---|
| **Reading** | Main Idea · Details · Meaning in Context · Inference · Text Structure · Purpose & Style |
| **Listening** | Speech Perception · Literal Understanding · Inferential Understanding · Discourse Integration |
| **Speaking** | Fluency & Coherence · Lexical Resource · Grammar · Pronunciation & Intonation |
| **Writing** | Content & Task · Organization & Coherence · Lexical Resource · Grammar & Sentence Structure · Register & Audience Awareness |
| **Vocabulary** | Two dimensions recorded in §7; the Category level itself is **not** decided |
| **Exam / Academic Skills** | 🛑 **BLOCKED** — the owner is still designing this |

> ✅ **Grammar is the exception and is no longer provisional at Skill level.** Its 10 Categories and
> 51 Skills are decided; see §8 and the spreadsheet. Only its **Micro-skill** level remains empty
> (§8.13).

⚠️ **Speaking → Grammar** and **Writing → Grammar & Sentence Structure** are *assessment criteria*
within a performance rubric. Whether they reference the Grammar Domain's Skills or are separate
rubric dimensions is **open** (§14.4).

---

## 10. Question tagging — Primary and Secondary Skill

> **Status: principle DECIDED. Precedence rules OPEN — §14.5.**

```
Question → Primary Skill  (exactly one, required)
         → Secondary Skill (zero or more, optional)
```

**Primary Skill = what the question actually tests**, not what it happens to contain. The worked
example in §8.9 is the reference: three questions about the same sentence carry three different
Primary Skills, because they demand three different competencies.

Principles:

1. **Exactly one Primary.** If two feel equally primary, the question is testing two things and
   should probably be two questions.
2. **Secondary is for genuine cross-category demand**, not for listing everything present in the
   text. A reading question containing a relative clause is not thereby a G7 question.
   🛑 **OD-01 and OD-02 (§8.12) are binding worked precedents for this**: do not dual-tag by
   default; a secondary skill is earned by what the question demands.
3. **Secondary never counts as full evidence.** Weighting is a mastery-model decision (§11), but
   secondary evidence must never be treated as equal to primary.
4. **Tag at the level the student is being asked to operate at**, which may be Skill or Micro-skill.

---

## 11. Evidence flow — Response → Evidence → Mastery

> **Status: the three-stage shape is DECIDED. Every algorithm is BLOCKED.**

```
Student Response  ──►  Skill Evidence  ──►  User Skill Mastery
   (a raw fact)        (an interpreted       (a current estimate,
                        observation)          always derived)
```

| Stage | What it is | Property that matters |
|---|---|---|
| **Student Response** | What the student actually did — the answer chosen, the text written, the recording made, with its timestamp and context | **Immutable.** Never rewritten when the taxonomy or scoring changes |
| **Skill Evidence** | That response interpreted *against a skill*: which skill, correct or not, how strong, primary or secondary | **Derived and re-derivable.** If tagging changes, evidence is recomputed from responses |
| **User Skill Mastery** | The current estimate of a learner's command of one skill | **Never authored.** Always computed from evidence |

**The load-bearing property is that responses are immutable while everything downstream is
derived.** Taxonomies get revised; questions get re-tagged; scoring models improve. If mastery were
stored as the only truth, every such change would silently corrupt history. Keeping raw responses
means the entire competency picture can be rebuilt from scratch.

🛑 **BLOCKED — not decided, do not invent:** the mastery scale, decay over time, how many
observations constitute mastery, how difficulty weights evidence, primary vs secondary weighting,
and how Micro-skill evidence rolls up into Skill.

⚠️ **There are already two divergent mastery models in Production** for vocabulary (client-side
mastery cap 6 vs server-side cap 5 — finding 9.10 in `docs/BACKLOG.md`). 🛑 `User Skill Mastery`
must not become a **third**. Reconciling them is a prerequisite for Vocabulary competency work, and
is currently a backlog item, not a `/learn` task.

---

## 12. How the two axes cross

The crossing point is what makes the product work:

| Question | Answered by |
|---|---|
| "What should I study next?" | **Content axis** — Program → Module → Lesson → Activity, plus Assignment |
| "What am I good at?" | **Competency axis** — evidence accumulated per Skill |
| "Why am I being shown this?" | The **join** — this Activity develops these Skills, via its Lesson's Learning Objectives |
| "This student is weak at `Reading → Inference` — what should they do?" | **Reverse traversal** — from Skill, find Activities that develop it, across every Program they are enrolled in |

That reverse traversal is the reason skills are program-independent (§5.1). With a forked taxonomy
it returns nothing useful.

---

## 13. Candidate database entities

> 🛑 **Names and responsibilities only. No SQL, no columns, no migration this round.** Nothing here
> is approved for creation.
>
> Every future table must follow the standing rules in `docs/BACKLOG.md` and
> `docs/IDENTITY_ARCHITECTURE_CHECKPOINT.md`: **RLS ON with policies written at the same time**,
> `TO authenticated`, `*_user_id uuid REFERENCES auth.users(id)`, never a bare `student_id`, no
> second identity store, no dependency on the shared LMS/Writing tables.

### 13.1 Content axis

| Entity | Responsibility | Relationships |
|---|---|---|
| `program` | A learning product authored by the platform owner | has many `module` |
| `module` | A themed / staged group of lessons | belongs to `program`; has many `lesson` |
| `lesson` | A complete learning unit with shared objectives | belongs to `module`; has many `activity`, many `learning_objective` |
| `activity` | The smallest evidence-producing teaching activity | belongs to `lesson`; references `content_asset`; tagged to `skill` |
| `content_asset` | Reusable content, outside the hierarchy | referenced by many `activity`; owned by no program |
| `activity_asset_ref` | The many-to-many join, carrying per-use context (order, role) | joins `activity` ↔ `content_asset` |

### 13.2 Competency axis

| Entity | Responsibility | Relationships |
|---|---|---|
| `domain` | One of the seven top-level domains | has many `category` |
| `category` | e.g. G1–G10 for Grammar | belongs to `domain`; has many `skill` |
| `skill` | A stable, program-independent competency. 🛑 Identified by its **code** (`GRAM_G7_REL_PRON`), never by its display name — §8.3 | belongs to `category`; has many `micro_skill` |
| `micro_skill` | The finest addressable competency | belongs to `skill` |
| `learning_objective` | A lesson-specific observable outcome | belongs to `lesson`; references many `skill` |
| `question_skill_tag` | Primary / secondary skill tagging for a question asset | joins `content_asset` (question) ↔ `skill`, with a primary flag |
| `skill_source_mapping` | Provenance: which source-material topic a skill came from, and the action taken (KEEP/MERGE/ADD/REMAP/CROSS-TAG/MOVE) — §8.11 | references `skill`; the audit trail for taxonomy revisions |

### 13.3 People, entitlement, work

| Entity | Responsibility | Relationships |
|---|---|---|
| `classes` ✅ | Optional grouping owned by a teacher | **Already deployed** — Identity Spine |
| `class_members` ✅ | Membership of a class, with role | **Already deployed** |
| `guardian_links` ✅ | Confirmed guardian ↔ student link | **Already deployed** |
| `teacher_student_link` 🆕 | **Direct** teacher ↔ student relationship, independent of any class | 🛑 **Does not exist yet — see §14.1** |
| `enrollment` 🆕 | A student's entitlement to one Program | student ↔ `program`, with granting teacher and state |
| `assignment` 🆕 | Teacher's instruction: what, for whom, by when | targets a student or class; points at `lesson` / `activity` |
| `assignment_target` 🆕 | Resolves a class-level assignment to individual students | joins `assignment` ↔ student |
| `activity_progress` 🆕 | Derived per-student, per-activity progress | student ↔ `activity` |
| `student_response` 🆕 | **Immutable** record of what a student actually did | student ↔ `activity` / question asset |
| `skill_evidence` 🆕 | A response interpreted against a skill; re-derivable | derived from `student_response`, references `skill` |
| `user_skill_mastery` 🆕 | Current computed estimate per student per skill | derived from `skill_evidence` |

### 13.4 🛑 Naming hazards

The shared LMS/Writing application already owns tables whose names collide conceptually with this
model. They carry the open CRITICAL findings 9.1 / 9.2 and **must not be reused or depended on**:

| Theirs (do not touch) | Ours (a different thing) |
|---|---|
| `courses`, `course_lessons` (organised by *week*) | `program`, `module`, `lesson` |
| `assignments`, `assignment_submissions` | `assignment`, `student_response` |
| `student_tasks` | `assignment_target` |
| `exam_records`, `exam_types` | — (LMS cluster, not the `/exam` domain either) |

Our entities live in the **`learn` schema**, which is what makes the collision safe.

---

## 14. Contradictions and gaps found

> Reported, not resolved. Each needs an owner decision before the affected work starts.

### 14.1 🔴 The deployed Identity Spine cannot represent a direct teacher–student relationship

**The most consequential gap in this document.**

§4.1 makes `Teacher ↔ Student` direct relationship first-class, and forbids forcing a one-to-one
student into a class of one. But the Identity Spine deployed to Production on 2026-08-28 has exactly
one membership mechanism: `learn.class_members`, which requires a `learn.classes` row.

Concretely, the additive `user_profiles` policy shipped as **D2** grants a teacher visibility of a
student's `display_name` **only through active membership of an active class they own**. So today:

> **A direct student with no class is invisible to their own teacher.** The teacher would see a uuid.

This is not a defect in the spine — it implemented what was decided at the time. It is a **decided
product requirement that the current schema does not yet serve**.

**Resolution shape (not built, not approved):** an additive `learn.teacher_student_link` table, plus
a **second** additive `user_profiles` SELECT policy scoped to a confirmed direct link — mirroring
exactly how the guardian policy already works. The guardian policy is the precedent: it grants
profile visibility through a **person-to-person** link with no class involved. 🛑 Owner decision
required; deliberately not designed further here.

### 14.2 ❓ Who may enrol a student in which Program?

§2.1 says Programs are owner-authored and **teachers activate them for students**. Unspecified:
whether any teacher may grant any Program, or whether a teacher must themselves be licensed for it.

This is an **authorization** question, and it decides an RLS policy. It cannot be inferred. 🛑 Owner
decision required before `enrollment` is designed.

### 14.3 ❓ Vocabulary does not fit `Domain → Category → Skill → Micro-skill`

§5 defines a four-level hierarchy for every Domain. §7 defines Vocabulary as **two orthogonal
dimensions** — Word Level (a property of the word) and Mastery Type (a property of the
learner–word pair). Neither is a Category, and neither is a Skill.

Vocabulary plausibly has *both*: real skills (word formation, collocation, meaning in context) in the
hierarchy, **plus** Level and Mastery Type as attributes hanging off words and off the learner's
relationship to them. But that is my reading, not an owner decision. 🛑 Recorded as open;
deliberately not resolved.

### 14.4 ❓ Speaking / Writing rubric dimensions vs Grammar Domain Skills

`Speaking → Grammar` and `Writing → Grammar & Sentence Structure` (§9) are rubric criteria. Do they
reference the Grammar Domain's Skills, or are they independent rubric dimensions?

- If they reference Grammar Skills, an essay's grammar score could feed grammar mastery — powerful,
  and hard to do well.
- If independent, they are simpler but produce a second, disconnected notion of "grammar ability".

🛑 Both taxonomies are still PROVISIONAL; no answer invented.

### 14.5 ❓ Skill tags on Activity vs on Content Asset — which wins?

§5 has `Activity → Skills`; §10 has `Question → Primary / Secondary Skill`. A question is a Content
Asset (§3), and a Content Asset is reusable across Activities. So a question can arrive carrying its
own tags into an Activity that has different ones.

Related: may an Activity tag a Skill that none of its Lesson's Learning Objectives covers (§6)?

**Suggested resolution, for the owner to accept or reject:** the **asset's** tags are the truth for
evidence (they describe what the question tests, which does not change with placement); the
**activity's** tags describe pedagogical intent and drive recommendation. 🛑 Not adopted — a
suggestion only.

### 14.6 ❓ Content Asset editing has no versioning story

§3 states editing an asset changes it everywhere. Combined with §11's immutable responses: if a
question is edited after students have answered it, their stored responses now refer to a question
that no longer exists in that form, and the evidence derived from it becomes unsound.

Options range from full asset versioning to freezing an asset once it has responses. 🛑 Owner
decision required before `content_asset` is built.

### 14.7 ⚠️ Grammar's Micro-skill level is empty, and one Skill has no source material

Two observations from the spreadsheet, both recorded rather than fixed:

1. **`Skill_Taxonomy` (the Micro-skill sheet) contains no data** — only a malformed header row. The
   taxonomy is decided three levels deep, not four. 🛑 Tag at Skill level until the owner supplies
   Micro-skills; do not invent them (§8.13).
2. **`GRAM_G1_ADJ_CLAUSE` has zero source records in both materials.** Every adjective-clause item in
   the junior- and senior-high sources was filed under the relative-clause topics that became G7. The
   skill is required by the §8.9 doctrine, but nothing currently backs it. 🛑 Owner's call whether to
   add material, leave it as a doctrinal placeholder, or reconsider.

### 14.8 ⚠️ "Level" is overloaded

"Level 1–6" (教育部 vocabulary bands, §7) and "level" as generic difficulty (§5.1) are different
concepts. 🛑 They must never share a field name. Suggested: `vocab_level` and `difficulty`.

### 14.9 ⚠️ Guardians are built but absent from this model

`learn.guardian_links` is deployed and working, but this document does not mention parents. Nothing
here says what a guardian may see of a child's assignments, progress, or evidence.

Not a contradiction — a decided capability the product model has not yet caught up with. 🛑
Recorded; no access rules invented.

---

## 15. Status summary

### ✅ DECIDED

- Program → Module → Lesson → Activity, with the definitions in §2
- Module is **not** a week
- Content Asset sits **outside** the hierarchy and is reusable
- Relationship · Enrollment · Assignment are **three separate concepts**; Progress is derived
- Teacher ↔ Student **direct** relationship is first-class; **Class is optional grouping**
- A one-to-one student is **never** forced into a class of one
- Competency structure: Domain → Category → Skill → Micro-skill
- Skills are **program-independent**; no 國中/高中/學測 forks
- Categories **need not be mutually exclusive**; overlap is resolved by tagging
- Learning Objective ≠ Skill; `Lesson → Learning Objectives → Skills`
- The seven Domains
- **Grammar: ten Categories (G1–G10) and 51 Skills with stable codes — frozen, verbatim.**
  Detailed source of truth: `docs/learn/grammar-taxonomy/Grammar_Skill_Taxonomy_v1.xlsx`
- **Owner Decisions OD-01 … OD-05** (§8.12) are binding tagging rules, including *do not dual-tag by
  default*
- G3 uses **語態**, never 體 / Aspect; all twelve forms are 時態
- Passive voice is G3, **not** G4
- G8 is 「不定詞、動名詞與分詞」, **never** 「非限定動詞」
- G6 is 「介係詞與連接詞」
- G1 Adjective Clause and G7 Relative Clause **both stand**; §8.9 governs
- Indirect Questions (間接問句) and Reported Speech (間接引語) are **separate Skills**;
  「間接引句」 is **forbidden**
- Question tagging: exactly one Primary Skill, optional Secondary
- Evidence flow: Student Response → Skill Evidence → User Skill Mastery
- Vocabulary has two dimensions; Recognition / Production is **not** a peer of Level 1–6

### 🟡 PROVISIONAL — direction only, do not complete

- Reading · Listening · Speaking · Writing first-level lists (§9)
- Vocabulary's Category level (§7, §14.3)
- Grammar **Micro-skill** level — the spreadsheet's sheet for it is empty (§8.13). 🛑 Do not populate
- Learning Objective phrasing format (§6)

> ✅ Two items that were PROVISIONAL in the previous revision are now **DECIDED** by the spreadsheet:
> Grammar's Skill level (51 skills), and the G7 formal-name discrepancy (「關係子句與關係詞」).

### 🛑 BLOCKED — needs an owner decision before the work starts

| # | Blocked item | Blocks |
|---|---|---|
| 1 | **Exam / Academic Skills taxonomy** — owner still designing | that Domain entirely |
| 2 | **Direct teacher–student relationship** (§14.1) | Student Home, teacher roster, any one-to-one flow |
| 3 | **Who may enrol whom in which Program** (§14.2) | `enrollment` and its RLS |
| 4 | **Mastery algorithm** — scale, decay, thresholds, weighting, roll-up (§11) | `user_skill_mastery` |
| 5 | **Content Asset versioning** (§14.6) | `content_asset`, and the soundness of historical evidence |
| 6 | **Activity vs Asset skill-tag precedence** (§14.5) | evidence derivation |
| 7 | **Speaking / Writing rubric ↔ Grammar Skills** (§14.4) | those two domains' scoring |
| 8 | **Guardian access rules** (§14.9) | any parent-facing view |
| 9 | Reconciling the **two existing vocabulary mastery models** (9.10, `docs/BACKLOG.md`) | Vocabulary competency |
| 10 | **Grammar Micro-skills** — the sheet is empty (§8.13, §14.7) | micro-skill-level tagging and reporting |

---

## 16. This round produced no code

No table, no migration, no seed data, no frontend, no schema exposure, no Production change, no
change to the deployed Identity Spine, nothing touching the shared LMS/Writing tables, and no
security audit. This document only.
