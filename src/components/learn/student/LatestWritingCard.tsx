import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { PenLine, Loader2, ChevronRight, MessageSquareQuote } from "lucide-react";
import { useLatestWriting } from "@/hooks/learn/useLatestWriting";
import { OVERALL_LABEL } from "@/components/learn/writing/report/reportLabels";
import { SURFACE, TYPE } from "./shared";

/**
 * Dashboard 上的「最近的作文」摘要卡。
 *
 * ⚠️ 這張卡用的是【真實資料】——這一頁其他區塊目前仍是示範資料，
 *    但作文狀態一律來自 writing_submissions 與批改 RPC。
 *
 * 刻意只做摘要：整體評價一句、值得肯定一則、需要處理一則，然後連到完整報告。
 * 完整的三軸分析留在 /learn/student/writing/:essayId，不在這裡重複。
 */

const STATUS_TONE: Record<string, string> = {
  WAITING: "bg-muted text-muted-foreground border-border",
  GRADING: "bg-secondary/10 text-foreground border-secondary/20",
  COMPLETED: "bg-primary/10 text-foreground border-primary/20",
};

export const LatestWritingCard = () => {
  const { latest, loading, error } = useLatestWriting();

  // 還沒有任何已送出的作文時，整張卡不顯示——Dashboard 不需要一個空盒子。
  if (loading || error || !latest) return null;

  const done = latest.status === "COMPLETED";

  return (
    <Card className={`p-5 ${SURFACE.base}`}>
      <div className="flex items-center justify-between gap-3 mb-3">
        <div className="flex items-center gap-2 min-w-0">
          <PenLine className="h-4 w-4 text-muted-foreground shrink-0" />
          <h2 className={TYPE.cardTitle}>最近的作文</h2>
        </div>
        <Badge
          variant="outline"
          className={`text-xs font-normal shrink-0 ${STATUS_TONE[latest.status]}`}
        >
          {latest.status === "WAITING" ? "等待老師批改" : null}
          {latest.status === "GRADING" ? (
            <span className="flex items-center gap-1">
              <Loader2 className="h-3 w-3 animate-spin" />
              批改中
            </span>
          ) : null}
          {done && latest.overall ? OVERALL_LABEL[latest.overall.level] : null}
          {done && !latest.overall ? "批改完成" : null}
        </Badge>
      </div>

      <p className="font-medium text-foreground truncate">{latest.title}</p>
      {latest.topic ? (
        <p className={`${TYPE.micro} truncate mt-0.5`}>{latest.topic}</p>
      ) : null}

      {done && latest.overall ? (
        <p className={`${TYPE.body} mt-3`}>{latest.overall.headline}</p>
      ) : null}

      {done ? (
        <div className="mt-3 space-y-2">
          {latest.firstStrength ? (
            <div className="border-l-2 border-primary/40 pl-3">
              <p className={TYPE.micro}>值得肯定</p>
              <p className="text-sm text-foreground/85 leading-relaxed line-clamp-2">
                {latest.firstStrength}
              </p>
            </div>
          ) : null}
          {latest.firstNeedsWork ? (
            <div className="border-l-2 border-accent/40 pl-3">
              <p className={TYPE.micro}>接下來的重點</p>
              <p className="text-sm text-foreground/85 leading-relaxed line-clamp-2">
                {latest.firstNeedsWork}
              </p>
            </div>
          ) : null}
        </div>
      ) : (
        <p className={`${TYPE.actionMeta} mt-3`}>
          {latest.status === "WAITING"
            ? "老師批改後，這裡會出現完整的分析。"
            : "分析正在產生，完成後就看得到。"}
        </p>
      )}

      <div className="mt-4 flex flex-wrap items-center justify-between gap-2">
        {latest.hasTeacherFeedback ? (
          <span className="flex items-center gap-1.5 text-xs text-secondary">
            <MessageSquareQuote className="h-3.5 w-3.5 shrink-0" />
            老師有補充講評
          </span>
        ) : (
          <span />
        )}
        <Button asChild variant="ghost" size="sm" className="h-8 -mr-2">
          <Link to={`/learn/student/writing/${latest.essayId}`}>
            {done ? "看完整報告" : "查看作文"}
            <ChevronRight className="h-4 w-4" />
          </Link>
        </Button>
      </div>
    </Card>
  );
};
