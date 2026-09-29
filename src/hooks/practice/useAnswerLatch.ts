import { useCallback, useRef } from "react";
import { createLatch } from "@/lib/practice/answerLatch";

/**
 * 一題只能作答一次的閂鎖。
 *
 * 🛑 用 ref 不用 state。state 要等 re-render 才看得到新值，
 *    同一個 tick 裡的第二次點擊會整個穿過去——那正是要擋的東西。
 *
 * 用法：
 *   const latch = useAnswerLatch();
 *   const handleSelect = (i) => {
 *     if (!latch.tryAcquire()) return;   // ← 第一行
 *     ...記錄作答...
 *   };
 *   const handleNext = () => { latch.release(); ... };
 */
export function useAnswerLatch() {
  const ref = useRef(createLatch());

  const tryAcquire = useCallback(() => ref.current.tryAcquire(), []);
  const release = useCallback(() => ref.current.release(), []);

  return { tryAcquire, release };
}
