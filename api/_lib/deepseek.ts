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
} from "../../src/lib/writing/analysisContract";

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
  ) {
    super(message);
    this.name = "DeepSeekError";
  }
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
  },
): Promise<unknown> {
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

  if (!res.ok) {
    const retriable = res.status === 429 || res.status >= 500;
    // 刻意不把 provider 的原始回應帶進錯誤訊息——它可能含有請求內容的回音。
    throw new DeepSeekError(`DeepSeek 回應 ${res.status}`, retriable);
  }

  const payload = (await res.json()) as {
    choices?: { message?: { content?: string } }[];
  };
  const content = payload.choices?.[0]?.message?.content;
  if (!content) {
    throw new DeepSeekError("DeepSeek 沒有回傳內容", true);
  }

  try {
    return JSON.parse(content);
  } catch {
    throw new DeepSeekError("DeepSeek 回傳的不是合法 JSON", true);
  }
}

export interface PassSuccess<T> {
  ok: true;
  value: T;
  attempts: number;
}

export type PassOutcome<T> = PassSuccess<T> | PassFailure;

export function isPassOk<T>(outcome: PassOutcome<T>): outcome is PassSuccess<T> {
  return outcome.ok === true;
}

export interface PassFailure {
  ok: false;
  /** 完整覆蓋／格式驗證的缺漏清單。空陣列代表是呼叫本身失敗，不是驗證失敗。 */
  issues: readonly ValidationIssue[];
  detail: string;
  attempts: number;
}

/** 把驗證失敗的缺漏清單整理成餵回模型的修正指示。 */
function repairInstruction(issues: readonly ValidationIssue[]): string {
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
}): Promise<PassOutcome<T>> {
  const maxAttempts = args.maxAttempts ?? 2;
  const messages = [...args.messages];
  let lastIssues: readonly ValidationIssue[] = [];
  let lastDetail = "";

  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    let raw: unknown;
    try {
      raw = await callDeepSeek(messages, {
        apiKey: args.apiKey,
        model: args.model,
        signal: args.signal,
        maxTokens: args.maxTokens,
      });
    } catch (err) {
      const message = err instanceof Error ? err.message : "DeepSeek 呼叫失敗";
      const retriable = err instanceof DeepSeekError ? err.retriable : false;
      lastDetail = `${args.label}：${message}`;
      lastIssues = [];
      // 逾時（AbortError）不重試——時間本來就是我們沒有的東西。
      if (!retriable || (err as { name?: string }).name === "AbortError") {
        return { ok: false, issues: [], detail: lastDetail, attempts: attempt };
      }
      continue;
    }

    const result = args.validate(raw);
    if (isValidationOk(result)) {
      return { ok: true, value: result.value, attempts: attempt };
    }

    lastIssues = result.issues;
    lastDetail = `${args.label}：結構化輸出驗證失敗（${result.issues.length} 項）`;

    if (attempt < maxAttempts) {
      messages.push(
        { role: "assistant", content: JSON.stringify(raw) },
        { role: "user", content: repairInstruction(result.issues) },
      );
    }
  }

  return { ok: false, issues: lastIssues, detail: lastDetail, attempts: maxAttempts };
}
