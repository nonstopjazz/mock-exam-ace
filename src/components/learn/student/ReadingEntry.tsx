import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { BookOpen, ChevronRight } from "lucide-react";
import { useFeatureEnabled } from "@/hooks/learn/useFeatureEnabled";
import { FEATURE_READING } from "@/config/gatedFeatures";
import { SectionHead, SURFACE, TYPE } from "./shared";

/**
 * 閱讀練習的入口。與 SpeakingEntry 同一套規則。
 *
 * 🛑 沒有被開放的人【整區不出現】，連「敬請期待」都沒有。
 *    顯示一個進不去的入口，只會讓學生一直問老師為什麼點不開。
 *
 * 🛑 這裡只決定【畫面出不出現】。真正的把關在 reading_get_passage 與
 *    reading_start_session 裡面——藏起來的頁面照樣打得到 RPC。
 *
 * 讀取中也不佔位（回 null）。這一區是選配的，閃一下骨架反而更吵。
 */
export const ReadingEntry = () => {
  const navigate = useNavigate();
  const { enabled } = useFeatureEnabled(FEATURE_READING);

  if (!enabled) return null;

  return (
    <section id="section-reading">
      <SectionHead title="閱讀練習" />
      <Card className={`p-6 ${SURFACE.raised}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-3 rounded-lg bg-primary/10 shrink-0">
              <BookOpen className="h-6 w-6 text-primary" />
            </div>
            <div className="min-w-0">
              <p className={TYPE.cardTitle}>讀一篇，練六題</p>
              <p className={TYPE.actionMeta}>做完會告訴你哪個能力最該加強</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => navigate("/learn/student/reading")}
          >
            <span className="hidden sm:inline">開始練習</span>
            <span className="sm:hidden">練習</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </section>
  );
};
