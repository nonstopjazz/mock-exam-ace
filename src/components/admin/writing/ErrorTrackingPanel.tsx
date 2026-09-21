import { useMemo, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Accordion, AccordionContent, AccordionItem, AccordionTrigger,
} from "@/components/ui/accordion";
import {
  Collapsible, CollapsibleContent, CollapsibleTrigger,
} from "@/components/ui/collapsible";
import { ToggleGroup, ToggleGroupItem } from "@/components/ui/toggle-group";
import {
  AlertCircle, ChevronDown, ExternalLink, Loader2, Users,
} from "lucide-react";
import { ERROR_TAG_BY_CODE } from "@/lib/writing/taxonomy";
import {
  essayCountTone,
  type ErrorScope,
  type StudentErrorRow,
} from "@/lib/writing/errorTracking";
import { useErrorFindings, useErrorTracking } from "@/hooks/learn/useErrorTracking";

/**
 * 錯誤追蹤分頁：同一份資料、同一組篩選，兩個方向看。
 *
 *   依錯誤查看 → 誰犯過這個錯（老師剛批改完當下最常問的）
 *   依學生查看 → 這位學生犯過哪些錯（一對一談之前）
 *
 * 🛑 兩邊都【沒有任何門檻】。只出現一次的錯誤一樣會列出來 ——
 *    那正是老師最容易漏掉、最想被提醒的情況。
 *
 * 🛑 D8 = S-b：選了某個錯誤之後，「依學生查看」列出的是【被篩出來的學生
 *    在這個範圍內的全部錯誤】，不只是選中的那一個。選中的會標記起來。
 *    理由：老師的需求是「不要漏掉他犯過哪些錯」，把清單砍掉等於自我否定。
 */

type ViewMode = "by-error" | "by-student";

interface Props {
  scope: ErrorScope;
  /** 班級／題目／時間是否已經縮小過範圍，用來寫空狀態的下一步 */
  hasFilters: boolean;
}

function codeLabel(code: string): string {
  return ERROR_TAG_BY_CODE.get(code)?.zh ?? code;
}

function shortDate(iso: string | null): string {
  if (!iso) return "—";
  const d = new Date(iso);
  return Number.isNaN(d.getTime()) ? "—" : d.toLocaleDateString("zh-TW");
}

