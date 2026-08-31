import { useState } from "react";
import { Button } from "@/components/ui/button";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { MessageSquareQuote } from "lucide-react";
import { StudentSection } from "./shared";
import type { StudentDashboard } from "@/hooks/learn/useStudentDashboard";

/** 只顯示最近、有意義的兩則；其餘收在「查看更多」裡 */
export const TeacherFeedback = ({ sd }: { sd: StudentDashboard }) => {
  const [open, setOpen] = useState(false);
  const all = sd.scenario.feedback;
  const recent = all.slice(0, 2);

  return (
    <>
      <StudentSection
        icon={MessageSquareQuote}
        title="老師的話"
        hint="最近的課堂觀察"
        action={
          all.length > recent.length && (
            <Button
              variant="ghost"
              size="sm"
              className="h-8 text-muted-foreground"
              onClick={() => setOpen(true)}
            >
              查看更多
            </Button>
          )
        }
      >
        <div className="space-y-3">
          {recent.map((f) => (
            <div key={f.id}>
              <p className="text-sm text-foreground leading-relaxed">{f.body}</p>
              <p className="text-xs text-muted-foreground mt-1">
                {f.teacherName} · {f.dateLabel}
              </p>
            </div>
          ))}
        </div>
      </StudentSection>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>老師的話</DialogTitle>
            <DialogDescription>最近幾堂課的觀察</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 max-h-[60vh] overflow-y-auto">
            {all.map((f) => (
              <div key={f.id} className="border-b border-border pb-3 last:border-0">
                <p className="text-sm text-foreground leading-relaxed">{f.body}</p>
                <p className="text-xs text-muted-foreground mt-1">
                  {f.teacherName} · {f.dateLabel}
                </p>
              </div>
            ))}
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
