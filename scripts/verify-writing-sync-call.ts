/**
 * findings 同步呼叫的自我檢查（不需要網路，也不需要資料庫）
 *
 *   npm run verify:writing-sync-call
 *
 * 這裡把 supabase client 換成受控的替身，用來證明三件不能靠讀程式碼保證的事：
 *
 *   E1 同步失敗【不改變】分析的結果 —— syncErrorFindings 不拋出
 *   E2 同步失敗【一定留下含 analysisId 的 console.error】
 *   E3 同步成功【不留任何 log】
 *
 * 🛑 E3 看起來多餘，但它是防止 E1/E2 變成空測試的關鍵：
 *    一個「什麼都不做只印 log」的實作會同時通過 E1 與 E2。
 *    加上 E3 之後，只有真的判斷了 error 才會三條全過。
 *
 * 🛑 supabase.rpc() 不會 throw，它回傳 { data, error }。
 *    所以「只包 try/catch」的實作會通過 E1（沒拋出）但通不過 E2（沒 log）。
 */

import { syncErrorFindings } from "../api/analyze-writing";

let failures = 0;

function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    console.error(`FAIL  ${label}`);
    failures += 1;
  }
}

/** 攔下 console.error，回傳攔到的內容 */
function captureErrors<T>(fn: () => Promise<T>): Promise<{ result: T; logs: unknown[][] }> {
  const logs: unknown[][] = [];
  const original = console.error;
  console.error = (...args: unknown[]) => { logs.push(args); };
  return fn()
    .then((result) => ({ result, logs }))
    .finally(() => { console.error = original; });
}

/** 只實作 rpc 的替身。刻意不是完整的 SupabaseClient —— 這支只會用到 rpc */
function fakeClient(rpc: (fn: string, args: unknown) => unknown) {
  return { rpc } as never;
}

const ANALYSIS_ID = "11111111-2222-3333-4444-555555555555";

async function main(): Promise<void> {
  // ── E2 + E1：PostgreSQL 層錯誤（rpc 回 { error }，不 throw）────────────
  {
    let called: { fn: string; args: unknown } | null = null;
    const { logs } = await captureErrors(async () =>
      syncErrorFindings(
        fakeClient((fn, args) => {
          called = { fn, args };
          return Promise.resolve({
            data: null,
            error: { code: "42501", message: "permission denied",
                     details: "d", hint: "h" },
          });
        }),
        ANALYSIS_ID,
      ),
    );
    check(called !== null, "E0 真的呼叫了 rpc");
    check((called as unknown as { fn: string } | null)?.fn === "writing_sync_error_findings",
      "E0b 呼叫的是 writing_sync_error_findings");
    check(
      JSON.stringify((called as unknown as { args: unknown } | null)?.args)
        === JSON.stringify({ p_analysis_id: ANALYSIS_ID }),
      "E0c 參數是 p_analysis_id",
    );
    check(logs.length === 1,
      "E2 rpc 回 { error } 時留下【一筆】console.error（try/catch 捕捉不到這種失敗）");
    check(JSON.stringify(logs).includes(ANALYSIS_ID),
      "E2b log 裡帶了 analysisId（否則事後無法針對性補資料）");
    check(JSON.stringify(logs).includes("42501") && JSON.stringify(logs).includes("permission denied"),
      "E2c log 裡帶了 error code 與訊息");
  }

  // ── E1：失敗不拋出 ───────────────────────────────────────────────
  {
    let threw = false;
    try {
      await captureErrors(async () =>
        syncErrorFindings(
          fakeClient(() => Promise.resolve({ data: null, error: { message: "boom" } })),
          ANALYSIS_ID,
        ),
      );
    } catch { threw = true; }
    check(!threw, "E1 同步失敗不拋出（已完成的分析不會因此被判定失敗）");
  }

  // ── E1b：連 rpc 本身拋出也不能往外傳 ─────────────────────────────
  {
    let threw = false;
    let logs: unknown[][] = [];
    try {
      const r = await captureErrors(async () =>
        syncErrorFindings(
          fakeClient(() => { throw new Error("client misconfigured"); }),
          ANALYSIS_ID,
        ),
      );
      logs = r.logs;
    } catch { threw = true; }
    check(!threw, "E1b rpc 拋出例外時也不往外傳");
    check(logs.length >= 1 && JSON.stringify(logs).includes(ANALYSIS_ID),
      "E1c 拋出例外時同樣留下含 analysisId 的 log");
  }

  // ── E3：成功時不留 log ───────────────────────────────────────────
  {
    const { logs } = await captureErrors(async () =>
      syncErrorFindings(
        fakeClient(() => Promise.resolve({
          data: { essay_id: "x", inserted: 12, deleted: 0 }, error: null })),
        ANALYSIS_ID,
      ),
    );
    check(logs.length === 0,
      "🛑 E3 同步成功時【不留任何 log】—— 這條擋住「只印 log 不判斷」的假實作");
  }

  // ── E4：靜態檢查 —— 呼叫點真的接在標記 COMPLETED 之後 ──────────────
  {
    const { readFileSync } = await import("node:fs");
    const src = readFileSync("api/analyze-writing.ts", "utf8");
    const completeIdx = src.indexOf('.update({ status: "COMPLETED"');
    const syncIdx = src.indexOf("await syncErrorFindings(admin, analysisId)");
    check(completeIdx > 0 && syncIdx > completeIdx,
      "E4 呼叫點在標記 COMPLETED【之後】（來源還沒定案就同步等於同步到一半）");

    // E5：這個檔案裡沒有「await xxx.rpc(...) 卻不檢查 error」的呼叫。
    //
    // ⚠️ 不能只比對「await ... .rpc(...)」——那會把
    //    `const { data, error } = await caller.rpc(...)` 也算進去，
    //    因為它同樣長那個樣子。要往回看這個 statement 的開頭有沒有解構出 error。
    const rpcRe = /await\s+\w+\.rpc\(/g;
    const bare: string[] = [];
    let m: RegExpExecArray | null;
    while ((m = rpcRe.exec(src)) !== null) {
      // ⚠️ 只能往回找 `;`（statement 結束）。
      //    若把 `}` 也算進來，`const { data, error } = await ...` 會被切成只剩 ` = `，
      //    看起來就像沒有檢查 error —— 那正是這個檢查第一版的 bug。
      //    再用 300 字元封底，避免檔案開頭沒有 `;` 時往回掃到整個檔案。
      const stmtStart = Math.max(src.lastIndexOf(";", m.index), m.index - 300);
      const stmt = src.slice(stmtStart + 1, m.index);
      if (!/\berror\b/.test(stmt)) {
        bare.push(src.slice(m.index, m.index + 50).split("\n")[0]);
      }
    }
    check(bare.length === 0,
      `🛑 E5 沒有「await xxx.rpc(...) 卻不檢查 error」的呼叫` +
      (bare.length > 0 ? `\n      找到：${bare.join(" | ")}` : ""));
  }

  console.log("");
  if (failures > 0) {
    console.error(`${failures} 項失敗`);
    process.exit(1);
  }
  console.log("全部通過。");
}

main().catch((err) => {
  console.error("verify 腳本本身出錯:", err);
  process.exit(1);
});
