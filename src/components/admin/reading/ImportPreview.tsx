import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { AlertTriangle, CheckCircle2, FileWarning, Layers } from "lucide-react";
import { CONSTRUCT_LABEL_ZH } from "@/lib/reading/constructs";
import { orderedConstructs, type ImportAnalysis } from "@/lib/reading/importAnalysis";

/**
 * 匯入前的檢查報告。
 *
 * 🛑 所有數字都來自 analyzeSource()，跟 `npm run reading:dry-run` 是【同一次計算】。
 *    這個元件只負責排版，不自己算任何東西——畫面上出現一個自己算的數字，
 *    就等於多了一個沒有人驗證過的真相。
 */
export function ImportPreview({ analysis }: { analysis: ImportAnalysis }) {
  const a = analysis;
  const willImport = a.payloads.length;

  return (
    <div className="space-y-8">
      {/* 🛑 最嚴重的問題放最上面，而且要能擋住匯入 */}
      {!a.payloadMatchesStatus && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            <span className="font-semibold">解析結果自相矛盾。</span>
            可匯入的文章應該是 {a.publishReady + a.draft} 篇，但實際只產出 {willImport} 份資料。
            這是程式的問題，不是資料的問題——請先回報，不要匯入。
          </AlertDescription>
        </Alert>
      )}

      {a.constructs.missingConstructs.length > 0 && (
        <Alert variant="destructive">
          <AlertTriangle className="h-4 w-4" />
          <AlertDescription>
            這份檔案缺少 {a.constructs.missingConstructs.join("、")} 的題目欄位。
            匯進來的文章都不會是完整的六題。
          </AlertDescription>
        </Alert>
      )}

      {/* 三態 */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
        <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
          <div className="flex items-center gap-2 mb-3">
            <CheckCircle2 className="h-5 w-5 text-primary shrink-0" />
            <h3 className="font-semibold text-foreground">六題完整</h3>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">{a.publishReady}</span>
            <span className="text-sm text-muted-foreground">篇</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">匯入後可以上架</p>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20">
          <div className="flex items-center gap-2 mb-3">
            <Layers className="h-5 w-5 text-secondary shrink-0" />
            <h3 className="font-semibold text-foreground">1–5 題</h3>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">{a.draft}</span>
            <span className="text-sm text-muted-foreground">篇</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">匯得進去，但上不了架</p>
        </Card>

        <Card className="p-6 bg-gradient-to-br from-accent/10 to-treasure/10 border-accent/20">
          <div className="flex items-center gap-2 mb-3">
            <FileWarning className="h-5 w-5 text-accent shrink-0" />
            <h3 className="font-semibold text-foreground">一題都沒有</h3>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="text-3xl font-bold text-foreground">{a.blocked}</span>
            <span className="text-sm text-muted-foreground">篇</span>
          </div>
          <p className="text-sm text-muted-foreground mt-2">🛑 不會匯入，要回去重新產製</p>
        </Card>
      </div>

      {/* 會寫進資料庫的東西 */}
      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-1">匯入後資料庫會多出</h3>
        <p className="text-sm text-muted-foreground mb-4">
          這是 {willImport} 篇實際會寫入的量，已經扣掉不匯入的 {a.blocked} 篇
        </p>
        <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
          {[
            ["文章", willImport],
            ["題目", a.payloadQuestions],
            ["段落", a.payloadParagraphs],
            ["詞彙", a.payloadVocabulary],
            ["micro-skill", a.payloadSkills],
          ].map(([label, n]) => (
            <div key={label as string} className="min-w-0">
              <div className="text-2xl font-bold text-foreground">{n as number}</div>
              <div className="text-sm text-muted-foreground truncate">{label as string}</div>
            </div>
          ))}
        </div>
      </Card>

      {/* 來源檔的狀況 */}
      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-4">來源檔</h3>
        <dl className="space-y-3 text-sm">
          <Row label="資料列">
            {a.rowCount} 列，其中 {a.withId} 列有 topic_id
          </Row>
          <Row label="已產出文章">
            {a.withPassage} 篇
            {a.noPassage > 0 && (
              <span className="text-muted-foreground">
                （另有 {a.noPassage} 列只有選題，管線還沒產出文章——不是壞資料）
              </span>
            )}
          </Row>
          <Row label="Construct">
            {a.constructs.found.length === 0 ? (
              <span className="text-destructive">一個都認不出來</span>
            ) : (
              <span className="flex flex-wrap gap-1">
                {a.constructs.found.map((f) => (
                  <Badge key={f.construct} variant="secondary" className="text-xs">
                    {f.prefix} → {f.construct}
                  </Badge>
                ))}
              </span>
            )}
          </Row>
          <Row label="內文來源">
            {(["FINAL", "REVISED", "WRITER"] as const)
              .filter((s) => a.contentSource[s] > 0)
              .map((s) => `${s} ${a.contentSource[s]} 篇`)
              .join("、") || "（沒有任何有效內文）"}
          </Row>
          <Row label="CEFR">
            {a.cefr.map((c) => `${c.level} ${c.count}`).join("、")}
          </Row>
          <Row label="重複的 passage_id">
            {a.duplicateIds.length === 0 ? (
              <span className="text-muted-foreground">沒有</span>
            ) : (
              <span className="text-destructive">
                {a.duplicateIds.map((d) => `${d.passageId}×${d.count}`).join("、")}
              </span>
            )}
          </Row>
        </dl>
      </Card>

      {/* 欄位健康 */}
      {(a.brokenColumns.length > 0 || a.missingColumns.length > 0 || a.unknownColumns.length > 0) && (
        <Card className="p-6">
          <h3 className="font-semibold text-foreground mb-1">欄位</h3>
          <p className="text-sm text-muted-foreground mb-4">
            缺欄位不會讓匯入失敗，它會安靜地變成空值。所以列在這裡
          </p>
          <div className="space-y-4 text-sm">
            {a.brokenColumns.length > 0 && (
              <div>
                <div className="font-medium text-foreground mb-2">壞掉或整欄空白</div>
                <ul className="space-y-1">
                  {a.brokenColumns.map((c) => (
                    <li key={c.column} className="flex flex-wrap items-baseline gap-2">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{c.column}</code>
                      <span className="text-muted-foreground">
                        {c.health === "PLACEHOLDER"
                          ? `🛑 值是另一個欄位的名稱（${c.placeholder}/${c.nonEmpty} 列）——管線沒把參照解開`
                          : c.health === "PARTIAL"
                            ? `⚠️ 有 ${c.placeholder}/${c.nonEmpty} 列的值等於欄位名稱`
                            : "整欄空白"}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {a.missingColumns.length > 0 && (
              <div>
                <div className="font-medium text-foreground mb-2">
                  這份檔案沒有的欄位（{a.missingColumns.length}）
                </div>
                <ul className="space-y-1">
                  {a.missingColumns.map((c) => (
                    <li key={c.column} className="flex flex-wrap items-baseline gap-2">
                      <code className="text-xs bg-muted px-1.5 py-0.5 rounded">{c.column}</code>
                      <span className="text-muted-foreground">{c.effect}</span>
                    </li>
                  ))}
                </ul>
              </div>
            )}
            {a.unknownColumns.length > 0 && (
              <Alert>
                <AlertTriangle className="h-4 w-4" />
                <AlertDescription>
                  有 {a.unknownColumns.length} 個欄位不在分類表裡（
                  {a.unknownColumns.slice(0, 5).map((c) => c.column).join("、")}
                  {a.unknownColumns.length > 5 ? " …" : ""}）。
                  來源格式可能換了，這些欄位的內容不會被匯入。
                </AlertDescription>
              </Alert>
            )}
          </div>
        </Card>
      )}

      {/* 每個 construct */}
      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-1">每個 Construct 的完整度</h3>
        <p className="text-sm text-muted-foreground mb-4">分母是 {a.withPassage} 篇已產出文章</p>
        {/* 🛑 窄螢幕讓表格在自己的容器裡橫向捲動，不要壓扁——
               壓扁之後欄位標題會變成一個字一行，看不出是哪一欄。 */}
        <div className="overflow-x-auto -mx-2 px-2">
          <table className="w-full min-w-[34rem] text-sm">
            <thead>
              <tr className="border-b border-border text-muted-foreground">
                <th className="text-left font-medium py-2 pr-4">Construct</th>
                <th className="text-right font-medium py-2 px-2">完整</th>
                <th className="text-right font-medium py-2 px-2">缺題幹</th>
                <th className="text-right font-medium py-2 px-2">選項不足</th>
                <th className="text-right font-medium py-2 px-2">缺正解</th>
                <th className="text-right font-medium py-2 px-2">正解無對應</th>
                <th className="text-right font-medium py-2 pl-2">缺解說</th>
              </tr>
            </thead>
            <tbody>
              {orderedConstructs().map((c) => {
                const h = a.perConstruct.find((x) => x.construct === c)!;
                return (
                  <tr key={c} className="border-b border-border/50 last:border-0">
                    <td className="py-2 pr-4 whitespace-nowrap">
                      <span className="font-medium text-foreground">{c}</span>{" "}
                      <span className="text-muted-foreground">{CONSTRUCT_LABEL_ZH[c]}</span>
                    </td>
                    <td className="text-right py-2 px-2 font-medium text-foreground">{h.ok}</td>
                    <Cell n={h.missingQuestion} />
                    <Cell n={h.badOptions} />
                    <Cell n={h.missingAnswer} />
                    <Cell n={h.answerNotInOptions} />
                    <Cell n={h.missingExplanation} last />
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      {/* micro-skill 與加值資料 */}
      {/* 🛑 來源檔的數字與會進資料庫的數字【不一樣】——差額是不匯入的那幾篇。
             同一頁上出現 5598 和 5238 而不解釋，只會讓人以為有東西漏掉了。 */}
      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-1">加值資料</h3>
        <p className="text-sm text-muted-foreground mb-4">
          「來源檔」是整份檔案的量，「匯入後」已經扣掉不匯入的 {a.blocked} 篇
        </p>
        <dl className="space-y-3 text-sm">
          <Row label="micro-skill">
            {a.skillKinds} 種 · <Delta from={a.skillRows} to={a.payloadSkills} unit="筆" />
            <span className="text-muted-foreground">
                來源檔有 {a.skillNullEmphasis} 筆沒有 emphasis（存成 NULL，不是 0——
              NULL 是「沒有這個資訊」）
            </span>
          </Row>
          <Row label="段落地圖">
            {a.withParagraphs}／{a.withPassage} 篇有 ·{" "}
            <Delta from={a.paragraphRows} to={a.payloadParagraphs} unit="段" />
          </Row>
          <Row label="詞彙">
            {a.withVocab}／{a.withPassage} 篇有 ·{" "}
            <Delta
              from={a.vocabByTier.reduce((n, t) => n + t.count, 0)}
              to={a.payloadVocabulary}
              unit="筆"
            />
            <span className="text-muted-foreground">
                {a.vocabByTier.map((t) => `${t.tier} ${t.count}`).join("、")}
            </span>
          </Row>
        </dl>
        {a.skillDriftCells > 0 && (
          <Alert className="mt-4">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              有 {a.skillDriftCells} 個 micro-skill 儲存格有內容，卻一個都解析不出來。
              來源的格式可能換了——這些資料會靜默消失，請先看一筆原始值。
            </AlertDescription>
          </Alert>
        )}
      </Card>

      {/* 有問題的文章 */}
      {a.problems.length > 0 && (
        <Card className="p-6">
          <h3 className="font-semibold text-foreground mb-1">
            需要注意的文章（{a.problems.length}）
          </h3>
          <p className="text-sm text-muted-foreground mb-4">
            DRAFT 會匯入但上不了架；BLOCKED 不會匯入
          </p>
          <ScrollArea className="max-h-72 rounded-lg border border-border">
            <div className="divide-y divide-border">
              {a.problems.map((p) => (
                <div key={p.passageId} className="p-3 flex flex-wrap items-start gap-2">
                  <code className="text-xs font-medium text-foreground shrink-0">
                    {p.passageId}
                  </code>
                  <Badge
                    variant={p.importStatus === "BLOCKED" ? "destructive" : "secondary"}
                    className="text-xs shrink-0"
                  >
                    {p.importStatus === "BLOCKED" ? "不匯入" : `DRAFT・${p.usableQuestions} 題`}
                  </Badge>
                  <span className="text-sm text-muted-foreground min-w-0 break-words">
                    {p.reasons.join("；")}
                  </span>
                </div>
              ))}
            </div>
          </ScrollArea>
        </Card>
      )}
    </div>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col sm:flex-row sm:items-baseline gap-1 sm:gap-3">
      <dt className="text-muted-foreground sm:w-32 shrink-0">{label}</dt>
      <dd className="text-foreground min-w-0 flex flex-wrap items-baseline gap-x-2">{children}</dd>
    </div>
  );
}

// 「來源檔 N → 匯入後 M」。相等時不畫箭頭，免得看起來像有東西被丟掉。
function Delta({ from, to, unit }: { from: number; to: number; unit: string }) {
  if (from === to) {
    return <span className="text-foreground">共 {from} {unit}</span>;
  }
  return (
    <span className="text-foreground">
      來源檔 {from} {unit} → 匯入後 <span className="font-medium">{to} {unit}</span>
    </span>
  );
}

// 0 用淡色、非 0 用正常色——一整排 0 裡的那個 3 要跳出來
function Cell({ n, last }: { n: number; last?: boolean }) {
  return (
    <td className={`text-right py-2 ${last ? "pl-2" : "px-2"} ${n === 0 ? "text-muted-foreground" : "text-foreground font-medium"}`}>
      {n}
    </td>
  );
}
