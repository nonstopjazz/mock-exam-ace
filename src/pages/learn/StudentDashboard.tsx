import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { STUDENT_SCENARIOS, type StudentId } from "@/data/learn/studentDashboardMock";
import { useStudentDashboard } from "@/hooks/learn/useStudentDashboard";
import { StudentTasksCard } from "@/components/learn/student/StudentTasksCard";
import { TodayLauncher } from "@/components/learn/student/TodayLauncher";
import { ProgressSnapshot } from "@/components/learn/student/ProgressSnapshot";
import { LearningRhythm } from "@/components/learn/student/LearningRhythm";
import { MyVocabulary } from "@/components/learn/student/MyVocabulary";
import { RecentResults } from "@/components/learn/student/RecentResults";
import { TeacherFeedback } from "@/components/learn/student/TeacherFeedback";
import { LatestWritingCard } from "@/components/learn/student/LatestWritingCard";

/**
 * Student Dashboard — v1.1（視覺重組）
 *
 * 資料來源：
 *   ✅ 真實 —— 我的任務（learn_student_tasks）、最近的作文（writing_*）
 *   🛑 示範 —— 今天、學習狀況、節奏、字卡、成績、老師的話
 *      這幾區仍是 studentDashboardMock，尚未接後端。
 *
 * 視覺層級刻意不平均：
 *   我的任務 → Action zone（今天）→ 兩欄摘要（學習狀況 / 節奏）
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

          {/* 1. 我的任務 —— ⚠️ 真實資料。老師指派什麼就顯示什麼；
              沒有任務時顯示「目前沒有新的任務」，不會整張卡消失。 */}
          <StudentTasksCard />

          {/* 2. Action zone —— 今天要做什麼 */}
          <div className="mt-10">
            <TodayLauncher sd={sd} />
          </div>

          {/* 2.5 最近的作文 —— ⚠️ 真實資料。
              沒有已送出的作文時整張卡不出現。 */}
          <div className="mt-10">
            <LatestWritingCard />
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
              「我的任務」與「最近的作文」是真實資料，本頁其餘區塊為示範用途。
            </p>
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default StudentDashboard;
