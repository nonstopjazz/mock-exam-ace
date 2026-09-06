import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { BookMarked, Flame, Repeat2 } from "lucide-react";
import { useUserStats } from "@/hooks/useUserStats";
import { TYPE } from "./shared";

/**
 * 學習紀錄 —— user_stats 裡真的存下來的四個數字。
 *
 * 🛑 刻意【沒有】一週的活動格子。系統沒有逐日的活動歷史，
 *    畫七格出來就等於編造學生哪幾天有練習。改用緊湊的數字呈現。
 * 🛑 完全沒有紀錄時說「開始練習後，這裡會慢慢累積」，
 *    而不是顯示一排 0 —— 沒開始不等於表現差。
 */

const Stat = ({
  icon: Icon,
  value,
  unit,
  label,
}: {
  icon: typeof Flame;
  value: number;
  unit: string;
  label: string;
}) => (
  <div className="flex items-start gap-3">
    <div className="h-9 w-9 grid place-items-center rounded-lg bg-muted/70 shrink-0">
      <Icon className="h-4 w-4 text-secondary" />
    </div>
    <div className="min-w-0">
      <p className="flex items-baseline gap-1">
        <span className="text-2xl font-bold text-foreground tabular-nums leading-none">
          {value.toLocaleString()}
        </span>
        <span className="text-sm text-muted-foreground">{unit}</span>
      </p>
      <p className={`${TYPE.micro} mt-1`}>{label}</p>
    </div>
  </div>
);

const relativeDay = (iso: string) => {
  const day = 86_400_000;
  const a = new Date(`${iso}T00:00:00Z`).getTime();
  const now = new Date();
  const b = Date.UTC(now.getFullYear(), now.getMonth(), now.getDate());
  const diff = Math.round((b - a) / day);
  if (diff <= 0) return "今天";
  if (diff === 1) return "昨天";
  if (diff < 7) return `${diff} 天前`;
  const d = new Date(`${iso}T00:00:00Z`);
  return `${d.getUTCMonth() + 1} 月 ${d.getUTCDate()} 日`;
};

export const LearningRhythm = () => {
  const { stats, loading } = useUserStats();

  const hasActivity =
    stats.totalReviewCount > 0 || stats.totalWordsLearned > 0 || !!stats.lastStudyDate;

  return (
    <Card className="p-5 h-full flex flex-col bg-card border-border/70" id="section-rhythm">
      <div className="flex items-start justify-between gap-3 mb-4">
        <div>
          <h2 className={TYPE.sectionHeading}>我的學習紀錄</h2>
          <p className={TYPE.micro}>來自字卡練習的累計數字</p>
        </div>
        {hasActivity && stats.streakDays > 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full bg-primary/10 px-2.5 py-1 text-xs font-semibold text-foreground shrink-0">
            <Flame className="h-3.5 w-3.5 text-primary" />
            連續 {stats.streakDays} 天
          </span>
        ) : null}
      </div>

      {loading ? (
        <div className="space-y-3">
          <Skeleton className="h-10 w-full" />
          <Skeleton className="h-10 w-2/3" />
        </div>
      ) : !hasActivity ? (
        <div className="flex-1 flex items-center justify-center py-8">
          <p className="text-sm text-muted-foreground text-center max-w-xs">
            開始練習後，這裡會慢慢累積你的學習紀錄。
          </p>
        </div>
      ) : (
        <>
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-5 flex-1">
            <Stat
              icon={Repeat2}
              value={stats.totalReviewCount}
              unit="次"
              label="累計複習次數"
            />
            <Stat
              icon={BookMarked}
              value={stats.totalWordsLearned}
              unit="個"
              label="學過的單字"
            />
          </div>

          {stats.lastStudyDate ? (
            <p className={`${TYPE.micro} mt-4 pt-3 border-t border-border/60`}>
              最近一次練習：{relativeDay(stats.lastStudyDate)}
            </p>
          ) : null}
        </>
      )}
    </Card>
  );
};
