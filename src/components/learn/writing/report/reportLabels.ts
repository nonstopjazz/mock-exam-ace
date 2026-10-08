import type { CompetencyState, HighScoreQuality, OverallLevel } from "@/lib/writing/analysisContract";

/**
 * 報告的共用標示。
 *
 * 三軸的狀態值都是 canonical 列舉，這裡只負責「怎麼講給學生聽」，
 * 不做任何合併或重新分級——分級是分析層的事。
 */

/**
 * 學生看得懂的說法。刻意不用「分數」「等第」這類評分術語。
 *
 * 🛑 「明顯不足」與「本次未評量」是兩件事，用字刻意拉開：
 *    前者是判斷（算 0 分），後者是沒有可判斷的材料（不計分）。
 *    讀成同一件事，學生會以為「沒測到」就是「不行」。
 */
export const COMPETENCY_LABEL: Record<CompetencyState, string> = {
  STRONG: "表現突出",
  ADEQUATE: "達到要求",
  DEVELOPING: "還在發展",
  MINIMAL: "明顯不足",
  UNMEASURED: "本次未評量",
};

export const HIGH_SCORE_LABEL: Record<HighScoreQuality, string> = {
  EFFECTIVE: "有效運用",
  PARTIALLY_EFFECTIVE: "差一點",
  MISUSED: "用錯了",
  UNMEASURED: "本次未出現",
};

export const OVERALL_LABEL: Record<OverallLevel, string> = {
  STRONG: "表現突出",
  SOLID: "穩健",
  DEVELOPING: "發展中",
  NEEDS_REWORK: "需要重整",
};

