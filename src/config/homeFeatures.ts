/**
 * 首頁的功能卡片目錄。
 *
 * 這裡是「有哪些卡、順序、屬於哪個 Phase」的唯一真實來源 —— 首頁與
 * /admin/settings 的開關都讀它，兩邊才不會各有一份而慢慢對不上。
 * 圖示與描述留在 Home.tsx：描述會依站別（學測 / 多益 / 兒童）換字。
 *
 * 🛑 開關【只能關掉】卡片，不能打開 Phase 尚未開放的功能。
 *    強行打開只會讓學生點進一個「即將推出」的頁面 —— 那比看不到更糟。
 */
export interface HomeFeatureDef {
  key: string;
  title: string;
  path: string;
  /** 這張卡要在哪一個 Phase 之後才會出現 */
  phase: 0 | 1 | 2;
}

export const HOME_FEATURES: HomeFeatureDef[] = [
  { key: "vocabulary", title: "單字複習中心", path: "/practice/vocabulary", phase: 0 },
  { key: "collections", title: "詞彙收藏", path: "/practice/vocabulary/collections", phase: 0 },
  { key: "exams", title: "真實模擬考", path: "/exams", phase: 2 },
  { key: "dashboard", title: "學習儀表板", path: "/dashboard", phase: 2 },
  { key: "essay", title: "AI 作文批改", path: "/essay", phase: 2 },
];

/** site_settings.home_features 的形狀：只存開關，沒存標題與順序（那些在上面） */
export type HomeFeatureFlags = Record<string, boolean>;

/**
 * 這張卡要不要出現。
 * flags 為 null（欄位還沒設定過）時一律顯示 —— 沒設定不等於全部關掉。
 */
export const isHomeFeatureVisible = (
  key: string,
  phase: number,
  featurePhase: number,
  flags: HomeFeatureFlags | null,
): boolean => featurePhase <= phase && flags?.[key] !== false;
