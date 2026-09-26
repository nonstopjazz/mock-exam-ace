import type { OptionLabel } from "./studentTypes";

/**
 * 作答過程的狀態：選了什麼、改過幾次、花了多久。
 *
 * 🛑 這個模組【沒有 React、沒有 supabase、沒有 Date.now()】。
 *    時間一律由外面傳進來，所以這三件事可以精準地測：
 *    改幾次算一次、第一次選的是什麼、送出時要回報多少毫秒。
 *
 * 為什麼值得獨立出來：`answer_change_count` 與 `first_answer` 是
 * 你當初指定要保留的訊號，而它們的語意很容易寫成「差不多對」——
 * 差不多對的統計比沒有統計更糟，因為沒有人會去懷疑它。
 */

export interface QuestionAnswerState {
  /** 目前選的。還沒選是 null */
  selected: OptionLabel | null;
  /** 🛑 【第一次】選的，不是送出的那個。配合 changeCount 才分得出「改對」與「改錯」 */
  firstAnswer: OptionLabel | null;
  /** 改成【不同】選項的次數。0 = 一次就決定 */
  changeCount: number;
}

export const emptyAnswer = (): QuestionAnswerState => ({
  selected: null, firstAnswer: null, changeCount: 0,
});

/**
 * 點一個選項。
 *
 * 🛑 點同一個選項兩次【不算改】。學生手滑點兩下、或確認一下自己選的是哪個，
 *    都不該被記成猶豫——那會讓 changeCount 變成「點擊次數」而不是「改變心意次數」。
 */
export function pickOption(
  state: QuestionAnswerState,
  option: OptionLabel,
): QuestionAnswerState {
  if (state.selected === option) return state;
  return {
    selected: option,
    firstAnswer: state.firstAnswer ?? option,
    changeCount: state.selected === null ? 0 : state.changeCount + 1,
  };
}

/**
 * 這一題要回報的作答時間。
 *
 * 🛑 定義是【從上一題送出（或進入練習）到這一題送出】，不是
 *    「從第一次點選到送出」。後者只會量到「按下去到確認」的一兩秒，
 *    把真正的思考時間全部丟掉。
 *
 * ⚠️ 已知的代價：學生跳著作答時，先送出的那一題會吸收掉讀文章的時間。
 *    那其實是對的——那段時間確實花在產出那個答案之前。但如果之後要
 *    拿這個數字做分析，要記得它量的是「產出這個答案之前花了多久」，
 *    不是「這一題本身有多難」。
 */
export function elapsedMs(anchorMs: number, nowMs: number): number {
  return Math.max(0, Math.round(nowMs - anchorMs));
}

/** 六題都送出了嗎 */
export const allAnswered = (total: number, answered: number): boolean =>
  total > 0 && answered >= total;
