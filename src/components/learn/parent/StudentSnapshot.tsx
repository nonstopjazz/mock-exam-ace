import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { CalendarClock, ClipboardList, MessageSquareQuote } from "lucide-react";
import type { ParentDashboardData } from "@/data/learn/parentDashboardMock";

export const StudentSnapshot = ({ student }: { student: ParentDashboardData["student"] }) => (
  <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20 mb-8">
    <div className="flex flex-col gap-6 lg:flex-row lg:items-start lg:justify-between">
      {/* 身分 */}
      <div className="flex items-center gap-4 min-w-0">
        <Avatar className="h-14 w-14 md:h-16 md:w-16 shrink-0 border-2 border-primary/20">
          <AvatarFallback className="bg-primary/15 text-primary text-xl font-semibold">
            {student.initials}
          </AvatarFallback>
        </Avatar>
        <div className="min-w-0">
          <h2 className="text-2xl md:text-3xl font-bold text-foreground truncate">
            {student.name}
          </h2>
          <p className="text-sm text-muted-foreground truncate">
            {student.grade} · {student.program}
          </p>
        </div>
      </div>

      {/* 待辦與目標 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 lg:min-w-[22rem]">
        <div className="flex items-center gap-3 rounded-lg bg-card/70 border border-border p-3">
          <ClipboardList className="h-5 w-5 text-accent shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">待完成作業</p>
            <p className="font-semibold text-foreground">
              {student.pendingTasks} 份
            </p>
          </div>
        </div>
        <div className="flex items-center gap-3 rounded-lg bg-card/70 border border-border p-3">
          <CalendarClock className="h-5 w-5 text-secondary shrink-0" />
          <div className="min-w-0">
            <p className="text-xs text-muted-foreground">{student.upcomingGoal.title}</p>
            <p className="font-semibold text-foreground truncate">
              {student.upcomingGoal.dateLabel}
              <span className="ml-1 text-sm font-normal text-muted-foreground">
                剩 {student.upcomingGoal.daysLeft} 天
              </span>
            </p>
          </div>
        </div>
      </div>
    </div>

    {/* 老師本週摘要 */}
    <div className="mt-6 flex gap-3 rounded-lg bg-card/70 border border-border p-4">
      <MessageSquareQuote className="h-5 w-5 text-primary shrink-0 mt-0.5" />
      <div className="min-w-0">
        <div className="flex items-center gap-2 mb-1">
          <p className="text-sm font-semibold text-foreground">老師本週回饋</p>
          <Badge variant="secondary" className="text-xs">本週</Badge>
        </div>
        <p className="text-sm text-muted-foreground leading-relaxed">
          {student.teacherWeeklySummary}
        </p>
      </div>
    </div>
  </Card>
);
