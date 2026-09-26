/**
 * 需要逐人／逐班開放的功能。
 *
 * 🛑 代號與 learn_feature_access.feature 的值【必須一致】，
 *    而且資料 RPC 裡也要用同一個字串。三個地方打錯一個字，
 *    結果是「後台開放了、學生還是看不到」，而沒有任何錯誤訊息。
 *    所以字串只在這裡寫一次。
 */
export const GATED_FEATURES = [
  { feature: "speaking", label: "口說練習" },
  { feature: "reading",  label: "閱讀練習" },
] as const;

export type GatedFeature = (typeof GATED_FEATURES)[number]["feature"];

export const FEATURE_LABEL: Record<string, string> = Object.fromEntries(
  GATED_FEATURES.map((f) => [f.feature, f.label]),
);
