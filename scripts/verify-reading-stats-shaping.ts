/**
 * 統計呈現規則的自我檢查
 *
 *   npm run verify:reading-stats
 *
 * 🛑 這裡測的是「什麼時候【不】下結論」。那種錯誤不會讓程式壞掉，
 *    只會讓畫面很有信心地講一句沒有根據的話。
 */
import {
  MIN_FOR_VERDICT, accuracyOf, measuredSkills, rankedConstructs, strongestConstruct,
  strongestSkills, ungradedTotal, unmeasuredSkills, weakestConstruct, weakestSkills,
  type ConstructStat, type SkillStat,
} from "../src/lib/reading/statsShaping";
import { knownSkillCodes, skillLabel } from "../src/lib/reading/skillLabels";
import type { Construct } from "../src/lib/reading/constructs";

let failures = 0;
const check = (cond: boolean, label: string): void => {
  if (cond) console.log(`PASS  ${label}`);
  else { console.error(`FAIL  ${label}`); failures += 1; }
};

const c = (construct: string, answered: number, correct: number): ConstructStat => ({
  construct: construct as Construct, answered, correct,
  median_ms: null, changed: 0, changed_away_from_correct: 0,
});

check(accuracyOf(c("SM", 0, 0)) === null, "A1 沒作答過的正確率是 null，不是 0");
check(accuracyOf(c("SM", 4, 3)) === 0.75, "A1 正確率算得對");

{
  const stats = [c("SM", 10, 9), c("MI", 10, 4), c("SD", 10, 8)];
  check(weakestConstruct(stats)?.construct === "MI", "B1 挑出正確率最低的");
}
{
  // 🛑 練兩題錯一題（50%）不該壓過練十題對八成的
  const stats = [c("SM", 10, 8), c("MI", 2, 1)];
  check(weakestConstruct(stats)?.construct === "SM",
    `🛑 B2 題數少於 ${MIN_FOR_VERDICT} 的不參與評選——兩題錯一題不是「弱」，是還看不出來`);
}
{
  const stats = [c("SM", 2, 1), c("MI", 1, 0)];
  check(weakestConstruct(stats) === null,
    "🛑 B3 全部題數都不夠時回 null——不可以退而求其次挑一個來充數");
}
{
  const stats = [c("SM", 10, 10), c("MI", 5, 5)];
  check(weakestConstruct(stats) === null,
    "🛑 B4 全對就沒有「最弱」——硬挑一個只會製造不存在的問題");
}
{
  // 正確率一樣時，練得多的更有代表性
  const stats = [c("SM", 4, 2), c("MI", 20, 10)];
  check(weakestConstruct(stats)?.construct === "MI",
    "B5 正確率相同時挑練得多的（樣本大的結論比較可信）");
}
check(weakestConstruct([]) === null, "B6 沒有資料時回 null");

{
  const s = (code: string, graded: number, ungraded: number,
             accuracy: number | null, enough: boolean): SkillStat =>
    ({ skill_code: code, graded, ungraded, accuracy, enough });

  const skills = [
    s("alpha", 10, 0, 0.9, true),
    s("beta", 8, 2, 0.4, true),
    s("gamma", 1, 5, 0.0, false),
    s("delta", 0, 7, null, false),
  ];

  const m = measuredSkills(skills);
  check(m.length === 2 && m[0].skill_code === "beta",
    "C1 有量到的依正確率由低到高——最需要練的排前面");
  check(!m.some((x) => x.skill_code === "gamma"),
    "🛑 C2 題數不夠的【不列入】有量到的——0% 只是樣本太小");

  const u = unmeasuredSkills(skills);
  check(u.length === 2, "C3 量不出來的另外列出來，不是丟掉");
  check(u[0].skill_code === "delta" && u[0].accuracy === null,
    "🛑 C3 連一題有權重的都沒有時，accuracy 是 null，不是 0");

  check(ungradedTotal(skills) === 14,
    "🛑 C4 沒有標權重的題數加總得出來——那是「沒被算進來」，不是「答錯了」");
}

// ── 最強／最弱 ──────────────────────────────────────────────────────
{
  const stats = [c("SM", 8, 7), c("MI", 8, 5), c("CO", 8, 3)];
  check(strongestConstruct(stats)?.construct === "SM", "D1 挑出最穩定的");
  check(weakestConstruct(stats)?.construct === "CO", "D1 最弱的還是 CO");
  check(rankedConstructs(stats).map((s) => s.construct).join(",") === "CO,MI,SM",
    "D1 排序由弱到強");
}
{
  // 只有一個能力達門檻 → 沒有比較的對象
  const stats = [c("SM", 8, 7), c("MI", 2, 1)];
  check(weakestConstruct(stats)?.construct === "SM", "D2 唯一達門檻的是最弱");
  check(strongestConstruct(stats) === null,
    "🛑 D2 只有一個達門檻時沒有「最穩定」——同一個能力不能同時是強項與弱項");
}
check(strongestConstruct([]) === null, "D3 沒資料時回 null");

// ── 細項的 Top N ────────────────────────────────────────────────────
{
  const s = (code: string, acc: number, graded = 8): SkillStat =>
    ({ skill_code: code, graded, ungraded: 0, accuracy: acc, enough: true });
  const skills = [s("a", 0.2), s("b", 0.3), s("c", 0.4), s("d", 0.9), s("e", 0.95)];

  check(weakestSkills(skills, 3).map((x) => x.skill_code).join(",") === "a,b,c",
    "E1 最需要改善的前三名");
  check(strongestSkills(skills, 2, 3).map((x) => x.skill_code).join(",") === "e,d",
    "E2 表現良好的前兩名，由高到低");
  check(!strongestSkills(skills, 3, 3).some((x) => ["a","b","c"].includes(x.skill_code)),
    "🛑 E3 已經列進「需要改善」的不會又出現在「表現良好」");

  // 只有三個有量到 → 全部都是「需要改善」，良好那區就該是空的
  const few = [s("a", 0.2), s("b", 0.3), s("c", 0.4)];
  check(strongestSkills(few, 3, 3).length === 0,
    "🛑 E4 總共只有三個時，良好那區是空的，而不是把同樣三個再列一次");
}

// ── 代號的中文對照 ──────────────────────────────────────────────────
{
  const w = skillLabel("word_sense_disambiguation");
  check(w.label === "字義判斷" && !w.isFallback, "F1 認得的代號有中文名");
  check(w.code === "word_sense_disambiguation", "F1 原始代號保留著（資料庫不動）");

  const unknown = skillLabel("some_new_skill_2027");
  check(unknown.isFallback, "🛑 F2 認不得的代號標成 fallback，畫面才知道要降級處理");
  check(unknown.label === "Some New Skill 2027",
    "🛑 F2 而且退回可讀的寫法，不是把 some_new_skill_2027 原樣當標題");

  check(knownSkillCodes().length === 18,
    "F3 對照表涵蓋題庫裡全部 18 個代號");
}

console.log("");
if (failures > 0) { console.error(`${failures} 項未通過`); process.exit(1); }
console.log("全部通過");
