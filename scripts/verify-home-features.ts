/**
 * 首頁功能卡片開關的自我檢查
 *
 *   npm run verify:home-features
 *
 * 這個檔案的重點是兩條不能被「簡化」掉的規則：
 *   1. 開關只能【關掉】卡片，不能越過 Phase 打開功能 —— 否則學生會點進「即將推出」。
 *   2. 設定裡沒有的 key 一律當作顯示 —— 缺席不等於關閉，之後新增卡片才不會被舊設定悶掉。
 */

import { HOME_FEATURES, isHomeFeatureVisible, type HomeFeatureFlags } from "../src/config/homeFeatures";

let fail = 0;
const check = (name: string, got: unknown, want: unknown) => {
  const ok = got === want;
  if (!ok) fail++;
  console.log(`${ok ? "PASS" : "FAIL"}  ${name}  → ${got}（預期 ${want}）`);
};

const vis = (key: string, phase: number, flags: HomeFeatureFlags | null) => {
  const def = HOME_FEATURES.find((f) => f.key === key)!;
  return isHomeFeatureVisible(def.key, phase, def.phase, flags);
};

// 1. 還沒設定過（欄位是 null）：一切依 Phase
check("null 設定時 Phase 0 看得到單字卡", vis("vocabulary", 0, null), true);
check("null 設定時 Phase 0 看不到模擬考", vis("exams", 0, null), false);
check("null 設定時 Phase 2 看得到模擬考", vis("exams", 2, null), true);

// 2. 開關關得掉
check("關掉之後就不顯示", vis("vocabulary", 2, { vocabulary: false }), false);
check("其他卡片不受影響", vis("collections", 2, { vocabulary: false }), true);

// 3. 🛑 開關不能越過 Phase
check("Phase 0 時就算開著也不顯示模擬考", vis("exams", 0, { exams: true }), false);
check("Phase 1 時就算開著也不顯示作文批改", vis("essay", 1, { essay: true }), false);

// 4. 缺席不等於關閉
check("設定裡沒有的 key 視為顯示", vis("dashboard", 2, { exams: false }), true);
check("空物件等同全部顯示", vis("exams", 2, {}), true);

// 5. 使用者要的那個情境：Phase 2 之下只留單字相關的兩張
{
  const flags: HomeFeatureFlags = { exams: false, dashboard: false, essay: false };
  const shown = HOME_FEATURES.filter((f) => isHomeFeatureVisible(f.key, 2, f.phase, flags)).map((f) => f.key);
  check("關掉模擬考／儀表板／作文後剩兩張", shown.join(","), "vocabulary,collections");
}

// 6. 目錄本身：key 不可重複，否則兩張卡會共用同一個開關
check("卡片 key 沒有重複", new Set(HOME_FEATURES.map((f) => f.key)).size, HOME_FEATURES.length);

console.log(fail === 0 ? "\n全部通過" : `\n${fail} 項失敗`);
process.exit(fail === 0 ? 0 : 1);
