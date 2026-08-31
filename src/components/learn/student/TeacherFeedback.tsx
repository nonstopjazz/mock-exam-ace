import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MessageSquareQuote } from "lucide-react";
import { QuietPanel, TYPE } from "./shared";
import type { StudentDashboard } from "@/hooks/learn/useStudentDashboard";

/** 只顯示最近、有意義的兩則；其餘收在「查看更多」裡 */
export const TeacherFeedback = ({ sd }: { sd: StudentDashboard }) => {
  const [open, setOpen] = useState(false);
  const all = sd.scenario.feedback;
  const recent = all.slice(0, 2);

  return (
    <>
      <QuietPanel
        icon={MessageSquareQuote}
        title="老師的話"
        aside={
          all.length > recent.length && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 px-2 text-muted-foreground hover:text-foreground"
              onClick={() => setOpen(true)}
            >
              查看更多
            </Button>
          )
        }
      >
        <div className="space-y-4">
          {recent.map((f) => (
            <div key={f.id} className="border-l-2 border-border/70 pl-3">
              <p className="text-sm text-foreground/90 leading-[1.7]">「{f.body}」</p>
              <p className={`${TYPE.micro} mt-1.5`}>
                <span className="font-medium text-foreground/70">{f.teacherName}</span> · {f.dateLabel}
              </p>
            </div>
          ))}
        </div>
      </QuietPanel>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>老師的話</DialogTitle>
            <DialogDescription>最近幾堂課的觀察</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {all.map((f) => (
              <div key={f.id} className="border-l-2 border-border/70 pl-3">
                <p className="text-sm text-foreground/90 leading-[1.7]">「{f.body}」</p>
                <p className="text-[11px] text-muted-foreground mt-1.5">
                  <span className="font-medium text-foreground/70">{f.teacherName}</span> · {f.dateLabel}
                </p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
