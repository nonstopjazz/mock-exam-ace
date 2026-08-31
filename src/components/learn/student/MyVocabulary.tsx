import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { BookMarked, ChevronRight, Flame, Play } from "lucide-react";
import { Meter } from "@/components/learn/parent/shared";
import { VOCAB_ROUTES } from "@/data/learn/studentDashboardMock";
import { StudentSection } from "./shared";
import type { StudentDashboard } from "@/hooks/learn/useStudentDashboard";

/**
 * My Vocabulary —— 既有字卡系統的摘要與入口，不是第二套 library。
 *
 * 熟悉度分桶沿用既有 vocabularyStore 的定義：
 *   已熟悉 (mastered) / 學習中 (learning) / 待複習 (review due) / 尚未接觸 (new)
 * 「開始今日複習」與「查看我的字卡包」都直接導向既有頁面。
 */
export const MyVocabulary = ({ sd }: { sd: StudentDashboard }) => {
  const navigate = useNavigate();
  const v = sd.scenario.vocabulary;
  const buckets = [
    { label: "已熟悉", value: v.familiar },
    { label: "學習中", value: v.learning },
    { label: "待複習", value: v.reviewDue },
    { label: "尚未接觸", value: v.unseen },
  ];

  return (
    <StudentSection
      icon={BookMarked}
      title="我的字彙"
      hint="單字、片語、句型與高分表達都收在這裡"
      id="section-vocabulary"
      tone="primary"
      action={
        <Badge variant="outline" className="gap-1 text-xs font-normal text-muted-foreground">
          <Flame className="h-3.5 w-3.5" />
          連續 {v.streakDays} 天
        </Badge>
      }
    >
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <p className="text-3xl font-bold text-foreground tabular-nums">
            {v.collected.toLocaleString()}
            <span className="ml-1.5 text-sm font-normal text-muted-foreground">個項目已收藏</span>
          </p>
          <p className="text-sm text-muted-foreground mt-0.5 tabular-nums">
            其中 {v.familiar.toLocaleString()} 個已經熟悉
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button onClick={() => navigate(VOCAB_ROUTES.review)}>
            <Play className="h-4 w-4" />
            開始今日複習（{v.reviewDue}）
          </Button>
          <Button variant="outline" onClick={() => navigate(VOCAB_ROUTES.library)}>
            查看我的字卡包
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </div>

      <div className="grid grid-cols-2 sm:grid-cols-4 gap-x-6 gap-y-3 mt-5">
        {buckets.map((b) => (
          <div key={b.label} className="min-w-0">
            <div className="flex items-baseline justify-between gap-2 mb-1.5">
              <span className="text-xs text-muted-foreground truncate">{b.label}</span>
              <span className="text-sm font-semibold text-foreground tabular-nums">
                {b.value.toLocaleString()}
              </span>
            </div>
            <Meter
              value={v.collected ? (b.value / v.collected) * 100 : 0}
              tone={b.label === "已熟悉" ? "strong" : b.label === "待複習" ? "focus" : "neutral"}
            />
          </div>
        ))}
      </div>

      <div className="mt-5 pt-4 border-t border-border">
        <p className="text-xs text-muted-foreground mb-2">我領到的字卡包</p>
        <div className="flex flex-wrap gap-2">
          {v.packs.map((p) => (
            <button
              key={p.id}
              type="button"
              onClick={() => navigate(VOCAB_ROUTES.library)}
              className="rounded-lg border border-border px-3 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
            >
              <span className="text-sm text-foreground">{p.title}</span>
              <span className="ml-2 text-xs text-muted-foreground tabular-nums">
                {p.familiar} / {p.collected} 已熟悉
              </span>
            </button>
          ))}
        </div>
      </div>
    </StudentSection>
  );
};
