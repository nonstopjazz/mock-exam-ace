import { useCallback, useRef, useState } from "react";
import { Link } from "react-router-dom";
import * as XLSX from "xlsx";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import {
  AlertCircle, ArrowLeft, BookOpen, CheckCircle2, FileSpreadsheet,
  Loader2, Upload,
} from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
// 預覽區塊自成一個檔案，這一頁只負責流程
import { ImportPreview } from "@/components/admin/reading/ImportPreview";
import { analyzeSource, type ImportAnalysis } from "@/lib/reading/importAnalysis";
import {
  DEFAULT_CHUNK_SIZE, needsAttention, runImport,
  type ImportCounts, type ImportOutcome, type ImportPassageResult,
} from "@/lib/reading/runImport";

/**
 * Six-Way Reading 題庫匯入（管理端）
 *
 * 上傳 → 檢查 → 確認匯入。三步，每一步都要能退回去。
 *
 * 🛑 檔案【不會上傳到任何伺服器】。xlsx 在瀏覽器裡解析，
 *    只有解析後的 canonical payload 會送進資料庫的 RPC。
 *
 * 🛑 瀏覽器【不做逐列 INSERT】。每 20 篇一次 reading_import_batch()，
 *    授權（is_admin）與全部驗證都在資料庫那一側重做一次。
 *    前端這份解析是為了讓你在按下匯入之前看得到會發生什麼事——
 *    它是預覽，不是把關。能被繞過的驗證不是驗證。
 *
 * 🛑 匯入【不覆蓋】既有文章。內容相同會略過，內容不同會拒絕並告訴你。
 *    要換掉已經存在的文章是另一件事，不能藏在批次匯入裡。
 */

type Step = "upload" | "preview" | "importing" | "done";

const COUNT_LABEL: Record<keyof ImportCounts, string> = {
  imported: "匯入", skipped: "略過", conflict: "衝突", blocked: "不匯入", failed: "失敗",
};

