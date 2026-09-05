import csv, json, io, os

BASE = "docs/learn/writing-taxonomy"

def rows(name):
    with open(os.path.join(BASE, name), newline="", encoding="utf-8") as f:
        return list(csv.DictReader(f))

def ts(s):
    return json.dumps(s, ensure_ascii=False)

cats = rows("Category_Summary.csv")
skills = rows("Skill_Taxonomy.csv")
errs = rows("Error_Taxonomy.csv")
feats = rows("High_Score_Features.csv")
subs = rows("High_Score_Subskills.csv")

out = []
w = out.append

w("""/**
 * 寫作分類法 —— 唯一真實來源（canonical taxonomy）
 *
 * 由 docs/learn/writing-taxonomy/*.csv 產生，請勿手改。
 * 產生器：scripts/generate-writing-taxonomy.py
 *
 * 這個檔案同時被前端（報告 UI）與 api/analyze-writing.ts（DeepSeek 分析）使用，
 * 所以只用純 TypeScript，不 import 任何東西、不使用 `@/` alias
 * （Vercel serverless function 沒有 Vite 的 path alias）。
 *
 * ⚠️ 為什麼放在 api/_lib/ 而不是 src/lib/：
 *    Vercel 的 Node builder 打包 serverless function 時，import 到 api/ 目錄
 *    外面會讓 function 在【載入階段】就崩潰（FUNCTION_INVOCATION_FAILED，
 *    連第一行程式都沒跑到）。2026-09-05 在 Preview 上實測確認。
 *    因此共用模組的唯一真實來源放在 api/_lib/，前端透過
 *    src/lib/writing/ 的 re-export 使用。反過來不行。
 *
 * TR-19：code 是 stable opaque identifier，禁止用字串解析推導所屬 Category，
 * 一律透過這裡的 relationship 取得。
 */

export const WRITING_TAXONOMY_VERSION = "writing-v1";
""")

# ---- competency ----
w("/* ──────────────── Axis 1：Writing Competency（W1–W5 / 23 skills） ──────────────── */\n")
w("export interface CompetencySkill {\n  readonly code: string;\n  readonly zh: string;\n  readonly en: string;\n  readonly categoryCode: string;\n}\n")
w("export interface CompetencyCategory {\n  readonly code: string;\n  readonly zh: string;\n  readonly en: string;\n  readonly definition: string;\n  readonly skills: readonly CompetencySkill[];\n}\n")
w("export const COMPETENCY_CATEGORIES: readonly CompetencyCategory[] = [")
for c in cats:
    cc = c["Category Code"]
    w("  {")
    w(f"    code: {ts(cc)},")
    w(f"    zh: {ts(c['Category 中文'])},")
    w(f"    en: {ts(c['Category English'])},")
    w(f"    definition: {ts(c['定義'])},")
    w("    skills: [")
    for s in skills:
        if s["Category Code"] != cc:
            continue
        w("      {")
        w(f"        code: {ts(s['Skill Code'])},")
        w(f"        zh: {ts(s['Skill 中文'])},")
        w(f"        en: {ts(s['Skill English'])},")
        w(f"        categoryCode: {ts(cc)},")
        w("      },")
    w("    ],")
    w("  },")
w("] as const;\n")

# ---- errors ----
w("/* ──────────────── Axis 2：Writing Error（16 codes） ──────────────── */\n")
w("export interface ErrorTag {\n  readonly code: string;\n  readonly zh: string;\n  readonly en: string;\n  /** 掛回 Axis 1 的 Primary Writing Skill；WRITE_ERR_THAT 依句法複雜度有兩種可能 */\n  readonly primarySkills: readonly string[];\n}\n")
w("export const ERROR_TAGS: readonly ErrorTag[] = [")
for e in errs:
    prim = [p.strip() for p in e["Primary Writing Skill"].split("/")]
    w("  {")
    w(f"    code: {ts(e['Error Code'])},")
    w(f"    zh: {ts(e['錯誤中文'])},")
    w(f"    en: {ts(e['Error English'])},")
    w(f"    primarySkills: {ts(prim)},")
    w("  },")
w("] as const;\n")

