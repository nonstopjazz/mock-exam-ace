/**
 * 寫作分析資料契約的自我檢查
 *
 *   npm run verify:writing-contract
 *
 * 這個檔案存在的重點是最後幾個案例：模型漏回傳 canonical node 時，
 * 驗證必須失敗，而且【不得】產出任何被補成 UNMEASURED 的結果。
 * 「學生沒有表現出來」與「AI 忘了分析」永遠不可以互換。
 */

import {
  ALL_COMPETENCY_SKILL_CODES,
  ALL_ERROR_CODES,
  COMPETENCY_CATEGORIES,
  HIGH_SCORE_CATEGORIES,
} from "../src/lib/writing/taxonomy";
import {
  collectCitableRefs,
  validateCompetencyAnalysis,
  validateErrorAnalysis,
  validateHighScoreAnalysis,
  validateSynthesis,
  type PassValidation,
  type ValidationIssueKind,
} from "../src/lib/writing/analysisContract";

let passed = 0;
const failures: string[] = [];

function check(name: string, condition: boolean, detail = "") {
  if (condition) {
    passed += 1;
    console.log(`  PASS  ${name}`);
  } else {
    failures.push(`${name}${detail ? ` — ${detail}` : ""}`);
    console.log(`  FAIL  ${name}${detail ? ` — ${detail}` : ""}`);
  }
}

function expectIssue<T>(
  name: string,
  result: PassValidation<T>,
  kind: ValidationIssueKind,
  pathContains?: string,
) {
  if (result.ok) {
    check(name, false, "驗證竟然通過了");
    return;
  }
  const hit = result.issues.find(
    (i) => i.kind === kind && (!pathContains || i.path.includes(pathContains) || i.detail.includes(pathContains)),
  );
  check(name, Boolean(hit), hit ? "" : `收到：${result.issues.map((i) => `${i.kind}@${i.path}`).join(", ")}`);
}

/* ──────────────── Pass 1：Writing Competency ──────────────── */

const fullCompetency = () => ({
  categories: COMPETENCY_CATEGORIES.map((c) => ({
    code: c.code,
    summary: `${c.zh}的整體觀察`,
    skills: c.skills.map((s) => ({
      code: s.code,
      state: "ADEQUATE",
      reason: `${s.zh}：本篇有對應表現`,
      evidence: [{ quote: "Many students think the policy is unfair.", reason: "示例" }],
    })),
  })),
});

console.log("\nPass 1 — Writing Competency（全 23 個 skill）");

{
  const r = validateCompetencyAnalysis(fullCompetency());
  check("完整覆蓋通過驗證", r.ok);
  if (r.ok) {
    const codes = r.value.categories.flatMap((c) => c.skills.map((s) => s.code));
    check("回傳全部 23 個 skill", codes.length === ALL_COMPETENCY_SKILL_CODES.length, `${codes.length}`);
  }
}

{
  // 核心案例：模型漏掉一個節點
  const payload = fullCompetency();
  const dropped = payload.categories[1].skills.shift()!;
  const r = validateCompetencyAnalysis(payload);
  expectIssue("漏回傳 skill → MISSING_NODE（不得補成 UNMEASURED）", r, "MISSING_NODE", dropped.code);
  check("驗證失敗時不產出任何 value", !r.ok && !("value" in r));
}

{
  const payload = fullCompetency();
  payload.categories[0].skills[0].state = "UNMEASURED";
  payload.categories[0].skills[0].reason = "";
  expectIssue(
    "UNMEASURED 沒寫理由 → MISSING_REASON",
    validateCompetencyAnalysis(payload),
    "MISSING_REASON",
  );
}

{
  const payload = fullCompetency();
  payload.categories[0].skills[0].state = "UNMEASURED";
  payload.categories[0].skills[0].reason = "本篇題型沒有要求提出支持性論述";
  expectIssue(
    "UNMEASURED 卻附了證據 → UNEXPECTED_EVIDENCE",
    validateCompetencyAnalysis(payload),
    "UNEXPECTED_EVIDENCE",
  );
}

{
  const payload = fullCompetency();
  payload.categories[0].skills[0].state = "UNMEASURED";
  payload.categories[0].skills[0].reason = "本篇題型沒有要求提出支持性論述";
  payload.categories[0].skills[0].evidence = [];
  const r = validateCompetencyAnalysis(payload);
  check("UNMEASURED + 理由 + 無證據 = 合法的模型判斷", r.ok);
}

{
  const payload = fullCompetency();
  payload.categories[2].skills[0].code = "WRITE_NOT_A_REAL_SKILL";
  expectIssue("不在 taxonomy 內的 code → UNKNOWN_NODE", validateCompetencyAnalysis(payload), "UNKNOWN_NODE");
}

{
  const payload = fullCompetency();
  payload.categories[0].skills[1].state = "GOOD" as never;
  expectIssue("非法 state → INVALID_STATE", validateCompetencyAnalysis(payload), "INVALID_STATE");
}

