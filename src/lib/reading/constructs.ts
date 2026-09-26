/**
 * Six Ways 的穩定短碼。
 *
 * 🛑 identity 只能是這六個短碼，不可以用中文或長英文標籤。
 *    標籤會改（「推論結論」→「推論與結論」），identity 不能跟著改。
 *    資料庫的 CHECK 約束擋的也是這六個。
 *
 * 🛑 來源 xlsx 的欄位前綴與這些短碼【剛好相同】，但那是巧合，不是保證。
 *    parser 必須從實際欄位名推導出前綴，再對照這張表；
 *    不可以假設「前綴一定是這六個」——2026-09-26 我就是因為自己猜
 *    inference_conclusion 的前綴是 ic（實際是 co），查到 0 就錯誤地
 *    宣告那個 construct 不存在。硬編碼猜測的代價就是那種錯。
 */
export const CONSTRUCTS = ["SM", "MI", "SD", "CO", "CD", "VC"] as const;
export type Construct = (typeof CONSTRUCTS)[number];

/** 來源 xlsx 的欄位前綴 → 短碼。前綴一律小寫比對。 */
export const PREFIX_TO_CONSTRUCT: Record<string, Construct> = {
  sm: "SM",
  mi: "MI",
  sd: "SD",
  co: "CO",
  cd: "CD",
  vc: "VC",
};

/** 顯示順序，也是 display_order */
export const CONSTRUCT_ORDER: Record<Construct, number> = {
  SM: 1, MI: 2, SD: 3, CO: 4, CD: 5, VC: 6,
};

/** 給人看的名稱。只用於畫面，不進資料庫。 */
export const CONSTRUCT_LABEL_ZH: Record<Construct, string> = {
  SM: "題材辨識",
  MI: "主旨大意",
  SD: "細節支持",
  CO: "推論結論",
  CD: "釐清手法",
  VC: "字彙語境",
};

export const CEFR_LEVELS = ["A1", "A2", "B1", "B2", "C1", "C2"] as const;
export type CefrLevel = (typeof CEFR_LEVELS)[number];

export const CONTENT_SOURCES = ["FINAL", "REVISED", "WRITER"] as const;
export type ContentSource = (typeof CONTENT_SOURCES)[number];

export const VOCAB_TIERS = ["CANDIDATE", "ACADEMIC", "KNOWLEDGE"] as const;
export type VocabTier = (typeof VOCAB_TIERS)[number];
