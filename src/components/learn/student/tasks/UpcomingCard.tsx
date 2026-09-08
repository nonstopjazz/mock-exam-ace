import { Card } from "@/components/ui/card";
import { dueLabel, type StudentHomework } from "@/lib/learn/tasks";
import { TYPE } from "../shared";

/**
 * 即將到來 —— 上面沒有顯示、而且還沒到期的下一件作業。
 *
 * 🛑 沒有這樣的作業時整張卡不出現。不為了填滿版面編一個假的下一步。
 * 🛑 也不會重複上面已經列出來的項目：這張卡回答的是「再來呢」，不是「還有什麼」。
 */
export const UpcomingCard = ({ items, today }: { items: StudentHomework[]; today: string }) => {
  if (items.length === 0) return null;

  return (
    <Card className="p-5">
      <p className="text-[11px] font-semibold uppercase tracking-[0.14em] text-muted-foreground">
        即將到來
      </p>
      <div className="mt-3 space-y-3">
        {items.map((hw) => (
          <div key={hw.task_id} className="flex gap-2.5">
            <span className="mt-2 h-1.5 w-1.5 rounded-full bg-muted-foreground/50 shrink-0" aria-hidden />
            <div className="min-w-0">
              <p className="text-sm font-medium text-foreground leading-snug line-clamp-2">
                {hw.title}
              </p>
              <p className={`${TYPE.micro} mt-0.5 truncate`}>
                {dueLabel(hw, today)} · {hw.class_name}
              </p>
            </div>
          </div>
        ))}
      </div>
    </Card>
  );
};
