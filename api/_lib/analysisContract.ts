/**
 * 寫作 AI 分析的資料契約與驗證
 *
 * 前端（報告 UI）與 api/analyze-writing.ts 共用。純 TypeScript，不 import 任何
 * 執行期相依，也不用 `@/` alias —— Vercel serverless function 沒有 Vite path alias。
 *
 * ┌─────────────────────────────────────────────────────────────────────────┐
 * │ 這個檔案存在的唯一理由：                                                 │
 * │                                                                         │
 * │   UNMEASURED  =  模型明確評估過這個 canonical node，判定本篇沒有提供      │
 * │                  足夠證據／這個能力沒有被題目 elicit，並且寫出理由。      │
 * │                                                                         │
 * │   缺漏        =  模型根本沒有回傳這個 canonical node。                    │
 * │                                                                         │
 * │ 這兩件事永遠不可以互相取代。缺漏一律當成 structured-output 驗證失敗，     │
 * │ 由呼叫端重試或讓該 pass 失敗；【絕不】在伺服器端補成 UNMEASURED。         │
 * │                                                                         │
 * │ 因為我們永遠不能把「學生沒有表現出來」和「AI 忘了分析」混為一談。         │
 * └─────────────────────────────────────────────────────────────────────────┘
 */

import {
  ALL_COMPETENCY_SKILL_CODES,
  ALL_ERROR_CODES,
  COMPETENCY_CATEGORIES,
  ERROR_TAG_BY_CODE,
  HIGH_SCORE_CATEGORIES,
  HIGH_SCORE_FEATURE_BY_CODE,
  HIGH_SCORE_SUBSKILL_BY_CODE,
  WRITING_TAXONOMY_VERSION,
} from "./taxonomy.js";

/* ──────────────── 狀態語彙 ──────────────── */

/**
 * Axis 1。三軸的「沒出現」意義不同，所以狀態語彙刻意不共用。
 * UNMEASURED 依 TR-11：沒有被 task elicited ≠ weak。
 */
export const COMPETENCY_STATES = [
  "STRONG",
  "ADEQUATE",
  "DEVELOPING",
  "UNMEASURED",
] as const;
export type CompetencyState = (typeof COMPETENCY_STATES)[number];

/**
 * Axis 3。canonical 值依 TR-05，只有 EFFECTIVE 是明確 positive evidence。
 * UI 顯示為「有效運用 / 差一點 / 用錯了 / 本次未出現」。
 */
export const HIGH_SCORE_QUALITIES = [
  "EFFECTIVE",
  "PARTIALLY_EFFECTIVE",
  "MISUSED",
  "UNMEASURED",
] as const;
export type HighScoreQuality = (typeof HIGH_SCORE_QUALITIES)[number];

/**
 * Axis 2 沒有 UNMEASURED。count = 0 代表「本篇未發現此類錯誤」，
 * 這是對這一篇的觀察，不是精熟度宣稱（TR-12 / TR-13）。
 */
export const ZERO_ERROR_LABEL = "本篇未發現此類錯誤";

/* ──────────────── 共用形狀 ──────────────── */

/** 學生原文證據。quote 必須是原文的逐字片段，不可改寫。 */
export interface EvidenceSpan {
  readonly quote: string;
  readonly reason: string;
}

/* ──────────────── Pass 1：Writing Competency ──────────────── */

export interface CompetencySkillFinding {
  readonly code: string;
  readonly state: CompetencyState;
  /** 為什麼是這個 state。UNMEASURED 也必須有理由——它是判斷，不是預設值。 */
  readonly reason: string;
  /** UNMEASURED 時必須為空陣列（沒有證據就是沒有證據，不可捏造）。 */
  readonly evidence: readonly EvidenceSpan[];
}

export interface CompetencyCategoryResult {
  readonly code: string;
  readonly summary: string;
  readonly skills: readonly CompetencySkillFinding[];
}

export interface CompetencyAnalysis {
  readonly taxonomy_version: string;
  readonly categories: readonly CompetencyCategoryResult[];
}

/* ──────────────── Pass 2：Writing Error ──────────────── */

export interface ErrorFinding {
  readonly code: string;
  readonly quote: string;
  readonly reason: string;
  /** 改寫後的正確版本。錯誤一定要能給修正，否則對學生沒有用。 */
  readonly correction: string;
  /** 掛回 Axis 1 的 Primary Writing Skill（TR-15：Run-on 仍歸 W4）。 */
  readonly primary_skill: string;
}

