import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "@/components/ui/alert-dialog";
import { Loader2, Sparkles } from "lucide-react";
import type { CostEstimate } from "@/lib/writing/gradingQueue";
import { HAS_PRICING, estimateUsd, formatTokens, formatUsd } from "@/config/writingCost";

/**
 * 批次分析的確認框。
 *
 * 存在的理由只有一個：**這是整個系統裡唯一會直接花錢的按鈕**，而它現在是一鍵。
 * 「14 篇」對老師是抽象的，「約 70 次 AI 呼叫」不是。
 *
 * 數字來自最近已完成分析的實際用量（telemetry），不是寫死的常數。
 * 還沒有資料可估時就老實說沒有，不掰一個看起來很精確的數字。
 */
export function BatchAnalyzeDialog({
  open,
  count,
  estimate,
  loading,
  onConfirm,
  onCancel,
}: {
  open: boolean;
  count: number;
  estimate: CostEstimate | null;
  loading: boolean;
  onConfirm: () => void;
  onCancel: () => void;
}) {
  const usd =
    estimate && estimate.sample_size > 0
      ? estimateUsd(estimate.projected_prompt_tokens, estimate.projected_completion_tokens)
      : null;

  // 額度不夠時先講清楚會排到幾篇——按下去才發現只排了 3 篇是很差的體驗。
  const willEnqueue = estimate ? Math.min(count, estimate.daily_remaining) : count;
  const shortfall = count - willEnqueue;

  return (
    <AlertDialog open={open} onOpenChange={(v) => !v && onCancel()}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>開始分析 {count} 篇作文？</AlertDialogTitle>
          <AlertDialogDescription asChild>
            <div className="space-y-3 text-sm">
              {loading ? (
                <div className="flex items-center gap-2 text-muted-foreground">
                  <Loader2 className="h-4 w-4 animate-spin" />
                  估算用量中
                </div>
              ) : estimate && estimate.sample_size > 0 ? (
                <>
                  <div className="rounded-lg bg-muted/40 p-4 space-y-1">
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-muted-foreground">預估 AI 呼叫</span>
                      <span className="font-semibold text-foreground">
                        約 {estimate.projected_calls} 次
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between gap-3">
                      <span className="text-muted-foreground">預估 token</span>
                      <span className="font-semibold text-foreground">
                        約{" "}
                        {formatTokens(
                          estimate.projected_prompt_tokens + estimate.projected_completion_tokens,
                        )}
                      </span>
                    </div>
                    {usd !== null ? (
                      <div className="flex items-baseline justify-between gap-3 pt-1 border-t border-border mt-2">
                        <span className="text-muted-foreground">預估費用</span>
                        <span className="font-semibold text-foreground">{formatUsd(usd)}</span>
                      </div>
                    ) : null}
                  </div>
                  <p className="text-xs text-muted-foreground">
                    依據最近 {estimate.sample_size} 篇已完成分析的實際用量推算，實際會有出入。
                    {HAS_PRICING ? null : "（設定 DeepSeek 單價後這裡會顯示金額）"}
                  </p>
                </>
              ) : (
                <p className="text-muted-foreground">
                  還沒有已完成的分析可以用來估算用量。第一批跑完之後，這裡就會顯示實際數字。
                </p>
              )}

              {estimate ? (
                <p className="text-xs text-muted-foreground">
                  今天已排入 {estimate.daily_used} / {estimate.daily_cap} 篇
                </p>
              ) : null}

              {shortfall > 0 ? (
                <p className="text-sm text-destructive">
                  今天的額度只剩 {willEnqueue} 篇，這一批會有 {shortfall} 篇排不進去。
                  明天（台灣時間）額度會重新計算。
                </p>
              ) : null}

              <p className="text-xs text-muted-foreground">
                系統一次只分析一篇，完成後自動接下一篇。送出之後可以關掉頁面。
              </p>
            </div>
          </AlertDialogDescription>
        </AlertDialogHeader>
        <AlertDialogFooter>
          <AlertDialogCancel>取消</AlertDialogCancel>
          <AlertDialogAction onClick={onConfirm} disabled={willEnqueue === 0}>
            <Sparkles className="h-4 w-4" />
            {willEnqueue === 0 ? "今天額度已滿" : `開始分析（${willEnqueue}）`}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
}
