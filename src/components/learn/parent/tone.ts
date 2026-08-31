import type { MeterTone } from "./shared";

/** 取一組分數中最高 / 最低的 label，用來決定 Meter 的顏色角色 */
export const toneMap = (items: { label: string; value: number | null }[]) => {
  const measured = items.filter((i): i is { label: string; value: number } => i.value !== null);
  if (measured.length < 2) return {} as Record<string, MeterTone>;
  const best = measured.reduce((a, b) => (b.value > a.value ? b : a));
  const worst = measured.reduce((a, b) => (b.value < a.value ? b : a));
  return { [best.label]: "strong", [worst.label]: "focus" } as Record<string, MeterTone>;
};
