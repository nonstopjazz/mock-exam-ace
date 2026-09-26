import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Check, Minus, X } from "lucide-react";
import { CONSTRUCT_LABEL_ZH } from "@/lib/reading/constructs";
import type { ConstructResult, ReadingSummary } from "@/lib/reading/studentTypes";

/**
 * 六題結算。
 *
 * 🛑 沒作答顯示「沒作答」，不是「答錯」。兩者對學生的意義完全不同——
 *    一個是不會，一個是沒寫完。把它們畫成同一個顏色，學生會以為自己錯更多。
 *
 * 🛑 這裡【不做 micro-skill 分析】。資料有存，但 10% 的 emphasis 是空的，
 *    拿不完整的資料算出一個「能力雷達圖」，等於把缺漏顯示成 0 分。
 *    六大能力這一頁只講對錯，那是資料真的支持的結論。
 */
export function ReadingSummaryPanel({ summary }: { summary: ReadingSummary }) {
  const total = summary.by_construct.length;
  const skipped = summary.by_construct.filter((c) => c.status === "SKIPPED").length;
  const wrong = summary.by_construct.filter((c) => c.status === "WRONG").length;

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
          <h3 className="font-semibold text-foreground mb-3">答對</h3>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">{summary.correct}</span>
            <span className="text-sm text-muted-foreground">／ {total} 題</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {wrong > 0 && `答錯 ${wrong} 題`}
            {wrong > 0 && skipped > 0 && "・"}
            {skipped > 0 && `沒作答 ${skipped} 題`}
            {wrong === 0 && skipped === 0 && "全對"}
          </p>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20">
          <h3 className="font-semibold text-foreground mb-3">花了多久</h3>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">
              {summary.total_seconds === null ? "—" : Math.floor(summary.total_seconds / 60)}
            </span>
            <span className="text-sm text-muted-foreground">
              分 {summary.total_seconds === null ? "" : summary.total_seconds % 60} 秒
            </span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">從開始到結束</p>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-accent/10 to-treasure/10 border-accent/20">
          <h3 className="font-semibold text-foreground mb-3">作答</h3>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">{summary.answered}</span>
            <span className="text-sm text-muted-foreground">／ {total} 題</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">
            {skipped === 0 ? "六題都寫了" : `還有 ${skipped} 題沒寫`}
          </p>
        </Card>
      </div>

      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-1">六大能力</h3>
        <p className="text-sm text-muted-foreground mb-4">
          每個能力各一題。沒作答的不算答錯
        </p>
        <div className="space-y-3">
          {summary.by_construct.map((c) => <ConstructRow key={c.question_id} result={c} />)}
        </div>
      </Card>
    </div>
  );
}

function ConstructRow({ result }: { result: ConstructResult }) {
  const tone =
    result.status === "CORRECT" ? "border-success/40 bg-success/5"
    : result.status === "WRONG" ? "border-destructive/40 bg-destructive/5"
    : "border-border bg-muted/30";

  const icon =
    result.status === "CORRECT" ? <Check className="h-4 w-4 text-success shrink-0" />
    : result.status === "WRONG" ? <X className="h-4 w-4 text-destructive shrink-0" />
    : <Minus className="h-4 w-4 text-muted-foreground shrink-0" />;

  return (
    <div className={`rounded-lg border p-4 ${tone}`}>
      <div className="flex flex-wrap items-center gap-2 mb-2">
        {icon}
        <span className="font-medium text-foreground">{result.construct}</span>
        <span className="text-sm text-muted-foreground">
          {CONSTRUCT_LABEL_ZH[result.construct]}
        </span>
        <Badge
          variant={
            result.status === "CORRECT" ? "secondary"
            : result.status === "WRONG" ? "destructive" : "outline"
          }
          className="text-xs ml-auto shrink-0"
        >
          {result.status === "CORRECT" ? "答對"
            : result.status === "WRONG" ? "答錯" : "沒作答"}
        </Badge>
      </div>

      {result.status !== "SKIPPED" && (
        <div className="text-sm text-muted-foreground space-y-1">
          <div className="flex flex-wrap gap-x-4 gap-y-1">
            <span>你選 <span className="text-foreground font-medium">{result.selected_answer}</span></span>
            <span>正解 <span className="text-foreground font-medium">{result.correct_answer}</span></span>
            {result.response_time_ms !== null && (
              <span>{Math.round(result.response_time_ms / 1000)} 秒</span>
            )}
            {/* 🛑 改過答案才顯示。0 次不必特別講，那是常態 */}
            {result.answer_change_count !== null && result.answer_change_count > 0 && (
              <span>改了 {result.answer_change_count} 次</span>
            )}
          </div>
          {result.explanation && (
            <p className="leading-relaxed pt-2">{result.explanation}</p>
          )}
        </div>
      )}
      {result.status === "SKIPPED" && result.correct_answer && (
        <div className="text-sm text-muted-foreground space-y-1">
          <span>正解 <span className="text-foreground font-medium">{result.correct_answer}</span></span>
          {result.explanation && <p className="leading-relaxed pt-2">{result.explanation}</p>}
        </div>
      )}
    </div>
  );
}
