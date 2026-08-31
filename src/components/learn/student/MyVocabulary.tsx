import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronRight, Play } from "lucide-react";
import { PackCard } from "@/components/vocabulary/PackCard";
import type { PackCardData } from "@/components/vocabulary/packMeta";
import { useUserPacks } from "@/hooks/useUserPacks";
import { VOCAB_ROUTES } from "@/data/learn/studentDashboardMock";
import { SectionHead, TYPE } from "./shared";
import type { StudentDashboard } from "@/hooks/learn/useStudentDashboard";

/**
 * My Vocabulary —— 既有字卡系統的收藏預覽與入口，不是第二套 library。
 *
 * 封面圖：登入且已領取字卡包時，直接讀 useUserPacks()，
 * 封面就是 pack_images 裡的那一張，和 Library 完全同源。
 * 沒有登入 / 沒有領取時，退回情境示範資料（沿用同一張 PackCard）。
 */
export const MyVocabulary = ({ sd }: { sd: StudentDashboard }) => {
  const navigate = useNavigate();
  const v = sd.scenario.vocabulary;
  const { packs: realPacks } = useUserPacks();

  const usingReal = realPacks.length > 0;
  const shelf: (PackCardData & { familiar?: number })[] = usingReal
    ? realPacks.slice(0, 3)
    : v.packs;

  return (
    <section id="section-vocabulary">
      <SectionHead
        title="我的字卡"
        aside={
          <>
            <Button
              onClick={() => navigate(VOCAB_ROUTES.review)}
              className="h-9 transition-shadow hover:shadow-button active:translate-y-px"
            >
              <Play className="h-4 w-4" />
              開始今日複習
            </Button>
            <Button
              variant="outline"
              className="h-9"
              onClick={() => navigate(VOCAB_ROUTES.library)}
            >
              查看全部字卡包
              <ChevronRight className="h-4 w-4" />
            </Button>
          </>
        }
      />

      {/* 待複習量緊鄰主要動作；收藏總量退為 microcopy */}
      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 -mt-1 mb-4">
        <p className="text-sm text-foreground">
          今天
          <span className="mx-1.5 text-xl font-bold text-foreground tabular-nums">{v.reviewDue}</span>
          張待複習
        </p>
        <p className={TYPE.micro}>
          已收藏 {v.collected.toLocaleString()} 個項目 · {v.familiar.toLocaleString()} 個已熟悉
        </p>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {shelf.map((p) => (
          <PackCard
            key={p.pack_id}
            pack={p}
            variant="compact"
            statLabel={
              p.familiar !== undefined
                ? `${p.familiar} / ${p.word_count} 已熟悉`
                : `${p.word_count} 個項目`
            }
            onOpenDetail={() => navigate(`/practice/vocabulary/pack/${p.pack_id}`)}
            onStartReview={() => navigate(`${VOCAB_ROUTES.review}?pack=${p.pack_id}`)}
          />
        ))}
      </div>
    </section>
  );
};