/* ──────────────── Pass 2：Writing Error ──────────────── */

console.log("\nPass 2 — Writing Error（全 16 個 code）");

const fullError = () => ({
  findings: [
    {
      code: "WRITE_ERR_SV_AGREEMENT",
      quote: "Many student thinks the policy are unfair.",
      reason: "主詞 students 是複數，動詞要用 think。",
      correction: "Many students think the policy is unfair.",
      primary_skill: "WRITE_GRAMMAR_BASIC",
    },
  ],
  coverage: ALL_ERROR_CODES.map((code) => ({
    code,
    count: code === "WRITE_ERR_SV_AGREEMENT" ? 1 : 0,
  })),
});

{
  const r = validateErrorAnalysis(fullError());
  check("完整覆蓋通過驗證", r.ok);
  if (r.ok) {
    check("coverage 列出全部 16 個 code", r.value.coverage.length === 16, `${r.value.coverage.length}`);
    const zero = r.value.coverage.filter((c) => c.count === 0).length;
    check("count = 0 的 code 明確保留（本篇未發現此類錯誤）", zero === 15, `${zero}`);
  }
}

{
  const payload = fullError();
  const dropped = payload.coverage.pop()!;
  expectIssue(
    "coverage 漏一個 code → MISSING_NODE",
    validateErrorAnalysis(payload),
    "MISSING_NODE",
    dropped.code,
  );
}

{
  const payload = fullError();
  payload.coverage[0] = { ...payload.coverage[0], count: 3 };
  expectIssue("coverage 與 findings 對不上 → COUNT_MISMATCH", validateErrorAnalysis(payload), "COUNT_MISMATCH");
}

{
  const payload = fullError();
  payload.findings[0] = { ...payload.findings[0], correction: "" };
  expectIssue("錯誤沒有給修正 → MALFORMED", validateErrorAnalysis(payload), "MALFORMED");
}

/* ──────────────── Pass 3a / 3b：High-Score Feature ──────────────── */

console.log("\nPass 3a / 3b — High-Score Feature（H1–H3 共 17 個、H4–H5 共 12 個）");

const H1_H3 = ["H1", "H2", "H3"];
const H4_H5 = ["H4", "H5"];

const featuresOf = (cats: string[]) =>
  HIGH_SCORE_CATEGORIES.filter((c) => cats.includes(c.code)).flatMap((c) => c.features);

const fullHighScore = (cats: string[]) => ({
  features: featuresOf(cats).map((f) => ({
    code: f.code,
    quality: "UNMEASURED",
    reason: `${f.zh}：本篇沒有出現這個特徵`,
    instances: [] as unknown[],
  })),
});

{
  const r = validateHighScoreAnalysis(fullHighScore(H1_H3), H1_H3);
  check("3a 完整覆蓋通過驗證", r.ok);
  if (r.ok) check("3a 共 17 個 feature", r.value.features.length === 17, `${r.value.features.length}`);
}

{
  const r = validateHighScoreAnalysis(fullHighScore(H4_H5), H4_H5);
  check("3b 完整覆蓋通過驗證", r.ok);
  if (r.ok) check("3b 共 12 個 feature", r.value.features.length === 12, `${r.value.features.length}`);
}

{
  const payload = fullHighScore(H1_H3);
  const dropped = payload.features.pop()!;
  expectIssue(
    "3a 漏回傳 feature → MISSING_NODE（不得補成 UNMEASURED）",
    validateHighScoreAnalysis(payload, H1_H3),
    "MISSING_NODE",
    dropped.code,
  );
}

{
  // 3a 不該回傳 H4 的 feature —— 兩支 pass 各自獨立驗證
  const payload = fullHighScore(H1_H3);
  payload.features.push({
    code: featuresOf(H4_H5)[0].code,
    quality: "UNMEASURED",
    reason: "不屬於這一支 pass",
    instances: [],
  });
  expectIssue("3a 混入 H4 的 feature → UNKNOWN_NODE", validateHighScoreAnalysis(payload, H1_H3), "UNKNOWN_NODE");
}

{
  const payload = fullHighScore(H1_H3);
  payload.features[0] = { ...payload.features[0], quality: "EFFECTIVE", instances: [] };
  expectIssue(
    "EFFECTIVE 卻沒引原文 → MISSING_EVIDENCE（TR-04）",
    validateHighScoreAnalysis(payload, H1_H3),
    "MISSING_EVIDENCE",
  );
}

{
  const payload = fullHighScore(H1_H3);
  payload.features[0] = {
    ...payload.features[0],
    instances: [{ quote: "Not only did he run, but he also swam.", reason: "示例" }],
  };
  expectIssue(
    "UNMEASURED 卻引了原文 → UNEXPECTED_EVIDENCE",
    validateHighScoreAnalysis(payload, H1_H3),
    "UNEXPECTED_EVIDENCE",
  );
}

