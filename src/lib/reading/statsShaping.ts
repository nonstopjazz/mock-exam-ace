import type { Construct } from "./constructs";

/**
 * 統計的呈現規則。
 *
 * 🛑 這裡只有一件事，但它很容易寫錯：【題數不夠就不下結論】。
 *    練了兩題、錯一題，就說「你的推論結論很弱」——那不是分析，
 *    是把雜訊寫成評語。學生會信，然後去練一個他其實沒問題的能力。
 *
 * 沒有 React、沒有 supabase，所以規則可以直接測。
 */

export interface ConstructStat {
  construct: Construct;
  answered: number;
  correct: number;
  median_ms: number | null;
  changed: number;
  changed_away_from_correct: number;
}

export interface SkillStat {
  skill_code: string;
  graded: number;
  ungraded: number;
  /** 0–1，或 null（沒有任何有 emphasis 的題目） */
  accuracy: number | null;
  /** 伺服器判斷題數夠不夠。🛑 門檻在伺服器，畫面不自己訂一套 */
  enough: boolean;
}

/** 宣告「這是你最弱的能力」之前，這個能力至少要練過幾題 */
export const MIN_FOR_VERDICT = 3;

export const accuracyOf = (s: ConstructStat): number | null =>
  s.answered === 0 ? null : s.correct / s.answered;

/**
 * 最需要練的能力。題數不夠的一律不參與評選。
 *
 * 🛑 回傳 null 是正常結果，不是錯誤——它的意思是「還看不出來」。
 *    畫面要照實說，不可以退而求其次挑一個題數最少的來充數。
 */
export function weakestConstruct(stats: ConstructStat[]): ConstructStat | null {
  const eligible = stats.filter((s) => s.answered >= MIN_FOR_VERDICT);
  if (eligible.length === 0) return null;

  let worst = eligible[0];
  for (const s of eligible) {
    const a = accuracyOf(s)!;
    const b = accuracyOf(worst)!;
    // 正確率一樣時，練得多的那個更有代表性
    if (a < b || (a === b && s.answered > worst.answered)) worst = s;
  }
  // 🛑 全對就沒有「最弱」。硬挑一個出來只會製造不存在的問題。
  return accuracyOf(worst)! >= 1 ? null : worst;
}

/** 有量到的 skill（依正確率由低到高——最需要練的排前面） */
export const measuredSkills = (skills: SkillStat[]): SkillStat[] =>
  skills
    .filter((s) => s.enough && s.accuracy !== null)
    .sort((a, b) => a.accuracy! - b.accuracy! || b.graded - a.graded);

/** 還量不出來的 skill。🛑 要列出來，不是藏起來——學生才知道不是漏掉了 */
export const unmeasuredSkills = (skills: SkillStat[]): SkillStat[] =>
  skills
    .filter((s) => !s.enough || s.accuracy === null)
    .sort((a, b) => b.graded + b.ungraded - (a.graded + a.ungraded));

/**
 * 有幾題「有標這個能力，但沒有標權重」。
 *
 * 🛑 這個數字要給學生看。它的意思是「這些題目沒被算進來」，
 *    而不是「這些題目你答錯了」。不講的話，分母對不起來時
 *    學生只會覺得這個統計怪怪的。
 */
export const ungradedTotal = (skills: SkillStat[]): number =>
  skills.reduce((n, s) => n + s.ungraded, 0);

/**
 * 有資格下結論的能力，由弱到強。
 *
 * 🛑 只有一個能力達到門檻時，「最弱」與「最強」會是同一個——
 *    那時畫面只該講一件事。把同一個能力同時標成強項與弱項，
 *    比什麼都不講更糟。呼叫端用長度判斷。
 */
export function rankedConstructs(stats: ConstructStat[]): ConstructStat[] {
  return stats
    .filter((s) => s.answered >= MIN_FOR_VERDICT)
    .sort((a, b) => accuracyOf(a)! - accuracyOf(b)! || b.answered - a.answered);
}

/** 最穩定的能力。不足兩個有資格的能力時回 null——沒有比較的對象 */
export function strongestConstruct(stats: ConstructStat[]): ConstructStat | null {
  const ranked = rankedConstructs(stats);
  return ranked.length >= 2 ? ranked[ranked.length - 1] : null;
}

/** 最需要改善的前 n 個細項能力 */
export const weakestSkills = (skills: SkillStat[], n: number): SkillStat[] =>
  measuredSkills(skills).slice(0, n);

/**
 * 表現良好的前 n 個細項能力。
 *
 * 🛑 會排除已經被列進「最需要改善」的那幾個。同一個能力同時出現在
 *    兩邊，學生會以為畫面壞了——而技術上那只是「總共才 3 個」。
 */
export function strongestSkills(skills: SkillStat[], n: number, excludeTop: number): SkillStat[] {
  const measured = measuredSkills(skills);
  const excluded = new Set(measured.slice(0, excludeTop).map((s) => s.skill_code));
  return measured
    .filter((s) => !excluded.has(s.skill_code))
    .slice(-n)
    .reverse();
}
