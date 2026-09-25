import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ArrowRight, Target } from "lucide-react";
import { ERROR_TAG_BY_CODE } from "@/lib/writing/taxonomy";
import { essayCountTone } from "@/lib/writing/errorTracking";
import { useMyErrorOverview } from "@/hooks/learn/useMyErrors";
import { SURFACE, TYPE } from "./shared";

/**
 * 最近常錯 —— 儀表板上的入口。
 *
 * 只列前三名，看細節要到「我的作文 → 我常犯的錯」。這張卡的工作是
 * 讓學生【知道有這個東西】，不是取代那一頁 —— 例句放不進這個尺寸。
 *
 * 🛑 沒有資料時整區不出現，與 RecentEssays / SpeakingEntry 一致。
 *    一張寫著「還沒有錯誤紀錄」的卡片，對還沒交過作文的學生毫無意義，
 *    只是在儀表板上佔一塊空白。
 *
 * 🛑 載入中也不出現。這是次要資訊，先讓儀表板其他區塊畫出來比較重要；
 *    塞一個 skeleton 進去只會讓版面在載入時跳動。
 */
const TOP_N = 3;

export const CommonMistakes = () => {
  const { overview, loading, error } = useMyErrorOverview();

  if (loading || error || overview.rows.length === 0) return null;

  const top = overview.rows.slice(0, TOP_N);

  return (
    <Card className={`p-5 ${SURFACE.base}`} id="section-common-mistakes">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 mb-3">
        <h2 className={TYPE.sectionHeading}>
          <Target className="h-5 w-5 text-accent inline-block mr-2 -mt-0.5" />
          最近常錯
        </h2>
        <Link
          to="/learn/student/writing?tab=errors"
          className="text-sm text-primary hover:underline inline-flex items-center gap-1 shrink-0"
        >
          看全部
          <ArrowRight className="h-4 w-4" />
        </Link>
      </div>

      <p className={`${TYPE.micro} mb-3`}>
        從你 {overview.essay_total} 篇批改完成的作文整理
      </p>

      <ul className="grid grid-cols-1 sm:grid-cols-3 gap-3">
        {top.map((row) => {
          const tag = ERROR_TAG_BY_CODE.get(row.error_code);
          return (
            <li
              key={row.error_code}
              className="rounded-lg border border-border/60 bg-background/40 p-3 min-w-0"
            >
              <p className={`${TYPE.cardTitle} truncate`}>{tag?.zh ?? row.error_code}</p>
              <div className="flex flex-wrap items-center gap-2 mt-2">
                <Badge
                  variant="outline"
                  className={`text-xs font-normal shrink-0 ${essayCountTone(row.essay_count)}`}
                >
                  {row.essay_count} 篇
                </Badge>
                <span className={TYPE.micro}>共 {row.occurrence_count} 次</span>
              </div>
            </li>
          );
        })}
      </ul>
    </Card>
  );
};