{
  // sub-skill 不是 canonical node（TR-07）：認不得就丟掉，不讓整支 pass 失敗
  const payload = fullHighScore(H1_H3);
  payload.features[0] = {
    ...payload.features[0],
    quality: "EFFECTIVE",
    instances: [
      {
        quote: "Not only did he run, but he also swam.",
        reason: "成對結構形成對稱",
        subskills: ["WRITE_HSF_PARALLEL_NOT_ONLY_BUT_ALSO", "TOTALLY_MADE_UP_SUBSKILL"],
      },
    ],
  };
  const r = validateHighScoreAnalysis(payload, H1_H3);
  check("認不得的 sub-skill 被丟棄，pass 仍通過", r.ok);
  if (r.ok) {
    const subs = r.value.features[0].instances[0].subskills ?? [];
    check("只留下 canonical sub-skill", subs.length === 1 && subs[0] === "WRITE_HSF_PARALLEL_NOT_ONLY_BUT_ALSO", subs.join(","));
  }
}

/* ──────────────── 綜合層 ──────────────── */

console.log("\n綜合層 — 摘要可以短，分析必須完整；且不得自行發明 finding");

// 用一組真的通過驗證的 Stage 1 結果來算可引用集合
const stage1Competency = validateCompetencyAnalysis(fullCompetency());
const stage1Error = validateErrorAnalysis(fullError());
const stage1A = validateHighScoreAnalysis(fullHighScore(H1_H3), H1_H3);
const stage1B = validateHighScoreAnalysis(fullHighScore(H4_H5), H4_H5);

if (!stage1Competency.ok || !stage1Error.ok || !stage1A.ok || !stage1B.ok) {
  throw new Error("Stage 1 fixture 應該要通過驗證");
}

const citable = collectCitableRefs(stage1Competency.value, stage1Error.value, [
  stage1A.value,
  stage1B.value,
]);

check(
  "可引用集合包含有表現的 competency skill",
  citable.has("WRITE_ORG_PARAGRAPH") && citable.has("W2"),
);
check(
  "可引用集合包含實際出現的 error code",
  citable.has("WRITE_ERR_SV_AGREEMENT"),
);
check(
  "可引用集合【不】包含 UNMEASURED 的 high-score feature",
  !citable.has("WRITE_HSF_INVERSION"),
  "fixture 裡全部 feature 都是 UNMEASURED",
);

const synthesis = (steps: number, overrides: Record<string, unknown> = {}) => ({
  overall_evaluation: {
    level: "SOLID",
    headline: "你的想法有支撐，但句界控制還不穩",
    summary: "整體達到題目要求。",
  },
  strengths: [{ text: "段落分明", refs: ["WRITE_ORG_PARAGRAPH"] }],
  needs_work: [{ text: "主詞單複數", refs: ["WRITE_ERR_SV_AGREEMENT"] }],
  next_steps: Array.from({ length: steps }, (_, i) => ({ text: `動作 ${i + 1}` })),
  ...overrides,
});

check("1 項下一步通過", validateSynthesis(synthesis(1), citable).ok);
check("3 項下一步通過", validateSynthesis(synthesis(3), citable).ok);
expectIssue("4 項下一步 → TOO_MANY（排序層有上限）", validateSynthesis(synthesis(4), citable), "TOO_MANY");
expectIssue("0 項下一步 → TOO_MANY", validateSynthesis(synthesis(0), citable), "TOO_MANY");

expectIssue(
  "strengths 沒有引用 → MISSING_CITATION（紅線 C）",
  validateSynthesis(synthesis(2, { strengths: [{ text: "寫得不錯" }] }), citable),
  "MISSING_CITATION",
);

expectIssue(
  "needs_work 沒有引用 → MISSING_CITATION（紅線 C）",
  validateSynthesis(synthesis(2, { needs_work: [{ text: "要加強" }] }), citable),
  "MISSING_CITATION",
);

expectIssue(
  "引用 Stage 1 判為 UNMEASURED 的特徵 → UNCITABLE_REF（紅線 A）",
  validateSynthesis(
    synthesis(2, { strengths: [{ text: "倒裝用得好", refs: ["WRITE_HSF_INVERSION"] }] }),
    citable,
  ),
  "UNCITABLE_REF",
);

expectIssue(
  "引用根本不存在的 code → UNCITABLE_REF",
  validateSynthesis(
    synthesis(2, { strengths: [{ text: "很好", refs: ["WRITE_TOTALLY_INVENTED"] }] }),
    citable,
  ),
  "UNCITABLE_REF",
);

{
  const payload = synthesis(2) as Record<string, unknown>;
  (payload.overall_evaluation as Record<string, unknown>).level = "AMAZING";
  expectIssue("非法 overall level → INVALID_STATE", validateSynthesis(payload, citable), "INVALID_STATE");
}

/* ──────────────── 結論 ──────────────── */

console.log(`\n${passed} / ${passed + failures.length} 通過`);
if (failures.length > 0) {
  console.error("\n失敗項目：");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("全部通過");