export function ErrorTrackingPanel({ scope, hasFilters }: Props) {
  const [view, setView] = useState<ViewMode>("by-error");
  const [commonOpen, setCommonOpen] = useState(true);
  const tracking = useErrorTracking(scope, true);
  const findings = useErrorFindings();

  const overviewRows = tracking.overview?.rows ?? [];
  const studentRows = tracking.students?.rows ?? [];
  /** 依學生分組，保留 RPC 給的順序 */
  const byStudent = useMemo(() => {
    const map = new Map<string, StudentErrorRow[]>();
    for (const row of tracking.studentErrors?.rows ?? []) {
      const list = map.get(row.student_id);
      if (list) list.push(row);
      else map.set(row.student_id, [row]);
    }
    return [...map.entries()];
  }, [tracking.studentErrors]);

  if (tracking.error) {
    return (
      <Alert variant="destructive">
        <AlertCircle className="h-4 w-4" />
        <AlertDescription>讀取錯誤追蹤資料失敗：{tracking.error}</AlertDescription>
      </Alert>
    );
  }

  if (tracking.loading && overviewRows.length === 0) {
    return (
      <Card className="p-6">
        <div className="flex flex-col items-center justify-center py-12 gap-3">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
          <p className="text-sm text-muted-foreground">載入錯誤追蹤</p>
        </div>
      </Card>
    );
  }

  const nothingAtAll = overviewRows.length === 0;

  return (
    <div className="space-y-6">
      {/* ── 常見錯誤（A4）───────────────────────────────────── */}
      <Collapsible open={commonOpen} onOpenChange={setCommonOpen}>
        <Card className="p-6">
          <CollapsibleTrigger asChild>
            <button
              type="button"
              className="flex w-full items-center justify-between gap-2 text-left"
            >
              <div className="flex items-center gap-2 min-w-0">
                <Users className="h-5 w-5 text-primary shrink-0" />
                <h2 className="font-semibold text-foreground truncate">常見錯誤</h2>
                <span className="text-sm text-muted-foreground hidden sm:inline">
                  依有多少位不同學生犯過排序
                </span>
              </div>
              <ChevronDown
                className={`h-4 w-4 text-muted-foreground shrink-0 transition-transform ${
                  commonOpen ? "rotate-180" : ""
                }`}
              />
            </button>
          </CollapsibleTrigger>

          <CollapsibleContent>
            {nothingAtAll ? (
              <div className="text-center py-12 text-muted-foreground">
                <p>{hasFilters ? "這個範圍內沒有找到錯誤" : "還沒有任何錯誤資料"}</p>
                <p className="text-sm mt-2">
                  {hasFilters
                    ? "放寬上方的班級、題目或時間看看"
                    : "作文完成 AI 分析之後，錯誤會出現在這裡"}
                </p>
              </div>
            ) : (
              <div className="divide-y divide-border mt-4">
                {overviewRows.map((row) => (
                  <div
                    key={row.error_code}
                    className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3 first:pt-0"
                  >
                    <span className="font-semibold text-foreground min-w-0 truncate">
                      {codeLabel(row.error_code)}
                    </span>
                    {row.is_fallback_code ? (
                      <Badge variant="outline" className="text-xs font-normal shrink-0">
                        混合類別
                      </Badge>
                    ) : null}
                    <span className="text-sm text-muted-foreground shrink-0">
                      <span className="font-semibold text-foreground">{row.student_count}</span> 位學生
                      {" · "}
                      {row.essay_count} 篇 · {row.occurrence_count} 次
                    </span>
                    <span className="text-xs text-muted-foreground ml-auto shrink-0 hidden sm:inline">
                      最近 {shortDate(row.last_seen_at)}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {overviewRows.some((r) => r.is_fallback_code) ? (
              <p className="text-xs text-muted-foreground mt-4">
                「混合類別」把多種不同的錯誤歸在一起，看到它排在前面時，建議點開看實際例句再決定怎麼處理。
              </p>
            ) : null}
          </CollapsibleContent>
        </Card>
      </Collapsible>

      {/* ── 切換 ────────────────────────────────────────────── */}
      <div className="flex items-center justify-between gap-3 flex-wrap">
        <ToggleGroup
          type="single"
          value={view}
          onValueChange={(v) => { if (v) setView(v as ViewMode); }}
          variant="outline"
        >
          <ToggleGroupItem value="by-error">依錯誤查看</ToggleGroupItem>
          <ToggleGroupItem value="by-student">依學生查看</ToggleGroupItem>
        </ToggleGroup>

        {view === "by-student" && scope.codes.length > 0 ? (
          <p className="text-xs text-muted-foreground">
            列出的是被篩出來的學生在這個範圍內的<strong className="text-foreground">全部</strong>錯誤
          </p>
        ) : null}
      </div>

      {/* ── 依錯誤查看（A5）──────────────────────────────────── */}
      {view === "by-error" ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-4">
            <h2 className="font-semibold text-foreground">
              {scope.codes.length > 0 ? "犯過這些錯的學生" : "有錯誤紀錄的學生"}
            </h2>
            <span className="text-sm text-muted-foreground min-w-0">
              {scope.codes.length > 0
                ? scope.codes.map(codeLabel).join("、")
                : "上方選錯誤類型，就只看犯過那幾個錯的學生"}
            </span>
            {studentRows.length > 0 ? (
              <span className="text-sm text-muted-foreground ml-auto shrink-0">
                {studentRows.length} 位
              </span>
            ) : null}
          </div>
          {studentRows.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>這個範圍內沒有學生犯過選取的錯誤</p>
              <p className="text-sm mt-2">
                {scope.codes.length === 0
                  ? "上方選一個錯誤類型，就會列出犯過的學生"
                  : "換一個錯誤類型，或放寬班級與時間"}
              </p>
            </div>
          ) : (
            <div className="divide-y divide-border">
              {studentRows.map((row) => (
                <div key={row.student_id} className="flex flex-wrap items-center gap-x-3 gap-y-1 py-3 first:pt-0 last:pb-0">
                  <span className="font-semibold text-foreground min-w-0 truncate">
                    {row.student_name ?? "未命名學生"}
                  </span>
                  <Badge
                    variant="outline"
                    className={`text-xs font-normal shrink-0 ${essayCountTone(row.essay_count)}`}
                  >
                    {row.essay_count} 篇 · {row.occurrence_count} 次
                  </Badge>
                  <span className="text-xs text-muted-foreground shrink-0 hidden sm:inline">
                    {shortDate(row.first_seen_at)} – {shortDate(row.last_seen_at)}
                  </span>
                  <span className="text-xs text-muted-foreground ml-auto shrink-0 truncate max-w-full">
                    {row.matched_codes.map(codeLabel).join("、")}
                  </span>
                </div>
              ))}
            </div>
          )}

          {tracking.students?.truncated ? (
            <p className="text-xs text-warning mt-4">
              只顯示前 {tracking.students.limit} 位，共 {tracking.students.total} 位。縮小班級或時間範圍看完整清單。
            </p>
          ) : null}
        </Card>
      ) : null}

      {/* ── 依學生查看（A6 + A7）─────────────────────────────── */}
      {view === "by-student" ? (
        <Card className="p-6">
          <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-4">
            <h2 className="font-semibold text-foreground">每位學生犯過的錯誤</h2>
            <span className="text-sm text-muted-foreground min-w-0">
              點開任何一項可以看原文與修正
            </span>
            {byStudent.length > 0 ? (
              <span className="text-sm text-muted-foreground ml-auto shrink-0">
                {byStudent.length} 位
              </span>
            ) : null}
          </div>
          {byStudent.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <p>這個範圍內沒有學生的錯誤紀錄</p>
              <p className="text-sm mt-2">放寬上方的班級、題目或時間看看</p>
            </div>
          ) : (
            <div className="space-y-6">
              {byStudent.map(([studentId, rows]) => (
                <div key={studentId}>
                  <h3 className="font-semibold text-foreground mb-2">
                    {rows[0].student_name ?? "未命名學生"}
                  </h3>
                  <Accordion type="multiple" className="border-t border-border">
                    {rows.map((row) => {
                      const key = `${studentId}:${row.error_code}`;
                      const detail = findings.rows[key];
                      const detailError = findings.errors[key];
                      return (
                        <AccordionItem key={key} value={key}>
                          <AccordionTrigger
                            className="py-3 hover:no-underline"
                            onClick={() => void findings.load(scope, studentId, row.error_code)}
                          >
                            <div className="flex flex-wrap items-center gap-x-2 gap-y-1 min-w-0 flex-1 pr-2">
                              <span
                                className={`truncate ${
                                  row.is_selected ? "font-semibold text-foreground" : "text-foreground"
                                }`}
                              >
                                {codeLabel(row.error_code)}
                              </span>
                              {/* 不用小圓點：這是整個 S-b 語意的關鍵標記，
                                  要讓人讀得到，不是只有看得到。 */}
                              {row.is_selected ? (
                                <Badge
                                  variant="outline"
                                  className="text-[10px] font-normal shrink-0 bg-primary/10 border-primary/20"
                                >
                                  篩選中
                                </Badge>
                              ) : null}
                              {row.is_fallback_code ? (
                                <Badge variant="outline" className="text-[10px] font-normal shrink-0">
                                  混合類別
                                </Badge>
                              ) : null}
                              <Badge
                                variant="outline"
                                className={`text-xs font-normal shrink-0 ${essayCountTone(row.essay_count)}`}
                              >
                                {row.essay_count} 篇 · {row.occurrence_count} 次
                              </Badge>
                              <span className="text-xs text-muted-foreground ml-auto shrink-0 hidden sm:inline">
                                最近 {shortDate(row.last_seen_at)}
                              </span>
                            </div>
                          </AccordionTrigger>

                          <AccordionContent>
                            {detailError ? (
                              <Alert variant="destructive" className="mb-2">
                                <AlertCircle className="h-4 w-4" />
                                <AlertDescription>{detailError}</AlertDescription>
                              </Alert>
                            ) : findings.loadingKey === key ? (
                              <div className="flex items-center gap-2 py-4 text-sm text-muted-foreground">
                                <Loader2 className="h-4 w-4 animate-spin" />
                                載入原文
                              </div>
                            ) : detail ? (
                              <div className="space-y-4 pb-2">
                                {detail.rows.map((f) => (
                                  <div key={f.finding_id} className="rounded-lg bg-muted/40 p-4">
                                    <div className="flex flex-wrap items-center gap-2 mb-2">
                                      <span className="text-xs text-muted-foreground">
                                        {shortDate(f.essay_submitted_at)}
                                        {f.essay_topic ? ` · ${f.essay_topic}` : ""}
                                      </span>
                                      <Link
                                        to={`/admin/writing/${f.essay_id}`}
                                        className="text-xs text-primary hover:underline inline-flex items-center gap-1 ml-auto"
                                      >
                                        看完整報告
                                        <ExternalLink className="h-3 w-3" />
                                      </Link>
                                    </div>
                                    <dl className="space-y-1.5 text-sm">
                                      <div className="flex gap-2">
                                        <dt className="text-muted-foreground shrink-0 w-10">原文</dt>
                                        <dd className="text-foreground break-words min-w-0">{f.quote}</dd>
                                      </div>
                                      <div className="flex gap-2">
                                        <dt className="text-muted-foreground shrink-0 w-10">修正</dt>
                                        <dd className="text-success break-words min-w-0">{f.correction}</dd>
                                      </div>
                                      <div className="flex gap-2">
                                        <dt className="text-muted-foreground shrink-0 w-10">說明</dt>
                                        <dd className="text-muted-foreground break-words min-w-0">{f.reason}</dd>
                                      </div>
                                    </dl>
                                  </div>
                                ))}
                                {detail.truncated ? (
                                  <p className="text-xs text-warning">
                                    只顯示前 {detail.limit} 筆，共 {detail.total} 筆。
                                  </p>
                                ) : null}
                              </div>
                            ) : null}
                          </AccordionContent>
                        </AccordionItem>
                      );
                    })}
                  </Accordion>
                </div>
              ))}
            </div>
          )}

          {tracking.studentErrors?.truncated ? (
            <p className="text-xs text-warning mt-4">
              只顯示前 {tracking.studentErrors.student_limit} 位學生，共{" "}
              {tracking.studentErrors.student_total} 位。縮小班級或時間範圍看完整清單。
            </p>
          ) : null}
        </Card>
      ) : null}

      <p className="text-xs text-muted-foreground">
        只出現一次的錯誤一樣會列出。沒有出現某個錯誤，代表這幾篇作文裡沒發現，
        <strong className="text-foreground">不代表學生已經學會</strong>。
      </p>
    </div>
  );
}
