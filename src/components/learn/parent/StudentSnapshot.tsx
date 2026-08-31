import { Card } from "@/components/ui/card";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CalendarClock, ClipboardList, MessageSquareQuote } from "lucide-react";
import type { ParentDashboardData } from "@/data/learn/parentDashboardMock";

/**
 * Hero —— 整頁唯一的「大」。學生身分與老師本週的話合成一塊，
 * 家長打開後第一眼就知道：這是誰、老師怎麼說。
 */
export const StudentSnapshot = ({ student }: { student: ParentDashboardData["student"] }) => (
  <Card className="p-6 md:p-8 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20 mb-6">
    <div className="flex flex-col gap-6 lg:flex-row lg:items-center lg:justify-between">
      {/* 身分 */}
      <div className="flex items-center gap-4 md:gap-5 min-w-0">
        <Avatar className="h-16 w-16 md:h-20 md:w-20 shrink-0 border-2 border-primary/20">
          <AvatarFallback className="bg-primary/15 text-primary text-2xl md:text-3xl font-semibold">
            {student.initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h2 className="text-3xl md:text-4xl font-bold text-foreground truncate">
            {student.name}
          </h2>
          <p className="text-sm md:text-base text-muted-foreground truncate">
            {student.grade} · {student.program}
          </p>
        </div>
      </div>

      {/* 待辦與目標：改成行內資訊，不再是兩張小卡 */}
      <div className="flex items-start gap-5 sm:gap-8 shrink-0">
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1 whitespace-nowrap">
            <ClipboardList className="h-3.5 w-3.5 shrink-0" />
            <span>待完成作業</span>
          </div>
          <p className="text-2xl font-bold text-foreground tabular-nums whitespace-nowrap">
            {student.pendingTasks}
            <span className="ml-1 text-sm font-normal text-muted-foreground">份</span>
          </p>
        </div>
        <div className="h-12 w-px bg-primary/20 shrink-0" />
        <div>
          <div className="flex items-center gap-1.5 text-xs text-muted-foreground mb-1 whitespace-nowrap">
            <CalendarClock className="h-3.5 w-3.5 shrink-0" />
            <span>{student.upcomingGoal.title}</span>
          </div>
          <p className="text-2xl font-bold text-foreground whitespace-nowrap">
            {student.upcomingGoal.dateLabel}
          </p>
          <p className="text-xs text-muted-foreground whitespace-nowrap">
            剩 {student.upcomingGoal.daysLeft} 天
          </p>
        </div>
      </div>
    </div>

    {/* 老師本週的話 —— 用引文的份量呈現，不再是灰底小方塊 */}
    <div className="mt-6 md:mt-8 pt-6 border-t border-primary/20 flex gap-4">
      <MessageSquareQuote className="h-5 w-5 md:h-6 md:w-6 text-primary shrink-0 mt-1" />
      <div className="min-w-0">
        <p className="text-xs text-muted-foreground mb-1.5">
          老師本週回饋 · {student.teacherName}
        </p>
        <p className="text-base md:text-lg text-foreground leading-relaxed">
          {student.teacherWeeklySummary}
        </p>
      </div>
    </div>
  </Card>
);
