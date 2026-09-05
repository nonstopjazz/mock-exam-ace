/**
 * 真實 DeepSeek 稽核（PHASE D3）
 *
 *   DEEPSEEK_API_KEY=... npm run audit:writing
 *   DEEPSEEK_API_KEY=... npm run audit:writing -- tests/fixtures/writing/essay-c-strong.json
 *
 * 這支腳本跑的是 api/analyze-writing.ts 完全相同的 prompt 與驗證程式碼，
 * 只是把資料庫換成記憶體、把結果寫成人看得懂的稽核報告。
 * 因此這裡量到的延遲、重試率、驗證結果，就是端點在 Preview 上會遇到的。
 *
 * ⚠️ API key 只從環境變數讀取。
 *    腳本不會把它印出來、不會寫進報告、不會寫進任何檔案。
 *    請用環境變數傳入，不要寫進原始碼或 commit 進版控。
 *
 * 產出：
 *   docs/learn/writing-audit/<時間戳>-<profile>.md   每篇一份可讀的稽核報告
 *   終端機：延遲、重試、驗證、證據查核的摘要表
 *
 * 自動查核（不需要人判斷的部分）：
 *   • 完整覆蓋：23 / 16 / 17 / 12 個節點
 *   • 每一段引用的原文是否真的逐字出現在作文裡（抓捏造證據）
 *   • coverage 與 findings 的筆數是否一致
 *   • UNMEASURED 是否都有理由、且沒有夾帶證據
 *   • 綜合層的 refs 是否全部落在 Stage 1 已驗證的集合內
 *
 * 需要人判斷的部分（EFFECTIVE 給得合不合理、修正對不對、建議有沒有教學價值）
 * 一律整理進報告，不做自動判分。
 */

import { readFileSync, writeFileSync, mkdirSync } from "node:fs";
import { join } from "node:path";

import {
  runValidatedPass,
  isPassOk,
  type CallTelemetry,
  type PassFailure,
  type PassOutcome,
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
  collectCitableRefs,
  validateCompetencyAnalysis,
  validateErrorAnalysis,
  validateHighScoreAnalysis,
  validateSynthesis,
  type CompetencyAnalysis,
  type ErrorAnalysis,
  type HighScoreAnalysis,
  type SynthesisResult,
  type ValidationIssue,
} from "../src/lib/writing/analysisContract";
import {
  COMPETENCY_CATEGORY_BY_CODE,
  COMPETENCY_SKILL_BY_CODE,
  ERROR_TAG_BY_CODE,
  HIGH_SCORE_FEATURE_BY_CODE,
} from "../src/lib/writing/taxonomy";

/* ──────────────── 設定 ──────────────── */

const apiKey = process.env.DEEPSEEK_API_KEY;
if (!apiKey) {
  console.error(
    [
      "缺少 DEEPSEEK_API_KEY。",
      "",
      "請用環境變數傳入，例如：",
      "  DEEPSEEK_API_KEY='<你的 key>' npm run audit:writing",
      "",
      "不要把 key 寫進原始碼、不要 commit、不要貼進聊天或 log。",
    ].join("\n"),
  );
  process.exit(1);
}

/** deepseek-chat 的參考單價（USD / 1M tokens）。只用來估算，不是帳單。 */
const PRICE_PER_M_INPUT = 0.27;
const PRICE_PER_M_OUTPUT = 1.1;

const DEFAULT_FIXTURES = [
  "tests/fixtures/writing/essay-a-average.json",
  "tests/fixtures/writing/essay-b-weak.json",
  "tests/fixtures/writing/essay-c-strong.json",
];

const fixtures = process.argv.slice(2).length > 0 ? process.argv.slice(2) : DEFAULT_FIXTURES;

const OUT_DIR = process.env.WRITING_AUDIT_OUT_DIR || "docs/learn/writing-audit";
const stamp = new Date().toISOString().replace(/[:.]/g, "-").slice(0, 19);

/* ──────────────── 型別 ──────────────── */

interface Fixture extends EssayInput {
  profile: string;
  expectations?: string[];
}

interface PassReport {
  label: string;
  ok: boolean;
  attempts: number;
  neededRepair: boolean;
  latencyMs: number;
  telemetry: CallTelemetry[];
  issues: readonly ValidationIssue[];
  detail?: string;
}

