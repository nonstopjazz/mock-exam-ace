/** 英文能力類型 —— 對應 packs.skill_type */
export const SKILL_TYPES = [
  { value: "all", label: "全部" },
  { value: "vocabulary", label: "單字" },
  { value: "writing", label: "寫作" },
  { value: "reading", label: "閱讀" },
];

export const skillTypeLabel = (v?: string | null) =>
  SKILL_TYPES.find((s) => s.value === v)?.label || v || "";

/** PackCard 需要的欄位，形狀對齊既有的 UserPack */
export interface PackCardData {
  pack_id: string;
  title: string;
  description?: string | null;
  theme?: string | null;
  skill_type?: string | null;
  difficulty?: string | null;
  word_count: number;
  progress: number;
  claimed_at?: string | null;
  cover_image_url?: string | null;
}
