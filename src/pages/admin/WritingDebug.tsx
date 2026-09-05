import { useCallback, useEffect, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, Bug, Database, Loader2, RefreshCw } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";

/**
 * 寫作分析除錯頁（僅限管理員）
 *
 * ⚠️ 這是 staging 驗證用的技術工具，不是學生看的報告 UI。
 *    它刻意只顯示原始 JSON 與耗時，不做任何呈現設計——
 *    報告 UI 要等真實 DeepSeek 結果被判讀過之後才開始。
 *
 * 用途：在 Preview 上驗證部署後的路徑
 *   登入 → JWT → is_admin() → writing_enqueue_analysis() → 端點 → 狀態機
 * 模型品質不在這裡驗，那是 scripts/writing-audit.ts 的工作。
 */

interface QueueRow {
  essay_id: string;
  student_id: string;
  title: string;
  submitted_at: string | null;
  char_count: number | null;
  analysis_id: string | null;
  analysis_status: string | null;
  analysis_version: number | null;
  synthesis_status: string | null;
  report_ready: boolean | null;
  failed_pass: string | null;
  error_detail: string | null;
  attempt_count: number | null;
  synthesis_attempt_count: number | null;
}

/**
 * 這一頁會真的觸發 DeepSeek 並把結果寫進資料庫，所以「現在連的是哪個 Supabase
 * 專案」必須是看得見的事實，而不是要靠人記得去 Vercel 後台核對。
 * 連到正式專案時直接跳警示，不要等寫進去才發現。
 */
const STAGING_REF = "cwymrzcovgobfqxtithn";
const PRODUCTION_REF = "ytzspnjmkvrkbztnaomm";

function supabaseProject(): { ref: string; label: string; isProduction: boolean } {
  const url = import.meta.env.VITE_SUPABASE_URL ?? "";
  const ref = url.replace(/^https?:\/\//, "").split(".")[0] || "(未設定)";
  if (ref === STAGING_REF) return { ref, label: "gsat-staging", isProduction: false };
  if (ref === PRODUCTION_REF) return { ref, label: "正式專案", isProduction: true };
  return { ref, label: "未知專案", isProduction: false };
}

type RunMode = "stage1" | "synthesis";

/** 一次請求的結果。兩個 Stage 是兩次請求，所以兩段延遲要分開留著看。 */
interface RunStep {
  mode: RunMode;
  httpStatus: number;
  elapsedMs: number;
  body: unknown;
  ok: boolean;
}

interface RunResult {
  essayId: string;
  steps: RunStep[];
}

const STAGE_LABEL: Record<RunMode, string> = {
  stage1: "Stage 1 四軸",
  synthesis: "Stage 2 綜合層",
};

/**
 * Stage 1 續跑請求的上限。
 *
 * 伺服器每支 pass 有自己的 MAX_PASS_ATTEMPTS，這裡是前端的獨立保險：
 * 就算伺服器的狀態機出了錯，也不會讓瀏覽器無限打下去。
 */
const MAX_STAGE1_REQUESTS = 4;

const StatusBadge = ({ row }: { row: QueueRow }) => {
  if (!row.analysis_status) {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground">
        尚未分析
      </Badge>
    );
  }
  const tone =
    row.analysis_status === "COMPLETED"
      ? "bg-success/10 text-success border-success/20"
      : row.analysis_status === "FAILED"
        ? "bg-accent/10 text-accent border-accent/20"
        : "bg-muted text-muted-foreground border-border";
  return (
    <span className="flex flex-wrap items-center gap-1.5">
      <Badge variant="outline" className={`text-xs font-normal ${tone}`}>
        {row.analysis_status} v{row.analysis_version}
      </Badge>
      {row.synthesis_status ? (
        <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
          synthesis {row.synthesis_status}
        </Badge>
      ) : null}
    </span>
  );
};

