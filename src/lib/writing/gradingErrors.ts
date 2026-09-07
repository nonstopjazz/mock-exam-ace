/**
 * 把技術錯誤翻成老師看得懂的話。
 *
 * 批改頁以前直接把原始 JSON 丟出來（`{"error":"...","issueCount":7}`），
 * 老師看到那個既不知道發生什麼事，也不知道該不該重試。
 *
 * 這裡只做「訊息呈現」，不改變任何行為：能重試的仍然能重試，
 * 該失敗的仍然失敗。診斷細節留在資料庫的 telemetry 裡給我們看。
 */
export interface FriendlyError {
  /** 一句話說明發生什麼事 */
  message: string;
  /** 老師現在可以做什麼 */
  action: string;
  /** 再按一次批改是合理的嗎 */
  retryable: boolean;
}

export function friendlyGradingError(httpStatus: number, body: unknown): FriendlyError {
  const raw = (body ?? {}) as {
    error?: string;
    failedPass?: string;
    hitDeadline?: boolean;
    retryable?: boolean;
    rawResponse?: string;
  };

  if (httpStatus === 0) {
    return {
      message: "連線失敗，沒有送出批改請求。",
      action: "檢查網路後再按一次。學生的作文沒有受到影響。",
      retryable: true,
    };
  }

  if (httpStatus === 401 || httpStatus === 403) {
    return {
      message: "你的登入已經過期，或這個帳號沒有批改權限。",
      action: "重新登入之後再試一次。",
      retryable: false,
    };
  }

  if (httpStatus === 409) {
    return {
      message: "這篇作文正在批改中。",
      action: "等目前這次跑完再試——重複觸發不會加快，只會多花一次 AI 費用。",
      retryable: false,
    };
  }

  if (httpStatus === 404) {
    return {
      message: "找不到這篇作文的分析紀錄。",
      action: "請先執行一次完整批改。",
      retryable: true,
    };
  }

  if (httpStatus === 400) {
    // 最常見的是「這篇作文沒有正規文字」——那不是系統錯誤，是資料還沒到位。
    return {
      message: raw.error ?? "這篇作文還不能批改。",
      action: "確認學生已經送出作文內容，再試一次。",
      retryable: false,
    };
  }

  if (raw.hitDeadline) {
    return {
      message: "這次批改超過單次執行的時間上限，被系統中斷了。",
      action: "再按一次批改。已經分析完成的部分會保留，不會重跑。",
      retryable: true,
    };
  }

  if (httpStatus === 502) {
    return {
      message: "AI 這次的回覆沒有通過完整性檢查，系統擋下了不完整的結果。",
      action: "再按一次批改。這通常一次就會過——寧可擋下來，也不要給學生半套分析。",
      retryable: true,
    };
  }

  if (raw.rawResponse) {
    return {
      message: "批改服務沒有正常回應。",
      action: "稍等一下再試一次。若持續發生，請告知工程端。",
      retryable: true,
    };
  }

  return {
    message: raw.error ?? "批改過程發生未預期的問題。",
    action: "再試一次。若持續發生，請告知工程端。",
    retryable: raw.retryable ?? true,
  };
}

/** 批改進行到哪裡。老師會等超過一分鐘，畫面上要說得出現在在做什麼。 */
export type GradingPhase = "idle" | "stage1" | "stage1-retry" | "synthesis" | "done";

export const GRADING_PHASE_TEXT: Record<GradingPhase, string> = {
  idle: "",
  stage1: "正在分析寫作能力、錯誤與高分特徵…",
  "stage1-retry": "正在補齊沒通過檢查的部分…",
  synthesis: "正在整理成給學生看的總結…",
  done: "批改完成",
};

/** 依實測，弱作文最久約 65 秒。給老師一個心理預期，不是精確倒數。 */
export const GRADING_EXPECTED_SECONDS = 60;
