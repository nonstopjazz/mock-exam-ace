import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, CalendarClock, Clock, Loader2, Users } from "lucide-react";
import type { SessionScenario } from "@/data/learn/teacherSessionMock";
import type { SaveState, SessionStatus } from "@/hooks/learn/useSessionWorkspace";

export const SaveIndicator = ({ saveState, savedAt }: { saveState: SaveState; savedAt: string }) =>
  saveState === "saving" ? (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Loader2 className="h-3.5 w-3.5 animate-spin" />
      儲存中…
    </span>
  ) : (
    <span className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Check className="h-3.5 w-3.5 text-success" />
      已自動儲存 · {savedAt}
    </span>
  );

/**
 * Session Header —— 系統已經知道的事情，老師不需要重新選。
 * 班級、日期、學生人數、下一堂課都是唯讀。
 */
export const SessionHeader = ({
  scenario,
  status,
  saveState,
  savedAt,
}: {
  scenario: SessionScenario;
  status: SessionStatus;
  saveState: SaveState;
  savedAt: string;
}) => (
  <Card className="px-6 py-4 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
    <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
      <div className="min-w-0">
        <div className="flex items-center gap-3 flex-wrap mb-1.5">
          <h1 className="text-xl md:text-2xl font-bold text-foreground">{scenario.className}</h1>
          {status === "completed" ? (
            <Badge className="bg-success text-success-foreground hover:bg-success">本堂已完成收尾</Badge>
          ) : (
            <Badge variant="outline" className="border-primary/40 text-foreground font-normal">
              上課中
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-x-5 gap-y-1 flex-wrap text-sm text-muted-foreground">
          <span className="flex items-center gap-1.5">
            <Clock className="h-4 w-4 shrink-0" />
            {scenario.dateLabel} · {scenario.timeLabel}
          </span>
          <span className="flex items-center gap-1.5">
            <Users className="h-4 w-4 shrink-0" />
            {scenario.students.length} 位學生
          </span>
          <span className="flex items-center gap-1.5">
            <CalendarClock className="h-4 w-4 shrink-0" />
            下一堂 {scenario.nextClassLabel}
          </span>
        </div>
      </div>
      <div className="shrink-0 lg:text-right">
        <SaveIndicator saveState={saveState} savedAt={savedAt} />
        <p className="text-xs text-muted-foreground mt-0.5">所有輸入都會自動儲存</p>
      </div>
    </div>
  </Card>
);