const WritingDebug = () => {
  const project = supabaseProject();
  const [queue, setQueue] = useState<QueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [running, setRunning] = useState<string | null>(null);
  const [result, setResult] = useState<RunResult | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("writing_admin_queue");
    if (rpcError) {
      setError(rpcError.message);
      setQueue([]);
    } else {
      setQueue((data as QueueRow[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  /** 送出一次請求，回傳那一段的結果。不做任何流程判斷。 */
  const callEndpoint = useCallback(
    async (essayId: string, mode: RunMode, token: string): Promise<RunStep> => {
      const startedAt = Date.now();
      try {
        const res = await fetch("/api/analyze-writing", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${token}`,
            "Content-Type": "application/json",
          },
          body: JSON.stringify({ essayId, mode }),
        });
        // 函式在 Vercel 上崩潰時回的是 HTML 錯誤頁，不是 JSON。
        // 把原文留下來——那裡面才有 FUNCTION_INVOCATION_FAILED 與追蹤 ID。
        const raw = await res.text();
        let body: unknown;
        try {
          body = JSON.parse(raw);
        } catch {
          body = {
            error: "回應不是 JSON（函式可能在啟動或執行時崩潰）",
            rawResponse: raw.slice(0, 4000),
          };
        }
        return { mode, httpStatus: res.status, elapsedMs: Date.now() - startedAt, body, ok: res.ok };
      } catch (err) {
        const message = err instanceof Error ? err.message : "呼叫失敗";
        return {
          mode,
          httpStatus: 0,
          elapsedMs: Date.now() - startedAt,
          body: { error: message },
          ok: false,
        };
      }
    },
    [],
  );

  /**
   * 老師只按一次。Stage 1 成功之後，綜合層由這裡自動接續發出，
   * 不需要第二次人為動作。
   *
   * Stage 1 失敗就停在這裡：綜合層永遠不會被呼叫，因為它沒有可引用的
   * 已驗證 finding，跑了也只會產生無根據的摘要。
   */
  const runAnalysis = useCallback(
    async (essayId: string, from: RunMode = "stage1") => {
      setResult(null);

      // 端點要求呼叫者的 JWT——授權在伺服器端做，不是靠這裡藏按鈕。
      const { data: session } = await supabase.auth.getSession();
      const token = session.session?.access_token;
      if (!token) {
        toast.error("找不到登入 token，請重新登入");
        return;
      }

      const steps: RunStep[] = [];
      try {
        if (from === "stage1") {
          // Stage 1 可能需要不只一次請求：某一支沒過驗證時，重試是【另一次請求】，
          // 那樣它才拿得到完整的 50 秒。老師仍然只按一次——這個迴圈自己跑完。
          let done = false;
          for (let round = 1; round <= MAX_STAGE1_REQUESTS && !done; round += 1) {
            setRunning(`${essayId}:stage1`);
            const stage1 = await callEndpoint(essayId, "stage1", token);
            steps.push(stage1);
            setResult({ essayId, steps: [...steps] });

            if (!stage1.ok) {
              toast.error(`Stage 1 失敗（HTTP ${stage1.httpStatus}），未執行綜合層`);
              return;
            }

            const body = stage1.body as {
              retryRequired?: boolean;
              retryPasses?: string[];
              preserved?: string[];
            };
            if (body?.retryRequired) {
              // 已通過的那幾支不會重跑——伺服器把它們保存在 stage1_progress 裡。
              toast.message(
                `Stage 1 第 ${round} 次：${(body.retryPasses ?? []).join("、")} 需要重試`,
                { description: `已保留 ${(body.preserved ?? []).length} 支通過的結果，不重跑` },
              );
              continue;
            }
            done = true;
            toast.success(`Stage 1 完成（${round} 次請求），接續綜合層`);
          }

          if (!done) {
            toast.error(`Stage 1 重試 ${MAX_STAGE1_REQUESTS} 次仍未完成，未執行綜合層`);
            return;
          }
        }

        setRunning(`${essayId}:synthesis`);
        const stage2 = await callEndpoint(essayId, "synthesis", token);
        steps.push(stage2);
        setResult({ essayId, steps: [...steps] });
        if (stage2.ok) {
          const total = steps.reduce((sum, step) => sum + step.elapsedMs, 0);
          toast.success(`分析完成，兩段合計 ${(total / 1000).toFixed(1)} 秒`);
        } else {
          // 四軸已落地且被凍結，重跑綜合層不會動到它們。
          toast.error(`綜合層失敗（HTTP ${stage2.httpStatus}），四軸結果已保留，可只重跑綜合層`);
        }
      } finally {
        setRunning(null);
        void loadQueue();
      }
    },
    [callEndpoint, loadQueue],
  );

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 md:p-3 rounded-lg bg-muted shrink-0">
                <Bug className="h-6 w-6 md:h-8 md:w-8 text-muted-foreground" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">
                  寫作分析除錯
                </h1>
                <p className="text-sm md:text-base text-muted-foreground hidden sm:block">
                  staging 驗證用的技術工具，不是學生看的報告
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadQueue()} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              重新載入
            </Button>
          </div>

          {project.isProduction ? (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>
                這個部署連的是<strong>正式專案</strong>（{project.ref}）。
                執行分析會把 AI 結果寫進正式資料庫，因此按鈕已停用。
                請把 Preview 的 VITE_SUPABASE_URL 指向 gsat-staging 之後再試。
              </AlertDescription>
            </Alert>
          ) : (
            <div className="mb-6 flex items-center gap-2 text-sm text-muted-foreground">
              <Database className="h-4 w-4 shrink-0" />
              <span className="min-w-0 truncate">
                資料庫：{project.label}
                <span className="ml-2 font-mono text-xs">{project.ref}</span>
              </span>
            </div>
          )}

          {error ? (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          ) : null}

          {loading ? (
            <Card className="p-6">
              <div className="flex flex-col items-center justify-center py-12 gap-3">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
                <p className="text-sm text-muted-foreground">載入批改佇列</p>
              </div>
            </Card>
          ) : queue.length === 0 ? (
            <Card className="p-6">
              <div className="text-center py-12 text-muted-foreground">
                <p>目前沒有已送出的作文</p>
                <p className="text-sm mt-2">學生送出作文之後才會出現在這裡</p>
              </div>
            </Card>
          ) : (
            <Card className="p-6 mb-8">
              <div className="divide-y divide-border">
                {queue.map((row) => {
                  const busy = running?.startsWith(row.essay_id);
                  const stage = busy ? running?.split(":")[1] : null;
                  // 綜合層自己失敗、或 Stage 1 之後綜合層還沒跑成功，都可以只補這一段。
                  const canRunSynthesisOnly =
                    row.analysis_status === "ANALYZED" &&
                    (row.synthesis_status === "FAILED" || row.synthesis_status === "PENDING");
                  return (
                    <div
                      key={row.essay_id}
                      className="py-4 first:pt-0 last:pb-0 flex flex-wrap items-center gap-3"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground truncate">{row.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {row.char_count ?? "?"} 字 · {row.essay_id}
                        </p>
                        {row.error_detail ? (
                          <p className="text-xs text-accent mt-1">
                            {row.failed_pass}：{row.error_detail}
                          </p>
                        ) : null}
                      </div>
                      <StatusBadge row={row} />
                      <div className="flex gap-2 shrink-0">
                        <Button
                          size="sm"
                          onClick={() => void runAnalysis(row.essay_id)}
                          disabled={Boolean(running) || project.isProduction}
                        >
                          {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                          {busy
                            ? stage === "synthesis"
                              ? "綜合層進行中"
                              : "Stage 1 進行中"
                            : "開始 AI 批改"}
                        </Button>
                        {canRunSynthesisOnly ? (
                          <Button
                            size="sm"
                            variant="outline"
                            onClick={() => void runAnalysis(row.essay_id, "synthesis")}
                            disabled={Boolean(running) || project.isProduction}
                          >
                            只跑綜合層
                          </Button>
                        ) : null}
                      </div>
                    </div>
                  );
                })}
              </div>
            </Card>
          )}

          {result ? (
            <Card className="p-6">
              <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                <h2 className="text-lg font-semibold text-foreground">原始回應</h2>
                <p className="text-sm text-muted-foreground">
                  兩段合計{" "}
                  {(result.steps.reduce((sum, step) => sum + step.elapsedMs, 0) / 1000).toFixed(1)} 秒
                </p>
              </div>
              {/* 每一段各自對照 50 秒硬性期限——合計數字只是參考，不是任何一段的約束。 */}
              <p className="text-xs text-muted-foreground mb-4">
                每次請求各自面對 50 秒期限，兩段之間的空檔不屬於任何一段
              </p>
              <div className="space-y-4">
                {result.steps.map((step, index) => (
                  <div key={`${step.mode}-${index}`}>
                    <div className="flex flex-wrap items-baseline justify-between gap-2 mb-2">
                      <p className="font-semibold text-foreground">{STAGE_LABEL[step.mode]}</p>
                      <p className="text-sm text-muted-foreground">
                        HTTP {step.httpStatus} · {(step.elapsedMs / 1000).toFixed(1)} 秒 · 對 50 秒餘裕{" "}
                        {((50_000 - step.elapsedMs) / 1000).toFixed(1)} 秒
                      </p>
                    </div>
                    <div className="overflow-x-auto rounded-lg bg-muted/40 p-4">
                      <pre className="text-xs text-foreground whitespace-pre">
                        {JSON.stringify(step.body, null, 2)}
                      </pre>
                    </div>
                  </div>
                ))}
              </div>
            </Card>
          ) : null}
        </div>
      </div>
    </Layout>
  );
};

export default WritingDebug;
