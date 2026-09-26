import type { CanonicalImportItem } from "./canonicalPayload";

/**
 * 把 canonical payload 分批送進 reading_import_batch()。
 *
 * 🛑 這個模組【不 import supabase】。呼叫方式由外面注入，
 *    所以它可以用假的 caller 測完整條流程——分批、批次接續、
 *    p_final 的位置、出錯就停——而不需要資料庫。
 *
 * 🛑 瀏覽器【不做逐列 INSERT】。一次 RPC 一批，授權與驗證都在資料庫那側。
 *    前端逐列寫入等於把「什麼算合法」交給瀏覽器決定。
 */

export interface ImportPassageResult {
  passage_id: string;
  status: "imported" | "skipped" | "conflict" | "blocked" | "failed" | string;
  reason: string | null;
  publish_ready?: boolean;
}

export interface ImportCounts {
  imported: number;
  skipped: number;
  conflict: number;
  blocked: number;
  failed: number;
}

export interface ImportChunkOutcome {
  /** 1 起算，對應畫面上的「第 N 批」 */
  index: number;
  total: number;
  passageCount: number;
  counts: ImportCounts;
  results: ImportPassageResult[];
  batchStatus: string | null;
}

export interface ImportOutcome {
  ok: boolean;
  batchId: string | null;
  chunks: ImportChunkOutcome[];
  totals: ImportCounts;
  /** 出錯時停在第幾批（1 起算）。沒出錯是 null */
  stoppedAtChunk: number | null;
  errorMessage: string | null;
}

export interface RpcArgs {
  p_passages: CanonicalImportItem[];
  p_filename: string;
  p_batch_id: string | null;
  p_final: boolean;
}

/**
 * 🛑 回傳 `{ data, error }`，【不 throw】。
 *    supabase.rpc() 就是這個形狀——它失敗時 resolve 一個帶 error 的物件，
 *    不會 reject。用 try/catch 包它，錯誤會安靜地穿過去，
 *    而畫面會顯示「匯入完成」。
 */
export type RpcCaller = (args: RpcArgs) => Promise<{
  data: unknown;
  error: { message: string } | null;
}>;

const ZERO: ImportCounts = { imported: 0, skipped: 0, conflict: 0, blocked: 0, failed: 0 };

const num = (v: unknown): number => {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
};

const readCounts = (chunk: unknown): ImportCounts => {
  const c = (chunk ?? {}) as Record<string, unknown>;
  return {
    imported: num(c.imported), skipped: num(c.skipped), conflict: num(c.conflict),
    blocked: num(c.blocked), failed: num(c.failed),
  };
};

export const DEFAULT_CHUNK_SIZE = 20;

export async function runImport(
  payloads: CanonicalImportItem[],
  filename: string,
  opts: {
    call: RpcCaller;
    chunkSize?: number;
    onProgress?: (outcome: ImportChunkOutcome, totals: ImportCounts) => void;
  },
): Promise<ImportOutcome> {
  const size = opts.chunkSize ?? DEFAULT_CHUNK_SIZE;
  const chunks: CanonicalImportItem[][] = [];
  for (let i = 0; i < payloads.length; i += size) chunks.push(payloads.slice(i, i + size));

  const done: ImportChunkOutcome[] = [];
  const totals: ImportCounts = { ...ZERO };
  let batchId: string | null = null;

  const fail = (index: number, message: string): ImportOutcome => ({
    ok: false, batchId, chunks: done, totals,
    stoppedAtChunk: index, errorMessage: message,
  });

  for (let i = 0; i < chunks.length; i += 1) {
    const chunk = chunks[i];
    const { data, error } = await opts.call({
      p_passages: chunk,
      p_filename: filename,
      p_batch_id: batchId,
      // 🛑 只有【最後一批】收尾。提早收尾的話，後面幾批會找不到
      //    進行中的批次，於是各自開新的，帳本就分岔了。
      p_final: i === chunks.length - 1,
    });

    // 🛑 先看 error。rpc 不會 throw，只會 resolve 一個帶 error 的物件。
    if (error) return fail(i + 1, error.message);

    const payload = data as Record<string, unknown> | null;
    if (!payload || typeof payload !== "object") {
      // 🛑 沒有 error 但回傳不是預期的形狀 —— 當成失敗，不要當成 0 筆成功。
      //    「安靜的 0」是最難發現的那種錯。
      return fail(i + 1, "RPC 回傳的格式不對（沒有 error，但也沒有結果）");
    }

    const counts = readCounts(payload.chunk);
    const outcome: ImportChunkOutcome = {
      index: i + 1,
      total: chunks.length,
      passageCount: chunk.length,
      counts,
      results: Array.isArray(payload.results)
        ? (payload.results as ImportPassageResult[])
        : [],
      batchStatus: ((payload.batch as Record<string, unknown> | undefined)?.status as string) ?? null,
    };

    // 🛑 第一批回傳的 batch_id 要帶著走，後面每一批都接續同一個批次。
    //    漏掉的話每一批都會開新批次，資料是對的但帳本對不起來。
    const returned = payload.batch_id;
    if (typeof returned === "string" && returned.length > 0) batchId = returned;
    else if (batchId === null) return fail(i + 1, "RPC 沒有回傳 batch_id，無法接續下一批");

    for (const k of Object.keys(totals) as (keyof ImportCounts)[]) totals[k] += counts[k];
    done.push(outcome);
    opts.onProgress?.(outcome, { ...totals });
  }

  return { ok: true, batchId, chunks: done, totals, stoppedAtChunk: null, errorMessage: null };
}

/** 這一批有沒有需要人看的東西（imported 以外的都算） */
export const needsAttention = (r: ImportPassageResult): boolean => r.status !== "imported";
