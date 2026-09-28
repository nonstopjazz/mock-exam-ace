/**
 * 影片課程純邏輯的測試。
 *
 * 用 tsx 直接跑：npx tsx scripts/verify-course-format.ts
 */
import {
  countLessons, formatDuration, formatDurationLong, nextLesson,
  progressPercent, sectionLabel, sortForStudent,
} from "../src/lib/learn/course/format";
import type { CourseSection, CourseSummary } from "../src/lib/learn/course/types";

let failures = 0;
const check = (ok: boolean, label: string) => {
  console.log(`${ok ? "PASS" : "FAIL"}  ${label}`);
  if (!ok) failures++;
};

const lesson = (id: string, pos: number, completed: boolean) => ({
  id, position: pos, title: `L${pos}`, description: "",
  duration_seconds: 600, is_preview: false, completed, last_position_seconds: 0,
});
const section = (id: string, pos: number, locked: boolean, ls: ReturnType<typeof lesson>[]):
  CourseSection => ({ id, position: pos, title: `S${pos}`, description: "", locked, lessons: ls });

console.log("");
console.log("════════ A. 時長格式 ════════");
check(formatDuration(0) === "0:00", "A1 0 秒");
check(formatDuration(90) === "1:30", "A2 90 秒 → 1:30");
check(formatDuration(600) === "10:00", "A3 整分");
check(formatDuration(3600) === "1:00:00", "A4 滿一小時才出現小時位");
check(formatDuration(3661) === "1:01:01", "A5 有小時時分位補零");
check(formatDuration(3599) === "59:59", "A6 差一秒不進位");
check(formatDuration(-5) === "0:00", "🛑 A7 負數不會變成 0:-5");
check(formatDuration(90.7) === "1:30", "🛑 A8 浮點數（播放器回報的就是）無條件捨去");
check(formatDuration(NaN) === "0:00", "🛑 A9 NaN 不會印出 NaN:NaN");

console.log("");
console.log("════════ B. 給人讀的時長 ════════");
check(formatDurationLong(45) === "45 秒", "B1 不到一分鐘");
check(formatDurationLong(16200) === "4 小時 30 分", "B2 4 小時 30 分");
check(formatDurationLong(3600) === "1 小時", "B3 整點不講「0 分」");
check(formatDurationLong(1800) === "30 分", "B4 不到一小時不講「0 小時」");
check(formatDurationLong(3580) === "1 小時", "🛑 B5 59 分 40 秒進位成 1 小時，不是「0 小時 60 分」");
check(formatDurationLong(0) === "0 秒", "B6 零");

console.log("");
console.log("════════ C. 進度百分比 ════════");
check(progressPercent(0, 10) === 0, "C1 零");
check(progressPercent(5, 10) === 50, "C2 一半");
check(progressPercent(10, 10) === 100, "C3 全部");
check(progressPercent(0, 0) === 0, "🛑 C4 一支影片都沒有的課回 0，【不是 NaN】");
check(progressPercent(3, 0) === 0, "🛑 C5 分母 0 一律 0，不會變成 Infinity");
check(progressPercent(11, 10) === 100, "C6 超過不會超出 100");
check(progressPercent(-1, 10) === 0, "C7 負數夾到 0");
check(progressPercent(1, 3) === 33, "C8 四捨五入到整數");

console.log("");
console.log("════════ D. 章節標籤 ════════");
check(sectionLabel("STANDARD", 3) === "第 3 週", "D1 週次課");
check(sectionLabel("DRIP", 3) === "單元 3", "D2 循序課");

console.log("");
console.log("════════ E. 繼續上課要跳哪一支 ════════");
{
  const secs = [
    section("s1", 1, false, [lesson("a", 1, true), lesson("b", 2, true)]),
    section("s2", 2, false, [lesson("c", 1, false), lesson("d", 2, false)]),
  ];
  check(nextLesson(secs)?.lessonId === "c", "E1 第一支沒看完的");

  const allDone = [section("s1", 1, false, [lesson("a", 1, true)])];
  check(nextLesson(allDone) === null, "E2 全部看完回 null（畫面該說已完成，不是再指一支）");

  const withLocked = [
    section("s1", 1, false, [lesson("a", 1, true)]),
    section("s2", 2, true,  [lesson("b", 1, false)]),
    section("s3", 3, false, [lesson("c", 1, false)]),
  ];
  check(nextLesson(withLocked)?.lessonId === "c",
    "🛑 E3 跳過鎖住的段落——指向一個按了會報錯的單元，比沒有這顆按鈕更糟");

  const allLocked = [section("s1", 1, true, [lesson("a", 1, false)])];
  check(nextLesson(allLocked) === null, "E4 全部鎖住也回 null");

  const outOfOrder = [
    section("s2", 2, false, [lesson("c", 1, false)]),
    section("s1", 1, false, [lesson("a", 1, false)]),
  ];
  check(nextLesson(outOfOrder)?.lessonId === "a",
    "🛑 E5 依 position 排序，不是依陣列順序（RPC 已排序，但別人不一定）");

  const lessonOutOfOrder = [
    section("s1", 1, false, [lesson("b", 2, false), lesson("a", 1, false)]),
  ];
  check(nextLesson(lessonOutOfOrder)?.lessonId === "a", "E6 影片也依 position 排");

  check(nextLesson([]) === null, "E7 空課程回 null");
  check(nextLesson([section("s1", 1, false, [])]) === null, "E8 空章節回 null");
}

console.log("");
console.log("════════ F. 計數 ════════");
{
  const secs = [
    section("s1", 1, false, [lesson("a", 1, true), lesson("b", 2, false)]),
    section("s2", 2, true,  [lesson("c", 1, false)]),
  ];
  const { total, done } = countLessons(secs);
  check(total === 3 && done === 1, "F1 跨章節加總");
  check(countLessons([]).total === 0, "F2 空的是 0，不會是 undefined");
}

console.log("");
console.log("════════ G. 清單排序 ════════");
{
  const c = (id: string, done: number, total: number): CourseSummary => ({
    id, slug: id, title: id, description: "", instructor: "", cover_path: null,
    level: "BEGINNER", category: "", type: "STANDARD", access: "FREE",
    status: "PUBLISHED", lesson_count: total, completed_count: done, duration_seconds: 0,
  });
  const sorted = sortForStudent([c("done", 5, 5), c("fresh", 0, 5), c("doing", 2, 5)]);
  check(sorted.map((x) => x.id).join(",") === "doing,fresh,done",
    "G1 進行中 → 還沒開始 → 已完成");
  check(sortForStudent([]).length === 0, "G2 空清單");
  const orig = [c("a", 0, 5), c("b", 0, 5)];
  sortForStudent(orig);
  check(orig[0].id === "a", "🛑 G3 不會就地改動傳進來的陣列");
}

console.log("");
if (failures > 0) { console.error(`${failures} 項未通過`); process.exit(1); }
console.log("全部通過");