/** 全 16 個 code 都必須出現，count = 0 也要明講。 */
export interface ErrorCoverageEntry {
  readonly code: string;
  readonly count: number;
  readonly note?: string;
}

export interface ErrorAnalysis {
  readonly taxonomy_version: string;
  readonly findings: readonly ErrorFinding[];
  readonly coverage: readonly ErrorCoverageEntry[];
}

/* ──────────────── 形式前提：只在邏輯上確實成立的地方設 ──────────────── */

/**
 * 有些高分特徵有【邏輯上必然】的形式前提。前提不成立時，那個特徵不可能有證據，
 * 只能是 UNMEASURED——這件事不需要模型配合，程式就能判定。
 *
 * ⚠️ 前提是【必要條件，不是充分條件】。
 *    作文裡有問號，不代表那個問句就是修辭問句、更不代表它有效。
 *    前提成立時，這裡不做任何限制，判斷仍然完全交給模型。
 *
 * ⚠️ 刻意只列兩項。倒裝、比喻、平行結構這類特徵無法在不做句法剖析的情況下
 *    可靠偵測，硬加守衛只會製造 false negative——那比不檢查更糟。
 *    2026-09-05 的實測就是被漏看倒裝咬過一次，不要用另一種方式再犯。
 */
export interface FeaturePrerequisite {
  readonly featureCode: string;
  readonly isSatisfied: (essay: string) => boolean;
  readonly detail: string;
}

export const FEATURE_PREREQUISITES: readonly FeaturePrerequisite[] = [
  {
    featureCode: "WRITE_HSF_RHET_QUESTION",
    // 修辭問句必須是問句。沒有問號就沒有問句。
    isSatisfied: (essay) => /[?？]/.test(essay),
    detail: "作文裡沒有任何問號，因此不存在問句，修辭問句只能是 UNMEASURED",
  },
  {
    featureCode: "WRITE_HSF_PARA_PROGRESSION",
    // 只有一個段落時，不存在「段落之間」的銜接。
    isSatisfied: (essay) =>
      essay.trim().split(/\n\s*\n/).filter((p) => p.trim().length > 0).length >= 2,
    detail: "作文只有一個段落，不存在段落間的銜接，只能是 UNMEASURED",
  },
];

const PREREQUISITE_BY_CODE = new Map(FEATURE_PREREQUISITES.map((p) => [p.featureCode, p]));

/* ──────────────── Pass 3a / 3b：High-Score Feature ──────────────── */

export interface HighScoreInstance {
  readonly quote: string;
  readonly reason: string;
  /**
   * 偵測到的 sub-skill code（TR-07：偵測判準，不是 taxonomy node）。
   * 不納入完整覆蓋驗證；無法辨識的 code 會被丟棄而不是讓 pass 失敗。
   */
  readonly subskills?: readonly string[];
  /** PARTIALLY_EFFECTIVE / MISUSED 時的建議寫法。 */
  readonly suggestion?: string;
}

/**
 * EFFECTIVE 的舉證。判 EFFECTIVE 必須附上這三項，缺一不可。
 *
 * 這不是形式主義。2026-09-05 的實測顯示，光在 prompt 裡要求模型「嚴格一點」
 * 完全沒有作用（29 個特徵判了 28 個 EFFECTIVE）。所以改成【提高舉證成本】：
 * 要給 EFFECTIVE，就必須逐項說出滿足了哪條判準、對這篇文章產生什麼作用、
 * 以及為什麼不只是形式存在。做不到就降級。
 *
 * 這比固定配額好，因為配額會懲罰真正寫得好的文章。
 */
export interface EffectiveJustification {
  /** 滿足了這個 feature 的哪一條 canonical 判準 */
  readonly criterion: string;
  /** 對【這一篇】作文產生了什麼具體的正面作用 */
  readonly effect: string;
  /** 為什麼這不只是「形式出現了」 */
  readonly beyondForm: string;
}

export interface HighScoreFeatureFinding {
  readonly code: string;
  readonly quality: HighScoreQuality;
  readonly reason: string;
  /** quality === "EFFECTIVE" 時必填；其他 quality 不得填寫。 */
  readonly justification?: EffectiveJustification;
  /**
   * TR-04：High-Score Feature finding 必須記錄 evidence_span。
   * 因此 quality !== UNMEASURED 時至少要有一筆；UNMEASURED 時必須為空。
   */
  readonly instances: readonly HighScoreInstance[];
}

