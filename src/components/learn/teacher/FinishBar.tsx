import { Button } from "@/components/ui/button";
import { CheckCircle2, Flag, RotateCcw } from "lucide-react";
import { SaveIndicator } from "./SessionHeader";
import type { SessionWorkspace } from "@/hooks/learn/useSessionWorkspace";

/**
 * Sticky Finish Bar。
 * 🛑 下面的數字只是本堂記錄的摘要，不是完成度檢查 ——
 *    沒有觀察紀錄的學生維持「未觀察」是完全合理的，不顯示為警告。
 */
export const FinishBar = ({
  ws,
  quickAdd,
}: {
  ws: SessionWorkspace;
  quickAdd: React.ReactNode;
}) => {
  const { summary, state, saveState, savedAt, finishSession, reopenSession } = ws;
  const done = state.status === "completed";

  const items = [
    { n: summary.observations, label: "則學生觀察" },
    { n: summary.assessments, label: "份評量" },
    { n: summary.nextHomework, label: "項次堂作業" },
    { n: summary.recurring, label: "項常態練習" },
    { n: summary.digital, label: "項線上任務" },
  ];

  return (
    <div className="sticky bottom-0 z-30 -mx-4 px-4 pb-4 pt-2 bg-gradient-to-t from-background via-background to-transparent">
      <div className="rounded-lg border border-border bg-card shadow-lg p-4">
        <div className="flex flex-wrap items-center gap-4">
          <div className="shrink-0">{quickAdd}</div>

          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted-foreground">
              {items.map((i) => (
                <span key={i.label} className="tabular-nums">
                  <span className="font-semibold text-foreground">{i.n}</span> {i.label}
                </span>
              ))}
            </div>
            <div className="mt-1">
              <SaveIndicator saveState={saveState} savedAt={savedAt} />
            </div>
          </div>

          {done ? (
            <div className="flex items-center gap-3 shrink-0">
              <span className="flex items-center gap-2 text-sm font-medium text-success">
                <CheckCircle2 className="h-5 w-5" />
                本堂收尾已完成
              </span>
              <Button variant="ghost" size="sm" className="text-muted-foreground" onClick={reopenSession}>
                <RotateCcw className="h-4 w-4" />
                重新開啟
              </Button>
            </div>
          ) : (
            <Button size="lg" className="shrink-0" onClick={finishSession}>
              <Flag className="h-4 w-4" />
              完成本堂收尾
            </Button>
          )}
        </div>
      </div>
    </div>
  );
};
