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
} from "../api/_lib/taxonomy";
import {
  collectCitableRefs,
  isValidationOk,
  validateCompetencyAnalysis,
  validateErrorAnalysis,
  validateHighScoreAnalysis,
  validateSynthesis,
  type PassValidation,
  type ValidationIssueKind,
} from "../api/_lib/analysisContract";

/** 所有 fixture 引用的原文。驗證器現在會逐字比對，引用必須真的出自這裡。 */
const ESSAY = [
  "Many student thinks the policy are unfair.",
  "However, uniforms save time every morning.",
  "Not only did he run, but he also swam.",
].join(" ");

/** 含問號、且有兩段——用來測形式前提的「滿足」那一側 */
const ESSAY_WITH_QUESTION = "Is convenience free?\n\nIt is not.";

const JUSTIFICATION = {
  criterion: "words / phrases / clauses 的平行",
  effect: "讓兩個對比概念在同一句裡並列，讀者一眼看出取捨",
  beyondForm: "不只是出現 not only…but also，兩邊的資訊量與結構真的對稱",
};

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
      evidence: [{ quote: "Many student thinks the policy are unfair.", reason: "示例" }],
    })),
  })),
});

console.log("\nPass 1 — Writing Competency（全 23 個 skill）");

{
  const r = validateCompetencyAnalysis(fullCompetency(), ESSAY);
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
  const r = validateCompetencyAnalysis(payload, ESSAY);
  expectIssue("漏回傳 skill → MISSING_NODE（不得補成 UNMEASURED）", r, "MISSING_NODE", dropped.code);
  check("驗證失敗時不產出任何 value", !r.ok && !("value" in r));
}

{
  const payload = fullCompetency();
  payload.categories[0].skills[0].state = "UNMEASURED";
  payload.categories[0].skills[0].reason = "";
  expectIssue(
    "UNMEASURED 沒寫理由 → MISSING_REASON",
    validateCompetencyAnalysis(payload, ESSAY),
    "MISSING_REASON",
  );
}

{
  const payload = fullCompetency();
  payload.categories[0].skills[0].state = "UNMEASURED";
  payload.categories[0].skills[0].reason = "本篇題型沒有要求提出支持性論述";
  expectIssue(
    "UNMEASURED 卻附了證據 → UNEXPECTED_EVIDENCE",
    validateCompetencyAnalysis(payload, ESSAY),
    "UNEXPECTED_EVIDENCE",
  );
}

{
  const payload = fullCompetency();
  payload.categories[0].skills[0].state = "UNMEASURED";
  payload.categories[0].skills[0].reason = "本篇題型沒有要求提出支持性論述";
  payload.categories[0].skills[0].evidence = [];
  const r = validateCompetencyAnalysis(payload, ESSAY);
  check("UNMEASURED + 理由 + 無證據 = 合法的模型判斷", r.ok);
}

{
  const payload = fullCompetency();
  payload.categories[2].skills[0].code = "WRITE_NOT_A_REAL_SKILL";
  expectIssue("不在 taxonomy 內的 code → UNKNOWN_NODE", validateCompetencyAnalysis(payload, ESSAY), "UNKNOWN_NODE");
}

{
  const payload = fullCompetency();
  payload.categories[0].skills[1].state = "GOOD" as never;
  expectIssue("非法 state → INVALID_STATE", validateCompetencyAnalysis(payload, ESSAY), "INVALID_STATE");
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
  const r = validateErrorAnalysis(fullError(), ESSAY);
  check("完整覆蓋通過驗證", r.ok);
  if (r.ok) {
    check("coverage 列出全部 16 個 code", r.value.coverage.length === 16, `${r.value.coverage.length}`);
    const zero = r.value.coverage.filter((c) => c.count === 0).length;
    check("count = 0 的 code 明確保留（本篇未發現此類錯誤）", zero === 15, `${zero}`);
  }
}