export default function ReadingImport() {
  const [step, setStep] = useState<Step>("upload");
  const [fileName, setFileName] = useState<string>("");
  const [parsing, setParsing] = useState(false);
  const [parseError, setParseError] = useState<string | null>(null);
  const [analysis, setAnalysis] = useState<ImportAnalysis | null>(null);

  const [progress, setProgress] = useState<{ done: number; total: number }>({ done: 0, total: 0 });
  const [liveCounts, setLiveCounts] = useState<ImportCounts | null>(null);
  const [outcome, setOutcome] = useState<ImportOutcome | null>(null);

  const inputRef = useRef<HTMLInputElement>(null);

  const reset = useCallback(() => {
    setStep("upload");
    setFileName("");
    setParseError(null);
    setAnalysis(null);
    setOutcome(null);
    setLiveCounts(null);
    setProgress({ done: 0, total: 0 });
    if (inputRef.current) inputRef.current.value = "";
  }, []);

  const onPick = useCallback(async (file: File) => {
    setParsing(true);
    setParseError(null);
    setFileName(file.name);
    // 讓 spinner 先畫出來——解析 600 列 × 183 欄會卡住主執行緒一下子。
    await new Promise((r) => setTimeout(r, 0));
    try {
      const buf = await file.arrayBuffer();
      const wb = XLSX.read(buf, { type: "array" });
      const sheet = wb.Sheets[wb.SheetNames[0]];
      if (!sheet) throw new Error("這個檔案裡沒有工作表");
      const rows = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, { defval: null });
      const headers = (XLSX.utils.sheet_to_json<string[]>(sheet, { header: 1 })[0] ?? [])
        .filter((h): h is string => typeof h === "string" && h.length > 0);
      if (rows.length === 0) throw new Error("第一個工作表沒有任何資料列");
      setAnalysis(analyzeSource(rows, headers));
      setStep("preview");
    } catch (e) {
      setParseError(e instanceof Error ? e.message : "讀不到這個檔案");
      setAnalysis(null);
    } finally {
      setParsing(false);
    }
  }, []);

  const startImport = useCallback(async () => {
    if (!analysis || analysis.payloads.length === 0) return;
    setStep("importing");
    setOutcome(null);
    const total = Math.ceil(analysis.payloads.length / DEFAULT_CHUNK_SIZE);
    setProgress({ done: 0, total });
    setLiveCounts(null);

    const result = await runImport(analysis.payloads, fileName, {
      chunkSize: DEFAULT_CHUNK_SIZE,
      // 🛑 supabase.rpc() 不會 throw，它 resolve 一個帶 error 的物件。
      //    runImport 會看那個 error；這裡不要用 try/catch 包起來裝作沒事。
      call: (args) => supabase.rpc("reading_import_batch", args),
      onProgress: (chunk, totals) => {
        setProgress({ done: chunk.index, total: chunk.total });
        setLiveCounts(totals);
      },
    });

    setOutcome(result);
    setStep("done");
    if (result.ok) toast.success(`匯入完成：${result.totals.imported} 篇`);
    else toast.error(`第 ${result.stoppedAtChunk} 批失敗，已經停下來`);
  }, [analysis, fileName]);

  const attention: ImportPassageResult[] =
    outcome?.chunks.flatMap((c) => c.results.filter(needsAttention)) ?? [];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 flex items-center justify-between gap-2">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-2 md:p-3 rounded-lg bg-primary/10 shrink-0">
              <BookOpen className="h-6 w-6 md:h-8 md:w-8 text-primary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">
                閱讀題庫匯入
              </h1>
              <p className="text-sm md:text-base text-muted-foreground hidden sm:block">
                上傳題庫檔案，檢查之後再決定要不要匯入
              </p>
            </div>
          </div>
          <Button variant="ghost" size="sm" asChild className="shrink-0 gap-1 md:gap-2">
            <Link to="/admin">
              <ArrowLeft className="h-4 w-4" />
              <span className="hidden md:inline">管理中心</span>
            </Link>
          </Button>
        </div>

        <StepBar step={step} />

        {step === "upload" && (
          <UploadStep
            parsing={parsing}
            error={parseError}
            inputRef={inputRef}
            onPick={onPick}
          />
        )}

        {step === "preview" && analysis && (
          <div className="space-y-8">
            <Card className="p-6 flex flex-col sm:flex-row sm:items-center gap-4">
              <FileSpreadsheet className="h-6 w-6 text-muted-foreground shrink-0" />
              <div className="min-w-0 flex-1">
                <div className="font-medium text-foreground truncate">{fileName}</div>
                <div className="text-sm text-muted-foreground">
                  {analysis.rowCount} 列 · {analysis.columnAudits.length} 欄
                </div>
              </div>
              <Button variant="outline" onClick={reset} className="shrink-0">
                換一個檔案
              </Button>
            </Card>

            <ImportPreview analysis={analysis} />

            <Card className="p-6">
              <h3 className="font-semibold text-foreground mb-3">按下去會發生什麼</h3>
              <ul className="space-y-2 text-sm text-muted-foreground mb-6">
                <li>
                  · 送出 <span className="text-foreground font-medium">{analysis.payloads.length} 篇</span>
                  ，每 {DEFAULT_CHUNK_SIZE} 篇一批，共{" "}
                  {Math.ceil(analysis.payloads.length / DEFAULT_CHUNK_SIZE)} 批
                </li>
                <li>· 匯入後<span className="text-foreground font-medium">一律是草稿</span>，上架是另一個動作</li>
                <li>· 已經存在而且內容相同的會<span className="text-foreground font-medium">略過</span>，重跑是安全的</li>
                <li>
                  · 已經存在但內容不同的會<span className="text-foreground font-medium">拒絕</span>，
                  🛑 不會覆蓋
                </li>
                <li>· 一篇失敗不影響其他篇；整批中斷時會停下來告訴你停在哪裡</li>
              </ul>
              <div className="flex flex-col sm:flex-row gap-3">
                <Button
                  onClick={startImport}
                  disabled={analysis.payloads.length === 0 || !analysis.payloadMatchesStatus}
                  className="gap-2"
                >
                  <Upload className="h-4 w-4" />
                  匯入 {analysis.payloads.length} 篇
                </Button>
                <Button variant="outline" onClick={reset}>取消</Button>
              </div>
              {analysis.payloads.length === 0 && (
                <p className="text-sm text-destructive mt-3">
                  這份檔案沒有任何一篇可以匯入。
                </p>
              )}
              {!analysis.payloadMatchesStatus && (
                <p className="text-sm text-destructive mt-3">
                  解析結果自相矛盾，匯入已停用。請先回報上面那則訊息。
                </p>
              )}
            </Card>
          </div>
        )}

        {step === "importing" && (
          <Card className="p-6">
            <div className="flex items-center gap-3 mb-4">
              <Loader2 className="h-5 w-5 animate-spin text-primary shrink-0" />
              <div className="min-w-0">
                <div className="font-semibold text-foreground">匯入中</div>
                <div className="text-sm text-muted-foreground">
                  第 {progress.done} / {progress.total} 批 —— 請不要關掉這個分頁
                </div>
              </div>
            </div>
            {/* 🛑 Progress 的軌道預設是 bg-secondary，而這個設計系統的 secondary
                   是深青色——未填滿的部分看起來會像第二段進度。改成 muted。 */}
            <Progress
              value={progress.total === 0 ? 0 : (progress.done / progress.total) * 100}
              className="mb-4 bg-muted"
            />
            {liveCounts && <Counts counts={liveCounts} />}
          </Card>
        )}

        {step === "done" && outcome && (
          <div className="space-y-8">
            {outcome.ok ? (
              <Alert>
                <CheckCircle2 className="h-4 w-4" />
                <AlertDescription>
                  <span className="font-semibold">匯入完成。</span>
                  {outcome.chunks.length} 批全部送完。
                  {outcome.batchId && (
                    <>
                      <br />
                      <span className="text-sm text-muted-foreground">
                        批次紀錄 <code className="text-xs">{outcome.batchId}</code>
                      </span>
                    </>
                  )}
                </AlertDescription>
              </Alert>
            ) : (
              <Alert variant="destructive">
                <AlertCircle className="h-4 w-4" />
                <AlertDescription>
                  <span className="font-semibold">
                    第 {outcome.stoppedAtChunk} 批失敗，已經停下來。
                  </span>
                  <br />
                  {outcome.errorMessage}
                  <br />
                  <span className="text-sm">
                    前面 {outcome.chunks.length} 批已經寫進去了。修正之後重跑同一個檔案是安全的——
                    已經匯過的會被略過。
                  </span>
                </AlertDescription>
              </Alert>
            )}

            <Card className="p-6">
              <h3 className="font-semibold text-foreground mb-4">結果</h3>
              <Counts counts={outcome.totals} />
            </Card>

            {attention.length > 0 && (
              <Card className="p-6">
                <h3 className="font-semibold text-foreground mb-1">
                  需要看一下的篇（{attention.length}）
                </h3>
                <p className="text-sm text-muted-foreground mb-4">
                  imported 以外的都列在這裡
                </p>
                <ScrollArea className="max-h-72 rounded-lg border border-border">
                  <div className="divide-y divide-border">
                    {attention.map((r) => (
                      <div key={r.passage_id} className="p-3 flex flex-wrap items-start gap-2">
                        <code className="text-xs font-medium text-foreground shrink-0">
                          {r.passage_id}
                        </code>
                        <Badge
                          variant={
                            r.status === "skipped" ? "secondary"
                            : r.status === "blocked" ? "outline"
                            : "destructive"
                          }
                          className="text-xs shrink-0"
                        >
                          {r.status}
                        </Badge>
                        <span className="text-sm text-muted-foreground min-w-0 break-words">
                          {r.reason}
                        </span>
                      </div>
                    ))}
                  </div>
                </ScrollArea>
              </Card>
            )}

            <Card className="p-6">
              <p className="text-sm text-muted-foreground mb-4">
                🛑 匯入的文章全部是草稿，學生還看不到。上架是另一個動作。
              </p>
              <Button variant="outline" onClick={reset}>匯入另一個檔案</Button>
            </Card>
          </div>
        )}
      </div>
    </div>
  );
}

