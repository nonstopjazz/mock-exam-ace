/**
 * 分析執行路徑的自我檢查（不需要網路，也不需要 DeepSeek API key）
 *
 *   npm run verify:writing-passes
 *
 * 這裡把 fetch 換成受控的替身，用來證明幾件不能靠讀程式碼保證的事：
 *
 *   1. 模型漏回傳 canonical node 時，會帶著缺漏清單重試，而不是被補成 UNMEASURED
 *   2. 重試指示明確說出「省略 ≠ UNMEASURED」
 *   3. 重試後仍缺漏 → 該支 pass 失敗，issues 完整帶回
 *   4. 可重試與不可重試的錯誤分得開（429/5xx vs 401；逾時不重試）
 *   5. 四支 prompt 真的列出了全部 23 / 16 / 17 / 12 個節點
 *   6. 綜合層拿到的摘要與可引用集合是一致的
 */

import {
  runValidatedPass,
  isPassOk,
  type PassFailure,
} from "../api/_lib/deepseek";
import {
  competencyMessages,
  errorMessages,
  highScoreMessages,
  highScoreCategoriesFor,
  compressForSynthesis,
  synthesisMessages,
  HIGH_SCORE_PASS_A,
  HIGH_SCORE_PASS_B,
  type EssayInput,
} from "../api/_lib/writingPrompts";
import {
  ALL_COMPETENCY_SKILL_CODES,
  ALL_ERROR_CODES,
  COMPETENCY_CATEGORIES,
  HIGH_SCORE_CATEGORIES,
} from "../api/_lib/taxonomy";
import {
  collectCitableRefs,
  validateCompetencyAnalysis,
  validateErrorAnalysis,
  validateHighScoreAnalysis,
  validateSynthesis,
  isValidationOk,
} from "../api/_lib/analysisContract";

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

/* ──────────────── fetch 替身 ──────────────── */

interface StubResponse {
  status?: number;
  /** 直接當成 message.content 送回；物件會被 JSON.stringify */
  content?: unknown;
  /** 設 true 時模擬 AbortError */
  abort?: boolean;
}

const sentBodies: string[] = [];
let queue: StubResponse[] = [];

const originalFetch = globalThis.fetch;

function installStub(responses: StubResponse[]) {
  queue = [...responses];
  sentBodies.length = 0;
  globalThis.fetch = (async (_url: unknown, init: { body?: string }) => {
    sentBodies.push(init?.body ?? "");
    const next = queue.shift();
    if (!next) throw new Error("替身用完了：實際呼叫次數比預期多");
    if (next.abort) {
      const err = new Error("The operation was aborted");
      err.name = "AbortError";
      throw err;
    }
    const status = next.status ?? 200;
    if (status !== 200) {
      return { ok: false, status, json: async () => ({}) };
    }
    return {
      ok: true,
      status,
      json: async () => ({
        choices: [
          {
            message: {
              content:
                typeof next.content === "string" ? next.content : JSON.stringify(next.content),
            },
          },
        ],
      }),
    };
  }) as unknown as typeof fetch;
}

function restoreFetch() {
  globalThis.fetch = originalFetch;
}

/* ──────────────── fixtures ──────────────── */

const essay: EssayInput = {
  title: "Should students wear uniforms?",
  topic: "Write an essay of about 120 words.",
  content: "Many student thinks the policy are unfair. However, uniforms save time every morning.",
};

const fullCompetency = (dropCode?: string) => ({
  categories: COMPETENCY_CATEGORIES.map((c) => ({
    code: c.code,
    summary: `${c.zh}的整體觀察`,
    skills: c.skills
      .filter((s) => s.code !== dropCode)
      .map((s) => ({
        code: s.code,
        state: "ADEQUATE",
        reason: `${s.zh}：本篇有對應表現`,
        evidence: [{ quote: "uniforms save time every morning", reason: "示例" }],
      })),
  })),
});

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

const featuresOf = (cats: readonly string[]) =>
  HIGH_SCORE_CATEGORIES.filter((c) => cats.includes(c.code)).flatMap((c) => c.features);

const fullHighScore = (cats: readonly string[], effective?: string) => ({
  features: featuresOf(cats).map((f) =>
    f.code === effective
      ? {
          code: f.code,
          quality: "EFFECTIVE",
          reason: "用得自然且有功能",
          instances: [
            { quote: "uniforms save time every morning", reason: "資訊壓縮得宜" },
          ],
        }
      : {
          code: f.code,
          quality: "UNMEASURED",
          reason: `${f.zh}：本篇沒有出現這個特徵`,
          instances: [],
        },
  ),
});

/* ──────────────── 1. 缺漏 → 重試 → 成功 ──────────────── */

console.log("\n完整覆蓋失敗時的重試行為");

