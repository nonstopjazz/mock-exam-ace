import { Layout } from "@/components/layout/Layout";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { useAuth } from "@/contexts/AuthContext";
import { useUserProfile } from "@/hooks/useUserProfile";
import { StudentTasksSection } from "@/components/learn/student/StudentTasksSection";
import { AbilitySnapshot } from "@/components/learn/student/AbilitySnapshot";
import { LearningRhythm } from "@/components/learn/student/LearningRhythm";
import { MyVocabulary } from "@/components/learn/student/MyVocabulary";
import { RecentEssays } from "@/components/learn/student/RecentEssays";
import { GrammarSnapshot } from "@/components/learn/student/GrammarSnapshot";

/**
 * Student Dashboard —— v2，全部真實資料。
 *
 * 🛑 這一頁【不再有任何示範資料】。每一區的來源都是持久化的：
 *      我的任務      learn_student_tasks()
 *      最近的作文    writing_student_essay_cards()
 *      學習表現      （沒有能力模型 → 誠實地說尚未有足夠資料）
 *      學習紀錄      user_stats
 *      我的字卡      user_pack_claims / packs / pack_items / pack_item_progress
 *    沒有資料就顯示空狀態，絕不用假資料填版面。
 *
 *    唯一的例外是最下方的「文法分析」：文法系統還沒上線，那一區是模擬資料，
 *    而且在畫面上直接寫明「此為模擬資料」——不靠小字，也不假裝是真的。
 *
 * 視覺層級刻意不平均：
 *   我的任務 → 最近的作文 → 兩欄摘要（學習表現 / 學習紀錄）
 *   → 字卡收藏 → 底部次要資訊（文法分析）
 */

/** 顯示名稱順位：profile → email 前段 → 同學。永遠不顯示裸 uuid。 */
const nameOf = (displayName: string | null | undefined, email: string | null | undefined) =>
  displayName?.trim() || email?.split("@")[0] || "同學";

const StudentDashboard = () => {
  const { user } = useAuth();
  const { profile } = useUserProfile();

  const name = nameOf(profile?.display_name, user?.email);
  const initials = name.slice(0, 1).toUpperCase();
  const subtitle = [profile?.grade, profile?.school].filter(Boolean).join(" · ");

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          {/* 頁首：緊湊的身分帶 */}
          <div className="mb-5 flex items-center gap-3 min-w-0">
            <Avatar className="h-11 w-11 shrink-0">
              <AvatarFallback className="bg-primary/15 text-primary font-semibold">
                {initials}
              </AvatarFallback>
            </Avatar>
            <div className="min-w-0">
              <h1 className="text-xl md:text-[1.6rem] font-bold text-foreground truncate leading-tight">
                嗨，{name}
              </h1>
              {subtitle ? (
                <p className="text-[11px] text-muted-foreground truncate">{subtitle}</p>
              ) : null}
            </div>
          </div>

          {/* 1. 我的任務 —— 左邊一件最該做的事，右邊今天的節奏。沒有任務時整區不會消失 */}
          <StudentTasksSection />

          {/* 2. 最近的作文 —— 卡片與「我的作文」同一張、同一組網格寬度。
                 還沒有任何作文時整區不出現（作文既有的 UX） */}
          <div className="mt-10">
            <RecentEssays />
          </div>

          {/* 3–4. 摘要與紀錄：兩欄 */}
          <div className="mt-10 grid grid-cols-1 lg:grid-cols-2 gap-4 items-stretch">
            <AbilitySnapshot />
            <LearningRhythm />
          </div>

          {/* 5. 字卡收藏 */}
          <div className="mt-10">
            <MyVocabulary />
          </div>

          {/* 6. 次要資訊 —— 文法分析（模擬資料，畫面上已標明） */}
          <div className="mt-10 -mx-4 px-4 py-8 border-t border-border/60 bg-muted/20">
            <GrammarSnapshot />
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default StudentDashboard;
