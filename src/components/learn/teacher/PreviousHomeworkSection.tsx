import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { CheckCheck, ClipboardList } from "lucide-react";
import { WorkspaceSection, SegmentedPicker, StudentAvatar } from "./shared";
import { homeworkOptions } from "./pickerOptions";
import type { SessionWorkspace } from "@/hooks/learn/useSessionWorkspace";

/**
 * 上次作業檢查。
 * - 只有「部分完成」才出現百分比欄位（完成 = 100，未完成 = 0）
 * - 課中已經記錄過的直接顯示結果，不要求再次 confirm
 * - 小團班才有「全部標記為完成」；一對一沒有多餘的 batch control
 */
export const PreviousHomeworkSection = ({ ws }: { ws: SessionWorkspace }) => {
  const { scenario, state, setHomeworkStatus, setHomeworkPercent, markAllHomeworkDone } = ws;
  const isGroup = scenario.students.length > 1;
  const recorded = scenario.students.filter((s) => state.homework[s.id]).length;

  return (
    <WorkspaceSection
      icon={ClipboardList}
      title="上次作業"
      hint={scenario.previousHomeworkTitle}
      action={
        <>
          {recorded > 0 && (
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
              課中已記錄 {recorded}/{scenario.students.length}
            </Badge>
          )}
          {isGroup && (
            <Button variant="outline" size="sm" onClick={markAllHomeworkDone}>
              <CheckCheck className="h-4 w-4" />
              全部標記為完成
            </Button>
          )}
        </>
      }
    >
      <div className="divide-y divide-border">
        {scenario.students.map((s) => {
          const entry = state.homework[s.id];
          return (
            <div
              key={s.id}
              className="flex flex-wrap items-center gap-3 py-3 first:pt-0 last:pb-0"
            >
              <div className="flex items-center gap-2.5 w-40 min-w-0">
                <StudentAvatar student={s} />
                <span className="font-medium text-foreground truncate">{s.name}</span>
              </div>

              <SegmentedPicker
                options={homeworkOptions}
                value={entry?.status ?? "not_done"}
                onChange={(v) => setHomeworkStatus(s.id, v)}
              />

              {/* 只有部分完成才需要百分比 */}
              {entry?.status === "partial" && (
                <div className="flex items-center gap-1.5">
                  <Input
                    type="number"
                    min={0}
                    max={100}
                    value={entry.percent ?? 0}
                    onChange={(e) => setHomeworkPercent(s.id, Number(e.target.value))}
                    className="h-8 w-20"
                    aria-label={`${s.name} 完成百分比`}
                  />
                  <span className="text-sm text-muted-foreground">%</span>
                </div>
              )}

              {!entry && (
                <span className="text-xs text-muted-foreground">尚未記錄</span>
              )}
            </div>
          );
        })}
      </div>
    </WorkspaceSection>
  );
};
