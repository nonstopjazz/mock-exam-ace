import { cn } from "@/lib/utils";

import type { DotState } from "@/lib/speaking/types";

const LABEL: Record<DotState, string> = {
  todo: "還沒練過",
  partial: "練了一部分",
  done: "已練過",
};

/**
 * 紅 / 琥珀 / 綠的實心點。
 *
 * 外圈那個 ring-4 是重點：點本身只有 10px，在上千列的清單裡掃過去會糊成一片；
 * 外面那圈淡色把它撐成一個看得見的色塊，顏色卻不會壓過旁邊的題目文字。
 *
 * 用 destructive / warning / success 三個語意 token，不是 red-500 那種寫死的色——
 * 寫死的顏色在深色模式下會失效。
 */
export function StatusDot({ state, className }: { state: DotState; className?: string }) {
  return (
    <span
      role="img"
      aria-label={LABEL[state]}
      className={cn(
        "inline-block h-2.5 w-2.5 shrink-0 rounded-full ring-4",
        state === "done" && "bg-success ring-success/25",
        state === "partial" && "bg-warning ring-warning/25",
        state === "todo" && "bg-destructive ring-destructive/25",
        className,
      )}
    />
  );
}
