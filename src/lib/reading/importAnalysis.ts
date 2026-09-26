import {
  CONSTRUCTS, CONSTRUCT_ORDER, type CefrLevel, type Construct, type ContentSource,
} from "./constructs";
import {
  detectConstructs, isPlaceholder, missingColumns, parseRow, skillsUnparseable,
  type ParsedPassage,
} from "./parseSourceRow";
import { auditColumns, brokenColumns, type ColumnAudit } from "./columnClassification";
import { toCanonicalPayload, type CanonicalImportItem } from "./canonicalPayload";

/**
 * 一份來源檔的完整體檢結果。
 *
 * 🛑 這個模組是 dry-run 指令與 /admin/reading/import 預覽畫面的【共同來源】。
 *
 *    管理員在畫面上看到「282 篇可上架」，跟我在 dry-run report 裡驗證過的
 *    「282 篇可上架」，必須是【同一次計算】。各自算一遍的話，兩邊遲早會
 *    分岔，而分岔的那一天，畫面會很有信心地顯示一個沒有人驗證過的數字。
 *
 * 🛑 這個模組【不碰檔案、不碰資料庫、不 import supabase】。
 *    輸入是已經讀好的列與欄位名，所以瀏覽器與 node 都能用，也能直接測。
 */

export interface ConstructHealth {
  construct: Construct;
  ok: number;
  missingQuestion: number;
  badOptions: number;
  missingAnswer: number;
  answerNotInOptions: number;
  missingExplanation: number;
}

export interface ProblemPassage {
  passageId: string;
  importStatus: ParsedPassage["importStatus"];
  usableQuestions: number;
  /** 已經整理過的原因，不重複列出同一個問題 */
  reasons: string[];
}

export interface ImportAnalysis {
  rowCount: number;
  /** 有 topic_id 的列 */
  withId: number;
  /** 🛑 已產出文章的列。所有品質數字以這個為分母 */
  withPassage: number;
  /** 只有選題、管線還沒產出文章。不是壞資料 */
  noPassage: number;

  publishReady: number;
  draft: number;
  blocked: number;

  constructs: ReturnType<typeof detectConstructs>;
  columnAudits: ColumnAudit[];
  brokenColumns: ColumnAudit[];
  unknownColumns: ColumnAudit[];
  missingColumns: { column: string; effect: string }[];

  contentSource: Record<ContentSource, number>;
  /** 值等於欄位名稱（未解析的參照）的列數，逐欄 */
  placeholderCounts: { column: string; count: number }[];
  cefr: { level: string; count: number }[];
  contentFamily: { value: string; count: number }[];
  subdomain: { value: string; count: number }[];

  perConstruct: ConstructHealth[];

  skillKinds: number;
  skillRows: number;
  skillNullEmphasis: number;
  /** 🛑 儲存格有內容卻一個 skill 都解析不出來 —— 格式漂移的偵測器 */
  skillDriftCells: number;

  withParagraphs: number;
  paragraphRows: number;
  withVocab: number;
  vocabByTier: { tier: string; count: number }[];

  duplicateIds: { passageId: string; count: number }[];
  problems: ProblemPassage[];

  /** 真正會送進資料庫的東西 */
  payloads: CanonicalImportItem[];
  payloadQuestions: number;
  payloadParagraphs: number;
  payloadVocabulary: number;
  /**
   * 🛑 payload 層級的 micro-skill 筆數，跟來源檔的總筆數【不一樣】。
   *    來源檔的數字含 BLOCKED 那幾篇，但它們不會進資料庫。
   *    預覽要預測的是「匯入之後資料庫會有幾筆」，所以用這個。
   */
  payloadSkills: number;
  /**
   * 🛑 payload 數應該等於 publishReady + draft。
   *    不相等代表 parser 的三態與 canonical payload 的規則分岔了——
   *    那是 bug，畫面要講出來，不可以只顯示其中一個數字。
   */
  payloadMatchesStatus: boolean;
}

const tally = (values: (string | null)[]): { value: string; count: number }[] => {
  const m = new Map<string, number>();
  for (const v of values) {
    const k = v ?? "（空白）";
    m.set(k, (m.get(k) ?? 0) + 1);
  }
  return [...m.entries()]
    .map(([value, count]) => ({ value, count }))
    .sort((a, b) => b.count - a.count || a.value.localeCompare(b.value));
};