/* ──────────────── 證據查核 ──────────────── */

/**
 * 引用是否真的出現在作文裡。
 *
 * 先做逐字比對；失敗時把空白正規化後再比一次，避免因為換行或雙空格
 * 就把一段真實引用誤判成捏造。仍然對不上才算捏造。
 */
function quoteIsReal(essay: string, quote: string): boolean {
  if (essay.includes(quote)) return true;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return norm(essay).includes(norm(quote));
}

interface EvidenceAudit {
  total: number;
  fabricated: { where: string; quote: string }[];
}

function auditEvidence(
  essay: string,
  competency: CompetencyAnalysis,
  errors: ErrorAnalysis,
  highScore: readonly HighScoreAnalysis[],
): EvidenceAudit {
  const fabricated: { where: string; quote: string }[] = [];
  let total = 0;

  for (const category of competency.categories) {
    for (const skill of category.skills) {
      for (const ev of skill.evidence) {
        total += 1;
        if (!quoteIsReal(essay, ev.quote)) fabricated.push({ where: skill.code, quote: ev.quote });
      }
    }
  }
  for (const finding of errors.findings) {
    total += 1;
    if (!quoteIsReal(essay, finding.quote)) {
      fabricated.push({ where: finding.code, quote: finding.quote });
    }
  }
  for (const pass of highScore) {
    for (const feature of pass.features) {
      for (const inst of feature.instances) {
        total += 1;
        if (!quoteIsReal(essay, inst.quote)) {
          fabricated.push({ where: feature.code, quote: inst.quote });
        }
      }
    }
  }

  return { total, fabricated };
}

/* ──────────────── 報告 ──────────────── */

function ms(n: number) {
  return `${(n / 1000).toFixed(1)}s`;
}

function sumTokens(reports: PassReport[]) {
  let input = 0;
  let output = 0;
  for (const r of reports) {
    for (const c of r.telemetry) {
      input += c.promptTokens ?? 0;
      output += c.completionTokens ?? 0;
    }
  }
  return { input, output };
}

function costUsd(input: number, output: number) {
  return (input / 1_000_000) * PRICE_PER_M_INPUT + (output / 1_000_000) * PRICE_PER_M_OUTPUT;
}

function competencySection(a: CompetencyAnalysis): string {
  const lines: string[] = [];
  for (const category of a.categories) {
    const meta = COMPETENCY_CATEGORY_BY_CODE.get(category.code);
    lines.push(`### ${category.code} ${meta?.zh ?? ""}`, "", `> ${category.summary}`, "");
    lines.push("| Skill | 判定 | 理由 | 引用 |", "|---|---|---|---|");
    for (const skill of category.skills) {
      const zh = COMPETENCY_SKILL_BY_CODE.get(skill.code)?.zh ?? skill.code;
      const quotes = skill.evidence.map((e) => `「${e.quote}」`).join("<br>") || "—";
      lines.push(`| ${zh}<br>\`${skill.code}\` | **${skill.state}** | ${skill.reason} | ${quotes} |`);
    }
    lines.push("");
  }
  return lines.join("\n");
}

function errorSection(a: ErrorAnalysis): string {
  const lines: string[] = [];
  lines.push("### 找到的錯誤", "");
  if (a.findings.length === 0) {
    lines.push("本篇未找到任何已分類的錯誤。", "");
  } else {
    lines.push("| 代碼 | 原句 | 修改後 | 說明 |", "|---|---|---|---|");
    for (const f of a.findings) {
      const zh = ERROR_TAG_BY_CODE.get(f.code)?.zh ?? f.code;
      lines.push(`| ${zh}<br>\`${f.code}\` | ${f.quote} | ${f.correction} | ${f.reason} |`);
    }
    lines.push("");
  }

  const zero = a.coverage.filter((c) => c.count === 0);
  lines.push(
    "### 覆蓋",
    "",
    `全 16 個 code 都有明確陳述。其中 ${zero.length} 個為「本篇未發現此類錯誤」：`,
    "",
    zero.map((c) => ERROR_TAG_BY_CODE.get(c.code)?.zh ?? c.code).join("、"),
    "",
  );
  return lines.join("\n");
}