export interface HighScoreAnalysis {
  readonly taxonomy_version: string;
  readonly features: readonly HighScoreFeatureFinding[];
}

/* ──────────────── 綜合層（摘要，不是清單） ──────────────── */

export const OVERALL_LEVELS = [
  "NEEDS_REWORK",
  "DEVELOPING",
  "SOLID",
  "STRONG",
] as const;
export type OverallLevel = (typeof OVERALL_LEVELS)[number];

export interface OverallEvaluation {
  readonly level: OverallLevel;
  /** 第一屏那一句話。對學生說話，不是評分術語。 */
  readonly headline: string;
  readonly summary: string;
}

/**
 * 第一屏的重點；只是編輯取捨，完整分析仍在下方三個矩陣裡。
 *
 * ⚠️ 這個型別【沒有】任何放證據的欄位，這是刻意的。
 *
 *    綜合層拿不到作文全文（compressForSynthesis 只給它壓縮摘要），所以它
 *    根本沒有能力正確引用原文。2026-09-05 的實測證實了後果：它在 text 裡
 *    憑空生出一句中文「原文引用」，而那句話在作文裡完全不存在。
 *
 *    因此職責切開：
 *      綜合層  → 只做摘要與排序，text 是【說明】，不是證據
 *      Stage 1 → 唯一的證據來源
 *      UI      → 靠 refs 回 Stage 1 取出真正的原句顯示給學生
 *
 *    text 內不得出現引號，也不得出現成串的英文——學生的作文是英文，
 *    綜合層寫的是中文，成串英文只可能是它在引用（或編造）原文。
 */
export interface Highlight {
  readonly text: string;
  readonly refs: readonly string[];
}

/** 排序層，不是清單層：最多 3 項。 */
export interface NextStep {
  readonly text: string;
  readonly refs?: readonly string[];
}

/**
 * 綜合層可以引用的 canonical code 集合。
 *
 * 只包含 Stage 1 真的有證據的節點：有表現的 competency skill、確實出現的
 * error code、非 UNMEASURED 的 high-score feature，加上它們所屬的類別代碼。
 * 綜合層引用集合以外的東西 = 它在憑空發明 finding（紅線 A），驗證會擋下來。
 */
export function collectCitableRefs(
  competency: CompetencyAnalysis,
  errors: ErrorAnalysis,
  highScore: readonly HighScoreAnalysis[],
): Set<string> {
  const refs = new Set<string>();

  for (const category of competency.categories) {
    let any = false;
    for (const skill of category.skills) {
      if (skill.state !== "UNMEASURED") {
        refs.add(skill.code);
        any = true;
      }
    }
    if (any) refs.add(category.code);
  }

  for (const entry of errors.coverage) {
    if (entry.count > 0) {
      refs.add(entry.code);
      const tag = ERROR_TAG_BY_CODE.get(entry.code);
      for (const skill of tag?.primarySkills ?? []) refs.add(skill);
    }
  }

  for (const pass of highScore) {
    for (const feature of pass.features) {
      if (feature.quality !== "UNMEASURED") {
        refs.add(feature.code);
        const meta = HIGH_SCORE_FEATURE_BY_CODE.get(feature.code);
        if (meta) refs.add(meta.categoryCode);
      }
    }
  }

  return refs;
}

export const MAX_NEXT_STEPS = 3;

/* ──────────────── 驗證 ──────────────── */

export type ValidationIssueKind =
  | "MALFORMED"
  | "MISSING_NODE"
  | "UNKNOWN_NODE"
  | "DUPLICATE_NODE"
  | "INVALID_STATE"
  | "MISSING_REASON"
  | "MISSING_EVIDENCE"
  | "UNEXPECTED_EVIDENCE"
  | "COUNT_MISMATCH"
  | "TOO_MANY"
  | "MISSING_CITATION"
  | "UNCITABLE_REF"
  | "QUOTE_NOT_IN_ESSAY"
  | "PREREQUISITE_NOT_MET"
  | "MISSING_JUSTIFICATION"
  | "SYNTHESIS_EVIDENCE";

export interface ValidationIssue {
  readonly kind: ValidationIssueKind;
  readonly path: string;
  readonly detail: string;
}

export interface ValidationOk<T> {
  readonly ok: true;
  readonly value: T;
}

export interface ValidationFail {
  readonly ok: false;
  readonly issues: readonly ValidationIssue[];
}

export type PassValidation<T> = ValidationOk<T> | ValidationFail;

