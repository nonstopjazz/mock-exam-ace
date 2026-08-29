# `/learn` Learning Domain Model

> **Written:** 2026-08-29 · **Revised:** 2026-08-29 — Grammar Skill Taxonomy v1, then an owner
> ruling on eight open items (§14)
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
- Editing an asset changes it **everywhere** it is referenced. This is the intended behaviour, and
  §3.1 is the constraint that keeps it safe.

### 3.1 Versioning — an asset with evidence is immutable

> **Status: architecture principle DECIDED (owner ruling, 2026-08-29). 🛑 No version table this
> round.**

> **Once a Content Asset version has produced a Student Response or Skill Evidence, that version must
> not be destructively overwritten.** A content change creates a **new version**.
>
> **Every historical Student Response must be able to point back at the exact asset / content version
> the student actually answered.**

Why this is load-bearing rather than tidy-mindedness: §11 makes Student Response immutable and
everything downstream derived. If the question a response refers to can be silently rewritten, that
immutability is worthless — the response survives, but what it *means* has changed underneath it, and
every piece of evidence derived from it becomes unsound without anything looking wrong.

**Consequences to honour when this is eventually built:**

- A response references a **version**, not just an asset.
- An asset that has never produced a response may be edited freely; the moment it has, edits fork a
  new version.
- Whether a fork also re-points live Activities at the new version is a **product** decision, not
  settled here.

---

## 4. Relationship · Enrollment · Assignment — three separate things

> **Status: DECIDED** — that they are separate, and (2026-08-29) that the direct teacher–student
> relationship is first-class. Program **distribution authorization** is RECOMMENDED but not frozen
> (§4.5).

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

**Owner ruling, 2026-08-29 — DECIDED:**

- The **Teacher ↔ Student direct relationship is a first-class relationship, independent of Class.**
- **Class is optional grouping.** It is *not* the required container for a Student Home.
- A student may simultaneously be a teacher's direct student, a member of one or more Classes, and
  enrolled in one or more Programs. **None implies the others.**
- **A student may hold separate teaching relationships with several teachers**, concurrently.
- 🛑 **A relationship does not grant Program access.** Teaching someone is not entitling them.
  Access comes only from Enrollment (§4.2).

Reserved entity name for the future: **`teacher_student_relationships`**. 🛑 Not built this round.

### 4.2 Enrollment — which Program a student may use

Enrollment is the **entitlement**. Without it a student cannot open a Program.

Enrollment is **per student**, not per class. A class may be a convenient way to grant it in bulk,
but the grant that matters is the one attached to the student — otherwise removing a student from a
class would silently revoke access to work they have already done.

🛑 **Enrollment is the only source of Program access.** Neither a direct relationship nor class
membership grants it (§4.1).

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

### 4.5 🟡 Program distribution authorization — RECOMMENDED, not frozen

> **Status: RECOMMENDED by the owner, awaiting final confirmation. 🛑 Do not treat as frozen and do
> not build against it yet.**

The recommended model, recorded verbatim in substance:

1. **Owner / Admin creates Programs.**
2. A **Teacher may grant a Program only if that Teacher has permission to distribute or use that
   Program.**
3. A **Teacher may enrol only students they legitimately teach** — through a direct relationship
   (§4.1) or a Class they manage.

Rule 2 implies a further entity that does not exist yet: something recording *which teacher may
distribute which Program*. Rule 3 is the point at which the direct relationship becomes load-bearing
for authorization, not merely for display.

🛑 This decides an RLS policy, so it must be frozen by the owner before `enrollment` is designed.

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

### 5.4 Not everything is a taxonomy node

> **Status: DECIDED (owner ruling, 2026-08-29).**

The four-level hierarchy is **not** the only way the model classifies things. Some facts are
**orthogonal dimensions**, and forcing them into Domain → Category → Skill → Micro-skill would be a
modelling error, not a completeness win.

| Kind of fact | Where it belongs |
|---|---|
| A competency a learner can develop | The **hierarchy** — a Skill or Micro-skill |
| A property of a piece of content | **Content metadata** — e.g. a word's 教育部 level, an item's difficulty |
| A property of a *learner × content* pair | **A mastery dimension** — e.g. recognition vs production |

