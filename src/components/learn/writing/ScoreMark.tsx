import type { EssayScore } from "@/types/writing";

/**
 * 老師用紅筆寫上去的分數。
 *
 * 🛑 學生的作文卡與老師的批改頁【共用這一個】元件。
 *    複製一份出來，兩邊遲早會長歪 —— 而「老師看到的分數跟學生不一樣」
 *    是這個畫面最不該出現的落差。
 *
 * 🛑 沒有分數時【整個不出現】。給一個 0 分或「尚未評分」的框，
 *    會讓還在批改中的作文看起來像被打了低分。
 *
 * 🛑 字型用既有的 font-display（Fredoka，圓體）。這個站只有一套字型系統，
 *    為了一個小效果引進一支手寫字型，是在為了裝飾新增一個永久的相依。
 *
 * 🛑 沒評滿五項時要把分母講出來。17 / 20 有可能只評了四項，
 *    不講的話學生會以為那是完整的評分。
 */
export function ScoreMark({ score }: { score: EssayScore | null }) {
  if (!score) return null;

  const partial = score.measured < score.total;

  return (
    <span className="flex flex-col items-end leading-none">
      <span
        aria-label={`總分 ${score.score} 分，滿分 20 分${
          partial ? `，五個面向中評了 ${score.measured} 項` : ""
        }`}
        /* 微微歪一點——像順手寫上去的，不是排版排出來的。
           位移刻意很小：Card 是 overflow-hidden，挪太多會被裁掉。 */
        className="relative -rotate-[5deg] translate-x-0.5 -translate-y-0.5 select-none"
      >
        {/* 🛑 畫面上只有數字，滿分不寫出來。但 aria-label 裡要講——
            螢幕報讀器唸出一個沒有量表的「17」，那是一個沒有意義的數字。 */}
        <span className="font-hand text-[2.75rem] leading-none text-destructive tabular-nums">
          {score.score}
        </span>

        {/* 兩道底線。老師寫完分數順手劃兩下——兩道【角度不一樣】，
            一樣就會看起來像 <hr>，而不是手劃的。 */}
        <span aria-hidden="true" className="pointer-events-none absolute inset-x-0 -bottom-1">
          <span className="block h-[3px] -rotate-1 rounded-full bg-destructive" />
          <span className="mt-[3px] block h-[3px] w-[85%] rotate-[1.5deg] rounded-full bg-destructive/90" />
        </span>
      </span>

      {partial ? (
        <span className="mt-3 text-[11px] font-normal text-muted-foreground">
          評了 {score.measured} / {score.total} 項
        </span>
      ) : null}
    </span>
  );
}
