import { ClipboardCheck } from "lucide-react";
import { Skeleton } from "@/components/ui/skeleton";
import { useRecentExamResults } from "@/hooks/learn/useRecentExamResults";
import { QuietPanel, TYPE } from "./shared";

const shortDate = (iso: string) => {
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
};

/**
 * 最近的成績 —— 只有 exam_attempts 裡真的交卷過的紀錄。
 *
 * 🛑 顯示的是考卷總分，不是能力值。各題型分數不會被換算成
 *    聽 / 說 / 讀 / 寫，那個對應關係並不存在。
 */
export const RecentResults = () => {
  const { results, loading, error } = useRecentExamResults();

  return (
    <QuietPanel icon={ClipboardCheck} title="最近的成績">
      {loading ? (
        <div className="space-y-2">
          <Skeleton className="h-5 w-full" />
          <Skeleton className="h-5 w-2/3" />
        </div>
      ) : error || results.length === 0 ? (
        <div className="py-6 text-center text-muted-foreground">
          <p className="text-sm">還沒有測驗紀錄</p>
          <p className={`${TYPE.micro} mt-1.5`}>完成一次模擬考之後，成績會出現在這裡</p>
        </div>
      ) : (
        <div className="divide-y divide-border/50">
          {results.map((r) => (
            <div key={r.id} className="flex items-center gap-2.5 py-2.5">
              <span className="text-sm text-foreground truncate min-w-0">{r.examTitle}</span>
              <span className="ml-auto text-base font-semibold text-foreground tabular-nums shrink-0">
                {r.totalScore === null ? "—" : r.totalScore}
              </span>
              <span className={`w-9 text-right ${TYPE.micro} tabular-nums shrink-0`}>
                {shortDate(r.submittedAt)}
              </span>
            </div>
          ))}
        </div>
      )}
    </QuietPanel>
  );
};