Vocabulary (§7) is the worked example. 🛑 When something does not fit the hierarchy, check which of
these three it is **before** concluding the taxonomy is incomplete.

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

⚠️ An Activity's own skill tags are an **instructional target** (§10.1), so an Activity tagging a
skill its Lesson's objectives do not name is a signal that the objectives are incomplete — not that
the tag is wrong. Either way it changes no evidence, because evidence comes from question-level tags.

Proposed phrasing shape — **concept only, not a schema**:

> Students can **[observable action]** **[skill / content]** **[condition]** **[success criterion]**

---

## 7. Vocabulary — two orthogonal dimensions

> **Status: DECIDED (owner ruling, 2026-08-29).** This was previously recorded as an open modelling
> problem. It is not one.

> **Word Level and Recognition / Production are orthogonal dimensions, not taxonomy nodes.**
> 🛑 Do **not** force them into `Domain → Category → Skill → Micro-skill`.

### A. Word Level — metadata **of the word**

`MOE_1` · `MOE_2` · `MOE_3` · `MOE_4` · `MOE_5` · `MOE_6` · `BEYOND`

Levels 1–6 follow the **教育部字彙分級** and match the site's six existing vocabulary packs. This is a
**classification of the word itself**: intrinsic, the same for every learner, and unchanged by
anyone's progress.

### B. Recognition / Production — a mastery dimension of the **learner × word** pair

`Recognition` · `Production`

This is **not** a property of the word, and **not** a peer of the levels:

> A `MOE_4` word may be **recognition** vocabulary for one student and already at **production**
> mastery for another. The word's level does not change; the learner's relationship to it does.

### Where each lives

| | Word Level | Recognition / Production |
|---|---|---|
| Attached to | the **word** | the **learner–word pair** |
| Kind | content metadata | mastery dimension |
| Changes when | the 教育部 list is revised | the learner improves |
| Field | `word_level` | a mastery dimension, not a taxonomy node |

Vocabulary may **still** have real Skills in the hierarchy — word formation, collocation, meaning in
context and so on. Those remain **PROVISIONAL** (§9); nothing above pre-empts them. The point of this
ruling is narrower: **these two dimensions are not among them.**

### 7.1 🛑 Naming — `level` is banned as a generic field name

> **Status: DECIDED (owner ruling, 2026-08-29).**

"Level" was being used for four unrelated things. Each now has its own name, and the generic word is
not to be used for any of them:

| Concept | Field | Values |
|---|---|---|
| 教育部 vocabulary band | **`word_level`** | `MOE_1` … `MOE_6`, `BEYOND` |
| Content or item difficulty | **`difficulty`** | — |
| CEFR level | **`cefr_level`** | — |
| The student's school year | **`grade`** | — |

🛑 **Never a bare `level` column, prop, or parameter.** A generic `level` is how these four silently
merge into one another.

⚠️ Note the collision that already exists in Production: `user_profiles.grade` holds the school year
(國一…高三, 重考), matching row 4 above — but the vocabulary system's client-side SRS also speaks of
"level" for 教育部 bands. New `/learn` code uses the names in this table; the existing columns are
not renamed by this document.

---

## 8. Grammar taxonomy — owner-defined, use verbatim

> **Status: DECIDED at Category and Skill level** — 10 Categories · **51 Skills**, each with a stable
> code. **Micro-skill: PROVISIONAL / CANDIDATE** — 234 candidates supplied, not yet frozen (§8.13).
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
| `Skill_Taxonomy` | **234 Micro-skill candidates**, each with a code, its parent Skill, source ticks and suggested stage — §8.13 |
| `高中原始對照` | 182 senior-high source topics mapped to canonical Category + Skill, each with an Action |
| `國中目錄對照` | 92 junior-high 會考 syllabus headings, mapped the same way |
| `待審核` | **CLOSED** — no pending decisions remain |
| `最新版修正` | The 7 renames from the previous draft to this one |
| `Owner_Decisions` | **OD-01 … OD-05**, the binding tagging rules (§8.12) |

`Skill_Summary.csv` (51 rows) and `Skill_Taxonomy.csv` (234 rows) alongside it are **generated,
greppable extracts**, kept so the taxonomy is diffable in git. 🛑 They are convenience copies, **not**
seed data and **not** for import. If either disagrees with the spreadsheet, the spreadsheet is right.
Both are regenerated from the workbook, never hand-edited.

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