function highScoreSection(passes: readonly HighScoreAnalysis[]): string {
  const all = passes.flatMap((p) => p.features);
  const byQuality = (q: string) => all.filter((f) => f.quality === q);
  const lines: string[] = [];

  for (const [quality, heading] of [
    ["EFFECTIVE", "有效運用"],
    ["PARTIALLY_EFFECTIVE", "差一點"],
    ["MISUSED", "用錯了"],
  ] as const) {
    const items = byQuality(quality);
    lines.push(`### ${heading}（${items.length}）`, "");
    if (items.length === 0) {
      lines.push("（本篇沒有）", "");
      continue;
    }
    for (const f of items) {
      const zh = HIGH_SCORE_FEATURE_BY_CODE.get(f.code)?.zh ?? f.code;
      lines.push(`**${zh}** \`${f.code}\``, "", `${f.reason}`, "");
      for (const inst of f.instances) {
        lines.push(`> ${inst.quote}`, "", `  ${inst.reason}`);
        if (inst.suggestion) lines.push(`  建議：${inst.suggestion}`);
        if (inst.subskills?.length) lines.push(`  偵測到：${inst.subskills.join("、")}`);
        lines.push("");
      }
    }
  }

  const unmeasured = byQuality("UNMEASURED");
  lines.push(
    `### 本次未出現（${unmeasured.length}）`,
    "",
    unmeasured.map((f) => HIGH_SCORE_FEATURE_BY_CODE.get(f.code)?.zh ?? f.code).join("、"),
    "",
  );
  return lines.join("\n");
}

function synthesisSection(s: SynthesisResult): string {
  const label = (refs: readonly string[] | undefined) =>
    refs?.length ? ` \`${refs.join("` `")}\`` : "";
  return [
    `**整體：${s.overall_evaluation.level}**`,
    "",
    `> ${s.overall_evaluation.headline}`,
    "",
    s.overall_evaluation.summary,
    "",
    "**值得肯定**",
    "",
    ...s.strengths.map((h) => `- ${h.text}${label(h.refs)}`),
    "",
    "**需要處理**",
    "",
    ...s.needs_work.map((h) => `- ${h.text}${label(h.refs)}`),
    "",
    "**下一步**",
    "",
    ...s.next_steps.map((n, i) => `${i + 1}. ${n.text}${label(n.refs)}`),
    "",
  ].join("\n");
}

/* ──────────────── 主流程 ──────────────── */

interface RunSummary {
  profile: string;
  ok: boolean;
  stage1Ms: number;
  synthesisMs: number;
  totalMs: number;
  repairs: number;
  fabricated: number;
  evidenceTotal: number;
  inputTokens: number;
  outputTokens: number;
  failedPass?: string;
}

