import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BookOpen, FileText, Headphones, Play, Sparkles } from "lucide-react";
import type { PracticeItem } from "@/data/learn/studentDashboardMock";
import { SURFACE, TYPE, SectionHead, PracticeDone } from "./shared";
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
      className={`group flex flex-col rounded-lg border p-5 transition-all duration-200 ${
        item.done
          ? "border-border/60 bg-muted/25"
          : `${SURFACE.raised} border hover:-translate-y-0.5 hover:shadow-lg`
      }`}
    >
      <div className="flex items-start gap-3">
        <div
          className={`h-10 w-10 grid place-items-center rounded-lg shrink-0 transition-colors ${
            item.done ? "bg-muted" : "bg-secondary/12 group-hover:bg-secondary/18"
          }`}
        >
          <Icon className={`h-5 w-5 ${item.done ? "text-muted-foreground" : "text-secondary"}`} />
        </div>
        <div className="min-w-0">
          <p className={`${TYPE.cardTitle} leading-snug`}>{item.title}</p>
          <p className="text-sm text-foreground/70 mt-1 tabular-nums">{count}</p>
          {time && <p className={TYPE.micro}>{time}</p>}
        </div>
      </div>

      <div className="mt-5">
        {item.done ? (
          <div className="h-10 flex items-center">
            <PracticeDone source={item.doneSource} />
          </div>
        ) : item.mode === "online" ? (
          <Button
            className="w-full h-10 transition-all hover:shadow-button active:translate-y-px"
            onClick={onStart}
          >
            <Play className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            開始
          </Button>
        ) : (
          <Button
            variant="outline"
            className="w-full h-10 active:translate-y-px"
            onClick={onSelfReport}
          >
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
      <SectionHead
        title="今天要做的練習"
        aside={
          <p className={TYPE.actionMeta}>
            {remaining > 0 ? `還有 ${remaining} 項` : "今天都完成了"}
          </p>
        }
      />

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
        <p className={`${TYPE.micro} mt-3`}>
          今日無安排：{notToday.map((p) => p.title).join("、")}
        </p>
      )}
    </section>
  );
};