### 8.13 Micro-skill — PROVISIONAL / CANDIDATE

> **Status: 🟡 PROVISIONAL / CANDIDATE.** The complete candidate list exists — **234 Micro-skills**
> in the `Skill_Taxonomy` sheet — but the owner has **not frozen them item by item**.

🛑 **Do not mark the 234 as DECIDED.** They are a candidate set: usable as the working taxonomy,
subject to change until the owner freezes them.

Coverage, computed from the workbook:

| Category | Micro-skills | | Category | Micro-skills |
|---|---|---|---|---|
| G1 | 37 | | G6 | 17 |
| G2 | 23 | | G7 | 24 |
| G3 | 37 | | G8 | 21 |
| G4 | 14 | | G9 | 12 |
| G5 | 24 | | G10 | 25 |
| | | | **Total** | **234** |

**All 51 Skills have at least one Micro-skill.** There are no gaps in the parent coverage.

Micro-skill codes extend the Skill code with a two-digit suffix — `GRAM_G1_SENT_PAT_01`,
`GRAM_G1_ADJ_CLAUSE_03`. As with Skills (§8.3), **the code is the identity**, not the Chinese label.

**What PROVISIONAL means in practice:**

- ✅ Tag questions at Micro-skill level where a candidate fits.
- ✅ Build against the four-level structure — it is real, not hypothetical.
- 🛑 Do **not** treat a Micro-skill code as permanent for reporting or entitlement until frozen.
- 🛑 Do **not** invent Micro-skills outside the candidate list.

> ⚠️ **Correction to the previous revision of this document.** It recorded the Micro-skill level as
> empty and listed it as BLOCKED. That was true of the *file* — the earlier export produced a
> corrupted sheet containing only a repeated header — but **not** of the taxonomy. The owner had
> supplied it all along. The repaired workbook (2026-08-29) replaces it, and the BLOCKED entry is
> **withdrawn**.

### 8.14 `GRAM_G1_ADJ_CLAUSE` — an owner-defined conceptual Skill

> **Status: DECIDED (owner ruling, 2026-08-29). Not a blocker.**

I previously flagged that this Skill has **zero source records** in both the junior- and senior-high
materials, because every adjective-clause item in them was filed under the relative-clause topics
that became G7.

**The owner's ruling:**

> **G1 → Adjective Clauses** represents the teaching competency of *clause type and clause function*.
> **G7 → Relative Clauses** represents the complete, in-depth *Relative Clause + Relative Words*
> system. **The two are permitted to overlap conceptually.**
>
> **Provenance landing entirely in G7 does not mean G1's Adjective Clause must be deleted.**
> `GRAM_G1_ADJ_CLAUSE` stands as an **owner-defined conceptual Skill**.

It has three Micro-skill candidates of its own — 形容詞子句的功能 · 形容詞子句修飾名詞 ·
形容詞子句辨識 — which is what a *function-level* competency looks like, distinct from G7's
structural treatment.

**If richer provenance is wanted later,** the source material may be cross-referenced to G1 in
addition to G7. 🛑 **Do not modify the source mapping this round**, and do not "fix" the zero count.

> The general principle, worth stating once: **a taxonomy node is justified by the competency it
> names, not by how much source material happens to sit under it.** Source counts measure coverage of
> the existing materials, not whether a skill deserves to exist.

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

> ✅ **Grammar is the exception.** Its 10 Categories and 51 Skills are **decided**; its 234
> Micro-skills are **PROVISIONAL / CANDIDATE** — supplied in full, not yet frozen item by item.
> See §8 and the spreadsheet.

⚠️ **Speaking → Grammar** and **Writing → Grammar & Sentence Structure** are *assessment criteria*
within a performance rubric. Whether they reference the Grammar Domain's Skills or are separate
rubric dimensions remains **BLOCKED / PROVISIONAL** (§14.4).

🛑 **One constraint is DECIDED regardless (owner ruling, 2026-08-29):**

> **A Speaking or Writing rubric's Grammar score must never be treated as Grammar Domain mastery.**
> Only evidence that can be resolved to a **specific Grammar Skill** may update that skill's mastery.

