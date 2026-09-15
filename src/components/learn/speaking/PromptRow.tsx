import { cn } from "@/lib/utils";
import { StatusDot } from "./StatusDot";

interface PromptRowProps {
  label: string;
  /**
   * 第二行的小字，目前放主題。
   *
   * 只有搜尋結果那種扁平清單才需要：題庫裡有 6 題同樣的問題各自掛在兩個主題下，
   * 搜尋時它們會連著出現，沒有主題就是一模一樣的兩行，看起來像重複渲染的 bug。
   * 主題分組的清單不必給——主題就寫在上面那一行了。
   */
  meta?: string;
  practiced: boolean;
  active: boolean;
  onSelect: () => void;
}

/**
 * 題庫裡的一題 —— 一行，不是一張卡片。
 *
 * 🛑 這是整個選題畫面能不能用的關鍵。一個 Part 有 800～1000 題；
 *    一題一張 p-6 的卡片，光是捲到中間就要滑幾十頁。
 *    一行的高度讓一個主題的八題同時看得到，才選得下去。
 */
export function PromptRow({ label, meta, practiced, active, onSelect }: PromptRowProps) {
  return (
    <button
      type="button"
      onClick={onSelect}
      aria-pressed={active}
      className={cn(
        "flex w-full items-start gap-2.5 rounded-md px-2 py-2 text-left text-sm transition-colors",
        "hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        active && "bg-muted ring-1 ring-primary/40",
      )}
    >
      <StatusDot state={practiced ? "done" : "todo"} className="mt-1.5" />
      <span className="min-w-0 flex-1">
        <span className="block break-words">{label}</span>
        {meta && <span className="block text-xs text-muted-foreground">{meta}</span>}
      </span>
    </button>
  );
}