function StepBar({ step }: { step: Step }) {
  const steps: { key: Step; label: string }[] = [
    { key: "upload", label: "上傳" },
    { key: "preview", label: "檢查" },
    { key: "importing", label: "匯入" },
  ];
  const activeIndex =
    step === "done" ? 2 : steps.findIndex((s) => s.key === step);
  return (
    <div className="flex items-center gap-2 mb-8 text-sm">
      {steps.map((s, i) => (
        <div key={s.key} className="flex items-center gap-2 min-w-0">
          <span
            className={
              i <= activeIndex
                ? "flex items-center gap-2 font-medium text-foreground"
                : "flex items-center gap-2 text-muted-foreground"
            }
          >
            <span
              className={`flex h-6 w-6 items-center justify-center rounded-full text-xs shrink-0 ${
                i < activeIndex || step === "done"
                  ? "bg-primary text-primary-foreground"
                  : i === activeIndex
                    ? "bg-primary/15 text-primary"
                    : "bg-muted text-muted-foreground"
              }`}
            >
              {i + 1}
            </span>
            <span className="truncate">{s.label}</span>
          </span>
          {i < steps.length - 1 && (
            <span className="h-px w-6 md:w-12 bg-border shrink-0" aria-hidden />
          )}
        </div>
      ))}
    </div>
  );
}

