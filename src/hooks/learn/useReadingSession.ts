import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  elapsedMs, emptyAnswer, pickOption, type QuestionAnswerState,
} from "@/lib/reading/answerState";
import type {
  OptionLabel, ReadingPassagePayload, ReadingSessionStart,
  ReadingSubmitResult, ReadingSummary,
} from "@/lib/reading/studentTypes";

/**
 * 一次閱讀練習的全部往返：開始 → 取題 → 逐題作答 → 結算。
 *
 * 🛑 supabase.rpc() 【不會 throw】，失敗時 resolve 一個帶 error 的物件。
 *    這裡每一次呼叫都看 error；用 try/catch 包它，錯誤會安靜穿過去，
 *    而畫面會顯示一個空白的練習。
 *
 * 🛑 答案在送出【之後】才進到前端。reading_get_passage 的回傳裡沒有正解，
 *    所以「送出前看不到答案」不是靠畫面藏起來——前端根本沒有那份資料。
 */

export interface AnsweredResult {
  selected: OptionLabel;
  isCorrect: boolean;
  /** 續做時還原的那幾題沒有解說（答案表學生讀不到），結算畫面才會補上 */
  correctAnswer: OptionLabel | null;
  explanation: string | null;
}

export interface ReadingSessionState {
  loading: boolean;
  error: string | null;
  sessionId: string | null;
  resumed: boolean;
  payload: ReadingPassagePayload | null;
  /** 每一題目前選了什麼、改過幾次 */
  drafts: Record<string, QuestionAnswerState>;
  /** 已經送出的題目與結果 */
  results: Record<string, AnsweredResult>;
  submitting: string | null;
  summary: ReadingSummary | null;
  finishing: boolean;
}

export function useReadingSession(passageId: string | undefined) {
  const [state, setState] = useState<ReadingSessionState>({
    loading: true, error: null, sessionId: null, resumed: false, payload: null,
    drafts: {}, results: {}, submitting: null, summary: null, finishing: false,
  });

  /**
   * 計時的錨點：上一次送出的時刻（一開始是進入練習的時刻）。
   * 放在 ref 而不是 state——它每次送出都會變，但不該觸發重繪。
   */
  const anchorRef = useRef<number>(Date.now());

  const load = useCallback(async () => {
    if (!passageId) return;
    setState((s) => ({ ...s, loading: true, error: null }));

    const { data: startData, error: startError } =
      await supabase.rpc("reading_start_session", { p_passage_id: passageId });
    if (startError) {
      setState((s) => ({ ...s, loading: false, error: startError.message }));
      return;
    }
    const start = startData as unknown as ReadingSessionStart;

    const { data: passageData, error: passageError } =
      await supabase.rpc("reading_get_passage", { p_passage_id: passageId });
    if (passageError) {
      setState((s) => ({ ...s, loading: false, error: passageError.message }));
      return;
    }
    const payload = passageData as unknown as ReadingPassagePayload;

    // 續做：把已經答過的還原成鎖住的狀態。
    // 🛑 走 reading_attempts（學生讀得到自己的），不是靠「重送 submit 會回第一次結果」
    //    去讀——那個行為是為了防重複計分而存在的，不是讀取介面。
    const results: Record<string, AnsweredResult> = {};
    const drafts: Record<string, QuestionAnswerState> = {};
    if (start.answered_question_ids.length > 0) {
      const { data: attempts } = await supabase
        .from("reading_attempts")
        .select("question_id, selected_answer, is_correct")
        .eq("session_id", start.session_id);
      for (const a of (attempts ?? []) as {
        question_id: string; selected_answer: OptionLabel; is_correct: boolean;
      }[]) {
        results[a.question_id] = {
          selected: a.selected_answer,
          isCorrect: a.is_correct,
          correctAnswer: null,   // 答案表學生讀不到，結算時才會有
          explanation: null,
        };
      }
    }
    for (const q of payload.questions) {
      if (!results[q.question_id]) drafts[q.question_id] = emptyAnswer();
    }

    anchorRef.current = Date.now();
    setState({
      loading: false, error: null,
      sessionId: start.session_id, resumed: start.resumed,
      payload, drafts, results, submitting: null, summary: null, finishing: false,
    });
  }, [passageId]);

  useEffect(() => { void load(); }, [load]);

  const pick = useCallback((questionId: string, option: OptionLabel) => {
    setState((s) => {
      if (s.results[questionId]) return s;          // 送出後不能再改
      const current = s.drafts[questionId] ?? emptyAnswer();
      const next = pickOption(current, option);
      if (next === current) return s;
      return { ...s, drafts: { ...s.drafts, [questionId]: next } };
    });
  }, []);

  const submit = useCallback(async (questionId: string) => {
    let draft: QuestionAnswerState | undefined;
    let sessionId: string | null = null;
    setState((s) => {
      draft = s.drafts[questionId];
      sessionId = s.sessionId;
      return s.results[questionId] || !draft?.selected
        ? s
        : { ...s, submitting: questionId, error: null };
    });
    if (!draft?.selected || !sessionId) return;

    const { data, error } = await supabase.rpc("reading_submit_answer", {
      p_session_id: sessionId,
      p_question_id: questionId,
      p_selected_answer: draft.selected,
      p_response_time_ms: elapsedMs(anchorRef.current, Date.now()),
      p_answer_change_count: draft.changeCount,
      p_first_answer: draft.firstAnswer,
    });

    if (error) {
      setState((s) => ({ ...s, submitting: null, error: error.message }));
      return;
    }
    const r = data as unknown as ReadingSubmitResult;
    anchorRef.current = Date.now();
    setState((s) => ({
      ...s,
      submitting: null,
      results: {
        ...s.results,
        [questionId]: {
          selected: r.selected_answer,
          isCorrect: r.is_correct,
          correctAnswer: r.correct_answer,
          explanation: r.explanation,
        },
      },
    }));
  }, []);

  const finish = useCallback(async () => {
    let sessionId: string | null = null;
    setState((s) => { sessionId = s.sessionId; return { ...s, finishing: true, error: null }; });
    if (!sessionId) return;
    const { data, error } = await supabase.rpc("reading_finish_session", {
      p_session_id: sessionId,
    });
    if (error) {
      setState((s) => ({ ...s, finishing: false, error: error.message }));
      return;
    }
    setState((s) => ({
      ...s, finishing: false, summary: data as unknown as ReadingSummary,
    }));
  }, []);

  return { ...state, pick, submit, finish, reload: load };
}