{
  // coverage 現在由伺服器推導，模型送什麼都不影響結果——連送都不必送。
  const payload = fullError();
  delete (payload as { coverage?: unknown }).coverage;
  const r = validateErrorAnalysis(payload, ESSAY);
  check("模型不送 coverage 也能通過（伺服器自己算）", isValidationOk(r));
  if (isValidationOk(r)) {
    check("伺服器推導出 16 筆 coverage", r.value.coverage.length === ALL_ERROR_CODES.length,
      `${r.value.coverage.length}`);
    check("coverage 標記為伺服器推導", r.value.coverage_source === "SERVER_DERIVED");
    const sv = r.value.coverage.find((c) => c.code === "WRITE_ERR_SV_AGREEMENT");
    check("有 finding 的 code count 正確", sv?.count === 1, `${sv?.count}`);
    const zero = r.value.coverage.filter((c) => c.count === 0).length;
    check("其餘 code 的 count 為 0", zero === ALL_ERROR_CODES.length - 1, `${zero}`);
  }
}

{
  // 模型自己送一份【算錯的】coverage，也不會再讓整支失敗——伺服器不看它。
  // 這正是 2026-09-05 那次重試的觸發原因，現在它不可能再發生。
  const payload = fullError() as Record<string, unknown>;
  payload.coverage = [{ code: "WRITE_ERR_SV_AGREEMENT", count: 99 }];
  const r = validateErrorAnalysis(payload, ESSAY);
  check("模型送錯的 coverage 不再造成失敗", isValidationOk(r));
  if (isValidationOk(r)) {
    const sv = r.value.coverage.find((c) => c.code === "WRITE_ERR_SV_AGREEMENT");
    check("count 以伺服器數的為準，不是模型說的 99", sv?.count === 1, `${sv?.count}`);
  }
}

{
  // fallback 要付舉證責任：GRAMMAR_OTHER 沒附理由就擋下來。
  // 純 prompt 要求在 v5→v6 之間完全沒效果，所以這一條必須是驗證，不是請求。
  const payload = fullError();
  payload.findings.push({
    code: "WRITE_ERR_GRAMMAR_OTHER",
    quote: "Many student thinks the policy are unfair.",
    reason: "語態錯誤",
    correction: "Many students think the policy is unfair, and it should change.",
    primary_skill: "WRITE_GRAMMAR_BASIC",
  });
  expectIssue(
    "GRAMMAR_OTHER 沒附 fallback_rationale → MISSING_JUSTIFICATION",
    validateErrorAnalysis(payload, ESSAY),
    "MISSING_JUSTIFICATION",
  );
}

{
  // 附了理由就通過，而且理由要留在資料裡（老師與診斷看得到）。
  const payload = fullError();
  payload.findings.push({
    code: "WRITE_ERR_GRAMMAR_OTHER",
    quote: "Many student thinks the policy are unfair.",
    reason: "語態錯誤",
    correction: "Many students think the policy is unfair, and it should change.",
    primary_skill: "WRITE_GRAMMAR_BASIC",
    fallback_rationale: "被動語態的動詞形式錯誤，不屬於冠詞／單複數／SV 一致／詞類任何一類",
  });
  const r = validateErrorAnalysis(payload, ESSAY);
  check("GRAMMAR_OTHER 附了理由就通過", isValidationOk(r));
  if (isValidationOk(r)) {
    const fb = r.value.findings.find((f) => f.code === "WRITE_ERR_GRAMMAR_OTHER");
    check("fallback_rationale 保留在資料裡", Boolean(fb?.fallback_rationale));
  }
}

{
  // 其他 code 不需要這一欄，也不該因為沒有它而失敗。
  const r = validateErrorAnalysis(fullError(), ESSAY);
  check("非 fallback 的 code 不需要 fallback_rationale", isValidationOk(r));
  if (isValidationOk(r)) {
    check(
      "非 fallback 的 finding 不會被塞進這一欄",
      r.value.findings.every((f) => f.fallback_rationale === undefined),
    );
  }
}