{
  const dropped = "WRITE_ORG_PARAGRAPH";
  installStub([{ content: fullCompetency(dropped) }, { content: fullCompetency() }]);

  const result = await runValidatedPass({
    label: "Writing Competency",
    messages: competencyMessages(essay),
    validate: (raw) => validateCompetencyAnalysis(raw, essay.content),
    apiKey: "test-key-not-a-real-secret",
  });
  restoreFetch();

  check("漏一個節點時會重試並在第二次成功", isPassOk(result) && result.attempts === 2);
  check("總共只呼叫兩次", sentBodies.length === 2, `${sentBodies.length}`);

  const repair = sentBodies[1];
  check("重試訊息點名了缺漏的節點", repair.includes(dropped));
  check(
    "重試訊息說明「省略 ≠ UNMEASURED」",
    repair.includes("省略等於沒有分析") && repair.includes("判定為 UNMEASURED"),
  );
  check(
    "重試訊息把上一次的輸出當成 assistant 訊息帶回去",
    repair.includes('"role":"assistant"'),
  );
}

{
  const dropped = "WRITE_LEXICAL_FORM";
  installStub([{ content: fullCompetency(dropped) }, { content: fullCompetency(dropped) }]);

  const result = await runValidatedPass({
    label: "Writing Competency",
    messages: competencyMessages(essay),
    validate: (raw) => validateCompetencyAnalysis(raw, essay.content),
    apiKey: "test-key-not-a-real-secret",
  });
  restoreFetch();

  check("重試後仍缺漏 → pass 失敗", !isPassOk(result));
  const failure = result as PassFailure;
  check(
    "失敗時帶回 MISSING_NODE 且點名該節點",
    failure.issues.some((i) => i.kind === "MISSING_NODE" && i.detail.includes(dropped)),
  );
  check("失敗時不產出任何 value", !("value" in failure));
}

/* ──────────────── 2. 可重試 vs 不可重試 ──────────────── */

console.log("\n呼叫層的錯誤分類");

{
  installStub([{ status: 500 }, { content: fullError() }]);
  const result = await runValidatedPass({
    label: "Writing Error",
    messages: errorMessages(essay),
    validate: (raw) => validateErrorAnalysis(raw, essay.content),
    apiKey: "test-key-not-a-real-secret",
  });
  restoreFetch();
  check("5xx 會重試並可能成功", isPassOk(result) && result.attempts === 2);
}

{
  installStub([{ status: 401 }, { content: fullError() }]);
  const result = await runValidatedPass({
    label: "Writing Error",
    messages: errorMessages(essay),
    validate: (raw) => validateErrorAnalysis(raw, essay.content),
    apiKey: "test-key-not-a-real-secret",
  });
  restoreFetch();
  check("401 不重試，立刻失敗", !isPassOk(result) && sentBodies.length === 1);
}

{
  installStub([{ abort: true }, { content: fullError() }]);
  const result = await runValidatedPass({
    label: "Writing Error",
    messages: errorMessages(essay),
    validate: (raw) => validateErrorAnalysis(raw, essay.content),
    apiKey: "test-key-not-a-real-secret",
  });
  restoreFetch();
  check("逾時（AbortError）不重試", !isPassOk(result) && sentBodies.length === 1);
}

{
  installStub([{ content: "這不是 JSON" }, { content: fullError() }]);
  const result = await runValidatedPass({
    label: "Writing Error",
    messages: errorMessages(essay),
    validate: (raw) => validateErrorAnalysis(raw, essay.content),
    apiKey: "test-key-not-a-real-secret",
  });
  restoreFetch();
  check("回傳非 JSON 時會重試", isPassOk(result) && sentBodies.length === 2);
}

/* ──────────────── 3. prompt 真的列出全部節點 ──────────────── */

console.log("\nprompt 的節點覆蓋");

{
  const prompt = competencyMessages(essay)[0].content;
  const missing = ALL_COMPETENCY_SKILL_CODES.filter((c) => !prompt.includes(c));
  check("Pass 1 prompt 列出全部 23 個 skill", missing.length === 0, missing.join(","));
  check("Pass 1 prompt 沒有混入 error code", !prompt.includes("WRITE_ERR_"));
  check("Pass 1 prompt 有退化輸入規則", prompt.includes("題目與提示文字不是學生寫的"));
  check("引用規則禁止用 ... 或 / 接起兩段", prompt.includes("把不相鄰的兩段接成一個引用"));
}

{
  const prompt = errorMessages(essay)[0].content;
  const missing = ALL_ERROR_CODES.filter((c) => !prompt.includes(c));
  check("Pass 2 prompt 列出全部 16 個 error code", missing.length === 0, missing.join(","));
  check(
    "Pass 2 prompt 明講 count = 0 不代表精熟",
    prompt.includes("不代表學生已經精熟"),
  );
  check(
    "Pass 2 prompt 禁止用錯誤代碼傳達 meta 訊息",
    prompt.includes("不可以把錯誤代碼拿來傳達與錯誤無關的訊息"),
  );
  check("Pass 2 prompt 有退化輸入規則", prompt.includes("16 個 code 全部 count = 0"));
}