function UploadStep({
  parsing, error, inputRef, onPick,
}: {
  parsing: boolean;
  error: string | null;
  inputRef: React.RefObject<HTMLInputElement>;
  onPick: (file: File) => void;
}) {
  if (parsing) {
    return (
      <Card className="p-12">
        <div className="text-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary mx-auto mb-4" />
          <p className="font-medium text-foreground">正在解析</p>
          <p className="text-sm text-muted-foreground mt-2">
            檔案在你的瀏覽器裡解析，沒有上傳到任何地方
          </p>
        </div>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {error && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>{error}</AlertDescription>
        </Alert>
      )}
      <Card className="p-12">
        <div className="text-center">
          <FileSpreadsheet className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
          <p className="font-medium text-foreground">選擇題庫檔案</p>
          <p className="text-sm text-muted-foreground mt-2 mb-6">
            .xlsx 或 .xls。六個 construct 會從欄位名自動推導，不必先整理欄位
          </p>
          <input
            ref={inputRef}
            type="file"
            accept=".xlsx,.xls"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) onPick(f);
            }}
          />
          <Button onClick={() => inputRef.current?.click()} className="gap-2">
            <Upload className="h-4 w-4" />
            選擇檔案
          </Button>
        </div>
      </Card>
      <Card className="p-6">
        <h3 className="font-semibold text-foreground mb-3">關於這一頁</h3>
        <ul className="space-y-2 text-sm text-muted-foreground">
          <li>· 檔案<span className="text-foreground">不會上傳</span>，在瀏覽器裡解析</li>
          <li>· 看完檢查報告之後，才會問你要不要匯入</li>
          <li>· 匯入的文章一律是草稿，<span className="text-foreground">學生不會看到</span></li>
          <li>· 已經匯過的內容會被略過，同一個檔案重跑是安全的</li>
        </ul>
      </Card>
    </div>
  );
}

function Counts({ counts }: { counts: ImportCounts }) {
  const keys = Object.keys(COUNT_LABEL) as (keyof ImportCounts)[];
  return (
    <div className="grid grid-cols-2 md:grid-cols-5 gap-4">
      {keys.map((k) => {
        const bad = (k === "conflict" || k === "failed") && counts[k] > 0;
        return (
          <div key={k} className="min-w-0">
            <div className={`text-2xl font-bold ${bad ? "text-destructive" : "text-foreground"}`}>
              {counts[k]}
            </div>
            <div className="text-sm text-muted-foreground truncate">{COUNT_LABEL[k]}</div>
          </div>
        );
      })}
    </div>
  );
}
