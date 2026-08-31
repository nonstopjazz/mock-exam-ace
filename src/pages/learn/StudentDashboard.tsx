import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { STUDENT_SCENARIOS, type StudentId } from "@/data/learn/studentDashboardMock";
import { useStudentDashboard } from "@/hooks/learn/useStudentDashboard";
import { NextClassHero } from "@/components/learn/student/NextClassHero";
import { TodayLauncher } from "@/components/learn/student/TodayLauncher";
import { ProgressSnapshot } from "@/components/learn/student/ProgressSnapshot";
import { LearningRhythm } from "@/components/learn/student/LearningRhythm";
import { MyVocabulary } from "@/components/learn/student/MyVocabulary";
import { RecentResults } from "@/components/learn/student/RecentResults";
import { TeacherFeedback } from "@/components/learn/student/TeacherFeedback";

/**
 * Student Dashboard — v1.1（視覺重組）
 * 🛑 全部為 mock data。字卡區塊使用共用的 PackCard，導向既有的字卡系統。
 *
 * 視覺層級刻意不平均：
 *   Hero（下一堂課）→ Action zone（今天）→ 兩欄摘要（學習狀況 / 節奏）
 *   → 字卡收藏 → 底部次要資訊（成績 / 老師的話）
 */
const StudentDashboard = () => {
  const [studentId, setStudentId] = useState<StudentId>("amy");
  const sd = useStudentDashboard(studentId);

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          {/* 頁首：緊湊的身分帶 */}
          <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-11 w-11 shrink-0">
                <AvatarFallback className="bg-primary/15 text-primary font-semibold">
                  {sd.scenario.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1 className="text-xl md:text-[1.6rem] font-bold text-foreground truncate leading-tight">
                  嗨，{sd.scenario.name}
                </h1>
                <p className="text-[11px] text-muted-foreground truncate">
                  {sd.scenario.grade} · {sd.scenario.className}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Tabs value={studentId} onValueChange={(v) => setStudentId(v as StudentId)}>
                <TabsList>
                  <TabsTrigger value="amy">{STUDENT_SCENARIOS.amy.switchLabel}</TabsTrigger>
                  <TabsTrigger value="brian">{STUDENT_SCENARIOS.brian.switchLabel}</TabsTrigger>
                </TabsList>
              </Tabs>
              <Badge variant="outline" className="text-xs text-muted-foreground">示範資料</Badge>
            </div>
          </div>

          {/* 1. Hero —— 下次上課前還要做什麼 */}
          <NextClassHero sd={sd} />

          {/* 2. Action zone —— 今天要做什麼 */}
          <div className="mt-10">
            <TodayLauncher sd={sd} />
          </div>

          {/* 3–4. 摘要與節奏：兩欄，密度比上面高、份量比上面輕 */}
          <div className="mt-10 grid grid-cols-1 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.35fr)] gap-4 items-stretch">
            <ProgressSnapshot sd={sd} />
            <LearningRhythm sd={sd} />
          </div>

          {/* 5. 字卡收藏 */}
          <div className="mt-10">
            <MyVocabulary sd={sd} />
          </div>

          {/* 6–7. 次要資訊 */}
          <div className="mt-10 -mx-4 px-4 py-8 border-t border-border/60 bg-muted/20">
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <RecentResults sd={sd} />
              <TeacherFeedback sd={sd} />
            </div>
            <p className="text-center text-[11px] text-muted-foreground mt-8">
              本頁為設計原型，所有資料皆為示範用途，未連接後端。
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default StudentDashboard;
