/**
 * DeepSeek 呼叫封裝 + 結構化輸出驗證
 *
 * 這一層唯一的職責：讓「模型漏回傳 canonical node」永遠走到失敗路徑，
 * 而不是被安靜地補成 UNMEASURED。
 *
 *   驗證失敗 → 把缺漏清單原封不動餵回去，重試一次
 *   還是失敗 → 回傳 issues，由呼叫端把該次分析標成 FAILED
 *
 * 任何情況下都不會有「伺服器幫模型填空」這條路徑存在。
 */

import {
  isValidationOk,
  type PassValidation,
  type ValidationIssue,
} from "./analysisContract.js";

const DEEPSEEK_ENDPOINT = "https://api.deepseek.com/chat/completions";

export const DEFAULT_MODEL = "deepseek-chat";

export interface DeepSeekMessage {
  role: "system" | "user" | "assistant";
  content: string;
}

export class DeepSeekError extends Error {
  constructor(
    message: string,
    readonly retriable: boolean,
    /** 這一次失敗屬於哪一類。決定稽核報告怎麼歸類，不影響控制流。 */
    readonly outcome: AttemptOutcome,
  ) {
    super(message);
    this.name = "DeepSeekError";
  }
}

/**
 * 我們自己那條硬性期限的中斷理由。
 *
 * 用一個具名的類別而不是比對 "This operation was aborted" 字串，是因為那個字串
 * 是 Node 對【任何】AbortSignal 中斷的通用訊息——它同樣會出現在使用者取消、
 * 平台中斷、以及任何第三方持有 signal 的情況。2026-09-05 那次診斷之所以要
 * 繞去看 Vercel trace，就是因為錯誤訊息看起來像是 DeepSeek 或網路出問題。
 *
 * abort(reason) 的 reason 會原封不動地變成 fetch 的 rejection，所以
 * instanceof 判斷是可靠的，不必猜。
 */
export class DeadlineExceeded extends Error {
  constructor(
    /** 期限本身的長度 */
    readonly deadlineMs: number,
    /** 期限觸發時，這次 serverless 執行已經跑了多久 */
    readonly elapsedMs: number,
  ) {
    super(`已達本次執行的 ${Math.round(deadlineMs / 1000)} 秒硬性期限（已耗時 ${elapsedMs} ms）`);
    this.name = "DeadlineExceeded";
  }
}

/** 一次嘗試的結局。互斥，而且每一種都指向不同的修法。 */
export type AttemptOutcome =
  | "OK"                 // 呼叫成功且通過驗證
  | "VALIDATION_FAILED"  // 模型有回，但沒過完整覆蓋／格式驗證
  | "DEADLINE"           // 被【我們自己的】硬性期限中斷
  | "ABORTED"            // 被別人中斷的（不是我們的期限）
  | "HTTP_ERROR"         // DeepSeek 回非 2xx
  | "MALFORMED_JSON"     // 回的不是合法 JSON
  | "NO_CONTENT"         // 回了 2xx 但沒有 content
  | "NETWORK_ERROR";     // 連不上／連線中斷

/**
 * 單次嘗試的完整紀錄。
 *
 * 這是一個【陣列】而不是一個聚合數字：attempt 1 驗證失敗、attempt 2 撞上期限
 * 是最需要看清楚的組合，而聚合之後那兩件事會互相蓋掉——舊版就是把 attempt 1
 * 的缺漏清單用 attempt 2 的空陣列覆蓋掉，重試的原因因此永遠查不到。
 */
