import { useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { ArrowUpRight, ChevronRight, Target } from "lucide-react";
import { SKILL_LABEL } from "@/data/learn/teacherSessionMock";
import {
  PROGRESS_LEVEL_LABEL, PROGRESS_LEVEL_STEP, type ProgressHighlight,
} from "@/data/learn/studentDashboardMock";
import { TrendIcon } from "@/components/learn/parent/shared";
import { SourceBadge } from "@/components/learn/teacher/shared";
import { LevelSteps } from "./shared";
import type { StudentDashboard } from "@/hooks/learn/useStudentDashboard";

const TREND_LABEL = { up: "在進步", flat: "持平", down: "最近較不穩" } as const;

const Item = ({
  item, icon: Icon, iconClass, eyebrow,
}: { item: ProgressHighlight; icon: typeof Target; iconClass: string; eyebrow: string }) => (
  <div className="flex gap-3">
    <div className="p-2 rounded-lg bg-muted shrink-0 h-fit">
      <Icon className={`h-4 w-4 ${iconClass}`} />
    </div>
    <div className="min-w-0">
      <p className="text-xs text-muted-foreground">{eyebrow}</p>
      <p className="font-semibold text-foreground mt-0.5">
        {SKILL_LABEL[item.skill]}
        <span className="ml-2 text-sm font-normal text-muted-foreground">{item.headline}</span>
      </p>
      <p className="text-sm text-foreground/80 leading-relaxed mt-1">{item.detail}</p>
    </div>
  </div>
);

/**
 * Progress Snapshot —— 首頁只放「近期亮點 + 本週重點」。
 * 完整六技能收在對話框裡，避免首頁變成家長端報表的複製品。
 */
export const ProgressSnapshot = ({ sd }: { sd: StudentDashboard }) => {
  const [open, setOpen] = useState(false);
  const { highlight, focus, progress } = sd.scenario;

  return (
    <>
      <Card className="p-5 h-full flex flex-col">
        <h2 className="text-base font-semibold text-foreground mb-4">我最近的學習</h2>
        <div className="space-y-5 flex-1">
          <Item item={highlight} icon={ArrowUpRight} iconClass="text-success" eyebrow="近期亮點" />
          <Item item={focus} icon={Target} iconClass="text-accent" eyebrow="本週重點" />
        </div>
        <Button
          variant="ghost"
          className="mt-4 justify-start -ml-2 text-muted-foreground"
          onClick={() => setOpen(true)}
        >
          查看完整學習表現
          <ChevronRight className="h-4 w-4" />
        </Button>
      </Card>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>我的學習表現</DialogTitle>
            <DialogDescription>
              綜合最近的課堂觀察與練習紀錄，不是單次成績，也不是精準分數
            </DialogDescription>
          </DialogHeader>
          <div className="divide-y divide-border/60 max-h-[60vh] overflow-y-auto">
            {progress.map((r) => {
              const measured = r.level !== null;
              return (
                <div key={r.skill} className="py-3">
                  <div className="flex items-center gap-3">
                    <span className="w-12 shrink-0 text-sm font-medium text-foreground">
                      {SKILL_LABEL[r.skill]}
                    </span>
                    <LevelSteps step={measured ? PROGRESS_LEVEL_STEP[r.level!] : null} />
                    <span className={`text-sm ${measured ? "text-foreground" : "text-muted-foreground"}`}>
                      {/* 🛑 尚未測得不等於能力弱 */}
                      {measured ? PROGRESS_LEVEL_LABEL[r.level!] : "尚無足夠資料"}
                    </span>
                    {measured && (
                      <span className="flex items-center gap-1 text-xs text-muted-foreground ml-auto">
                        <TrendIcon trend={r.trend} />
                        {TREND_LABEL[r.trend]}
                      </span>
                    )}
                  </div>
                  <p className="text-sm text-muted-foreground mt-1 pl-[3.75rem]">
                    下一步：{r.nextAction}
                  </p>
                  {r.sources.length > 0 && (
                    <div className="flex items-center gap-1.5 mt-1.5 pl-[3.75rem]">
                      {r.sources.map((s) => <SourceBadge key={s} source={s} />)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
