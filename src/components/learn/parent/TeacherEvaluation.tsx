import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { GraduationCap, Star, MessageSquareQuote } from "lucide-react";
import { SectionCard } from "./shared";
import type { ParentDashboardData } from "@/data/learn/parentDashboardMock";

export const TeacherEvaluation = ({ data }: { data: ParentDashboardData["teacherEvaluation"] }) => (
  <SectionCard
    icon={GraduationCap}
    title="老師課堂評量"
    description="由老師直接評分，與線上練習分析分開呈現"
    action={<Badge variant="secondary" className="text-xs">{data.updatedLabel}</Badge>}
    className="mb-8"
  >
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-3">
      {data.metrics.map((m) => (
        <Card key={m.label} className="p-4 bg-muted/30">
          <p className="text-sm text-foreground mb-2 truncate">{m.label}</p>
          <div className="flex items-center gap-1">
            {[1, 2, 3, 4, 5].map((i) => (
              <Star
                key={i}
                className={`h-4 w-4 shrink-0 ${
                  i <= m.rating ? "fill-primary text-primary" : "text-muted-foreground/40"
                }`}
              />
            ))}
            <span className="ml-2 text-sm text-muted-foreground tabular-nums">
              {m.rating} / 5
            </span>
          </div>
        </Card>
      ))}
    </div>

    <div className="mt-6 flex gap-3 rounded-lg bg-primary/5 border border-primary/15 p-4">
      <MessageSquareQuote className="h-5 w-5 text-primary shrink-0 mt-0.5" />
      <div className="min-w-0">
        <p className="text-sm font-semibold text-foreground mb-1">{data.teacherName}的話</p>
        <p className="text-sm text-muted-foreground leading-relaxed">{data.comment}</p>
      </div>
    </div>
  </SectionCard>
);