/**
 * 這個專案的 tsconfig 是 strict: false（因此 strictNullChecks 也關著），
 * 在那個設定下 `if (result.ok)` 不保證能把可辨識聯集收窄。用明確的
 * type guard，narrowing 就與 strictNullChecks 無關。
 */
export function isValidationOk<T>(result: PassValidation<T>): result is ValidationOk<T> {
  return result.ok === true;
}

/**
 * 引用是否真的逐字出現在學生作文裡。
 *
 * 2026-09-05 的真實測試顯示：模型會把 quote 欄位當成「證據摘要」用——
 * 把不相鄰的段落用 ... 或 / 接起來，或是塞一串詞彙清單。那些字串在原文裡
 * 根本找不到，報告一旦上線，學生會點到一段自己文章裡沒有的「原句」。
 *
 * 所以這件事改成驗證層強制，不只是在 prompt 裡請求。
 * 比對前先把空白正規化並轉小寫，避免因為換行或大小寫就誤殺真實引用。
 */
export function quoteAppearsInEssay(essay: string, quote: string): boolean {
  if (essay.includes(quote)) return true;
  const norm = (s: string) => s.replace(/\s+/g, " ").trim().toLowerCase();
  return norm(essay).includes(norm(quote));
}

/** 引號：中英日常用的都算 */
const QUOTE_MARK = /[「」『』“”‘’"']/;

/** 連續四個以上的拉丁字詞——綜合層寫中文，這種東西只可能是引文 */
const LATIN_RUN = /(?:[A-Za-z][A-Za-z'’-]*[ \t]+){3,}[A-Za-z][A-Za-z'’-]*/;

/**
 * 綜合層的 text 不得夾帶證據。
 *
 * 不能只靠偵測引號——2026-09-05 那次的捏造引用【有】引號，但重點不在標點，
 * 而在於綜合層根本沒有原文可引。所以兩條一起擋：引號，以及成串英文。
 */
function checkNoEmbeddedEvidence(
  text: string,
  path: string,
  issues: ValidationIssue[],
): void {
  if (QUOTE_MARK.test(text)) {
    issues.push({
      kind: "SYNTHESIS_EVIDENCE",
      path,
      detail: "綜合層不得引用原文。請改成描述，並用 refs 指回 Stage 1 的 finding",
    });
    return;
  }
  const run = LATIN_RUN.exec(text);
  if (run) {
    issues.push({
      kind: "SYNTHESIS_EVIDENCE",
      path,
      detail: `綜合層不得夾帶原文片段：「${run[0]}」。證據一律由 refs 指回 Stage 1`,
    });
  }
}

const isNonEmptyString = (v: unknown): v is string =>
  typeof v === "string" && v.trim().length > 0;

const isRecord = (v: unknown): v is Record<string, unknown> =>
  typeof v === "object" && v !== null && !Array.isArray(v);

/**
 * 檢查一組回傳的 code 是否恰好覆蓋 canonical 清單。
 * 缺漏、重複、不認識的 code 都是驗證失敗——這裡不做任何補值。
 */
function checkCoverage(
  returned: readonly string[],
  canonical: readonly string[],
  path: string,
): ValidationIssue[] {
  const issues: ValidationIssue[] = [];
  const canonicalSet = new Set(canonical);
  const seen = new Set<string>();

  for (const code of returned) {
    if (!canonicalSet.has(code)) {
      issues.push({
        kind: "UNKNOWN_NODE",
        path,
        detail: `不在 canonical taxonomy 內的 code：${code}`,
      });
    } else if (seen.has(code)) {
      issues.push({ kind: "DUPLICATE_NODE", path, detail: `重複回傳：${code}` });
    }
    seen.add(code);
  }

  for (const code of canonical) {
    if (!seen.has(code)) {
      issues.push({
        kind: "MISSING_NODE",
        path,
        detail: `模型沒有回傳這個 canonical node：${code}（不得補成 UNMEASURED）`,
      });
    }
  }

  return issues;
}

function validateEvidence(
  raw: unknown,
  path: string,
  issues: ValidationIssue[],
  essay: string,
): EvidenceSpan[] {
  if (!Array.isArray(raw)) {
    issues.push({ kind: "MALFORMED", path, detail: "evidence 必須是陣列" });
    return [];
  }
  const out: EvidenceSpan[] = [];
  raw.forEach((item, i) => {
    if (!isRecord(item) || !isNonEmptyString(item.quote) || !isNonEmptyString(item.reason)) {
      issues.push({
        kind: "MALFORMED",
        path: `${path}[${i}]`,
        detail: "evidence 每一筆都必須有非空的 quote 與 reason",
      });
      return;
    }
    if (!quoteAppearsInEssay(essay, item.quote)) {
      issues.push({
        kind: "QUOTE_NOT_IN_ESSAY",
        path: `${path}[${i}]`,
        detail: `這段引用在作文原文裡找不到：「${item.quote}」`,
      });
      return;
    }
    out.push({ quote: item.quote, reason: item.reason });
  });
  return out;
}

/* ---------- Pass 1 ---------- */

export function validateCompetencyAnalysis(
  raw: unknown,
  essay: string,
): PassValidation<CompetencyAnalysis> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(raw) || !Array.isArray(raw.categories)) {
    return {
      ok: false,
      issues: [{ kind: "MALFORMED", path: "competency", detail: "缺少 categories 陣列" }],
    };
  }

  const categories: CompetencyCategoryResult[] = [];
  const returnedSkillCodes: string[] = [];

  for (const category of COMPETENCY_CATEGORIES) {
    const rawCat = (raw.categories as unknown[]).find(
      (c) => isRecord(c) && c.code === category.code,
    );
    if (!isRecord(rawCat)) {
      issues.push({
        kind: "MISSING_NODE",
        path: `competency.categories`,
        detail: `模型沒有回傳這個 category：${category.code}`,
      });
      continue;
    }
    if (!isNonEmptyString(rawCat.summary)) {
      issues.push({
        kind: "MISSING_REASON",
        path: `competency.${category.code}.summary`,
        detail: "category summary 不可為空",
      });
    }

    const rawSkills = Array.isArray(rawCat.skills) ? rawCat.skills : [];
    const skills: CompetencySkillFinding[] = [];

    for (const item of rawSkills) {
      if (!isRecord(item) || typeof item.code !== "string") {
        issues.push({
          kind: "MALFORMED",
          path: `competency.${category.code}.skills`,
          detail: "skill 缺少 code",
        });
        continue;
      }
      returnedSkillCodes.push(item.code);
      const path = `competency.${category.code}.${item.code}`;

      if (!COMPETENCY_STATES.includes(item.state as CompetencyState)) {
        issues.push({
          kind: "INVALID_STATE",
          path,
          detail: `state 必須是 ${COMPETENCY_STATES.join(" / ")}，收到：${String(item.state)}`,
        });
        continue;
      }
      const state = item.state as CompetencyState;

      if (!isNonEmptyString(item.reason)) {
        issues.push({
          kind: "MISSING_REASON",
          path,
          detail:
            state === "UNMEASURED"
              ? "UNMEASURED 必須說明為什麼本篇沒有 elicit 這個能力"
              : "state 必須附理由",
        });
        continue;
      }

      const evidence = validateEvidence(item.evidence ?? [], `${path}.evidence`, issues, essay);
      if (state === "UNMEASURED" && evidence.length > 0) {
        issues.push({
          kind: "UNEXPECTED_EVIDENCE",
          path,
          detail: "UNMEASURED 不得附證據",
        });
        continue;
      }

      skills.push({ code: item.code, state, reason: item.reason, evidence });
    }

    categories.push({ code: category.code, summary: String(rawCat.summary ?? ""), skills });
  }

  issues.push(
    ...checkCoverage(returnedSkillCodes, ALL_COMPETENCY_SKILL_CODES, "competency.skills"),
  );

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: { taxonomy_version: WRITING_TAXONOMY_VERSION, categories },
  };
}

