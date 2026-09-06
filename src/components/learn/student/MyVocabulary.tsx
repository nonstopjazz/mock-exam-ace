import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Skeleton } from "@/components/ui/skeleton";
import { ChevronRight, Play } from "lucide-react";
import { PackCard } from "@/components/vocabulary/PackCard";
import { useUserPacks } from "@/hooks/useUserPacks";
import { VOCAB_ROUTES } from "@/lib/learn/vocabRoutes";
import { SectionHead, TYPE } from "./shared";

/**
 * 我的字卡 —— 既有字卡系統的收藏預覽與入口，不是第二套 library。
 *
 * ✅ 真實資料：user_pack_claims → packs → pack_items / pack_item_progress
 *    （progress 由 useUserPacks 依實際學習過的單字數即時算出）
 * 🛑 沒有領取任何字卡包時顯示「尚未指派字卡」，不退回示範資料。
 *    老師的 token 兌換流程是這一版指派字卡的方式。
 */
export const MyVocabulary = () => {
  const navigate = useNavigate();
  const { packs, loading } = useUserPacks();

  if (loading) {
    return (
      <section id="section-vocabulary">
        <SectionHead title="我的字卡" />
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {[0, 1, 2].map((i) => (
            <Skeleton key={i} className="h-40 rounded-lg" />
          ))}
        </div>
      </section>
    );
  }

  if (packs.length === 0) {
    return (
      <section id="section-vocabulary">
        <SectionHead title="我的字卡" />
        <Card className="p-6">
          <div className="text-center py-12 text-muted-foreground">
            <p>尚未指派字卡</p>
            <p className="text-sm mt-2">老師給你兌換碼之後，就能在這裡看到你的字卡包</p>
            <Button
              variant="outline"
              className="mt-4"
              onClick={() => navigate(VOCAB_ROUTES.library)}
            >
              前往字卡收藏
              <ChevronRight className="h-4 w-4" />
            </Button>
          </div>
        </Card>
      </section>
    );
  }

  const totalWords = packs.reduce((s, p) => s + p.word_count, 0);

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

      {/* 只講資料庫裡真的有的數字：幾個包、幾個單字。
          「今天幾張待複習」目前沒有持久化的來源，所以不顯示。 */}
      <p className={`${TYPE.micro} -mt-1 mb-4`}>
        {packs.length} 個字卡包 · 共 {totalWords.toLocaleString()} 個單字
      </p>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {packs.slice(0, 3).map((p) => (
          <PackCard
            key={p.pack_id}
            pack={p}
            variant="compact"
            statLabel={`${p.word_count} 個單字 · 已學習 ${p.progress}%`}
            onOpenDetail={() => navigate(`/practice/vocabulary/pack/${p.pack_id}`)}
            onStartReview={() => navigate(`${VOCAB_ROUTES.review}?pack=${p.pack_id}`)}
          />
        ))}
      </div>
    </section>
  );
};