A holistic "grammar: 4/5" on an essay identifies no skill. Feeding it into the Grammar Domain would
manufacture mastery the evidence does not support — and would do so invisibly, since the number looks
authoritative. Rubric scores stay rubric scores until something can say *which* grammar.

---

## 10. Question tagging — Primary and Secondary Skill

> **Status: DECIDED**, including the two-kinds-of-tag rule settled on 2026-08-29 (§10.1).

### 10.1 Two kinds of skill tag — they mean different things

> **Status: DECIDED (owner ruling, 2026-08-29).**

| Tag on | Means | Is |
|---|---|---|
| **Lesson / Activity** | *what this content intends to teach* | an **instructional target** |
| **Question / assessable item** | *what this item actually measures* | a **measured skill** |

> 🛑 **Skill Evidence is derived primarily from question / assessable-item tags.**
>
> 🛑 **An Activity tagged with a Skill does NOT make every response inside it evidence for that
> Skill.**

The distinction is what keeps the competency axis honest. A vocabulary Activity tagged
`Reading → Inference` as its teaching intent does not turn twenty spelling responses into inference
evidence. Intent drives **recommendation and reporting**; measurement drives **evidence**.

This also settles what was previously an open question: the two tag sets do not compete, because they
answer different questions. Neither "wins" — they are not the same claim.

### 10.2 Primary and Secondary

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
   ⚠️ Grammar Micro-skills are **candidates, not frozen** (§8.13) — tagging at that level is fine,
   but a code is not yet permanent for reporting or entitlement.

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
| **Skill Evidence** | That response interpreted *against a skill*: which skill, correct or not, how strong, primary or secondary. 🛑 Derived from the **question / assessable-item** tags, not the Activity's (§10.1) | **Derived and re-derivable.** If tagging changes, evidence is recomputed from responses |
| **User Skill Mastery** | The current estimate of a learner's command of one skill | **Never authored.** Always computed from evidence |

🛑 **Two rules constrain this flow, both DECIDED (2026-08-29):**

1. **Evidence follows the measured skill, not the instructional target** (§10.1). An Activity's tags
   never convert its responses into evidence wholesale.
2. **A rubric score that resolves to no specific Skill updates no Skill** (§9). This applies to
   Speaking and Writing rubric grammar scores in particular.

**The load-bearing property is that responses are immutable while everything downstream is
derived.** Taxonomies get revised; questions get re-tagged; scoring models improve. If mastery were
stored as the only truth, every such change would silently corrupt history. Keeping raw responses
means the entire competency picture can be rebuilt from scratch.

🛑 **BLOCKED — not decided, do not invent:** the mastery scale, decay over time, how many
observations constitute mastery, how `difficulty` weights evidence, primary vs secondary weighting,
and how Micro-skill evidence rolls up into Skill.

⚠️ A response must reference the **exact asset version** it was answered against (§3.1). Without
that, re-deriving evidence after a content edit silently produces the wrong answer.

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
>
> 🛑 **Naming, per §7.1:** `word_level` · `difficulty` · `cefr_level` · `grade`. **Never a bare
> `level`.**

### 13.1 Content axis

| Entity | Responsibility | Relationships |
|---|---|---|
| `program` | A learning product authored by the platform owner | has many `module` |
| `module` | A themed / staged group of lessons | belongs to `program`; has many `lesson` |
| `lesson` | A complete learning unit with shared objectives | belongs to `module`; has many `activity`, many `learning_objective` |
| `activity` | The smallest evidence-producing teaching activity | belongs to `lesson`; references `content_asset`; tagged to `skill` |
| `content_asset` | Reusable content, outside the hierarchy | referenced by many `activity`; owned by no program |
| `content_asset_version` | An immutable snapshot of an asset's content. 🛑 Required by §3.1 — a version with evidence is never overwritten | belongs to `content_asset`; referenced by `student_response` |
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
| `teacher_student_relationships` 🆕 | **Direct** teacher ↔ student relationship, independent of any class. First-class (§4.1); grants **no** Program access; a student may hold several concurrently | teacher ↔ student. 🛑 **Does not exist yet — §14.1** |
| `program_distribution_right` 🆕 | Which teacher may distribute or use which Program | teacher ↔ `program`. 🛑 **Shape follows §4.5, which is RECOMMENDED, not frozen** |
| `enrollment` 🆕 | A student's entitlement to one Program | student ↔ `program`, with granting teacher and state |
| `assignment` 🆕 | Teacher's instruction: what, for whom, by when | targets a student or class; points at `lesson` / `activity` |
| `assignment_target` 🆕 | Resolves a class-level assignment to individual students | joins `assignment` ↔ student |
| `activity_progress` 🆕 | Derived per-student, per-activity progress | student ↔ `activity` |
| `student_response` 🆕 | **Immutable** record of what a student actually did | student ↔ `activity`; 🛑 references the exact `content_asset_version` answered (§3.1) |
| `skill_evidence` 🆕 | A response interpreted against a skill; re-derivable. 🛑 Derived from **question-level** tags, never from an Activity's instructional target (§10.1) | derived from `student_response`, references `skill` |
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