/* ---------- Pass 2 ---------- */

export function validateErrorAnalysis(
  raw: unknown,
  essay: string,
): PassValidation<ErrorAnalysis> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(raw) || !Array.isArray(raw.findings) || !Array.isArray(raw.coverage)) {
    return {
      ok: false,
      issues: [
        { kind: "MALFORMED", path: "error", detail: "缺少 findings 或 coverage 陣列" },
      ],
    };
  }

  const findings: ErrorFinding[] = [];
  raw.findings.forEach((item, i) => {
    const path = `error.findings[${i}]`;
    if (
      !isRecord(item) ||
      !isNonEmptyString(item.code) ||
      !isNonEmptyString(item.quote) ||
      !isNonEmptyString(item.reason) ||
      !isNonEmptyString(item.correction) ||
      !isNonEmptyString(item.primary_skill)
    ) {
      issues.push({
        kind: "MALFORMED",
        path,
        detail: "每一筆錯誤都必須有 code / quote / reason / correction / primary_skill",
      });
      return;
    }
    if (!ALL_ERROR_CODES.includes(item.code)) {
      issues.push({ kind: "UNKNOWN_NODE", path, detail: `未知的 error code：${item.code}` });
      return;
    }
    if (!quoteAppearsInEssay(essay, item.quote)) {
      issues.push({
        kind: "QUOTE_NOT_IN_ESSAY",
        path,
        detail: `這段引用在作文原文裡找不到：「${item.quote}」`,
      });
      return;
    }
    // correction 必須是改寫後的句子，不是給學生的指令。
    if (item.correction.trim() === item.quote.trim()) {
      issues.push({
        kind: "MALFORMED",
        path,
        detail: "correction 與原句相同，沒有提供任何修正",
      });
      return;
    }
    findings.push({
      code: item.code,
      quote: item.quote,
      reason: item.reason,
      correction: item.correction,
      primary_skill: item.primary_skill,
    });
  });

  const coverage: ErrorCoverageEntry[] = [];
  const returnedCodes: string[] = [];
  raw.coverage.forEach((item, i) => {
    const path = `error.coverage[${i}]`;
    if (!isRecord(item) || typeof item.code !== "string") {
      issues.push({ kind: "MALFORMED", path, detail: "coverage 缺少 code" });
      return;
    }
    returnedCodes.push(item.code);
    if (typeof item.count !== "number" || !Number.isInteger(item.count) || item.count < 0) {
      issues.push({
        kind: "MALFORMED",
        path: `error.coverage.${item.code}`,
        detail: "count 必須是非負整數",
      });
      return;
    }
    coverage.push({
      code: item.code,
      count: item.count,
      note: isNonEmptyString(item.note) ? item.note : undefined,
    });
  });

  issues.push(...checkCoverage(returnedCodes, ALL_ERROR_CODES, "error.coverage"));

  // coverage 與 findings 必須互相對得起來，否則其中一邊漏了東西。
  const actual = new Map<string, number>();
  for (const f of findings) actual.set(f.code, (actual.get(f.code) ?? 0) + 1);
  for (const entry of coverage) {
    const n = actual.get(entry.code) ?? 0;
    if (n !== entry.count) {
      issues.push({
        kind: "COUNT_MISMATCH",
        path: `error.coverage.${entry.code}`,
        detail: `coverage 說 ${entry.count} 筆，findings 實際 ${n} 筆`,
      });
    }
  }

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { taxonomy_version: WRITING_TAXONOMY_VERSION, findings, coverage } };
}

