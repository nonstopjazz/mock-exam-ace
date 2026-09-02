/**
 * 寫作頁的純函式（與元件分開，避免 react-refresh 失效）
 */

export function formatEssayDate(value: string): string {
  // essay_date 是 DATE，字串本身就是 YYYY-MM-DD，直接換成本地寫法即可，
  // 不經過 Date 物件以免時區把日期挪掉一天。
  const [y, m, d] = value.split("-");
  if (!y || !m || !d) return value;
  return `${y}/${m}/${d}`;
}
