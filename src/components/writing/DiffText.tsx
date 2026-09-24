import type { DiffSegment } from "@/lib/writing/correctionDiff";

/**
 * 把 diffCorrection() 算出來的片段畫出來，改動的地方標色。
 *
 * 學生打開報告只想知道一件事：【我哪裡錯了】。兩行純文字並排時，
 * 短句看得出來，長句看不出來——而 production 有 15.2% 的 correction
 * 是整句改寫。所以差異要由畫面指出來，不要期待學生自己逐字比對。
 *
 * 🛑 這個元件【不自己算 diff】。呼叫端算一次，兩行共用同一個結果 ——
 *    分別算兩次不只是浪費，兩邊還可能算出不一致的切法。
 *
 * 🛑 顏色只是輔助。worthShowing 為 false 時呼叫端應該直接給純文字，
 *    不要走這裡——整段紅、整段綠跟沒標一樣，只是更吵。
 */
export function DiffText({ segments }: { segments: DiffSegment[] }) {
  return (
    <>
      {segments.map((seg, i) => {
        if (seg.kind === "removed") {
          return (
            <span key={i} className="bg-destructive/15 text-destructive rounded-sm px-0.5">
              {seg.text}
            </span>
          );
        }
        if (seg.kind === "added") {
          return (
            <span key={i} className="bg-success/15 text-success rounded-sm px-0.5 font-medium">
              {seg.text}
            </span>
          );
        }
        return <span key={i}>{seg.text}</span>;
      })}
    </>
  );
}