## 14. Open items and how they were ruled

> The owner ruled on eight of these on **2026-08-29**. What follows records **which are closed, which
> remain open, and what each ruling actually constrains** — a resolved item is kept rather than
> deleted, because the reasoning is what stops it being re-litigated.

### ✅ Resolved by owner ruling

#### 14.1 🔴 The deployed Identity Spine cannot represent a direct teacher–student relationship

**Product question — RESOLVED. Schema gap — still open.**

> **Ruling:** the direct Teacher ↔ Student relationship is **first-class and independent of Class**.
> A one-to-one student must never be forced into a class of one. A student may hold concurrent
> relationships with several teachers. 🛑 **A relationship grants no Program access.**

Recorded in §4.1. The reserved entity name is **`teacher_student_relationships`**.

⚠️ **The implementation gap is unchanged and is now a decided requirement, not an open question.**
The Identity Spine deployed on 2026-08-28 has exactly one membership mechanism,
`learn.class_members`, which requires a `learn.classes` row. The additive `user_profiles` policy
shipped as **D2** grants a teacher sight of a student's `display_name` **only through active
membership of an active class they own**. So today:

> **A direct student with no class is invisible to their own teacher** — the teacher sees a uuid.

**Resolution shape (not built, not approved):** the `teacher_student_relationships` table plus a
**second** additive `user_profiles` SELECT policy scoped to a confirmed direct relationship. The
existing guardian policy is the exact precedent — it already grants profile visibility through a
**person-to-person** link with no class involved. 🛑 Requires its own owner approval, and follows the
staged process the spine used.

#### 14.3 ✅ Vocabulary dimensions — not a modelling problem

> **Ruling:** Word Level and Recognition / Production are **orthogonal dimensions, not taxonomy
> nodes**. 🛑 Do not force them into Domain → Category → Skill → Micro-skill.

I had recorded this as a blocker. It was not one — it was me assuming the hierarchy had to absorb
everything. Word Level is **metadata of the word**; Recognition / Production is a **mastery dimension
of the learner × word pair**. Neither is a competency.

Generalised into §5.4, so the same mistake is not repeated for another domain: when something does
not fit the hierarchy, first ask whether it is a competency, content metadata, or a learner × content
fact. Full detail in §7.

#### 14.5 ✅ Activity tags vs question tags — they answer different questions

> **Ruling:** Lesson / Activity tags are the **instructional target** (what this intends to teach).
> Question / assessable-item tags are the **measured skill** (what this item actually tests). Skill
> Evidence derives primarily from the **question-level** tags. 🛑 An Activity tagged with a Skill does
> **not** make every response inside it evidence for that Skill. Primary / Secondary rules still apply.

My earlier framing asked "which wins" — the wrong question, because the two are not competing claims
about the same thing. Recorded in §10.1, with the constraint restated in §11.

#### 14.6 ✅ Content Asset versioning — evidence freezes a version

> **Ruling:** once a Content Asset version has produced a Student Response or Skill Evidence, that
> version must **not** be destructively overwritten. Content changes create a **new version**, and
> every historical response must be able to point back at the **exact version** the student answered.

Recorded in §3.1. 🛑 Architecture principle only — no version table this round.

#### 14.7 ✅ `level` is banned as a generic name

