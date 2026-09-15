import { useState } from "react";
import { Layout } from "@/components/layout/Layout";
import { Mic } from "lucide-react";
import { useSpeakingHistory } from "@/hooks/learn/useSpeakingHistory";
import { usePracticedPrompts } from "@/hooks/learn/usePracticedPrompts";
import { PromptPicker } from "@/components/learn/speaking/PromptPicker";
import { SpeakingRecorderPanel } from "@/components/learn/speaking/SpeakingRecorderPanel";
import { RecordingHistory } from "@/components/learn/speaking/RecordingHistory";
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
const StudentSpeaking = () => {
  const history = useSpeakingHistory();
  const practicedPrompts = usePracticedPrompts();
  const [selected, setSelected] = useState<SpeakingPrompt | null>(null);

  /** 上傳成功：練習紀錄與「練過的」都要更新，綠點才會立刻出現在清單上。 */
  const handleSaved = () => {
    void history.refetch();
    void practicedPrompts.refetch();
  };

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
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
                onSaved={handleSaved}
                onChangePrompt={() => setSelected(null)}
              />
            </div>
          ) : (
            <div className="mb-10">
              <PromptPicker practiced={practicedPrompts.practiced} onSelect={setSelected} />
            </div>
          )}

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