export interface AttemptRecord {
  /** 第幾次嘗試，從 1 開始 */
  attempt: number;
  /** 這一次是驗證重試（把缺漏清單餵回去）還是原始呼叫 */
  isRepair: boolean;
  /** 從這一支 pass 開始算起，這次嘗試在第幾毫秒發出 */
  offsetMs: number;
  /**
   * 這一次嘗試花了多久（含被中斷前跑掉的時間）。
   * 量到【回應主體讀完】為止，不是收到標頭就算——見 callDeepSeek 裡的說明。
   */
  latencyMs: number;
  /** 收到標頭的時間。與 latencyMs 的差距就是主體串流的時間。 */
  ttfbMs?: number;
  outcome: AttemptOutcome;
  /** 給人看的一句話。期限中斷會明確寫成期限，不會留下通用的 abort 訊息。 */
  detail?: string;
  httpStatus?: number;
  promptTokens?: number;
  completionTokens?: number;
  totalTokens?: number;
  /** 回傳 JSON 序列化後的長度。輸出量的代理指標，驗證失敗時一樣有值。 */
  responseChars?: number;
  /** 由呼叫端提供的體積指標，例如 error 這一支的 findings 筆數。 */
  shape?: Record<string, number>;
  /** 這一次的驗證缺漏數 */
  issueCount?: number;
  /** 這一次的驗證缺漏清單。逐次保留，後面的嘗試不會蓋掉前面的。 */
  issues?: readonly ValidationIssue[];
}

/** 一支 pass 的完整量測。寫進 writing_analyses.stage1_telemetry。 */
export interface PassTelemetry {
  label: string;
  /** 實際嘗試次數。這是量測值，不是常數。 */
  attempts: number;
  totalLatencyMs: number;
  finalOutcome: AttemptOutcome;
  /** 有沒有發生過驗證重試 */
  retried: boolean;
  /** 是不是被我們自己的期限砍掉的 */
  hitDeadline: boolean;
  detail?: string;
  records: AttemptRecord[];
}

