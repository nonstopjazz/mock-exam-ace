import { Card } from "@/components/ui/card";
import { Sparkles } from "lucide-react";
import { TYPE } from "./shared";

/**
 * 學習表現 —— 這一版沒有資料。
 *
 * 🛑 系統目前【沒有】任何持久化的多維能力模型。
 *    模擬考的題型分數不是聽 / 說 / 讀 / 寫的能力值，把它換算過去
 *    就是憑空發明資料，所以這裡不做任何推導。
 * 🛑 「尚未有足夠資料」不等於「表現弱」，所以刻意不用任何進度條、
 *    等級條或警示色 —— 空的視覺不能長得像低分。
 *
 * 這張卡保留給之後真的有能力模型時使用；在那之前它只說實話。
 */
export const AbilitySnapshot = () => (
  <Card className="p-5 h-full flex flex-col bg-card border-border/70" id="section-ability">
    <h2 className={`${TYPE.sectionHeading} mb-4`}>我的學習表現</h2>

    <div className="flex-1 flex flex-col items-center justify-center text-center py-8">
      <div className="h-11 w-11 grid place-items-center rounded-lg bg-muted/70 mb-3">
        <Sparkles className="h-5 w-5 text-muted-foreground" />
      </div>
      <p className="text-sm font-medium text-foreground">尚未有足夠資料</p>
      <p className={`${TYPE.micro} mt-2 max-w-xs`}>
        能力分析需要累積課堂觀察與練習紀錄。在有足夠依據之前，
        這裡不會顯示估計的分數。
      </p>
    </div>
  </Card>
);
