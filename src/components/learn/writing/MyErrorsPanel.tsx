import { useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ChevronDown, ExternalLink, FileText, Loader2 } from "lucide-react";
import { ERROR_TAG_BY_CODE } from "@/lib/writing/taxonomy";
import { essayCountTone } from "@/lib/writing/errorTracking";
import { diffCorrection } from "@/lib/writing/correctionDiff";
import { DiffText } from "@/components/writing/DiffText";
import { useMyErrorFindings, useMyErrorOverview } from "@/hooks/learn/useMyErrors";
import { WritingLoading } from "@/components/learn/writing/writingShared";

/**
 * 我常犯的錯 —— 跨作文的彙總。
 *
 * 學生本來就看得到【單篇】報告裡的「錯誤與修正」。這裡補的是他今天
 * 唯一做不到的事：把同一個錯在好幾篇作文裡的樣子擺在一起看。
 *
 * 🛑 排序與門檻刻意與老師端一致。沒有「至少出現 N 次」這種過濾 ——
 *    只犯過一次的錯也要列出來。老師端的註解寫得很清楚為什麼，
 *    這裡沒有理由不同。
 *
 * 🛑 展開才載入 findings。一次把 20 個 code 的歷史全撈下來，
 *    學生卻一次只看一項。
 */
function shortDate(iso: string | null): string {
  if (!iso) return "";
  const d = new Date(iso);
  return `${d.getMonth() + 1}/${d.getDate()}`;
}

export function MyErrorsPanel() {
  const { overview, loading, error, refetch } = useMyErrorOverview();
  const { byCode, loadingCode, errorCode, load } = useMyErrorFindings();
  const [open, setOpen] = useState<string | null>(null);

  const toggle = (code: string) => {
    const next = open === code ? null : code;
    setOpen(next);
    if (next) void load(next);
  };

  if (loading) return <WritingLoading label="正在整理你的錯誤紀錄" />;

  if (error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription className="flex flex-wrap items-center gap-3">
          <span>{error}</span>
          <Button variant="outline" size="sm" onClick={() => void refetch()}>
            重新載入
          </Button>
        </AlertDescription>
      </Alert>
    );
  }

  if (overview.rows.length === 0) {
    return (
      <Card className="p-6">
        <div className="text-center py-12 text-muted-foreground">
          <FileText className="h-12 w-12 mx-auto mb-4 opacity-40" />
          <p>還沒有可以整理的錯誤紀錄</p>
          <p className="text-sm mt-2">
            交出作文、批改完成之後，這裡會把你常犯的地方整理出來
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
        從你 {overview.essay_total} 篇批改完成的作文整理出來，出現在越多篇的排越前面。
      </p>

      <div className="space-y-3">
        {overview.rows.map((row) => {
          const tag = ERROR_TAG_BY_CODE.get(row.error_code);
          const isOpen = open === row.error_code;
          const detail = byCode[row.error_code];

          return (
            <Card key={row.error_code} className="overflow-hidden">
              <button
                type="button"
                onClick={() => toggle(row.error_code)}
                aria-expanded={isOpen}
                className="w-full p-4 text-left hover:bg-muted/40 transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-inset"
              >
                <div className="flex items-center gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <span className="font-semibold text-foreground min-w-0 truncate">
                        {tag?.zh ?? row.error_code}
                      </span>
                      <Badge
                        variant="outline"
                        className={`text-xs font-normal shrink-0 ${essayCountTone(row.essay_count)}`}
                      >
                        {row.essay_count} 篇作文
                      </Badge>
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">
                      共 {row.occurrence_count} 次
                      {row.last_seen_at ? ` · 最近一次 ${shortDate(row.last_seen_at)}` : ""}
                    </p>
                  </div>
                  <ChevronDown
                    className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${
                      isOpen ? "rotate-180" : ""
                    }`}
                  />
                </div>
              </button>

              {isOpen ? (
                <div className="border-t border-border px-4 py-4">
                  {loadingCode === row.error_code ? (
                    <div className="flex items-center gap-2 text-sm text-muted-foreground py-4">
                      <Loader2 className="h-4 w-4 animate-spin" />
                      正在載入
                    </div>
                  ) : errorCode === row.error_code ? (
                    <Alert variant="destructive">
                      <AlertCircle className="h-4 w-4" />
                      <AlertDescription className="flex flex-wrap items-center gap-3">
                        <span>載入失敗</span>
                        <Button
                          variant="outline"
                          size="sm"
                          onClick={() => void load(row.error_code)}
                        >
                          重試
                        </Button>
                      </AlertDescription>
                    </Alert>
                  ) : detail ? (
                    <div className="space-y-4">
                      {detail.rows.map((f) => {
                        // 兩行共用同一次比對，切法才會一致。
                        const diff = diffCorrection(f.quote, f.correction);
                        return (
                          <div key={f.finding_id} className="rounded-lg bg-muted/40 p-4">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className="text-xs text-muted-foreground">
                                {shortDate(f.essay_submitted_at)}
                                {f.essay_topic ? ` · ${f.essay_topic}` : ""}
                              </span>
                              <Link
                                to={`/learn/student/writing/${f.essay_id}`}
                                className="text-xs text-primary hover:underline inline-flex items-center gap-1 ml-auto"
                              >
                                看這一篇
                                <ExternalLink className="h-3 w-3" />
                              </Link>
                            </div>
                            <dl className="space-y-1.5 text-sm">
                              <div className="flex gap-2">
                                <dt className="text-muted-foreground shrink-0 w-10">原文</dt>
                                <dd className="text-foreground break-words min-w-0">
                                  {diff.worthShowing ? (
                                    <DiffText segments={diff.quote} />
                                  ) : (
                                    f.quote
                                  )}
                                </dd>
                              </div>
                              <div className="flex gap-2">
                                <dt className="text-muted-foreground shrink-0 w-10">修正</dt>
                                <dd className="break-words min-w-0">
                                  {diff.worthShowing ? (
                                    <DiffText segments={diff.correction} />
                                  ) : (
                                    <span className="text-success">{f.correction}</span>
                                  )}
                                </dd>
                              </div>
                              <div className="flex gap-2">
                                <dt className="text-muted-foreground shrink-0 w-10">說明</dt>
                                <dd className="text-muted-foreground break-words min-w-0">
                                  {f.reason}
                                </dd>
                              </div>
                            </dl>
                          </div>
                        );
                      })}
                      {detail.truncated ? (
                        <p className="text-xs text-warning">
                          只顯示最近 {detail.limit} 筆，共 {detail.total} 筆
                        </p>
                      ) : null}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </Card>
          );
        })}
      </div>

      {overview.truncated ? (
        <p className="text-xs text-warning">
          只顯示前 {overview.limit} 種，共 {overview.total} 種
        </p>
      ) : null}
    </div>
  );
}
