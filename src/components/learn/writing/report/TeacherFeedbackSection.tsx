import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { MessageSquareQuote } from "lucide-react";
import type { TeacherFeedback } from "@/hooks/learn/useTeacherFeedback";

/**
 * 學生端的「老師講評」區塊。
 *
 * 兩件事刻意做得很明顯：
 *   1. 它與 AI 分析在視覺與語意上都分開——AI 區塊掛「AI 分析」標籤，
 *      這裡掛「老師親筆」。學生與家長不該把自動分析誤讀成老師寫的話。
 *   2. 沒有講評就【整個不顯示】，不留空區塊——老師可能選擇在課堂上口頭講，
 *      那不是缺漏，不需要在畫面上留一個洞。
 *
 * 引號本文 + 左側細線 + 姓名日期，沿用站上既有「老師的話」的視覺語言。
 */
export const TeacherFeedbackSection = ({ feedback }: { feedback: TeacherFeedback | null }) => {
  if (!feedback) return null;

  const date = new Date(feedback.updated_at).toLocaleDateString("zh-TW", {
    year: "numeric",
    month: "long",
    day: "numeric",
  });

  return (
    <Card className="p-6 bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20">
      <div className="flex flex-wrap items-center gap-2 mb-4">
        <MessageSquareQuote className="h-5 w-5 text-secondary shrink-0" />
        <h2 className="font-semibold text-foreground">老師講評</h2>
        <Badge
          variant="outline"
          className="text-xs font-normal bg-secondary/10 text-foreground border-secondary/20"
        >
          老師親筆
        </Badge>
      </div>

      <div className="border-l-2 border-secondary/40 pl-3">
        <p className="text-sm text-foreground/90 leading-[1.7] whitespace-pre-wrap">
          {feedback.body}
        </p>
        <p className="text-xs text-muted-foreground mt-2">
          {feedback.author_name ? (
            <span className="font-medium text-foreground/70">{feedback.author_name}</span>
          ) : (
            <span className="font-medium text-foreground/70">老師</span>
          )}
          {" · "}
          {date}
        </p>
      </div>
    </Card>
  );
};
