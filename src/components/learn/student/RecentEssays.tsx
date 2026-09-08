import { Link } from "react-router-dom";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight } from "lucide-react";
import { useEssayCards } from "@/hooks/learn/useEssayCards";
import { EssayCard } from "@/components/learn/writing/EssayCard";
import { GRID_CARDS } from "@/lib/cardGrid";
import { SectionHead, TYPE } from "./shared";

/** Dashboard 上只放最近幾篇，其餘在「我的作文」整頁看 */
const MAX = 4;

/**
 * 最近的作文 —— 與「我的作文」用同一張卡（EssayCard），
 * 也用同一組網格斷點，所以兩頁的卡片寬度會完全一致。
 *
 * 沒有任何作文時整區不出現：Dashboard 不需要一個空盒子，這是作文區既有的行為。
 */
export const RecentEssays = () => {
  const { cards, loading, error } = useEssayCards();

  if (loading) {
    return (
      <section>
        <SectionHead title="最近的作文" />
        <div className={GRID_CARDS}>
          {Array.from({ length: 2 }).map((_, i) => (
            <Skeleton key={i} className="h-72 rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  if (error || cards.length === 0) return null;

  return (
    <section>
      <SectionHead
        title="最近的作文"
        aside={
          cards.length > MAX ? (
            <Link
              to="/learn/student/writing"
              className={`${TYPE.actionMeta} flex items-center gap-0.5 hover:text-foreground transition-colors`}
            >
              查看全部 {cards.length} 篇
              <ChevronRight className="h-4 w-4" />
            </Link>
          ) : null
        }
      />
      <div className={GRID_CARDS}>
        {cards.slice(0, MAX).map((card) => (
          <EssayCard key={card.essay_id} card={card} />
        ))}
      </div>
    </section>
  );
};