/** 呼叫一次 DeepSeek，回傳解析後的 JSON。不做任何 taxonomy 相關的判斷。 */
export async function callDeepSeek(
  messages: DeepSeekMessage[],
  options: {
    apiKey: string;
    model?: string;
    signal?: AbortSignal;
    maxTokens?: number;
    temperature?: number;
    /** 有給就把這一次的量測寫進去。 */
    telemetry?: AttemptRecord;
  },
): Promise<unknown> {
  const startedAt = Date.now();
  const res = await fetch(DEEPSEEK_ENDPOINT, {
    method: "POST",
    headers: {
      // API key 只存在於伺服器端環境變數，永遠不會出現在回應或前端。
      Authorization: `Bearer ${options.apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      model: options.model ?? DEFAULT_MODEL,
      messages,
      response_format: { type: "json_object" },
      temperature: options.temperature ?? 0.2,
      max_tokens: options.maxTokens ?? 8000,
    }),
    signal: options.signal,
  });

  // ⚠️ 這裡【只】記 status，不記 latency。
  // fetch 在【收到標頭】時就 resolve，回應主體還在串流。DeepSeek 的主體要跑
  // 十幾秒，標頭卻 0.4 秒就回來——在這裡量 latency 量到的是 TTFB，不是整支呼叫。
  // 2026-09-05 的量測就吃了這個虧：每一次嘗試都顯示 0.4 秒，pass 總長卻是 19.6 秒。
  // latencyMs 移到主體讀完之後才寫。
  if (options.telemetry) {
    options.telemetry.httpStatus = res.status;
    options.telemetry.ttfbMs = Date.now() - startedAt;
  }

  if (!res.ok) {
    if (options.telemetry) options.telemetry.latencyMs = Date.now() - startedAt;
    const retriable = res.status === 429 || res.status >= 500;
    // 刻意不把 provider 的原始回應帶進錯誤訊息——它可能含有請求內容的回音。
    throw new DeepSeekError(`DeepSeek 回應 ${res.status}`, retriable, "HTTP_ERROR");
  }

  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
    usage?: {
      prompt_tokens?: number;
      completion_tokens?: number;
      total_tokens?: number;
    };
  };

  if (options.telemetry && payload.usage) {
    options.telemetry.promptTokens = payload.usage.prompt_tokens;
    options.telemetry.completionTokens = payload.usage.completion_tokens;
    options.telemetry.totalTokens = payload.usage.total_tokens;
  }
  const content = payload.choices?.[0]?.message?.content;
  if (options.telemetry) {
    // 主體已經讀完，這時候的 elapsed 才是整支呼叫真正花的時間。
    options.telemetry.latencyMs = Date.now() - startedAt;
    // 輸出量的代理指標。驗證有沒有過都記得下來，這樣「弱作文的 error 這一支
    // 到底吐了多少東西」在失敗的列上也查得到。
    options.telemetry.responseChars = content?.length ?? 0;
  }
  if (!content) {
    throw new DeepSeekError("DeepSeek 沒有回傳內容", true, "NO_CONTENT");
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new DeepSeekError("DeepSeek 回傳的不是合法 JSON", true, "MALFORMED_JSON");
  }
}

export interface PassSuccess<T> {
  ok: true;
  value: T;
  attempts: number;
  telemetry: PassTelemetry;
}

export type PassOutcome<T> = PassSuccess<T> | PassFailure;

export function isPassOk<T>(outcome: PassOutcome<T>): outcome is PassSuccess<T> {
  return outcome.ok === true;
}

export interface PassFailure {
  ok: false;
  /**
   * 最後一次驗證失敗的缺漏清單。空陣列代表【最後一次】是呼叫本身失敗。
   *
   * ⚠️ 這一欄會被後面的嘗試蓋掉，所以它不是完整的歷史。要看「attempt 1 為什麼
   * 需要重試」請讀 telemetry.records[n].issues——那裡逐次保留，不會互相覆蓋。
   */
  issues: readonly ValidationIssue[];
  detail: string;
  attempts: number;
  telemetry: PassTelemetry;
  /**
   * 最後一次【有回來但沒過驗證】的原始輸出。
   *
   * 跨請求的重試靠它把「修正」做成修正：下一次請求把這份輸出與缺漏清單一起
   * 餵回去，模型才知道要改哪裡，而不是從零重寫一份同樣可能出錯的東西。
   * 呼叫失敗（中斷／HTTP／非 JSON）時沒有這個值。
   */
  lastRaw?: unknown;
}

/** 把驗證失敗的缺漏清單整理成餵回模型的修正指示。 */
export function repairInstruction(issues: readonly ValidationIssue[]): string {
  const missing = issues.filter((i) => i.kind === "MISSING_NODE");
  const others = issues.filter((i) => i.kind !== "MISSING_NODE");

  const lines: string[] = [
    "你上一次的輸出沒有通過結構驗證。請重新輸出完整的 JSON，修正以下問題：",
  ];

  if (missing.length > 0) {
    lines.push(
      "",
      `【缺少 ${missing.length} 個必填的 canonical node】必須全部補上。`,
      "注意：如果本篇作文確實沒有提供足夠證據，你要明確輸出 UNMEASURED 並寫出理由，",
      "而不是把這個節點省略掉。省略等於沒有分析，這與「判定為 UNMEASURED」是兩件事。",
      ...missing.map((i) => `  - ${i.detail}`),
    );
  }

  if (others.length > 0) {
    lines.push("", "【其他格式問題】", ...others.map((i) => `  - [${i.kind}] ${i.path}：${i.detail}`));
  }

  return lines.join("\n");
}

/**
 * 跑一支 pass：呼叫 → 驗證 →（失敗就帶著缺漏清單重試）→ 再驗證。
 *
 * @param maxAttempts 總嘗試次數（含第一次）。預設 2：一次原始 + 一次修正。
 */
export async function runValidatedPass<T>(args: {
  label: string;
  messages: DeepSeekMessage[];
  validate: (raw: unknown) => PassValidation<T>;
  apiKey: string;
  model?: string;
  signal?: AbortSignal;
  maxTokens?: number;
  maxAttempts?: number;
  /**
   * 從【尚未驗證】的原始回傳裡取出體積指標，例如 error 這一支的 findings 筆數。
   * 驗證失敗時 value 拿不到，但體積問題往往正是失敗的原因，所以要在這裡取。
   * 丟出例外不影響流程——量測不能反過來害死執行。
   */
  describe?: (raw: unknown) => Record<string, number>;
}): Promise<PassOutcome<T>> {
  const maxAttempts = args.maxAttempts ?? 2;
  const messages = [...args.messages];
  const passStartedAt = Date.now();
  const records: AttemptRecord[] = [];
  let lastIssues: readonly ValidationIssue[] = [];
  let lastDetail = "";
  let lastRaw: unknown;

  /** 把這一支的紀錄收成 PassTelemetry。finalOutcome 一律取最後一次的結局。 */
  const summarise = (): PassTelemetry => {
    const last = records[records.length - 1];
    return {
      label: args.label,
      attempts: records.length,
      totalLatencyMs: Date.now() - passStartedAt,
      finalOutcome: last?.outcome ?? "NETWORK_ERROR",
      retried: records.length > 1,
      hitDeadline: records.some((r) => r.outcome === "DEADLINE"),
      detail: lastDetail || undefined,
      records,
    };
  };

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    const record: AttemptRecord = {
      attempt,
      isRepair: attempt > 1,
      offsetMs: Date.now() - passStartedAt,
      latencyMs: 0,
      outcome: "NETWORK_ERROR",
    };
    records.push(record);

    let raw: unknown;
    try {
      raw = await callDeepSeek(messages, {
        apiKey: args.apiKey,
        model: args.model,
        signal: args.signal,
        maxTokens: args.maxTokens,
        telemetry: record,
      });
    } catch (err) {
      // callDeepSeek 只在收到回應之後才填 latencyMs；中斷與連線失敗都到不了那裡，
      // 所以這裡補上——「被砍之前跑了多久」正是我們最需要的數字。
      if (record.latencyMs === 0) {
        record.latencyMs = Date.now() - passStartedAt - record.offsetMs;
      }

      // 是不是【我們自己】那條期限？用具名類別判斷，不比對字串。
      // Node 對任何 AbortSignal 中斷都給同一句 "This operation was aborted"，
      // 光看訊息分不出是我們的碼表、平台、還是別的東西。
      if (err instanceof DeadlineExceeded) {
        record.outcome = "DEADLINE";
        record.detail =
          `${err.message}，中斷於第 ${attempt} 次嘗試` +
          (attempt > 1 ? "（這一次是驗證重試）" : "");
        lastDetail = `${args.label}：${record.detail}`;
        lastIssues = [];
        return { ok: false, issues: [], detail: lastDetail, attempts: attempt, telemetry: summarise() };
      }

      const aborted = (err as { name?: string }).name === "AbortError";
      const message = err instanceof Error ? err.message : "DeepSeek 呼叫失敗";
      record.outcome = err instanceof DeepSeekError ? err.outcome : aborted ? "ABORTED" : "NETWORK_ERROR";
      record.detail = message;
      lastDetail = `${args.label}：${message}`;
      lastIssues = [];

      const retriable = err instanceof DeepSeekError ? err.retriable : false;
      // 中斷不重試——時間本來就是我們沒有的東西。
      if (!retriable || aborted) {
        return { ok: false, issues: [], detail: lastDetail, attempts: attempt, telemetry: summarise() };
      }
      continue;
    }

    if (args.describe) {
      try {
        record.shape = args.describe(raw);
      } catch {
        // 量測失敗就不記，不能讓它影響這一支的結果。
      }
    }

    const result = args.validate(raw);
    if (isValidationOk(result)) {
      record.outcome = "OK";
      return { ok: true, value: result.value, attempts: attempt, telemetry: summarise() };
    }

    // 這一次的缺漏清單記在【這一次】的紀錄上。後面的嘗試寫自己的那一筆，
    // 不會回頭覆蓋——「attempt 1 為什麼要重試」因此永遠查得到。
    record.outcome = "VALIDATION_FAILED";
    record.issueCount = result.issues.length;
    record.issues = result.issues;
    record.detail = `結構化輸出驗證失敗（${result.issues.length} 項）`;

    lastIssues = result.issues;
    lastRaw = raw;
    lastDetail = `${args.label}：結構化輸出驗證失敗（${result.issues.length} 項）`;

    if (attempt < maxAttempts) {
      messages.push(
        { role: "assistant", content: JSON.stringify(raw) },
        { role: "user", content: repairInstruction(result.issues) },
      );
    }
  }

  return {
    ok: false,
    issues: lastIssues,
    detail: lastDetail,
    attempts: records.length,
    telemetry: summarise(),
    lastRaw,
  };
}