export function analyzeSource(
  rows: Record<string, unknown>[],
  headers: string[],
): ImportAnalysis {
  const headerSet = new Set(headers);
  const constructs = detectConstructs(headers);
  const prefixes = constructs.found.map((f) => f.prefix);

  const withIdRows = rows.filter(
    (r) => String(r["topic_id"] ?? "").trim().length > 0,
  );
  const parsed = withIdRows.map((r) => parseRow(r, headers));
  const withPassage = parsed.filter((p) => p.passageText !== null);

  const idCount = new Map<string, number>();
  for (const p of parsed) idCount.set(p.passageId, (idCount.get(p.passageId) ?? 0) + 1);

  const audits = auditColumns(headers, withIdRows, prefixes);

  const perConstruct: ConstructHealth[] = CONSTRUCTS.map((construct) => {
    const qs = withPassage
      .map((p) => p.questions.find((q) => q.construct === construct))
      .filter((q): q is NonNullable<typeof q> => q !== undefined);
    const count = (pred: (s: string) => boolean) =>
      qs.filter((q) => q.problems.some(pred)).length;
    return {
      construct,
      ok: qs.filter((q) => q.problems.length === 0).length,
      missingQuestion:     count((s) => s === "缺題幹"),
      badOptions:          count((s) => s.startsWith("選項只有")),
      missingAnswer:       count((s) => s === "缺正解"),
      answerNotInOptions:  count((s) => s.includes("沒有對應")),
      missingExplanation:  count((s) => s === "缺解說"),
    };
  });

  const skillNames = new Set<string>();
  let skillRows = 0;
  let skillNullEmphasis = 0;
  for (const p of withPassage) {
    for (const q of p.questions) {
      for (const s of q.skills) {
        skillRows += 1;
        if (s.emphasis === null) skillNullEmphasis += 1;
        skillNames.add(s.skillCode);
      }
    }
  }

  let skillDriftCells = 0;
  for (const r of withIdRows) {
    for (const prefix of prefixes) {
      if (skillsUnparseable(r[`${prefix}_micro_skill_profile_json`])) skillDriftCells += 1;
    }
  }

  const payloads = parsed
    .map(toCanonicalPayload)
    .filter((x): x is CanonicalImportItem => x !== null);

  const nStatus = (st: ParsedPassage["importStatus"]) =>
    withPassage.filter((p) => p.importStatus === st).length;
  const publishReady = nStatus("PUBLISH_READY");
  const draft = nStatus("DRAFT");

  // 🛑 同一個原因壞在好幾個 construct 是常態，逐題展開會刷滿畫面。
  //    這裡把原因去重，但【保留是哪幾個 construct】——那決定了要補什麼。
  const problems: ProblemPassage[] = withPassage
    .filter((p) => p.importStatus !== "PUBLISH_READY")
    .map((p) => {
      const bad = p.questions.filter((q) => q.problems.length > 0);
      const absent = CONSTRUCTS.filter((c) => !p.questions.some((q) => q.construct === c));
      const reasons: string[] = [];
      if (p.problems.length > 0) reasons.push(...p.problems);
      if (absent.length > 0) reasons.push(`完全沒有 ${absent.join("/")}`);
      if (bad.length > 0) {
        const kinds = [...new Set(bad.flatMap((q) => q.problems))];
        reasons.push(`${bad.map((q) => q.construct).join("/")} → ${kinds.join("、")}`);
      }
      return {
        passageId: p.passageId,
        importStatus: p.importStatus,
        usableQuestions: p.usableQuestions,
        reasons,
      };
    })
    .sort((a, b) => a.passageId.localeCompare(b.passageId));

  const contentSource: Record<ContentSource, number> = { FINAL: 0, REVISED: 0, WRITER: 0 };
  for (const p of parsed) if (p.contentSource) contentSource[p.contentSource] += 1;

  return {
    rowCount: rows.length,
    withId: parsed.length,
    withPassage: withPassage.length,
    noPassage: parsed.length - withPassage.length,

    publishReady,
    draft,
    blocked: nStatus("BLOCKED"),

    constructs,
    columnAudits: audits,
    brokenColumns: brokenColumns(audits),
    unknownColumns: audits.filter((a) => a.category === "UNKNOWN"),
    missingColumns: missingColumns(headers),

    contentSource,
    placeholderCounts: ["passage_final_title", "passage_final_text", "passage_revised_text",
                        "passage_writer_text", "passage_final_vocab_json"]
      .filter((c) => headerSet.has(c))
      .map((column) => ({
        column,
        count: withIdRows.filter((r) => isPlaceholder(r[column], headerSet)).length,
      })),
    cefr: tally(parsed.map((p) => p.cefrLevel as CefrLevel | null))
      .map(({ value, count }) => ({ level: value, count })),
    contentFamily: tally(parsed.map((p) => p.contentFamily)),
    subdomain: tally(parsed.map((p) => p.subdomain)),

    perConstruct,

    skillKinds: skillNames.size,
    skillRows,
    skillNullEmphasis,
    skillDriftCells,

    withParagraphs: withPassage.filter((p) => p.paragraphs.length > 0).length,
    paragraphRows: withPassage.reduce((n, p) => n + p.paragraphs.length, 0),
    withVocab: withPassage.filter((p) => p.vocab.length > 0).length,
    vocabByTier: (["CANDIDATE", "ACADEMIC", "KNOWLEDGE"] as const).map((tier) => ({
      tier,
      count: withPassage.reduce((n, p) => n + p.vocab.filter((v) => v.tier === tier).length, 0),
    })),

    duplicateIds: [...idCount.entries()]
      .filter(([, count]) => count > 1)
      .map(([passageId, count]) => ({ passageId, count })),
    problems,

    payloads,
    payloadQuestions:   payloads.reduce((n, p) => n + p.questions.length, 0),
    payloadParagraphs:  payloads.reduce((n, p) => n + p.paragraphs.length, 0),
    payloadVocabulary:  payloads.reduce((n, p) => n + p.vocabulary.length, 0),
    payloadSkills: payloads.reduce(
      (n, p) => n + p.questions.reduce((m, q) => m + q.skills.length, 0), 0),
    payloadMatchesStatus: payloads.length === publishReady + draft,
  };
}

/** 依 Six Ways 的順序排。畫面與報告都用這個，不要各自排一次。 */
export const orderedConstructs = (): Construct[] =>
  [...CONSTRUCTS].sort((a, b) => CONSTRUCT_ORDER[a] - CONSTRUCT_ORDER[b]);
