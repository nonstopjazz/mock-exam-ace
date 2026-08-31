# Teaching Block Types v1

> **Written:** 2026-08-31 · **Status:** ✅ **DECIDED v1 — 18 Block Types**
>
> 🟡 **DOCUMENTATION ONLY.** No table, no schema, no migration, no API, no component, no frontend.
> 🛑 **The database implementation is deliberately NOT decided** — see §4.

---

## 1. What a Teaching Block is

> A **Teaching Block** is one **main teaching segment a teacher actually runs inside a Lesson**.

It is a **product / lesson-composition** concept — how a teacher thinks about the shape of a class.

🛑 **A Teaching Block is not:**

| Not a | Because |
|---|---|
| **Skill** | Skills are the competency axis (`docs/learn/LEARNING_DOMAIN_MODEL.md` §5). A Block is a segment of teaching time |
| **Domain** | 🛑 In particular, *Translation Practice* being a Block does **not** create a Translation Domain. The seven Domains are unchanged |
| **Content Asset** | Assets are what a Block uses, not what it is (§3 of the domain model) |
| **A new level of `Program → Module → Lesson → Activity`** | 🛑 It does **not** slot into that hierarchy — see §2 |

---

## 2. 🛑 Relationship to the existing content hierarchy

The decided content axis is unchanged:

```
Program → Module → Lesson → Activity
```

**A Teaching Block describes how a Lesson is composed in teaching terms.** It is a *lens on* a
Lesson, not a new tier inside it. 🛑 Do not rewrite the hierarchy as
`Program → Module → Lesson → Teaching Block → Activity` — that decision has not been made, and §4
explains why it is being left open on purpose.

**Principles — all DECIDED:**

| | |
|---|---|
| One Lesson may contain **several** Teaching Blocks | |
| A real class does **not** use every Block Type every time | 🛑 The list is a vocabulary, not a checklist |
| Different Programs may favour different Block combinations | 國中英文 and 學測英文 will not look alike |
| **Teaching Block Type ≠ Skill** | A Block may develop several Skills; a Skill appears in several Blocks |

---

## 3. The 18 Block Types — DECIDED v1

| # | Block Type |
|---|---|
| 1 | Translation Practice |
| 2 | Question Review |
| 3 | Textbook Vocabulary & Grammar |
| 4 | Reading Practice / Extensive Reading |
| 5 | Writing Feedback |
| 6 | Writing Skill Instruction |
| 7 | Vocabulary Instruction |
| 8 | Speaking Practice & Feedback |
| 9 | Listening Practice |
| 10 | Grammar Instruction |
| 11 | Reading Skill Instruction |
| 12 | Writing Production / Guided Writing |
| 13 | Pronunciation & Fluency Practice |
| 14 | Discussion / Debate / Presentation |
| 15 | Assessment / Timed Practice |
| 16 | Review & Consolidation |
| 17 | Learning Strategy / Error Analysis |
| 18 | Project / Task-based Learning |

✅ **Types 14 and 18 are reserved deliberately**, even though the first release may not implement
them. Naming them now costs nothing; discovering later that the vocabulary has no word for
"presentation" costs a schema change.

---

## 4. 🛑 Implementation is deliberately undecided

> **A Teaching Block may eventually be its own entity, or it may be expressed as a grouping of
> Activities, or as something else. 🛑 That decision is NOT being made now.**

Recording the *concept* is what unblocks lesson-planning design. Choosing the *storage* early would
commit the schema to a shape nobody has yet tested against real lesson plans.

**When the time comes, the candidate approaches are at least:** a first-class `teaching_block`
entity · a grouping attribute on `Activity` · a lesson-level ordered structure. 🛑 No recommendation
is made here.

---

## 5. Progressive Complexity — the design rule that matters most

> **Start with the name and the order. Add structure only when something real needs it.**

🛑 **Do not design a Teaching Block with a dozen required fields.** Do not require a teacher to fill
in extensive metadata for every Block they run.

| ✅ v1 | 🛑 Not v1 |
|---|---|
| The Block Type · its position in the Lesson | Required Skills per Block |
| Optionally, a free-text note | Required Learning Objectives per Block |
| | Required assessment configuration |
| | Required evidence wiring |

Links to **Skills**, **Learning Objectives**, **Assessment** and **Evidence** are added **later, and
only where a real feature needs them.** A model that demands metadata a teacher has no reason to
supply gets filled with noise, and noisy structure is worse than no structure — it looks like data.

---

## 6. Scope of this document

**This round recorded:** the concept, its boundaries, the 18 types, and the Progressive Complexity
rule.

🛑 **This round did not:** create a table, change any schema, design fields, decide storage, build
anything, or alter the `Program → Module → Lesson → Activity` hierarchy.

**Related:** `docs/learn/LEARNING_DOMAIN_MODEL.md` (content and competency axes) ·
`docs/learn/content-factory/Digital_Content_Types_v1.md` (what a Block draws its material from).
