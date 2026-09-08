/**
 * 全站卡片網格的斷點 —— 只有這一組。
 *
 * 用它的地方：
 *   /practice/vocabulary/collections  字卡包
 *   /learn/student/writing            我的作文
 *   /learn/student                    最近的作文
 *
 * 三頁的外框都是 `container mx-auto px-4`，所以套同一組 class 之後，
 * 卡片在每一頁的寬度會完全一致。要調寬度就改這一行，不要在各頁各寫一份。
 */
export const GRID_CARDS =
  "grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6 xl:gap-4";
