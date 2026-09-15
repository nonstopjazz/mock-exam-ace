import { useMemo, useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Tabs, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { AlertCircle, Loader2, Mic } from "lucide-react";
import { useSpeakingPrompts } from "@/hooks/learn/useSpeakingPrompts";
import { useSpeakingHistory } from "@/hooks/learn/useSpeakingHistory";
import { PromptCard } from "@/components/learn/speaking/PromptCard";
import { SpeakingRecorderPanel } from "@/components/learn/speaking/SpeakingRecorderPanel";
import { RecordingHistory } from "@/components/learn/speaking/RecordingHistory";
import { GRID_CARDS } from "@/lib/cardGrid";
import type { SpeakingPrompt } from "@/lib/speaking/types";

/**
 * 口說練習 —— 選題 → 錄音 → 上傳
 *
 * 這一批【沒有】AI 批改。畫面上因此不提分數、不提「分析中」，
 * 只說錄音存下來了、可以回頭聽。功能還沒做就先在畫面上承諾，
 * 是最快讓學生不再相信這個網站的做法。
 *
 * 這一頁能不能被看到，由 StudentFeatureGate 依 learn_feature_enabled('speaking')
 * 決定；資料本身另外由每一支 RPC 各自把關。
 */
const PARTS = [
  { value: "all", label: "全部" },
  { value: "1", label: "Part 1" },
  { value: "2", label: "Part 2" },
  { value: "3", label: "Part 3" },
];

const StudentSpeaking = () => {
  const { prompts, loading, error, refetch } = useSpeakingPrompts();
  const history = useSpeakingHistory();
  const [part, setPart] = useState("all");
  const [selected, setSelected] = useState<SpeakingPrompt | null>(null);

  const visible = useMemo(
    () => (part === "all" ? prompts : prompts.filter((p) => String(p.part) === part)),
    [prompts, part],
  );

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          {/* 頁首 */}
          <div className="mb-8 flex items-center gap-3 min-w-0">
            <div className="p-2 md:p-3 rounded-lg bg-secondary/10 shrink-0">
              <Mic className="h-6 w-6 md:h-8 md:w-8 text-secondary" />
            </div>
            <div className="min-w-0">
              <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">口說練習</h1>
              <p className="text-sm md:text-base text-muted-foreground hidden sm:block">
                挑一題、講給自己聽，錄起來之後可以回頭比較
              </p>
            </div>
          </div>

          {/* 選好題目之後，錄音面板取代選題區——同時出現會讓人不知道要看哪裡 */}
          {selected ? (
            <div className="mb-10">
              <SpeakingRecorderPanel
                prompt={selected}
                onSaved={() => void history.refetch()}
                onChangePrompt={() => setSelected(null)}
              />
            </div>
          ) : (
            <div className="mb-10">
              <div className="mb-4 flex items-center justify-between gap-2">
                <h2 className="text-lg font-semibold text-foreground">選一題</h2>
                <Tabs value={part} onValueChange={setPart}>
                  <TabsList>
                    {PARTS.map((option) => (
                      <TabsTrigger key={option.value} value={option.value}>
                        {option.label}
                      </TabsTrigger>
                    ))}
                  </TabsList>
                </Tabs>
              </div>

              {loading ? (
                <Card className="p-6">
                  <div className="flex justify-center py-12">
                    <Loader2 className="h-12 w-12 animate-spin text-primary" />
                  </div>
                </Card>
              ) : error ? (
                <Alert variant="destructive">
                  <AlertCircle className="h-4 w-4" />
                  <AlertDescription className="flex flex-wrap items-center gap-3">
                    <span>{error}</span>
                    <Button variant="outline" size="sm" onClick={() => void refetch()}>
                      重新載入
                    </Button>
                  </AlertDescription>
                </Alert>
              ) : visible.length === 0 ? (
                <Card className="p-6">
                  <div className="text-center py-12 text-muted-foreground">
                    <Mic className="h-12 w-12 mx-auto mb-4 opacity-40" />
                    <p>{prompts.length === 0 ? "題庫還沒有題目" : "這個 Part 還沒有題目"}</p>
                    <p className="text-sm mt-2">
                      {prompts.length === 0 ? "老師新增題目之後就會出現在這裡" : "換一個 Part 看看"}
                    </p>
                  </div>
                </Card>
              ) : (
                <div className={GRID_CARDS}>
                  {visible.map((prompt) => (
                    <PromptCard
                      key={prompt.id}
                      prompt={prompt}
                      selected={false}
                      onSelect={setSelected}
                    />
                  ))}
                </div>
              )}
            </div>
          )}

          {/* 我練過的 */}
          <div>
            <h2 className="mb-4 text-lg font-semibold text-foreground">我練過的</h2>
            <RecordingHistory
              items={history.items}
              loading={history.loading}
              error={history.error}
              playbackUrl={history.playbackUrl}
              onRetry={() => void history.refetch()}
            />
          </div>
        </div>
      </div>
    </Layout>
  );
};

export default StudentSpeaking;