> **Ruling:** `word_level` (`MOE_1` … `MOE_6`, `BEYOND`) · `difficulty` · `cefr_level` · `grade`.
> 🛑 Never a bare `level`.

Recorded in §7.1 and in §13's preamble.

#### 14.8 ✅ Speaking / Writing rubric grammar — a constraint, even while blocked

> **Ruling:** a Speaking or Writing rubric's Grammar score **must never be treated as Grammar Domain
> mastery**. Only evidence resolvable to a **specific Grammar Skill** may update that skill.

The larger taxonomy question stays blocked (§14.4 below), but this constraint holds regardless and is
recorded in §9 and §11.

#### 14.9 ✅ Grammar Micro-skills — WITHDRAWN as a blocker

> **Ruling / correction, 2026-08-29:** the Micro-skill level was **never missing**. The earlier
> workbook export was corrupted — its `Skill_Taxonomy` sheet contained only a repeated header. The
> repaired workbook carries **234 Micro-skill candidates** covering all 51 Skills.

Status is now **PROVISIONAL / CANDIDATE**, not BLOCKED: the list is complete, the owner has not
frozen it item by item. Recorded in §8.13. 🛑 Do not mark the 234 as DECIDED, and do not invent
Micro-skills outside the list.

**Worth keeping as a lesson:** I reported an empty sheet, which was accurate about the *file* and
wrong about the *taxonomy* — and I turned that file-level observation into a BLOCKED decision, which
was a bigger claim than the evidence supported. An artefact being broken is not the same as a
decision being unmade. The report was right; the conclusion drawn from it was not.

#### 14.11 ✅ `GRAM_G1_ADJ_CLAUSE` zero source records — not a blocker

> **Ruling:** G1 → Adjective Clauses is the *clause type / clause function* competency; G7 → Relative
> Clauses is the complete relative system. They may overlap. Provenance landing entirely in G7 does
> **not** require deleting G1's Adjective Clause, which stands as an **owner-defined conceptual
> Skill**.

Recorded in §8.14, together with the general principle it implies: a taxonomy node is justified by
the competency it names, not by how much source material sits under it. 🛑 Source mapping is **not**
to be modified this round; cross-referencing to G1 is a possible future refinement, not a task.

---

### 🟡 Recommended, not frozen

#### 14.2 Program distribution authorization

> **Recommended model (owner, not yet frozen):** Owner/Admin creates Programs · a Teacher may grant a
> Program only if that Teacher has permission to distribute or use it · a Teacher may enrol only
> students they legitimately teach, through a direct relationship or a Class they manage.

Recorded in §4.5. 🛑 **Do not freeze it, and do not build against it.** It decides an RLS policy and
implies an entity (`program_distribution_right`) that does not exist. Owner confirmation required
before `enrollment` is designed.

---

### 🛑 Still blocked

#### 14.4 Speaking / Writing rubric dimensions vs Grammar Domain Skills

`Speaking → Grammar` and `Writing → Grammar & Sentence Structure` are rubric criteria. Whether they
reference Grammar Domain Skills or are independent rubric dimensions is **undecided**, and both
taxonomies are still PROVISIONAL. The §14.8 constraint applies meanwhile. 🛑 No answer invented.

#### 14.10 Guardian access rules

`learn.guardian_links` is deployed and working, but nothing states what a guardian may see of a
child's assignments, progress, or evidence. 🛑 **Explicitly out of scope this round.** No access
rules invented.

---

## 15. Status summary

### ✅ DECIDED

**Content axis**

- Program → Module → Lesson → Activity, with the definitions in §2
- Module is **not** a week
- Content Asset sits **outside** the hierarchy and is reusable
- 🆕 **An asset version that has produced evidence is immutable**; changes fork a new version, and
  responses point at the exact version answered (§3.1)

**People and access**

- Relationship · Enrollment · Assignment are **three separate concepts**; Progress is derived
- 🆕 **Teacher ↔ Student direct relationship is first-class and independent of Class**; a student may
  hold several concurrently; **a relationship grants no Program access** (§4.1)
- A one-to-one student is **never** forced into a class of one; **Class is optional grouping**
- **Enrollment is the only source of Program access**

**Competency axis**