async function auditOne(path: string): Promise<RunSummary> {
  const fixture = JSON.parse(readFileSync(path, "utf8")) as Fixture;
  const essay: EssayInput = {
    title: fixture.title,
    topic: fixture.topic,
    content: fixture.content,
  };

  console.log(`\n── ${fixture.profile} ──`);
  console.log(`   ${fixture.title}`);

  const shared = { apiKey: apiKey!, signal: undefined };
  const stage1Start = Date.now();

  const [c, e, ha, hb] = await Promise.all([
    runValidatedPass({ ...shared, label: "Competency", messages: competencyMessages(essay), validate: validateCompetencyAnalysis }),
    runValidatedPass({ ...shared, label: "Error", messages: errorMessages(essay), validate: validateErrorAnalysis }),
    runValidatedPass({
      ...shared,
      label: "High-Score H1–H3",
      messages: highScoreMessages(essay, highScoreCategoriesFor(HIGH_SCORE_PASS_A)),
      validate: (raw) => validateHighScoreAnalysis(raw, HIGH_SCORE_PASS_A),
    }),
    runValidatedPass({
      ...shared,
      label: "High-Score H4–H5",
      messages: highScoreMessages(essay, highScoreCategoriesFor(HIGH_SCORE_PASS_B)),
      validate: (raw) => validateHighScoreAnalysis(raw, HIGH_SCORE_PASS_B),
    }),
  ]);
  const stage1Ms = Date.now() - stage1Start;

  const reports: PassReport[] = [
    { label: "Pass 1 Competency", ...toReport(c) },
    { label: "Pass 2 Error", ...toReport(e) },
    { label: "Pass 3a High-Score H1–H3", ...toReport(ha) },
    { label: "Pass 3b High-Score H4–H5", ...toReport(hb) },
  ];

  for (const r of reports) {
    console.log(
      `   ${r.ok ? "OK  " : "FAIL"} ${r.label.padEnd(28)} ${ms(r.latencyMs).padStart(6)}` +
        `  ${r.attempts} 次呼叫${r.neededRepair ? "（含缺漏重試）" : ""}`,
    );
  }

  const broken = reports.find((r) => !r.ok);
  if (broken) {
    const md = failureReport(fixture, reports);
    writeReport(fixture, md);
    return {
      profile: fixture.profile,
      ok: false,
      stage1Ms,
      synthesisMs: 0,
      totalMs: stage1Ms,
      repairs: reports.filter((r) => r.neededRepair).length,
      fabricated: 0,
      evidenceTotal: 0,
      ...sumTokensAs(reports),
      failedPass: broken.label,
    };
  }

  const competency = (c as { value: CompetencyAnalysis }).value;
  const errors = (e as { value: ErrorAnalysis }).value;
  const hsA = (ha as { value: HighScoreAnalysis }).value;
  const hsB = (hb as { value: HighScoreAnalysis }).value;

  const evidence = auditEvidence(essay.content, competency, errors, [hsA, hsB]);

  // ── Stage 2 ──
  const citable = collectCitableRefs(competency, errors, [hsA, hsB]);
  const digest = compressForSynthesis(competency, errors, [hsA, hsB]);

  const synthStart = Date.now();
  const s = await runValidatedPass({
    ...shared,
    label: "Synthesis",
    messages: synthesisMessages(digest, [...citable]),
    validate: (raw) => validateSynthesis(raw, citable),
    maxTokens: 3000,
  });
  const synthesisMs = Date.now() - synthStart;
  reports.push({ label: "Pass 5 Synthesis", ...toReport(s) });

  console.log(
    `   ${isPassOk(s) ? "OK  " : "FAIL"} ${"Pass 5 Synthesis".padEnd(28)} ${ms(synthesisMs).padStart(6)}` +
      `  ${s.attempts} 次呼叫`,
  );
  console.log(
    `   證據查核：${evidence.total} 段引用，${evidence.fabricated.length} 段在原文中找不到`,
  );

  const totalMs = stage1Ms + synthesisMs;
  const md = fullReport(fixture, reports, {
    competency,
    errors,
    highScore: [hsA, hsB],
    synthesis: isPassOk(s) ? s.value : null,
    synthesisFailure: isPassOk(s) ? null : (s as PassFailure),
    evidence,
    citable,
    stage1Ms,
    synthesisMs,
  });
  writeReport(fixture, md);

  return {
    profile: fixture.profile,
    ok: isPassOk(s),
    stage1Ms,
    synthesisMs,
    totalMs,
    repairs: reports.filter((r) => r.neededRepair).length,
    fabricated: evidence.fabricated.length,
    evidenceTotal: evidence.total,
    ...sumTokensAs(reports),
    failedPass: isPassOk(s) ? undefined : "Pass 5 Synthesis",
  };
}

function toReport<T>(pass: PassOutcome<T>): Omit<PassReport, "label"> {
  const telemetry = pass.telemetry;
  const failure = isPassOk(pass) ? null : (pass as PassFailure);
  return {
    ok: pass.ok,
    attempts: pass.attempts,
    neededRepair: telemetry.some((t) => t.isRepair),
    latencyMs: telemetry.reduce((n, t) => n + t.latencyMs, 0),
    telemetry,
    issues: failure?.issues ?? [],
    detail: failure?.detail,
  };
}

function sumTokensAs(reports: PassReport[]) {
  const { input, output } = sumTokens(reports);
  return { inputTokens: input, outputTokens: output };
}

function timingTable(reports: PassReport[]): string {
  const lines = ["| Pass | 結果 | 延遲 | 呼叫次數 | 缺漏重試 | input tokens | output tokens |", "|---|---|---|---|---|---|---|"];
  for (const r of reports) {
    const inTok = r.telemetry.reduce((n, t) => n + (t.promptTokens ?? 0), 0);
    const outTok = r.telemetry.reduce((n, t) => n + (t.completionTokens ?? 0), 0);
    lines.push(
      `| ${r.label} | ${r.ok ? "通過" : "**失敗**"} | ${ms(r.latencyMs)} | ${r.attempts} | ${r.neededRepair ? "是" : "否"} | ${inTok} | ${outTok} |`,
    );
  }
  return lines.join("\n");
}

