import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { ChevronRight, Clock, Loader2, MessageSquare, Sparkles, TriangleAlert } from "lucide-react";
import { OVERALL_LABEL } from "@/components/learn/writing/report/reportLabels";
import { formatEssayDate } from "@/components/learn/writing/writingFormat";
import type { EssayCard as EssayCardData } from "@/types/writing";

/**
 * 一篇作文 = 一張卡。
 *
 * 版面刻意分成四塊，由上而下：
 *   ① 圖區    —— 一眼看出「這是一篇作文」，也讓一排卡片有節奏
 *   ② 標題區  —— 標題 + 批改狀態徽章
 *   ③ 事實列  —— 日期 / 文字 / 字數，全是不會變的客觀資訊
 *   ④ 結果格  —— 這張卡最重要的東西：批改結果
 *
 * ④ 是【固定保留】的位置。目前放的是等第（穩健 / 表現突出 …），
 * 之後 20 分制上線時，數字會放進同一格，版面不需要重做。
 */

/** 結果格與徽章的色調。與報告頁的 TONE 同一套語彙，不另開一組顏色。 */
const LEVEL_TONE: Record<string, string> = {
  STRONG: "bg-primary/10 border-primary/20",
  SOLID: "bg-secondary/10 border-secondary/20",
  DEVELOPING: "bg-accent/10 border-accent/20",
  NEEDS_REWORK: "bg-accent/10 border-accent/20",
};

type CardState = "DRAFT" | "WAITING" | "GRADING" | "FAILED" | "COMPLETED";

function cardState(card: EssayCardData): CardState {
  if (card.status === "DRAFT") return "DRAFT";
  if (card.report_ready) return "COMPLETED";
  if (card.analysis_status === "FAILED") return "FAILED";
  if (card.analysis_status) return "GRADING";
  return "WAITING";
}

/** 右上角的狀態徽章。用字是講給學生聽的，不是資料庫的列舉值。 */
function StatusBadge({ state }: { state: CardState }) {
  const map: Record<CardState, { label: string; className: string }> = {
    DRAFT: { label: "草稿", className: "text-muted-foreground" },
    WAITING: { label: "等待批改", className: "text-muted-foreground" },
    GRADING: { label: "批改中", className: "text-secondary border-secondary/40" },
    FAILED: { label: "批改未完成", className: "text-muted-foreground" },
    COMPLETED: { label: "已批改", className: "text-primary border-primary/40" },
  };
  const { label, className } = map[state];
  return (
    <Badge variant="outline" className={`text-xs shrink-0 font-normal ${className}`}>
      {label}
    </Badge>
  );
}

/**
 * 結果格。
 *
 * 沒有結果的時候也一定要有東西 —— 一個空框會讓學生以為卡片壞了。
 * 因此每一種狀態都有一句話說明「現在到哪了」，以及接下來會發生什麼。
 */
function ResultSlot({ card, state }: { card: EssayCardData; state: CardState }) {
  if (state === "COMPLETED" && card.overall_level) {
    const tone = LEVEL_TONE[card.overall_level] ?? "bg-muted/50 border-border";
    return (
      <div className={`rounded-lg border p-3 ${tone}`}>
        <div className="flex items-baseline gap-2">
          <span className="text-xl font-bold text-foreground">
            {OVERALL_LABEL[card.overall_level]}
          </span>
          <span className="text-xs text-muted-foreground">整體表現</span>
        </div>
        {card.overall_headline ? (
          <p className="text-sm text-muted-foreground mt-1 line-clamp-2">{card.overall_headline}</p>
        ) : null}
      </div>
    );
  }

  const pending: Record<
    Exclude<CardState, "COMPLETED">,
    { icon: typeof Clock; title: string; hint: string; spin?: boolean }
  > = {
    DRAFT: { icon: Clock, title: "尚未送出", hint: "送出後才會進入批改" },
    WAITING: { icon: Clock, title: "等待批改", hint: "老師按下批改後就會開始分析" },
    GRADING: { icon: Loader2, title: "批改中", hint: "分析完成後這裡會顯示結果", spin: true },
    FAILED: { icon: TriangleAlert, title: "批改未完成", hint: "請告訴老師重新分析一次" },
  };
  const p = pending[state as Exclude<CardState, "COMPLETED">];
  const Icon = p.icon;

  return (
    <div className="rounded-lg border border-border bg-muted/50 p-3">
      <div className="flex items-center gap-2">
        <Icon className={`h-4 w-4 text-muted-foreground shrink-0 ${p.spin ? "animate-spin" : ""}`} />
        <span className="font-semibold text-foreground">{p.title}</span>
      </div>
      <p className="text-sm text-muted-foreground mt-1">{p.hint}</p>
    </div>
  );
}

export function EssayCard({ card }: { card: EssayCardData }) {
  const state = cardState(card);
  const action = state === "COMPLETED" ? "查看批改報告" : "查看這篇作文";

  return (
    <Link
      to={`/learn/student/writing/${card.essay_id}`}
      className="group block rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background"
    >
      <Card className="flex h-full flex-col overflow-hidden border-border shadow-card transition-all duration-200 group-hover:-translate-y-0.5 group-hover:shadow-lg">
        {/* ① 圖區。圖是裝飾，訊息全在下面的文字裡，所以對輔助技術隱藏。
            手機上刻意壓成一條窄帶——一欄排版時，六張 16:9 的圖會把列表拉得非常長。 */}
        <div className="relative aspect-[5/2] sm:aspect-[16/9] overflow-hidden bg-gradient-to-br from-primary/20 via-primary/5 to-card">
          <img
            src="/images/essay-icon.png"
            alt=""
            aria-hidden="true"
            loading="lazy"
            className="absolute inset-0 m-auto h-20 w-20 sm:h-28 sm:w-28 object-contain transition-transform duration-300 group-hover:scale-[1.03]"
          />
        </div>

        <div className="flex flex-1 flex-col gap-3 p-6">
          {/* ② 標題 */}
          <div className="flex items-start justify-between gap-2">
            <div className="min-w-0">
              <h3 className="font-semibold text-foreground truncate">{card.title}</h3>
              {card.essay_topic ? (
                <p className="text-sm text-muted-foreground truncate mt-1">{card.essay_topic}</p>
              ) : null}
            </div>
            <StatusBadge state={state} />
          </div>

          {/* ③ 事實列 */}
          <div className="flex flex-wrap items-center gap-x-3 gap-y-1 text-sm text-muted-foreground">
            <span>{formatEssayDate(card.essay_date)}</span>
            <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
              {card.submission_type === "text" ? "文字" : "照片"}
            </Badge>
            {card.word_count !== null ? <span>{card.word_count} 字</span> : null}
          </div>

          {/* ④ 結果格 */}
          <div className="mt-auto">
            <ResultSlot card={card} state={state} />
          </div>

          <div className="flex items-center justify-between gap-2 text-sm">
            <span className="flex items-center gap-1 text-primary font-medium">
              {state === "COMPLETED" ? (
                <Sparkles className="h-4 w-4" />
              ) : null}
              {action}
              <ChevronRight className="h-4 w-4 transition-transform group-hover:translate-x-0.5" />
            </span>
            {card.has_teacher_feedback ? (
              <span className="flex items-center gap-1 text-muted-foreground shrink-0">
                <MessageSquare className="h-4 w-4" />
                老師評語
              </span>
            ) : null}
          </div>
        </div>
      </Card>
    </Link>
  );
}