/* ---------- Pass 3a / 3b ---------- */

/**
 * @param expectedCategoryCodes 這一支 pass 負責的 High-Score Category（3a = H1–H3、3b = H4–H5）。
 *        每一支各自獨立驗證；一支失敗不會被另一支的成功掩蓋。
 */
export function validateHighScoreAnalysis(
  raw: unknown,
  expectedCategoryCodes: readonly string[],
  essay: string,
): PassValidation<HighScoreAnalysis> {
  const issues: ValidationIssue[] = [];
  const expected = HIGH_SCORE_CATEGORIES.filter((c) =>
    expectedCategoryCodes.includes(c.code),
  ).flatMap((c) => c.features.map((f) => f.code));

  if (!isRecord(raw) || !Array.isArray(raw.features)) {
    return {
      ok: false,
      issues: [{ kind: "MALFORMED", path: "high_score", detail: "缺少 features 陣列" }],
    };
  }

  const features: HighScoreFeatureFinding[] = [];
  const returnedCodes: string[] = [];

  raw.features.forEach((item, i) => {
    if (!isRecord(item) || typeof item.code !== "string") {
      issues.push({
        kind: "MALFORMED",
        path: `high_score.features[${i}]`,
        detail: "feature 缺少 code",
      });
      return;
    }
    returnedCodes.push(item.code);
    const path = `high_score.${item.code}`;

    if (!HIGH_SCORE_QUALITIES.includes(item.quality as HighScoreQuality)) {
      issues.push({
        kind: "INVALID_STATE",
        path,
        detail: `quality 必須是 ${HIGH_SCORE_QUALITIES.join(" / ")}，收到：${String(item.quality)}`,
      });
      return;
    }
    const quality = item.quality as HighScoreQuality;

    if (!isNonEmptyString(item.reason)) {
      issues.push({
        kind: "MISSING_REASON",
        path,
        detail:
          quality === "UNMEASURED"
            ? "UNMEASURED 必須說明這個特徵本篇為什麼沒有出現"
            : "quality 必須附理由",
      });
      return;
    }

    const rawInstances = Array.isArray(item.instances) ? item.instances : [];
    const instances: HighScoreInstance[] = [];
    rawInstances.forEach((inst, j) => {
      const ipath = `${path}.instances[${j}]`;
      if (!isRecord(inst) || !isNonEmptyString(inst.quote) || !isNonEmptyString(inst.reason)) {
        issues.push({
          kind: "MALFORMED",
          path: ipath,
          detail: "instance 必須有非空的 quote 與 reason",
        });
        return;
      }
      // sub-skill 不是 canonical node（TR-07），認不得就丟掉，不讓 pass 失敗。
      const subskills = Array.isArray(inst.subskills)
        ? inst.subskills.filter(
            (s): s is string => typeof s === "string" && HIGH_SCORE_SUBSKILL_BY_CODE.has(s),
          )
        : undefined;
      if (!quoteAppearsInEssay(essay, inst.quote)) {
        issues.push({
          kind: "QUOTE_NOT_IN_ESSAY",
          path: ipath,
          detail:
            `這段引用在作文原文裡找不到：「${inst.quote}」` +
            "（一個 instance 只能放一段連續原文，跨段證據請拆成多筆）",
        });
        return;
      }
      instances.push({
        quote: inst.quote,
        reason: inst.reason,
        subskills: subskills && subskills.length > 0 ? subskills : undefined,
        suggestion: isNonEmptyString(inst.suggestion) ? inst.suggestion : undefined,
      });
    });

    // 形式前提：邏輯上不可能有證據時，只能是 UNMEASURED。
    const prereq = PREREQUISITE_BY_CODE.get(item.code);
    if (prereq && quality !== "UNMEASURED" && !prereq.isSatisfied(essay)) {
      issues.push({
        kind: "PREREQUISITE_NOT_MET",
        path,
        detail: `${prereq.detail}（收到 ${quality}）`,
      });
      return;
    }

    // EFFECTIVE 的舉證契約：要給 EFFECTIVE，就必須逐項說清楚。
    const rawJust = isRecord(item.justification) ? item.justification : null;
    let justification: EffectiveJustification | undefined;
    if (quality === "EFFECTIVE") {
      const criterion = rawJust?.criterion;
      const effect = rawJust?.effect;
      const beyondForm = rawJust?.beyondForm;
      if (
        !isNonEmptyString(criterion) ||
        !isNonEmptyString(effect) ||
        !isNonEmptyString(beyondForm)
      ) {
        issues.push({
          kind: "MISSING_JUSTIFICATION",
          path,
          detail:
            "EFFECTIVE 必須附 justification：criterion（滿足哪條判準）、" +
            "effect（對這篇文章的具體作用）、beyondForm（為什麼不只是形式存在）",
        });
        return;
      }
      // 三句話貼同一段等於沒有舉證。
      if (effect.trim() === beyondForm.trim() || criterion.trim() === effect.trim()) {
        issues.push({
          kind: "MISSING_JUSTIFICATION",
          path,
          detail: "justification 的三個欄位不可以填同樣的內容",
        });
        return;
      }
      justification = { criterion, effect, beyondForm };
    } else if (rawJust) {
      issues.push({
        kind: "MALFORMED",
        path,
        detail: `只有 EFFECTIVE 才需要 justification（收到 ${quality}）`,
      });
      return;
    }

    // TR-04：非 UNMEASURED 的 finding 一定要有 evidence_span。
    if (quality !== "UNMEASURED" && instances.length === 0) {
      issues.push({
        kind: "MISSING_EVIDENCE",
        path,
        detail: `${quality} 必須至少引用一段原文（TR-04）`,
      });
      return;
    }
    if (quality === "UNMEASURED" && instances.length > 0) {
      issues.push({ kind: "UNEXPECTED_EVIDENCE", path, detail: "UNMEASURED 不得附證據" });
      return;
    }

    features.push({ code: item.code, quality, reason: item.reason, instances, justification });
  });

  issues.push(...checkCoverage(returnedCodes, expected, "high_score.features"));

  if (issues.length > 0) return { ok: false, issues };
  return { ok: true, value: { taxonomy_version: WRITING_TAXONOMY_VERSION, features } };
}