{
  // 被驗證擋下來的 finding 不可以算進 count，否則捏造的證據會把數字灌水。
  const payload = fullError();
  payload.findings.push({
    code: "WRITE_ERR_SPELLING",
    quote: "這段原文裡沒有的字",
    reason: "拼錯",
    correction: "fixed",
    primary_skill: "WRITE_LEXICAL_FORM",
  });
  const r = validateErrorAnalysis(payload, ESSAY);
  check("引用不存在的 finding 仍然擋下整支", !isValidationOk(r));
}

{
  const payload = fullError();
  payload.findings[0] = { ...payload.findings[0], correction: "" };
  expectIssue("錯誤沒有給修正 → MALFORMED", validateErrorAnalysis(payload, ESSAY), "MALFORMED");
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
  const r = validateHighScoreAnalysis(fullHighScore(H1_H3), H1_H3, ESSAY);
  check("3a 完整覆蓋通過驗證", r.ok);
  if (r.ok) check("3a 共 17 個 feature", r.value.features.length === 17, `${r.value.features.length}`);
}

{
  const r = validateHighScoreAnalysis(fullHighScore(H4_H5), H4_H5, ESSAY);
  check("3b 完整覆蓋通過驗證", r.ok);
  if (r.ok) check("3b 共 12 個 feature", r.value.features.length === 12, `${r.value.features.length}`);
}

