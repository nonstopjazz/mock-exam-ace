import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { GraduationCap } from "lucide-react";
import { SectionCard } from "./shared";
import type { ParentDashboardData } from "@/data/learn/parentDashboardMock";

/** 1–5 分改用分段指示條 + 文字等第，避免看起來像消費性評價的五顆星 */
const ratingLabel = (rating: number) =>
  rating >= 5 ? "優秀" : rating === 4 ? "良好" : rating === 3 ? "穩定發展" : "需加強";

export const TeacherEvaluation = ({ data }: { data: ParentDashboardData["teacherEvaluation"] }) => (
  <SectionCard
    icon={GraduationCap}
    title="老師課堂評量"
    description="由老師直接評分，與線上練習分析分開呈現"
    action={
      <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
        {data.updatedLabel}
      </Badge>
    }
    className="mb-8"
  >
    <div className="grid grid-cols-1 sm:grid-cols-2 gap-x-10 gap-y-1">
      {data.metrics.map((m) => (
        <div
          key={m.label}
          className="flex items-center justify-between gap-3 py-3 border-b border-border"
        >
          <span className="text-sm text-foreground min-w-0 truncate">{m.label}</span>
          <div className="flex items-center gap-3 shrink-0">
            <div className="flex gap-1">
              {[1, 2, 3, 4, 5].map((i) => (
                <span
                  key={i}
                  className={`h-1.5 w-5 rounded-full ${
                    i <= m.rating ? "bg-primary" : "bg-muted"
                  }`}
                />
              ))}
            </div>
            <span className="text-xs text-muted-foreground w-14 text-right">
              {ratingLabel(m.rating)}
            </span>
          </div>
        </div>
      ))}
    </div>

    {/* 老師的話：整頁的收尾，份量接近 Hero 的引文 */}
    <div className="mt-8 flex gap-4">
      <Avatar className="h-11 w-11 shrink-0 border border-primary/20">
        <AvatarFallback className="bg-primary/10 text-primary font-semibold">
          {data.teacherName.slice(0, 1)}
        </AvatarFallback>
      </Avatar>
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground mb-1.5">{data.teacherName}的話</p>
        <p className="text-base text-foreground leading-relaxed">{data.comment}</p>
      </div>
    </div>
  </SectionCard>
);