# ---- hsf ----
w("/* ──────────────── Axis 3：High-Score Feature（H1–H5 / 29 features） ──────────────── */\n")
w("export interface HighScoreFeature {\n  readonly id: string;\n  readonly code: string;\n  readonly zh: string;\n  readonly en: string;\n  readonly categoryCode: string;\n  /** Effective / Boundary Rule —— TR-06 的判準，會原文帶進 DeepSeek prompt */\n  readonly boundaryRule: string;\n}\n")
w("export interface HighScoreCategory {\n  readonly code: string;\n  readonly zh: string;\n  readonly en: string;\n  readonly features: readonly HighScoreFeature[];\n}\n")
seen = []
for f in feats:
    if f["High-Score Category Code"] not in seen:
        seen.append(f["High-Score Category Code"])
w("export const HIGH_SCORE_CATEGORIES: readonly HighScoreCategory[] = [")
for hc in seen:
    grp = [f for f in feats if f["High-Score Category Code"] == hc]
    w("  {")
    w(f"    code: {ts(hc)},")
    w(f"    zh: {ts(grp[0]['Category 中文'])},")
    w(f"    en: {ts(grp[0]['Category English'])},")
    w("    features: [")
    for f in grp:
        w("      {")
        w(f"        id: {ts(f['Feature ID'])},")
        w(f"        code: {ts(f['Feature Code'])},")
        w(f"        zh: {ts(f['主技巧'])},")
        w(f"        en: {ts(f['Feature English'])},")
        w(f"        categoryCode: {ts(hc)},")
        w(f"        boundaryRule: {ts(f['Effective / Boundary Rule'])},")
        w("      },")
    w("    ],")
    w("  },")
w("] as const;\n")

# ---- subskills ----
w("""/**
 * Sub-skill 是 detection criteria / subtype，不是 taxonomy node（TR-07 / TR-20），
 * CSV 標記為 Visibility = OWNER_ONLY。這裡只提供顯示標籤：
 * 學生端的矩陣節點永遠是上面 29 個 Feature，sub-skill 只在詳情裡當佐證文字出現。
 * 因為它不是 canonical node，所以【不】納入完整覆蓋驗證。
 */""")
w("export interface HighScoreSubskill {\n  readonly code: string;\n  readonly zh: string;\n  readonly featureCode: string;\n}\n")
w("export const HIGH_SCORE_SUBSKILLS: readonly HighScoreSubskill[] = [")
for s in subs:
    w("  {")
    w(f"    code: {ts(s['Sub-skill Code'])},")
    w(f"    zh: {ts(s['Sub-skill 中文 / Display Label'])},")
    w(f"    featureCode: {ts(s['Parent Feature Code'])},")
    w("  },")
w("] as const;\n")

w("""/* ──────────────── 展開後的查表結構 ──────────────── */

export const COMPETENCY_SKILLS: readonly CompetencySkill[] =
  COMPETENCY_CATEGORIES.flatMap((c) => c.skills);

export const HIGH_SCORE_FEATURES: readonly HighScoreFeature[] =
  HIGH_SCORE_CATEGORIES.flatMap((c) => c.features);

/** 完整覆蓋驗證用的 canonical code 清單。順序即 prompt 內的列舉順序。 */
export const ALL_COMPETENCY_SKILL_CODES: readonly string[] =
  COMPETENCY_SKILLS.map((s) => s.code);

export const ALL_ERROR_CODES: readonly string[] = ERROR_TAGS.map((e) => e.code);

export const ALL_HIGH_SCORE_FEATURE_CODES: readonly string[] =
  HIGH_SCORE_FEATURES.map((f) => f.code);

const byCode = <T extends { code: string }>(items: readonly T[]) =>
  new Map(items.map((i) => [i.code, i]));

export const COMPETENCY_SKILL_BY_CODE = byCode(COMPETENCY_SKILLS);
export const COMPETENCY_CATEGORY_BY_CODE = byCode(COMPETENCY_CATEGORIES);
export const ERROR_TAG_BY_CODE = byCode(ERROR_TAGS);
export const HIGH_SCORE_FEATURE_BY_CODE = byCode(HIGH_SCORE_FEATURES);
export const HIGH_SCORE_CATEGORY_BY_CODE = byCode(HIGH_SCORE_CATEGORIES);

export const HIGH_SCORE_SUBSKILL_BY_CODE = byCode(HIGH_SCORE_SUBSKILLS);
""")

with open("api/_lib/taxonomy.ts", "w", encoding="utf-8") as fh:
    fh.write("\n".join(out).replace("\n\n\n", "\n\n") + "\n")

print("skills", len(skills), "errors", len(errs), "features", len(feats), "subskills", len(subs), "categories", len(cats))
