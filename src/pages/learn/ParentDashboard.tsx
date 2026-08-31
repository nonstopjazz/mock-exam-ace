import { Layout } from "@/components/layout/Layout";
import { Badge } from "@/components/ui/badge";
import { Users, BookOpen, Headphones } from "lucide-react";
import { parentDashboardMock } from "@/data/learn/parentDashboardMock";
import { StudentSnapshot } from "@/components/learn/parent/StudentSnapshot";
import { MonthlySummary } from "@/components/learn/parent/MonthlySummary";
import { EngagementSection } from "@/components/learn/parent/EngagementSection";
import { AbilityOverview } from "@/components/learn/parent/AbilityOverview";
import { DomainBars } from "@/components/learn/parent/DomainBars";
import { VocabularySection } from "@/components/learn/parent/VocabularySection";
import { GrammarSection } from "@/components/learn/parent/GrammarSection";
import { WritingSection } from "@/components/learn/parent/WritingSection";
import { SpeakingSection } from "@/components/learn/parent/SpeakingSection";
import { TeacherEvaluation } from "@/components/learn/parent/TeacherEvaluation";

/**
 * Parent Dashboard — prototype v1
 * 🛑 全部為 mock data，未接任何後端。資訊層級：總結 → 解讀 → 圖表 → 細節。
 */
const ParentDashboard = () => {
  const d = parentDashboardMock;

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          {/* 頁首 */}
          <div className="mb-8 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 md:p-3 rounded-lg bg-primary/10 shrink-0">
                <Users className="h-6 w-6 md:h-8 md:w-8 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">
                  家長學習報告
                </h1>
                <p className="text-sm md:text-base text-muted-foreground hidden sm:block">
                  孩子最近的學習狀況與老師的建議
                </p>
              </div>
            </div>
            <Badge variant="outline" className="shrink-0 text-xs text-muted-foreground">
              示範資料
            </Badge>
          </div>

          {/* A. 學生概況 */}
          <StudentSnapshot student={d.student} />

          {/* B. 本月總結 —— 最先看到的結論 */}
          <MonthlySummary data={d.monthlySummary} />

          {/* C. 學習投入 */}
          <EngagementSection data={d.engagement} />

          {/* D. 能力總覽 */}
          <AbilityOverview domains={d.abilityOverview} />

          {/* E–H. 各項能力細部 */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8 items-start">
            <DomainBars
              icon={BookOpen}
              title="閱讀分析"
              summary={d.reading.summary}
              categories={d.reading.categories}
            />
            <VocabularySection data={d.vocabulary} />
            <GrammarSection data={d.grammar} />
            <DomainBars
              icon={Headphones}
              title="聽力分析"
              summary={d.listening.summary}
              categories={d.listening.categories}
            />
          </div>

          {/* I–J. 產出型能力 */}
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6 mb-8 items-start">
            <WritingSection data={d.writing} />
            <SpeakingSection data={d.speaking} />
          </div>

          {/* K. 老師評量 —— 獨立於六大能力 */}
          <TeacherEvaluation data={d.teacherEvaluation} />

          <p className="text-center text-xs text-muted-foreground">
            本頁為設計原型，所有數據皆為示範用途。
          </p>
        </div>
      </div>
    </Layout>
  );
};

export default ParentDashboard;