{
  const payload = fullHighScore(H1_H3);
  const dropped = payload.features.pop()!;
  expectIssue(
    "3a 漏回傳 feature → MISSING_NODE（不得補成 UNMEASURED）",
    validateHighScoreAnalysis(payload, H1_H3, ESSAY),
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
  expectIssue("3a 混入 H4 的 feature → UNKNOWN_NODE", validateHighScoreAnalysis(payload, H1_H3, ESSAY), "UNKNOWN_NODE");
}

{
  const payload = fullHighScore(H1_H3);
  payload.features[0] = {
    ...payload.features[0],
    quality: "EFFECTIVE",
    justification: JUSTIFICATION,
    instances: [],
  };
  expectIssue(
    "EFFECTIVE 卻沒引原文 → MISSING_EVIDENCE（TR-04）",
    validateHighScoreAnalysis(payload, H1_H3, ESSAY),
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
    validateHighScoreAnalysis(payload, H1_H3, ESSAY),
    "UNEXPECTED_EVIDENCE",
  );
}

{
  // sub-skill 不是 canonical node（TR-07）：認不得就丟掉，不讓整支 pass 失敗
  const payload = fullHighScore(H1_H3);
  payload.features[0] = {
    ...payload.features[0],
    quality: "EFFECTIVE",
    justification: JUSTIFICATION,
    instances: [
      {
        quote: "Not only did he run, but he also swam.",
        reason: "成對結構形成對稱",
        subskills: ["WRITE_HSF_PARALLEL_NOT_ONLY_BUT_ALSO", "TOTALLY_MADE_UP_SUBSKILL"],
      },
    ],
  };
  const r = validateHighScoreAnalysis(payload, H1_H3, ESSAY);
  check("認不得的 sub-skill 被丟棄，pass 仍通過", r.ok);
  if (r.ok) {
    const subs = r.value.features[0].instances[0].subskills ?? [];
    check("只留下 canonical sub-skill", subs.length === 1 && subs[0] === "WRITE_HSF_PARALLEL_NOT_ONLY_BUT_ALSO", subs.join(","));
  }
}

/* ──────────────── 引用必須逐字出自原文 ──────────────── */

console.log("\n引用查核 —— 2026-09-05 真實測試抓到的問題");

{
  const payload = fullCompetency();
  payload.categories[0].skills[0].evidence = [
    { quote: "這句話原文裡根本沒有出現過", reason: "捏造" },
  ];
  expectIssue(
    "能力軸引用找不到出處 → QUOTE_NOT_IN_ESSAY",
    validateCompetencyAnalysis(payload, ESSAY),
    "QUOTE_NOT_IN_ESSAY",
  );
}

{
  const payload = fullError();
  payload.findings[0] = { ...payload.findings[0], quote: "a sentence that is not there" };
  expectIssue(
    "錯誤引用找不到出處 → QUOTE_NOT_IN_ESSAY",
    validateErrorAnalysis(payload, ESSAY),
    "QUOTE_NOT_IN_ESSAY",
  );
}

{
  // correction 必須是改寫，不是原句照抄，更不是指令
  const payload = fullError();
  payload.findings[0] = {
    ...payload.findings[0],
    correction: payload.findings[0].quote,
  };
  expectIssue(
    "correction 與原句相同 → MALFORMED",
    validateErrorAnalysis(payload, ESSAY),
    "MALFORMED",
  );
}

{
  // 真實案例：用 / 把不相鄰的兩段接成一個引用
  const payload = fullHighScore(H1_H3);
  payload.features[0] = {
    ...payload.features[0],
    quality: "EFFECTIVE",
    justification: JUSTIFICATION,
    reason: "首尾呼應",
    instances: [
      {
        quote: "Many student thinks the policy are unfair. / However, uniforms save time every morning.",
        reason: "接起來的假引用",
      },
    ],
  };
  expectIssue(
    "用 / 接起兩段 → QUOTE_NOT_IN_ESSAY（應拆成多筆 instance）",
    validateHighScoreAnalysis(payload, H1_H3, ESSAY),
    "QUOTE_NOT_IN_ESSAY",
  );
}

{
  // 真實案例：詞彙清單當引用
  const payload = fullHighScore(H1_H3);
  payload.features[0] = {
    ...payload.features[0],
    quality: "EFFECTIVE",
    justification: JUSTIFICATION,
    reason: "詞彙多樣",
    instances: [{ quote: "policy, uniforms, morning, time", reason: "詞彙清單" }],
  };
  expectIssue(
    "詞彙清單當引用 → QUOTE_NOT_IN_ESSAY",
    validateHighScoreAnalysis(payload, H1_H3, ESSAY),
    "QUOTE_NOT_IN_ESSAY",
  );
}

{
  // 跨段證據拆成兩筆 instance —— 這是正確做法，必須通過
  const payload = fullHighScore(H1_H3);
  payload.features[0] = {
    ...payload.features[0],
    quality: "EFFECTIVE",
    justification: JUSTIFICATION,
    reason: "首尾呼應",
    instances: [
      { quote: "Many student thinks the policy are unfair.", reason: "開頭" },
      { quote: "However, uniforms save time every morning.", reason: "結尾" },
    ],
  };
  check(
    "跨段證據拆成兩筆 instance → 通過",
    isValidationOk(validateHighScoreAnalysis(payload, H1_H3, ESSAY)),
  );
}

{
  // 空白與大小寫的差異不該誤殺真實引用
  const payload = fullCompetency();
  payload.categories[0].skills[0].evidence = [
    { quote: "many   student\n thinks the POLICY are unfair.", reason: "空白與大小寫不同" },
  ];
  check(
    "空白與大小寫差異不誤殺真實引用",
    isValidationOk(validateCompetencyAnalysis(payload, ESSAY)),
  );
}

/* ──────────────── 綜合層 ──────────────── */

console.log("\n綜合層 — 摘要可以短，分析必須完整；且不得自行發明 finding");

// 用一組真的通過驗證的 Stage 1 結果來算可引用集合
const stage1Competency = validateCompetencyAnalysis(fullCompetency(), ESSAY);
const stage1Error = validateErrorAnalysis(fullError(), ESSAY);
const stage1A = validateHighScoreAnalysis(fullHighScore(H1_H3), H1_H3, ESSAY);
const stage1B = validateHighScoreAnalysis(fullHighScore(H4_H5), H4_H5, ESSAY);

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

/* ──────────────── v3：形式前提、EFFECTIVE 舉證、綜合層證據邊界 ──────────────── */

console.log("\nv3 —— 只靠 prompt 修不動的三件事，改成可強制");

{
  // 作文沒有問號 → 修辭問句只能 UNMEASURED
  const payload = fullHighScore(H4_H5);
  const idx = payload.features.findIndex((f) => f.code === "WRITE_HSF_RHET_QUESTION");
  payload.features[idx] = {
    ...payload.features[idx],
    quality: "EFFECTIVE",
    justification: JUSTIFICATION,
    instances: [{ quote: "Not only did he run, but he also swam.", reason: "示例" }],
  };
  expectIssue(
    "作文無問號卻判修辭問句 EFFECTIVE → PREREQUISITE_NOT_MET",
    validateHighScoreAnalysis(payload, H4_H5, ESSAY),
    "PREREQUISITE_NOT_MET",
  );
}

{
  // 前提是必要條件、不是充分條件：有問號時不加任何限制
  const payload = fullHighScore(H4_H5);
  const idx = payload.features.findIndex((f) => f.code === "WRITE_HSF_RHET_QUESTION");
  payload.features[idx] = {
    ...payload.features[idx],
    quality: "UNMEASURED",
    reason: "有問句但不是修辭性的",
    instances: [],
  };
  check(
    "有問號時仍可判 UNMEASURED（前提只是必要條件）",
    isValidationOk(validateHighScoreAnalysis(payload, H4_H5, ESSAY_WITH_QUESTION)),
  );
}

{
  // 單段作文 → 段落間銜接只能 UNMEASURED
  const payload = fullHighScore(H1_H3);
  const idx = payload.features.findIndex((f) => f.code === "WRITE_HSF_PARA_PROGRESSION");
  payload.features[idx] = {
    ...payload.features[idx],
    quality: "PARTIALLY_EFFECTIVE",
    justification: undefined,
    instances: [{ quote: "Many student thinks the policy are unfair.", reason: "示例" }],
  };
  expectIssue(
    "單段作文卻判段落間銜接 → PREREQUISITE_NOT_MET",
    validateHighScoreAnalysis(payload, H1_H3, ESSAY),
    "PREREQUISITE_NOT_MET",
  );
}

{
  const payload = fullHighScore(H1_H3);
  payload.features[0] = {
    ...payload.features[0],
    quality: "EFFECTIVE",
    instances: [{ quote: "Not only did he run, but he also swam.", reason: "示例" }],
  };
  expectIssue(
    "EFFECTIVE 沒附 justification → MISSING_JUSTIFICATION",
    validateHighScoreAnalysis(payload, H1_H3, ESSAY),
    "MISSING_JUSTIFICATION",
  );
}

{
  const payload = fullHighScore(H1_H3);
  payload.features[0] = {
    ...payload.features[0],
    quality: "EFFECTIVE",
    justification: { criterion: "平行結構", effect: "同一句話", beyondForm: "同一句話" },
    instances: [{ quote: "Not only did he run, but he also swam.", reason: "示例" }],
  };
  expectIssue(
    "justification 三欄填一樣 → MISSING_JUSTIFICATION",
    validateHighScoreAnalysis(payload, H1_H3, ESSAY),
    "MISSING_JUSTIFICATION",
  );
}

{
  const payload = fullHighScore(H1_H3);
  payload.features[0] = {
    ...payload.features[0],
    quality: "PARTIALLY_EFFECTIVE",
    justification: JUSTIFICATION,
    instances: [{ quote: "Not only did he run, but he also swam.", reason: "示例" }],
  };
  expectIssue(
    "非 EFFECTIVE 卻附 justification → MALFORMED",
    validateHighScoreAnalysis(payload, H1_H3, ESSAY),
    "MALFORMED",
  );
}

{
  // 2026-09-05 真實案例：綜合層在 text 裡編了一句中文「原文」
  const bad = validateSynthesis(
    {
      overall_evaluation: { level: "STRONG", headline: "h", summary: "s" },
      strengths: [
        {
          text: "結尾的修辭問句——「我們還記得自己真正想要的是什麼嗎？」——很有力",
          refs: ["WRITE_ORG_LOGIC"],
        },
      ],
      needs_work: [{ text: "主詞單複數", refs: ["WRITE_ERR_SV_AGREEMENT"] }],
      next_steps: [{ text: "檢查主詞" }],
    },
    citable,
  );
  expectIssue("綜合層夾帶引號引文 → SYNTHESIS_EVIDENCE", bad, "SYNTHESIS_EVIDENCE");
}

{
  // 不能只靠引號：沒有引號但夾帶成串英文，一樣是引用
  const bad = validateSynthesis(
    {
      overall_evaluation: { level: "STRONG", headline: "h", summary: "s" },
      strengths: [
        { text: "你寫的 Not only do these stores reshape our habits 很有力量", refs: ["WRITE_ORG_LOGIC"] },
      ],
      needs_work: [{ text: "主詞單複數", refs: ["WRITE_ERR_SV_AGREEMENT"] }],
      next_steps: [{ text: "檢查主詞" }],
    },
    citable,
  );
  expectIssue("綜合層夾帶成串英文（無引號）→ SYNTHESIS_EVIDENCE", bad, "SYNTHESIS_EVIDENCE");
}

{
  // 2026-09-05 calibration run 1 真的漏掉的那一句：逗號把英文切碎，舊門檻擋不住
  const bad = validateSynthesis(
    {
      overall_evaluation: { level: "STRONG", headline: "h", summary: "s" },
      strengths: [
        {
          text: "如用 simmering broth 對比 heated, sealed, and forgettable，對比很清楚",
          refs: ["WRITE_ORG_LOGIC"],
        },
      ],
      needs_work: [{ text: "主詞單複數", refs: ["WRITE_ERR_SV_AGREEMENT"] }],
      next_steps: [{ text: "檢查主詞" }],
    },
    citable,
  );
  expectIssue("逗號切碎的英文引文 → SYNTHESIS_EVIDENCE", bad, "SYNTHESIS_EVIDENCE");
}

{
  // 反向：taxonomy code 與短英文術語不可以被誤判成引文
  const good = validateSynthesis(
    {
      overall_evaluation: {
        level: "STRONG",
        headline: "結構清楚",
        summary: "WRITE_ORG_LOGIC 這一軸表現穩定。",
      },
      strengths: [{ text: "topic sentence 位置正確，段落好讀", refs: ["WRITE_ORG_LOGIC"] }],
      needs_work: [{ text: "主詞單複數", refs: ["WRITE_ERR_SV_AGREEMENT"] }],
      next_steps: [{ text: "檢查主詞" }],
    },
    citable,
  );
  check("taxonomy code 與兩字英文術語不算引文", isValidationOk(good));
}

{
  // headline / summary 也要擋
  const bad = validateSynthesis(
    {
      overall_evaluation: {
        level: "STRONG",
        headline: "你的「便利的代價」寫得很好",
        summary: "s",
      },
      strengths: [{ text: "段落分明", refs: ["WRITE_ORG_LOGIC"] }],
      needs_work: [{ text: "主詞單複數", refs: ["WRITE_ERR_SV_AGREEMENT"] }],
      next_steps: [{ text: "檢查主詞" }],
    },
    citable,
  );
  expectIssue("headline 夾帶引文 → SYNTHESIS_EVIDENCE", bad, "SYNTHESIS_EVIDENCE");
}

{
  // 純描述、用 refs 指回證據 —— 這是正確做法
  const good = validateSynthesis(
    {
      overall_evaluation: { level: "STRONG", headline: "結構清楚，收束有力", summary: "整體達到要求。" },
      strengths: [{ text: "結尾用修辭問句收束，讓主題留下餘韻", refs: ["WRITE_ORG_LOGIC"] }],
      needs_work: [{ text: "主詞與動詞的一致要再檢查", refs: ["WRITE_ERR_SV_AGREEMENT"] }],
      next_steps: [{ text: "寫完後把每個主詞圈起來檢查動詞" }],
    },
    citable,
  );
  check("純描述 + refs → 通過", isValidationOk(good));
}

/* ──────────────── 結論 ──────────────── */

console.log(`\n${passed} / ${passed + failures.length} 通過`);
if (failures.length > 0) {
  console.error("\n失敗項目：");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("全部通過");
