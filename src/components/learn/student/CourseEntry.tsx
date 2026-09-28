import { useNavigate } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { ChevronRight, PlayCircle } from "lucide-react";
import { useFeatureEnabled } from "@/hooks/learn/useFeatureEnabled";
import { FEATURE_COURSE } from "@/config/gatedFeatures";
import { SectionHead, SURFACE, TYPE } from "./shared";

/**
 * 影片課程的入口。與 ReadingEntry / SpeakingEntry 同一套規則。
 *
 * 🛑 沒有被開放的人【整區不出現】。顯示一個進不去的入口，只會讓學生
 *    一直問老師為什麼點不開。
 *
 * 🛑 這裡只決定畫面出不出現。真正的把關在 learn_course_list() 與
 *    learn_course_playback() 裡——藏起來的頁面照樣打得到 RPC。
 *
 * ⚠️ 開放了「影片課程」這個功能，不等於這個人看得到每一門課。免費課
 *    才不用個別選課；其餘還要在 learn_course_access 裡有一列。
 */
export const CourseEntry = () => {
  const navigate = useNavigate();
  const { enabled } = useFeatureEnabled(FEATURE_COURSE);

  if (!enabled) return null;

  return (
    <section id="section-course">
      <SectionHead title="影片課程" />
      <Card className={`p-6 ${SURFACE.raised}`}>
        <div className="flex items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <div className="shrink-0 rounded-lg bg-secondary/10 p-3">
              <PlayCircle className="h-6 w-6 text-secondary" />
            </div>
            <div className="min-w-0">
              <p className={TYPE.cardTitle}>看課程影片</p>
              <p className={TYPE.actionMeta}>照自己的步調上，看到哪裡會記住</p>
            </div>
          </div>
          <Button variant="outline" className="shrink-0" onClick={() => navigate("/courses")}>
            <span className="hidden sm:inline">看課程</span>
            <span className="sm:hidden">課程</span>
            <ChevronRight className="h-4 w-4" />
          </Button>
        </div>
      </Card>
    </section>
  );
};
