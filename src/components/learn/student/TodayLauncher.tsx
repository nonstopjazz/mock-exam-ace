import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BookOpen, Check, FileText, Headphones, Play, Sparkles } from "lucide-react";
import type { PracticeItem } from "@/data/learn/studentDashboardMock";
import type { StudentDashboard } from "@/hooks/learn/useStudentDashboard";

const ICON_FOR = (title: string) =>
  title.includes("單字") ? Sparkles
    : title.includes("閱讀") ? BookOpen
    : title.includes("聽力") ? Headphones
    : FileText;

/** 一格 launcher：圖示、名稱、待辦量與時間、然後是一顆大按鈕 */
const Tile = ({
  item, onStart, onSelfReport,
}: { item: PracticeItem; onStart: () => void; onSelfReport: () => void }) => {
  const Icon = ICON_FOR(item.title);
  const [count, time] = item.meta.split(" · ");

  return (
    <div
      className={`flex flex-col rounded-lg border p-4 transition-all ${
        item.done
          ? "border-border bg-muted/30"
          : "border-secondary/25 bg-secondary/5 hover:border-secondary/45 hover:shadow-md"
      }`}
    >
      <div className="flex items-start gap-3">
        <div className={`p-2 rounded-lg shrink-0 ${item.done ? "bg-muted" : "bg-secondary/15"}`}>
          <Icon className={`h-5 w-5 ${item.done ? "text-muted-foreground" : "text-secondary"}`} />
        </div>
        <div className="min-w-0">
          <p className="font-semibold text-foreground leading-snug">{item.title}</p>
          <p className="text-sm text-muted-foreground mt-0.5">{count}</p>
          {time && <p className="text-xs text-muted-foreground">{time}</p>}
        </div>
      </div>

      <div className="mt-4">
        {item.done ? (
          <p className="flex items-center gap-1.5 text-sm font-medium text-success">
            <Check className="h-4 w-4" />
            {item.doneSource === "self" ? "已標記完成" : "已完成"}
          </p>
        ) : item.mode === "online" ? (
          <Button className="w-full" onClick={onStart}>
            <Play className="h-4 w-4" />
            開始
          </Button>
        ) : (
          <Button variant="outline" className="w-full" onClick={onSelfReport}>
            我完成了
          </Button>
        )}
      </div>
    </div>
  );
};

/**
 * Today —— action zone，不是另一張清單。
 * 只放今天真的要做的；沒有安排的用一行帶過，不占大卡。
 */
export const TodayLauncher = ({ sd }: { sd: StudentDashboard }) => {
  const navigate = useNavigate();
  const { practice, todayPractice, togglePracticeDone } = sd;
  const notToday = practice.filter((p) => !p.scheduledToday);
  const remaining = todayPractice.filter((p) => !p.done).length;

  return (
    <section id="section-today">
      <div className="flex items-baseline justify-between gap-3 mb-3">
        <h2 className="text-xl font-semibold text-foreground">今天要做的練習</h2>
        <p className="text-sm text-muted-foreground">
          {remaining > 0 ? `還有 ${remaining} 項 · 約 ${remaining * 10} 分鐘` : "今天都完成了"}
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {todayPractice.map((p) => (
          <Tile
            key={p.id}
            item={p}
            onStart={() => p.startPath && navigate(p.startPath)}
            onSelfReport={() => togglePracticeDone(p.id)}
          />
        ))}
      </div>

      {notToday.length > 0 && (
        <p className="text-xs text-muted-foreground mt-3">
          今日無安排：{notToday.map((p) => p.title).join("、")}
        </p>
      )}
    </section>
  );
};