function failureReport(fixture: Fixture, reports: PassReport[]): string {
  const broken = reports.filter((r) => !r.ok);
  return [
    `# 稽核報告（失敗）：${fixture.profile}`,
    "",
    `模型：deepseek-chat  執行時間：${new Date().toISOString()}`,
    "",
    "## 延遲與重試",
    "",
    timingTable(reports),
    "",
    "## 失敗的 pass",
    "",
    ...broken.flatMap((r) => [
      `### ${r.label}`,
      "",
      `${r.detail ?? ""}`,
      "",
      r.issues.length > 0
        ? ["| 類型 | 位置 | 說明 |", "|---|---|---|", ...r.issues.map((i) => `| ${i.kind} | ${i.path} | ${i.detail} |`)].join("\n")
        : "（沒有驗證層級的缺漏，是呼叫本身失敗）",
      "",
    ]),
    "> 依規則：任何一支 pass 沒過就不發佈報告。這裡沒有做任何補值。",
    "",
  ].join("\n");
}

function fullReport(
  fixture: Fixture,
  reports: PassReport[],
  data: {
    competency: CompetencyAnalysis;
    errors: ErrorAnalysis;
    highScore: readonly HighScoreAnalysis[];
    synthesis: SynthesisResult | null;
    synthesisFailure: PassFailure | null;
    evidence: EvidenceAudit;
    citable: Set<string>;
    stage1Ms: number;
    synthesisMs: number;
  },
): string {
  const { input, output } = sumTokens(reports);
  const allFeatures = data.highScore.flatMap((p) => p.features);
  const effective = allFeatures.filter((f) => f.quality === "EFFECTIVE").length;
  const partial = allFeatures.filter((f) => f.quality === "PARTIALLY_EFFECTIVE").length;
  const misused = allFeatures.filter((f) => f.quality === "MISUSED").length;
  const skills = data.competency.categories.flatMap((c) => c.skills);
  const counts = (state: string) => skills.filter((s) => s.state === state).length;

  return [
    `# 稽核報告：${fixture.profile}`,
    "",
    `**${fixture.title}**`,
    "",
    `模型：deepseek-chat  執行時間：${new Date().toISOString()}`,
    "",
    "## 1. 一眼看完",
    "",
    "| 項目 | 結果 |",
    "|---|---|",
    `| Stage 1 延遲（四支平行） | ${ms(data.stage1Ms)} |`,
    `| Stage 2 延遲（綜合層） | ${ms(data.synthesisMs)} |`,
    `| 端對端 | ${ms(data.stage1Ms + data.synthesisMs)} |`,
    `| 對 50 秒硬性期限的餘裕 | ${ms(50_000 - data.stage1Ms - data.synthesisMs)} |`,
    `| 需要缺漏重試的 pass | ${reports.filter((r) => r.neededRepair).length} / ${reports.length} |`,
    `| 引用查核 | ${data.evidence.total} 段，其中 ${data.evidence.fabricated.length} 段在原文中找不到 |`,
    `| 能力判定 | STRONG ${counts("STRONG")}・ADEQUATE ${counts("ADEQUATE")}・DEVELOPING ${counts("DEVELOPING")}・UNMEASURED ${counts("UNMEASURED")} |`,
    `| 錯誤 | ${data.errors.findings.length} 處，涵蓋 ${new Set(data.errors.findings.map((f) => f.code)).size} 類 |`,
    `| 高分特徵 | EFFECTIVE ${effective}・PARTIAL ${partial}・MISUSED ${misused}・UNMEASURED ${allFeatures.length - effective - partial - misused} |`,
    `| token（估） | input ${input}・output ${output}・約 US$${costUsd(input, output).toFixed(4)} |`,
    "",
    "## 2. 延遲與重試",
    "",
    timingTable(reports),
    "",
    "## 3. 自動查核",
    "",
    "| 查核 | 結果 |",
    "|---|---|",
    `| 完整覆蓋 23 / 16 / 17 / 12 個節點 | ${reports.slice(0, 4).every((r) => r.ok) ? "通過" : "**未通過**"} |`,
    `| 引用逐字存在於作文中 | ${data.evidence.fabricated.length === 0 ? "全部通過" : `**${data.evidence.fabricated.length} 段找不到**`} |`,
    `| coverage 與 findings 筆數一致 | 通過（驗證層強制） |`,
    `| UNMEASURED 皆有理由且未夾帶證據 | 通過（驗證層強制） |`,
    `| 綜合層 refs 皆在已驗證集合內 | ${data.synthesis ? "通過" : "**綜合層失敗**"} |`,
    "",
    ...(data.evidence.fabricated.length > 0
      ? [
          "### 找不到出處的引用（疑似捏造）",
          "",
          "| 節點 | 引用內容 |",
          "|---|---|",
          ...data.evidence.fabricated.map((f) => `| \`${f.where}\` | ${f.quote} |`),
          "",
        ]
      : []),
    "## 4. 綜合層（學生會看到的第一屏）",
    "",
    data.synthesis
      ? synthesisSection(data.synthesis)
      : [
          "**綜合層失敗**，四軸資料完整保留。",
          "",
          data.synthesisFailure?.detail ?? "",
          "",
          ...(data.synthesisFailure?.issues ?? []).map((i) => `- [${i.kind}] ${i.path}：${i.detail}`),
          "",
        ].join("\n"),
    "",
    "## 5. 寫作能力（Pass 1）",
    "",
    competencySection(data.competency),
    "## 6. 錯誤（Pass 2）",
    "",
    errorSection(data.errors),
    "## 7. 高分特徵（Pass 3a + 3b）",
    "",
    highScoreSection(data.highScore),
    "## 8. 人工判讀對照表",
    "",
    "這篇 fixture 在設計時埋了以下判斷點。請對照上面的實際輸出，判斷模型合不合理。",
    "**這不是標準答案**，模型有理由的不同判斷是可以接受的。",
    "",
    ...(fixture.expectations ?? []).map((x) => `- ${x}`),
    "",
    "## 9. 作文原文（對照用）",
    "",
    "```",
    fixture.content,
    "```",
    "",
  ].join("\n");
}

