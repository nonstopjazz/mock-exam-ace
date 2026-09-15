import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, Mic } from "lucide-react";
import { useFeatureEnabled } from "@/hooks/learn/useFeatureEnabled";
import { FEATURE } from "@/config/speaking";
import { SectionHead, SURFACE, TYPE } from "./shared";

/**
 * 口說練習的入口。
 *
 * 🛑 沒有被開放的人【整區不出現】，連「敬請期待」都沒有。
 *    顯示一個進不去的入口，只會讓學生一直問老師為什麼點不開；
 *    這個功能本來就是分批開放的，沒開放的人不需要知道它存在。
 *
 * 讀取中也不佔位（回 null）。這一區是選配的，閃一下骨架反而更吵。
 */
export const SpeakingEntry = () => {
  const navigate = useNavigate();
  const { enabled } = useFeatureEnabled(FEATURE);

  if (!enabled) return null;

  return (
    <section id="section-speaking">
      <SectionHead title="口說練習" />
      <Card className={`p-6 ${SURFACE.raised}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex items-center gap-3 min-w-0">
            <div className="p-3 rounded-lg bg-secondary/10 shrink-0">
              <Mic className="h-6 w-6 text-secondary" />
            </div>
            <div className="min-w-0">
              <p className={TYPE.cardTitle}>挑一題，講給自己聽</p>
              <p className={TYPE.actionMeta}>錄起來之後可以回頭比較</p>
            </div>
          </div>
          <Button
            variant="outline"
            className="shrink-0"
            onClick={() => navigate("/learn/student/speaking")}
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