- Structure: Domain → Category → Skill → Micro-skill
- Skills are **program-independent**; no 國中/高中/學測 forks
- Categories **need not be mutually exclusive**; overlap is resolved by tagging
- 🆕 **Not everything is a taxonomy node** — competency vs content metadata vs learner × content
  mastery dimension (§5.4)
- Learning Objective ≠ Skill; `Lesson → Learning Objectives → Skills`
- The seven Domains

**Grammar**

- **Ten Categories (G1–G10) and 51 Skills with stable codes — frozen, verbatim.** Detailed source of
  truth: `docs/learn/grammar-taxonomy/Grammar_Skill_Taxonomy_v1.xlsx`
- Skill **code** is the identity, not the display name
- G3 uses **語態**, never 體 / Aspect; all twelve forms are 時態. Passive voice is G3, **not** G4
- G8 is 「不定詞、動名詞與分詞」, **never** 「非限定動詞」; G6 is 「介係詞與連接詞」
- G1 Adjective Clause and G7 Relative Clause **both stand**; §8.9 governs
- 🆕 **`GRAM_G1_ADJ_CLAUSE` is an owner-defined conceptual Skill** — zero source records is not a
  defect, and a node is justified by the competency it names, not by its provenance count (§8.14)
- Indirect Questions (間接問句) and Reported Speech (間接引語) are **separate Skills**;
  「間接引句」 is **forbidden**
- **Owner Decisions OD-01 … OD-05** are binding tagging rules, including *do not dual-tag by default*

**Vocabulary**

- 🆕 Word Level and Recognition / Production are **orthogonal dimensions, not taxonomy nodes** (§7)
- 🆕 Word Level is **metadata of the word**; Recognition / Production is a **learner × word** mastery
  dimension

**Tagging and evidence**

- 🆕 **Lesson / Activity tags = instructional target; question tags = measured skill** (§10.1)
- 🆕 **Evidence derives from question-level tags**; an Activity's tag does not convert its responses
  wholesale
- Exactly one Primary Skill per question, optional Secondary
- Evidence flow: Student Response → Skill Evidence → User Skill Mastery, responses immutable
- 🆕 **A rubric score resolvable to no specific Skill updates no Skill** (§9)

**Naming**

- 🆕 `word_level` (`MOE_1`…`MOE_6`, `BEYOND`) · `difficulty` · `cefr_level` · `grade`.
  🛑 **Never a bare `level`** (§7.1)

### 🟡 PROVISIONAL / RECOMMENDED — do not freeze, do not build against

- **Program distribution authorization** — the recommended model in §4.5 awaits owner confirmation
- Reading · Listening · Speaking · Writing first-level lists (§9)
- Vocabulary's **Skill** level — real vocabulary competencies are still undesigned (§7)
- Grammar **Micro-skill** level — **234 candidates supplied, covering all 51 Skills**, not yet frozen
  item by item (§8.13). ✅ Usable for tagging · 🛑 not DECIDED, and do not invent additions
- Learning Objective phrasing format (§6)

### 🛑 BLOCKED — needs an owner decision before the work starts

| # | Blocked item | Blocks |
|---|---|---|
| 1 | **Exam / Academic Skills taxonomy** — owner still designing | that Domain entirely |
| 2 | **Mastery algorithm** — scale, decay, thresholds, weighting, roll-up (§11) | `user_skill_mastery` |
| 3 | **Speaking / Writing rubric ↔ Grammar Skills** (§14.4) | those two domains' scoring |
| 4 | **Guardian access rules** (§14.10) | any parent-facing view |
| 5 | Reconciling the **two existing vocabulary mastery models** (9.10, `docs/BACKLOG.md`) | Vocabulary competency |

> **Down from ten to five.** Four were closed by the first 2026-08-29 ruling (direct relationship,
> vocabulary dimensions, tag precedence, asset versioning) and naming was settled outright; the
> Grammar Micro-skill entry was then **withdrawn** — it was never blocked, only mis-exported. The
> `teacher_student_relationships` schema gap is a **decided requirement awaiting its own
> deployment**, not a blocked decision.

---

## 16. This round produced no code

No table, no migration, no seed data, no frontend, no schema exposure, no Production change, no
change to the deployed Identity Spine, nothing touching the shared LMS/Writing tables, and no
security audit. This document only.
