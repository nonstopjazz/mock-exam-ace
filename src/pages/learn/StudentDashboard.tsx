import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { STUDENT_SCENARIOS, type StudentId } from "@/data/learn/studentDashboardMock";
import { useStudentDashboard } from "@/hooks/learn/useStudentDashboard";
import { NextClassReadiness } from "@/components/learn/student/NextClassReadiness";
import { TodaysPractice } from "@/components/learn/student/TodaysPractice";
import { MyProgress } from "@/components/learn/student/MyProgress";
import { LearningRhythm } from "@/components/learn/student/LearningRhythm";
import { MyVocabulary } from "@/components/learn/student/MyVocabulary";
import { RecentResults } from "@/components/learn/student/RecentResults";
import { TeacherFeedback } from "@/components/learn/student/TeacherFeedback";

/**
 * Student Dashboard — prototype v1
 * 🛑 全部為 mock data，沒有後端。字彙區塊是既有字卡系統的摘要與入口，不是第二套 library。
 *
 * Action first, progress second：
 *   下次上課前要做什麼 → 今天要練什麼 → 我進步了嗎 → 節奏 → 字彙 → 成績 → 老師的話
 */
const StudentDashboard = () => {
  const [studentId, setStudentId] = useState<StudentId>("amy");
  const sd = useStudentDashboard(studentId);

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <Avatar className="h-12 w-12 md:h-14 md:w-14 shrink-0">
                <AvatarFallback className="bg-primary/15 text-primary text-lg font-semibold">
                  {sd.scenario.initials}
                </AvatarFallback>
              </Avatar>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-3xl font-bold text-foreground truncate">
                  嗨，{sd.scenario.name}
                </h1>
                <p className="text-sm text-muted-foreground truncate">
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
              <Badge variant="outline" className="text-xs text-muted-foreground">
                示範資料
              </Badge>
            </div>
          </div>

          <div className="space-y-4">
            {/* 1. 下次上課前要完成什麼 —— 學生最主要的心智模型 */}
            <NextClassReadiness sd={sd} />

            {/* 2. 今天要練什麼 */}
            <TodaysPractice sd={sd} />

            {/* 3. 我最近有沒有進步 */}
            <MyProgress sd={sd} />

            {/* 4. 這週的學習節奏 */}
            <LearningRhythm sd={sd} />

            {/* 5. 我的字彙（既有字卡系統的摘要入口） */}
            <MyVocabulary sd={sd} />

            {/* 6–7. 次要資訊 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 items-start">
              <RecentResults sd={sd} />
              <TeacherFeedback sd={sd} />
            </div>
          </div>

          <p className="text-center text-xs text-muted-foreground mt-6">
            本頁為設計原型，所有資料皆為示範用途，未連接後端。
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default StudentDashboard;
