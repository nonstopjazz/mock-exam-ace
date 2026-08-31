import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { ChevronRight, Play } from "lucide-react";
import { PackCard } from "@/components/vocabulary/PackCard";
import { VOCAB_ROUTES } from "@/data/learn/studentDashboardMock";
import type { StudentDashboard } from "@/hooks/learn/useStudentDashboard";

/**
 * My Vocabulary —— 既有字卡系統的收藏預覽與入口，不是第二套 library。
 * 卡片直接用共用的 PackCard（compact 變體），封面 / tag / 字數 / 進度 / CTA 全部保留。
 */
export const MyVocabulary = ({ sd }: { sd: StudentDashboard }) => {
  const navigate = useNavigate();
  const v = sd.scenario.vocabulary;

  return (
    <section id="section-vocabulary">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-3">
        <div>
          <h2 className="text-xl font-semibold text-foreground">我的字卡</h2>
          <p className="text-sm text-muted-foreground">
            今天 <span className="font-semibold text-foreground tabular-nums">{v.reviewDue}</span> 張待複習
            <span className="mx-1.5">·</span>
            已收藏 {v.collected.toLocaleString()} 個項目，其中 {v.familiar.toLocaleString()} 個已熟悉
          </p>
        </div>
        <div className="flex items-center gap-2 shrink-0">
          <Button onClick={() => navigate(VOCAB_ROUTES.review)}>
            <Play className="h-4 w-4" />
            開始今日複習
          </Button>
          <Button variant="outline" onClick={() => navigate(VOCAB_ROUTES.library)}>
            查看全部字卡包
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        {v.packs.map((p) => (
          <PackCard
            key={p.pack_id}
            pack={p}
            variant="compact"
            statLabel={`${p.familiar} / ${p.word_count} 已熟悉`}
            onOpenDetail={() => navigate(`/practice/vocabulary/pack/${p.pack_id}`)}
            onStartReview={() => navigate(`${VOCAB_ROUTES.review}?pack=${p.pack_id}`)}
          />
        ))}
      </div>
    </section>
  );
};