{
  const a = highScoreMessages(essay, highScoreCategoriesFor(HIGH_SCORE_PASS_A))[0].content;
  const b = highScoreMessages(essay, highScoreCategoriesFor(HIGH_SCORE_PASS_B))[0].content;
  const codesA = featuresOf(HIGH_SCORE_PASS_A).map((f) => f.code);
  const codesB = featuresOf(HIGH_SCORE_PASS_B).map((f) => f.code);

  check("Pass 3a prompt 列出 H1–H3 的 17 個 feature", codesA.every((c) => a.includes(c)));
  check("Pass 3b prompt 列出 H4–H5 的 12 個 feature", codesB.every((c) => b.includes(c)));
  check("Pass 3a 不含 H4–H5 的 feature", !codesB.some((c) => a.includes(c)));
  check("Pass 3b 不含 H1–H3 的 feature", !codesA.some((c) => b.includes(c)));
  check(
    "Pass 3a prompt 明講「偵測到形式不等於高分」（TR-06）",
    a.includes("偵測到形式不等於高分"),
  );
  check("Pass 3a prompt 帶入每個 feature 的 boundary rule", a.includes("有效與否的界線"));
  // ↓ 以下五項對應 2026-09-05 真實測試抓到的問題（prompt v2）
  check("Pass 3a prompt 提高 EFFECTIVE 門檻", a.includes("拿掉，文章會明顯變差嗎"));
  check("Pass 3a prompt 警告不要大多判 EFFECTIVE", a.includes("標準放太寬"));
  check(
    "Pass 3a prompt 要求形式前提（問句要有問號、倒裝要真的倒置）",
    a.includes("必須真的有問句") && a.includes("主詞與助動詞倒置"),
  );
  check("Pass 3a prompt 寫入 TR-08（同句可多特徵）", a.includes("同一句話可以同時成立多個特徵"));
  check("Pass 3a prompt 有退化輸入規則", a.includes("題目與提示文字不是學生寫的"));
}

/* ──────────────── 4. 綜合層的輸入 ──────────────── */

console.log("\n綜合層的輸入一致性");

{
  const c = validateCompetencyAnalysis(fullCompetency(), essay.content);
  const e = validateErrorAnalysis(fullError(), essay.content);
  const a = validateHighScoreAnalysis(
    fullHighScore(HIGH_SCORE_PASS_A, "WRITE_HSF_REDUCED"),
    HIGH_SCORE_PASS_A,
    essay.content,
  );
  const b = validateHighScoreAnalysis(
    fullHighScore(HIGH_SCORE_PASS_B),
    HIGH_SCORE_PASS_B,
    essay.content,
  );

  if (!isValidationOk(c) || !isValidationOk(e) || !isValidationOk(a) || !isValidationOk(b)) {
    throw new Error("Stage 1 fixture 應該要通過驗證");
  }

  const citable = collectCitableRefs(c.value, e.value, [a.value, b.value]);
  const digest = compressForSynthesis(c.value, e.value, [a.value, b.value]);

  check("摘要含有實際出現的錯誤與其修正", digest.includes("WRITE_ERR_SV_AGREEMENT")
    && digest.includes("Many students think the policy is unfair."));
  check(
    "摘要【不】含 UNMEASURED 的高分特徵（那些不是可引用的證據）",
    !digest.includes("WRITE_HSF_INVERSION"),
  );
  check("摘要含有判為 EFFECTIVE 的特徵", digest.includes("WRITE_HSF_REDUCED = EFFECTIVE"));
  check(
    "摘要沒有夾帶作文全文",
    !digest.includes("However, uniforms save time every morning."),
  );

  const prompt = synthesisMessages(digest, [...citable])[0].content;
  check("綜合層 prompt 明講不可產生新判斷", prompt.includes("不可以產生任何新的判斷"));
  check("綜合層 prompt 附上可引用清單", prompt.includes("WRITE_HSF_REDUCED"));
  check(
    "綜合層 prompt 不含 UNMEASURED 的節點",
    !prompt.includes("WRITE_HSF_INVERSION"),
  );

  // 端點實際會用的驗證方式
  const good = validateSynthesis(
    {
      overall_evaluation: { level: "SOLID", headline: "h", summary: "s" },
      strengths: [{ text: "簡化結構用得好", refs: ["WRITE_HSF_REDUCED"] }],
      needs_work: [{ text: "主詞單複數", refs: ["WRITE_ERR_SV_AGREEMENT"] }],
      next_steps: [{ text: "檢查每個主詞的單複數" }],
    },
    citable,
  );
  check("引用可引用集合內的節點 → 通過", isValidationOk(good));

  const bad = validateSynthesis(
    {
      overall_evaluation: { level: "SOLID", headline: "h", summary: "s" },
      strengths: [{ text: "倒裝用得好", refs: ["WRITE_HSF_INVERSION"] }],
      needs_work: [{ text: "主詞單複數", refs: ["WRITE_ERR_SV_AGREEMENT"] }],
      next_steps: [{ text: "檢查主詞" }],
    },
    citable,
  );
  check("引用 Stage 1 判為 UNMEASURED 的節點 → 擋下", !isValidationOk(bad));
}

/* ──────────────── 結論 ──────────────── */

console.log(`\n${passed} / ${passed + failures.length} 通過`);
if (failures.length > 0) {
  console.error("\n失敗項目：");
  for (const f of failures) console.error(`  - ${f}`);
  process.exit(1);
}
console.log("全部通過");
