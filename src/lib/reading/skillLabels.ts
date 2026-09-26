import { CONSTRUCTS, type Construct } from "./constructs";

/**
 * micro-skill 的分類表：代號 → 中文名稱 + 所屬的六大能力。
 *
 * 🛑 這裡【只改顯示】，資料庫裡的 skill_code 一個字都不動。
 *    代號是資料的身分，中文是給人看的名字——把身分改成名字，
 *    下一批題庫用同樣的代號進來就對不上了。
 *
 * 🛑 學生端【不准】出現 snake_case 代號。不是縮小、不是變灰，是不 render。
 *    `word_sense_disambiguation` 印在畫面上，學生看到的是資料庫欄位，
 *    不是一個能力。所以 skillLabel() 認不得時回 null，
 *    呼叫端只能選擇不顯示——沒有「把代號當退路印出來」這個選項。
 *
 * 🛑 micro-skill 不是獨立的第二套能力架構，它是六大能力【底下】的子能力。
 *    construct 寫在這張表裡，畫面才能照資料模型的層級呈現。
 */

export interface SkillMeta {
  label: string;
  construct: Construct;
}

/** 每個 construct 三個子能力。表內順序就是畫面順序。 */
export const SKILL_TAXONOMY: Record<string, SkillMeta> = {
  // SM 題材辨識
  topic_identification: { label: "主題辨識", construct: "SM" },
  scope_control: { label: "範圍掌握", construct: "SM" },
  gist_recognition: { label: "大意辨識", construct: "SM" },
  // MI 主旨大意
  global_synthesis: { label: "全文整合", construct: "MI" },
  central_claim_identification: { label: "核心主張辨識", construct: "MI" },
  cross_paragraph_integration: { label: "跨段整合", construct: "MI" },
  // SD 細節支持
  explicit_information_retrieval: { label: "明示資訊擷取", construct: "SD" },
  detail_location: { label: "細節定位", construct: "SD" },
  fact_discrimination: { label: "事實辨識", construct: "SD" },
  // CO 推論結論
  logical_inference: { label: "邏輯推論", construct: "CO" },
  evidence_integration: { label: "證據整合", construct: "CO" },
  implicit_meaning: { label: "隱含意義", construct: "CO" },
  // CD 釐清手法
  rhetorical_function: { label: "修辭功能", construct: "CD" },
  example_function: { label: "例證功能", construct: "CD" },
  organizational_structure: { label: "篇章結構", construct: "CD" },
  // VC 字彙語境
  context_clue_use: { label: "上下文線索", construct: "VC" },
  word_sense_disambiguation: { label: "字義判斷", construct: "VC" },
  semantic_fit: { label: "語意適配", construct: "VC" },
};

/**
 * 中文名稱；認不得的代號回 null。
 *
 * 🛑 回 null 就是「這個東西不該出現在學生面前」。呼叫端不可以拿 code 補位。
 */
export const skillLabel = (code: string): string | null =>
  SKILL_TAXONOMY[code]?.label ?? null;

/** 某個 construct 底下的子能力代號，依分類表的順序 */
export const skillCodesOf = (construct: Construct): string[] =>
  Object.keys(SKILL_TAXONOMY).filter((c) => SKILL_TAXONOMY[c].construct === construct);

export const SKILLS_BY_CONSTRUCT: Record<Construct, string[]> = Object.fromEntries(
  CONSTRUCTS.map((c) => [c, skillCodesOf(c)]),
) as Record<Construct, string[]>;

/** 對照表目前認得幾個代號。新題庫進來時用來確認有沒有漏。 */
export const knownSkillCodes = (): string[] => Object.keys(SKILL_TAXONOMY);
