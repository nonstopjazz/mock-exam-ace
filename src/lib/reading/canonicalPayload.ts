import { CONSTRUCT_ORDER, type Construct } from "./constructs";
import type { ParsedPassage } from "./parseSourceRow";

/**
 * Canonical import payload —— parser 與資料庫之間的穩定介面。
 *
 * 🛑 `reading_import_batch()` 只吃這個形狀，【不吃 XLSX 的原始欄位】。
 *
 *    來源檔的欄位名稱與結構已經換過一次：2026-09 那份 183 欄的管線匯出，
 *    跟 2026-09-26 那份 296 篇的 36 欄匯入檔，只有 36 欄是交集。
 *    如果 RPC 直接吃原始格式，那次變動就會變成一支 migration。
 *
 *    有了這一層：來源格式再怎麼變，改的都只是 parseSourceRow.ts。
 *    資料庫那一側的契約不動。
 *
 * 🛑 只放【匯得進去】的東西。
 *    parser 的 ParsedPassage 帶著 problems 與 publishReady——那些是
 *    給 preview 畫面看的診斷，不是內容，不進 payload。
 *    送診斷給資料庫，資料庫就得決定要不要相信它，而它不該相信。
 */

export interface CanonicalOption { A: string; B: string; C: string; D: string }

export interface CanonicalSkill {
  skill_code: string;
  /** 0–100 或 null。🛑 null 是「沒有這個資訊」，不是 0 */
  emphasis: number | null;
}

export interface CanonicalQuestion {
  construct: Construct;
  display_order: number;
  question: string;
  options: CanonicalOption;
  correct_answer: "A" | "B" | "C" | "D";
  explanation: string;
  skills: CanonicalSkill[];
}

export interface CanonicalPassage {
  passage_id: string;
  title: string;
  passage_text: string;
  content_source: "FINAL" | "REVISED" | "WRITER";
  cefr_level: string | null;
  content_family: string | null;
  subdomain: string | null;
  narrative_archetype: string | null;
  geography: string | null;
  time_period: string | null;
  fame_level: string | null;
  fame_rank: number | null;
  quality_score: number | null;
  readability_score: number | null;
  sixway_score: number | null;
  topic_quality_score: number | null;
  factual_risk: string | null;
  source_package_id: string | null;
  source_batch_id: string | null;
}

export interface CanonicalImportItem {
  passage: CanonicalPassage;
  questions: CanonicalQuestion[];
  paragraphs: { paragraph_no: number; description: string }[];
  vocabulary: {
    tier: "CANDIDATE" | "ACADEMIC" | "KNOWLEDGE";
    term: string;
    definition: string | null;
    paragraph_no: number | null;
  }[];
}

/** 這一份 payload 的格式版本。改形狀時 +1，資料庫那側才分得出來。 */
export const CANONICAL_SCHEMA_VERSION = 1;

/**
 * 把 parser 的結果轉成 canonical payload。
 *
 * 回傳 null = 這一篇 BLOCKED（沒有有效內文／標題，或沒有任何可用題目）。
 *
 * 🛑 只轉【內容完整】的題目。有問題的那幾題直接不放進 payload ——
 *    半成品的文章仍然匯得進去（DRAFT 允許不完整），但不完整的
 *    【題目】不該進資料庫：一道沒有選項或沒有答案的題目，
 *    對學生與對分析都只是雜訊。
 *
 *    哪幾題被排除，preview 畫面會從 ParsedPassage.questions[].problems 講清楚。
 *
 */
export function toCanonicalPayload(p: ParsedPassage): CanonicalImportItem | null {
  if (!p.passageId || !p.title || !p.passageText || !p.contentSource) return null;
  // 🛑 0 題 = BLOCKED，不送進資料庫。parser 已經算好三態，這裡【讀】它，
  //    不要在這裡重算一次條件——兩份規則遲早會分岔。
  if (p.importStatus === "BLOCKED") return null;

  const questions: CanonicalQuestion[] = [];
  for (const q of p.questions) {
    if (q.problems.length > 0) continue;               // 見上方 🛑
    const opt = Object.fromEntries(q.options.map((o) => [o.label, o.text]));
    questions.push({
      construct: q.construct,
      display_order: CONSTRUCT_ORDER[q.construct],
      question: q.question!,
      options: opt as unknown as CanonicalOption,
      correct_answer: q.correctAnswer as CanonicalQuestion["correct_answer"],
      explanation: q.explanation!,
      skills: q.skills.map((s) => ({ skill_code: s.skillCode, emphasis: s.emphasis })),
    });
  }

  return {
    passage: {
      passage_id: p.passageId,
      title: p.title,
      passage_text: p.passageText,
      content_source: p.contentSource,
      cefr_level: p.cefrLevel,
      content_family: p.contentFamily,
      subdomain: p.subdomain,
      narrative_archetype: p.narrativeArchetype,
      geography: p.geography,
      time_period: p.timePeriod,
      fame_level: p.fameLevel,
      fame_rank: p.fameRank,
      quality_score: p.qualityScore,
      readability_score: p.readabilityScore,
      sixway_score: p.sixwayScore,
      topic_quality_score: p.topicQualityScore,
      factual_risk: p.factualRisk,
      source_package_id: p.sourcePackageId,
      source_batch_id: p.sourceBatchId,
    },
    questions: questions.sort((a, b) => a.display_order - b.display_order),
    paragraphs: p.paragraphs.map((x) => ({
      paragraph_no: x.paragraphNo, description: x.description,
    })),
    vocabulary: p.vocab.map((v) => ({
      tier: v.tier, term: v.term, definition: v.definition, paragraph_no: v.paragraphNo,
    })),
  };
}
