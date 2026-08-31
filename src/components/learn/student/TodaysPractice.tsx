import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { CheckCircle2, Clock, FileText, Play, Sun } from "lucide-react";
import type { PracticeItem } from "@/data/learn/studentDashboardMock";
import { StudentSection } from "./shared";
import type { StudentDashboard } from "@/hooks/learn/useStudentDashboard";

const DoneBadge = ({ item }: { item: PracticeItem }) => (
  <Badge
    variant="outline"
    className={
      item.doneSource === "self"
        ? "gap-1 font-normal border-dashed bg-secondary/5 text-secondary border-secondary/40"
        : "gap-1 font-normal bg-success/10 text-success border-success/30"
    }
  >
    <CheckCircle2 className="h-3.5 w-3.5" />
    {item.doneSource === "self" ? "已標記完成" : "已完成"}
  </Badge>
);

/**
 * Today's Practice —— 只顯示今天真的要做的 Recurring Practice。
 * Amy 平日登入常常只是為了這一區，所以 Start 必須很好按到。
 */
export const TodaysPractice = ({ sd }: { sd: StudentDashboard }) => {
  const navigate = useNavigate();
  const { practice, todayPractice, togglePracticeDone } = sd;
  const notToday = practice.filter((p) => !p.scheduledToday);
  const remaining = todayPractice.filter((p) => !p.done).length;

  return (
    <StudentSection
      icon={Sun}
      title="今天的練習"
      hint="每天固定的練習，和上課前的作業分開"
      tone="primary"
      action={
        <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
          {remaining > 0 ? `還有 ${remaining} 項` : "今天都完成了"}
        </Badge>
      }
    >
      <div className="divide-y divide-border/60">
        {todayPractice.map((p) => (
          <div key={p.id} className="flex flex-wrap items-center gap-3 py-2.5">
            {p.mode === "paper" ? (
              <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
            ) : (
              <Clock className="h-4 w-4 text-muted-foreground shrink-0" />
            )}
            <div className="min-w-0">
              <p className="font-medium text-foreground">{p.title}</p>
              <p className="text-xs text-muted-foreground">{p.meta}</p>
            </div>

            <div className="ml-auto flex items-center gap-2 shrink-0">
              {p.done ? (
                <>
                  <DoneBadge item={p} />
                  <Button
                    variant="ghost"
                    size="sm"
                    className="text-muted-foreground"
                    onClick={() => togglePracticeDone(p.id)}
                  >
                    取消
                  </Button>
                </>
              ) : p.mode === "online" && p.startPath ? (
                <Button size="sm" onClick={() => navigate(p.startPath!)}>
                  <Play className="h-4 w-4" />
                  開始
                </Button>
              ) : (
                // 紙本 recurring practice 只能自行標記，語意上不等於平台記錄
                <Button variant="outline" size="sm" onClick={() => togglePracticeDone(p.id)}>
                  我完成了
                </Button>
              )}
            </div>
          </div>
        ))}
      </div>

      {notToday.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3 pt-3 border-t border-border">
          今天沒有安排：{notToday.map((p) => p.title).join("、")}
        </p>
      )}
    </StudentSection>
  );
};