function writeReport(fixture: Fixture, md: string) {
  mkdirSync(OUT_DIR, { recursive: true });
  const slug = fixture.profile.split("｜")[0].trim().toLowerCase();
  const file = join(OUT_DIR, `${stamp}-essay-${slug}.md`);
  writeFileSync(file, md, "utf8");
  console.log(`   報告：${file}`);
}

/* ──────────────── 執行 ──────────────── */

const summaries: RunSummary[] = [];
for (const path of fixtures) {
  try {
    summaries.push(await auditOne(path));
  } catch (err) {
    console.error(`\n${path} 執行失敗：`, err instanceof Error ? err.message : err);
  }
}

console.log("\n══════════ 總結 ══════════\n");
console.log("| 輪廓 | 結果 | Stage 1 | 綜合層 | 端對端 | 重試 | 捏造引用 | tokens |");
console.log("|---|---|---|---|---|---|---|---|");
for (const s of summaries) {
  console.log(
    `| ${s.profile} | ${s.ok ? "通過" : `失敗（${s.failedPass}）`} | ${ms(s.stage1Ms)} | ${ms(s.synthesisMs)} | ${ms(s.totalMs)} | ${s.repairs} | ${s.fabricated}/${s.evidenceTotal} | ${s.inputTokens}+${s.outputTokens} |`,
  );
}

const worst = Math.max(0, ...summaries.map((s) => s.totalMs));
console.log(`\n最慢一篇端對端：${ms(worst)}  對 50 秒硬性期限的餘裕：${ms(50_000 - worst)}`);
if (worst > 40_000) {
  console.log("\n⚠️  已接近 60 秒的 Vercel 執行上限。請先回報量測數字，不要為了塞進去而改架構。");
}

const totalIn = summaries.reduce((n, s) => n + s.inputTokens, 0);
const totalOut = summaries.reduce((n, s) => n + s.outputTokens, 0);
console.log(
  `\n本次共 ${summaries.length} 篇：input ${totalIn}・output ${totalOut}・約 US$${costUsd(totalIn, totalOut).toFixed(4)}`,
);
console.log(`\n報告寫在 ${OUT_DIR}/`);

if (summaries.some((s) => !s.ok)) process.exit(1);
