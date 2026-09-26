/**
 * micro-skill 代號的中文對照。
 *
 * 🛑 這裡【只改顯示】，資料庫裡的 skill_code 一個字都不動。
 *    代號是資料的身分，中文是給人看的名字——把身分改成名字，
 *    下一批題庫用同樣的代號進來就對不上了。
 *
 * 🛑 認不得的代號【不可以直接當標題顯示】。
 *    `word_sense_disambiguation` 原樣印在畫面上，學生看到的是資料庫欄位，
 *    不是一個能力。認不得時退回「把底線換成空白、首字大寫」，
 *    並且讓呼叫端知道那是退路（isFallback），畫面才能把它排在次要位置。
 */

const LABELS: Record<string, string> = {
  // 題材辨識 SM
  topic_identification: "主題辨識",
  scope_control: "範圍掌握",
  gist_recognition: "大意掌握",
  // 主旨大意 MI
  global_synthesis: "整合主旨",
  central_claim_identification: "核心主張辨識",
  cross_paragraph_integration: "跨段整合",
  // 細節支持 SD
  explicit_information_retrieval: "明示資訊擷取",
  detail_location: "細節定位",
  fact_discrimination: "事實辨識",
  // 推論結論 CO
  logical_inference: "邏輯推論",
  evidence_integration: "證據整合",
  implicit_meaning: "隱含意義",
  // 釐清手法 CD
  rhetorical_function: "修辭功能",
  example_function: "舉例作用",
  organizational_structure: "篇章結構",
  // 字彙語境 VC
  context_clue_use: "上下文線索",
  word_sense_disambiguation: "字義判斷",
  semantic_fit: "語意適配",
};

export interface SkillLabel {
  /** 給人看的名字 */
  label: string;
  /** 原始代號，當次要文字用 */
  code: string;
  /** true = 對照表裡沒有，這是退路 */
  isFallback: boolean;
}

const humanise = (code: string): string =>
  code.split("_").filter(Boolean)
      .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
      .join(" ");

export function skillLabel(code: string): SkillLabel {
  const label = LABELS[code];
  return label
    ? { label, code, isFallback: false }
    : { label: humanise(code), code, isFallback: true };
}

/** 對照表目前認得幾個代號。新題庫進來時用來確認有沒有漏。 */
export const knownSkillCodes = (): string[] => Object.keys(LABELS);