/* ---------- 綜合層 ---------- */

export interface SynthesisResult {
  readonly overall_evaluation: OverallEvaluation;
  readonly strengths: readonly Highlight[];
  readonly needs_work: readonly Highlight[];
  readonly next_steps: readonly NextStep[];
}

/**
 * 綜合層驗證。
 *
 * @param citableRefs Stage 1 已驗證結果算出來的可引用集合（collectCitableRefs）。
 *
 * 這裡守住三條紅線：
 *   A. 綜合層不得產生新的 taxonomy finding —— 型別上就沒有 competency / error /
 *      feature 欄位，而且任何引用都必須落在 citableRefs 內。
 *   B. 綜合層不得覆寫 Stage 1 —— 它的輸出寫進另外四個欄位，且三軸在
 *      status = ANALYZED 之後由資料庫 trigger 凍結。
 *   C. strengths / needs_work 必須引用已驗證的 finding —— refs 不可為空。
 */
export function validateSynthesis(
  raw: unknown,
  citableRefs: ReadonlySet<string>,
): PassValidation<SynthesisResult> {
  const issues: ValidationIssue[] = [];

  if (!isRecord(raw) || !isRecord(raw.overall_evaluation)) {
    return {
      ok: false,
      issues: [{ kind: "MALFORMED", path: "synthesis", detail: "缺少 overall_evaluation" }],
    };
  }

  const overall = raw.overall_evaluation;
  if (!OVERALL_LEVELS.includes(overall.level as OverallLevel)) {
    issues.push({
      kind: "INVALID_STATE",
      path: "synthesis.overall_evaluation.level",
      detail: `level 必須是 ${OVERALL_LEVELS.join(" / ")}`,
    });
  }
  if (!isNonEmptyString(overall.headline) || !isNonEmptyString(overall.summary)) {
    issues.push({
      kind: "MISSING_REASON",
      path: "synthesis.overall_evaluation",
      detail: "headline 與 summary 都不可為空",
    });
  } else {
    checkNoEmbeddedEvidence(overall.headline, "synthesis.overall_evaluation.headline", issues);
    checkNoEmbeddedEvidence(overall.summary, "synthesis.overall_evaluation.summary", issues);
  }

  /** refs 必須全部落在 Stage 1 的可引用集合裡，否則就是綜合層自己發明的。 */
  const readRefs = (item: Record<string, unknown>, path: string, required: boolean): string[] => {
    const refs = Array.isArray(item.refs)
      ? item.refs.filter((r): r is string => typeof r === "string")
      : [];
    if (required && refs.length === 0) {
      issues.push({
        kind: "MISSING_CITATION",
        path,
        detail: "必須引用至少一個 Stage 1 已驗證的 finding",
      });
    }
    for (const ref of refs) {
      if (!citableRefs.has(ref)) {
        issues.push({
          kind: "UNCITABLE_REF",
          path,
          detail: `引用了 Stage 1 沒有證據的節點：${ref}（綜合層不得自行產生 finding）`,
        });
      }
    }
    return refs;
  };

  const readList = (key: string, requireRefs: boolean) => {
    const arr = Array.isArray((raw as Record<string, unknown>)[key])
      ? ((raw as Record<string, unknown>)[key] as unknown[])
      : [];
    return arr.flatMap((item, i) => {
      const path = `synthesis.${key}[${i}]`;
      if (!isRecord(item) || !isNonEmptyString(item.text)) {
        issues.push({ kind: "MALFORMED", path, detail: "每一項都必須有 text" });
        return [];
      }
      checkNoEmbeddedEvidence(item.text, path, issues);
      return [{ text: item.text, refs: readRefs(item, path, requireRefs) }];
    });
  };

  const strengths = readList("strengths", true);
  const needs_work = readList("needs_work", true);
  const next_steps = readList("next_steps", false);

  // 摘要可以短，分析必須完整——上限只加在排序層。
  if (next_steps.length === 0 || next_steps.length > MAX_NEXT_STEPS) {
    issues.push({
      kind: "TOO_MANY",
      path: "synthesis.next_steps",
      detail: `下一步必須是 1–${MAX_NEXT_STEPS} 項，收到 ${next_steps.length} 項`,
    });
  }

  if (issues.length > 0) return { ok: false, issues };
  return {
    ok: true,
    value: {
      overall_evaluation: {
        level: overall.level as OverallLevel,
        headline: String(overall.headline),
        summary: String(overall.summary),
      },
      strengths,
      needs_work,
      next_steps: next_steps.map((n) => ({
        text: n.text,
        refs: n.refs.length > 0 ? n.refs : undefined,
      })),
    },
  };
}
