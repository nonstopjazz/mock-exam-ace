import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { GraduationCap } from "lucide-react";
import { SCENARIOS, type ScenarioId } from "@/data/learn/teacherSessionMock";
import { useSessionWorkspace } from "@/hooks/learn/useSessionWorkspace";
import { SessionHeader } from "@/components/learn/teacher/SessionHeader";
import { PreviousHomeworkSection } from "@/components/learn/teacher/PreviousHomeworkSection";
import { PerformanceSection } from "@/components/learn/teacher/PerformanceSection";
import { AssessmentsSection } from "@/components/learn/teacher/AssessmentsSection";
import { NextHomeworkSection } from "@/components/learn/teacher/NextHomeworkSection";
import { RecurringPracticeSection } from "@/components/learn/teacher/RecurringPracticeSection";
import { DigitalAssignmentSection } from "@/components/learn/teacher/DigitalAssignmentSection";
import { FinishBar } from "@/components/learn/teacher/FinishBar";
import { QuickAdd } from "@/components/learn/teacher/QuickAdd";

/**
 * Teacher Session Workspace — prototype v1
 *
 * 🛑 全部為 mock data，沒有任何後端呼叫。
 *
 * 單頁 workspace，不是 step-by-step wizard。一套資訊架構，
 * 依 students.length 自動切換 presentation（一對一 vs 小團班）。
 */
const TeacherSessionWorkspace = () => {
  const [scenarioId, setScenarioId] = useState<ScenarioId>("group");
  const [openStudentId, setOpenStudentId] = useState<string | null>(null);
  const ws = useSessionWorkspace(scenarioId);

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          {/* 頁首 + demo scenario 切換 */}
          <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 md:p-3 rounded-lg bg-primary/10 shrink-0">
                <GraduationCap className="h-6 w-6 md:h-8 md:w-8 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">
                  課堂工作區
                </h1>
                <p className="text-sm md:text-base text-muted-foreground hidden sm:block">
                  課中隨手記錄，課後兩三分鐘完成收尾
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              <Tabs value={scenarioId} onValueChange={(v) => {
                setScenarioId(v as ScenarioId);
                setOpenStudentId(null);
              }}>
                <TabsList>
                  <TabsTrigger value="tutor">{SCENARIOS.tutor.switchLabel}</TabsTrigger>
                  <TabsTrigger value="group">{SCENARIOS.group.switchLabel}</TabsTrigger>
                </TabsList>
              </Tabs>
              <Badge variant="outline" className="text-xs text-muted-foreground">
                示範資料
              </Badge>
            </div>
          </div>

          <div className="space-y-6">
            {/* 1. Session header */}
            <SessionHeader
              scenario={ws.scenario}
              status={ws.state.status}
              saveState={ws.saveState}
              savedAt={ws.savedAt}
            />

            {/* 2. 上次作業 */}
            <PreviousHomeworkSection ws={ws} />

            {/* 3. 今日表現（主觀觀察） */}
            <PerformanceSection
              ws={ws}
              openStudentId={openStudentId}
              onOpenStudent={setOpenStudentId}
            />

            {/* 4. 評量與成績（客觀成績） */}
            <AssessmentsSection ws={ws} />

            {/* 5. 次堂作業 */}
            <NextHomeworkSection ws={ws} />

            {/* 6. 常態練習 */}
            <RecurringPracticeSection ws={ws} />

            {/* 7. 線上任務 */}
            <DigitalAssignmentSection ws={ws} />
          </div>

          {/* 8. Sticky finish bar（含 Quick Add） */}
          <FinishBar ws={ws} quickAdd={<QuickAdd ws={ws} />} />

          <p className="text-center text-xs text-muted-foreground pb-2">
            本頁為設計原型，所有資料皆為示範用途，未連接後端。
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default TeacherSessionWorkspace;
