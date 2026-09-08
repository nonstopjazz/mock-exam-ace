import { Link } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Minus, Plus } from "lucide-react";
import { recurringProgress, recurringTargetLabel, type StudentRecurring } from "@/lib/learn/tasks";
import { ProgressRing } from "./ProgressRing";
import { TYPE } from "../shared";

/**
 * 每日動能 —— 常態練習。
 *
 * 🛑 沒有「每日任務列」這種東西：沒做的日子就是沒有紀錄，不會累積成一長串未完成追著學生跑。
 *    這裡顯示的是【當期】進度：每天的看今天，每週的看本週。
 *
 * 用深青（站上代表「學習」的顏色）而不是琥珀：常態練習是日復一日的累積，
 * 語氣要比焦點任務安靜一階。
 */

const MAX_ROWS = 2;

const HabitRow = ({
  item,
  busy,
  onLog,
}: {
  item: StudentRecurring;
  busy?: boolean;
  onLog: (taskId: string, delta: 1 | -1) => void;
}) => {
  const p = recurringProgress(item);

  return (
    <div className="py-3 border-b border-border/50 last:border-0 first:pt-0">
      <div className="flex items-center gap-3">
        <ProgressRing percent={p.percent} met={p.met} label={`${p.done}/${p.target}`} />
        <div className="min-w-0 flex-1">
          <p className="text-[15px] font-semibold text-foreground leading-snug line-clamp-2">
            {item.title}
          </p>
          <p className={`${TYPE.micro} mt-0.5`}>
            {p.met
              ? `${p.periodLabel}已達成 ${p.done} / ${p.target}`
              : `${p.periodLabel} ${p.done} / ${p.target} · ${recurringTargetLabel(item)}`}
          </p>
        </div>
      </div>

      <div className="mt-2.5 flex items-center gap-2">
        <Button
          variant="outline"
          size="sm"
          className={`flex-1 h-9 ${
            p.met ? "" : "border-secondary/45 text-secondary hover:bg-secondary/10 hover:text-secondary"
          }`}
          disabled={busy}
          onClick={() => onLog(item.task_id, 1)}
        >
          <Plus className="h-4 w-4" />
          {p.met ? "再記一次" : "完成一次"}
        </Button>
        {/* 減一次是修正用的，語氣最輕：沒有紀錄可減時直接停用 */}
        <Button
          variant="ghost"
          size="icon"
          className="h-9 w-9 shrink-0 text-muted-foreground"
          aria-label={`${item.title} 減一次`}
          disabled={busy || p.done === 0}
          onClick={() => onLog(item.task_id, -1)}
        >
          <Minus className="h-4 w-4" />
        </Button>
      </div>
    </div>
  );
};

export const HabitCard = ({
  items,
  busy,
  onLog,
}: {
  items: StudentRecurring[];
  busy?: boolean;
  onLog: (taskId: string, delta: 1 | -1) => void;
}) => {
  if (items.length === 0) return null;

  // 還沒達成的排前面：右欄的位置有限，先給今天還要做的
  const ordered = [...items].sort(
    (a, b) => Number(recurringProgress(a).met) - Number(recurringProgress(b).met),
  );
  const shown = ordered.slice(0, MAX_ROWS);
  const rest = ordered.length - shown.length;

  return (
    <Card className="p-5 border-secondary/25 bg-gradient-to-b from-secondary/[0.08] to-card">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        每日動能
      </p>
      <div className="mt-2">
        {shown.map((item) => (
          <HabitRow key={item.task_id} item={item} busy={busy} onLog={onLog} />
        ))}
      </div>
      {rest > 0 ? (
        <Link
          to="/learn/student/tasks"
          className={`${TYPE.micro} mt-3 block hover:text-foreground transition-colors`}
        >
          還有 {rest} 項常態練習 ›
        </Link>
      ) : null}
    </Card>
  );
};
