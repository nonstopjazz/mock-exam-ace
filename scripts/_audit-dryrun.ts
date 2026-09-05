/**
 * writing-audit 的空跑檢查（不打真的 API，不需要 key）
 *
 *   npm run audit:writing:dryrun
 *
 * 目的很單純：稽核腳本會花掉真錢與真時間，所以它不可以跑到一半才炸。
 * 這裡用受控的假回應把 scripts/writing-audit.ts 從頭到尾跑一次，
 * 確認它產得出報告、算得出延遲、抓得到捏造引用、也處理得了驗證失敗。
 *
 * 假回應刻意安排成：
 *   • Competency 第一次少回一個節點 → 走缺漏重試路徑
 *   • 所有引用都從【當篇作文】真的抓一句出來——因為驗證層現在會逐字比對，
 *     引用找不到出處會直接讓那一支 pass 失敗（2026-09-05 真實測試後加的）。
 *     捏造引用本身的擋下行為由 verify-writing-contract 覆蓋。
 */

import { rmSync, existsSync, readdirSync, readFileSync } from "node:fs";
import {
  COMPETENCY_CATEGORIES,
  ALL_ERROR_CODES,
  HIGH_SCORE_CATEGORIES,
} from "../api/_lib/taxonomy";

const OUT = "/tmp/writing-audit-dryrun";
rmSync(OUT, { recursive: true, force: true });
process.env.WRITING_AUDIT_OUT_DIR = OUT;
process.env.DEEPSEEK_API_KEY = "dryrun-not-a-real-key";

const featuresOf = (cats: string[]) =>
  HIGH_SCORE_CATEGORIES.filter((c) => cats.includes(c.code)).flatMap((c) => c.features);

/** 從送出的 prompt 裡把作文內文挖出來，取第一句當引用。 */
function firstSentenceOf(body: string): string {
  try {
    const parsed = JSON.parse(body) as { messages?: { role: string; content: string }[] };
    // 第一則 user 訊息就是 essayBlock()；重試回合的追加訊息排在後面。
    const userMsg = parsed.messages?.find((m) => m.role === "user")?.content ?? "";
    const marker = "內文：\n";
    const idx = userMsg.indexOf(marker);
    const text = idx >= 0 ? userMsg.slice(idx + marker.length) : userMsg;
    const sentence = text.split(/(?<=[.!?。])\s/)[0] ?? text;
    return sentence.trim().slice(0, 120);
  } catch {
    return "";
  }
}

let currentQuote = "";

const competency = (drop?: string) => ({
  categories: COMPETENCY_CATEGORIES.map((c) => ({
    code: c.code,
    summary: `${c.zh}整體觀察`,
    skills: c.skills
      .filter((s) => s.code !== drop)
      .map((s) => ({
        code: s.code,
        state: "ADEQUATE",
        reason: `${s.zh}有對應表現`,
        evidence: [{ quote: currentQuote, reason: "示例" }],
      })),
  })),
});

const errors = () => ({
  findings: [
    {
      code: "WRITE_ERR_SV_AGREEMENT",
      quote: currentQuote,
      reason: "示例錯誤。",
      correction: currentQuote + " (fixed)",
      primary_skill: "WRITE_GRAMMAR_BASIC",
    },
  ],
  coverage: ALL_ERROR_CODES.map((code) => ({
    code,
    count: code === "WRITE_ERR_SV_AGREEMENT" ? 1 : 0,
  })),
});

const highScore = (cats: string[]) => ({
  features: featuresOf(cats).map((f, i) =>
    i === 0
      ? {
          code: f.code,
          quality: "EFFECTIVE",
          reason: "用得自然",
          instances: [
            {
              quote: currentQuote,
              reason: "示例",
            },
          ],
        }
      : { code: f.code, quality: "UNMEASURED", reason: `${f.zh}本篇沒有出現`, instances: [] },
  ),
});

const synthesis = (firstFeature: string) => ({
  overall_evaluation: { level: "SOLID", headline: "結構清楚，但單複數要顧好", summary: "整體達到要求。" },
  strengths: [{ text: "理由安排清楚", refs: ["WRITE_ORG_LOGIC"] }],
  needs_work: [{ text: "主詞與動詞的一致", refs: ["WRITE_ERR_SV_AGREEMENT"] }],
  next_steps: [{ text: "寫完後把每個句子的主詞圈起來，逐一檢查動詞" }],
});

/** 依 request body 內容判斷這是哪一支 pass，回傳對應的假結果。 */
const seen = new Map<string, number>();
function respondTo(body: string): unknown {
  const isRepair = body.includes("沒有通過結構驗證");
  if (!isRepair) currentQuote = firstSentenceOf(body) || currentQuote;
  const kind = body.includes("【本次必須全部覆蓋的 23 個 skill】")
    ? "competency"
    : body.includes("【必須全部覆蓋的 16 個 error code】")
      ? "error"
      : body.includes("H1 句構與句式技巧")
        ? "hsA"
        : body.includes("H4 修辭與風格")
          ? "hsB"
          : "synthesis";

  seen.set(kind, (seen.get(kind) ?? 0) + 1);

  switch (kind) {
    case "competency":
      return isRepair ? competency() : competency("WRITE_ORG_PARAGRAPH");
    case "error":
      return errors();
    case "hsA":
      return highScore(["H1", "H2", "H3"]);
    case "hsB":
      return highScore(["H4", "H5"]);
    default:
      return synthesis(featuresOf(["H1"])[0].code);
  }
}

let calls = 0;
globalThis.fetch = (async (_url: unknown, init: { body?: string }) => {
  calls += 1;
  const content = respondTo(init?.body ?? "");
  return {
    ok: true,
    status: 200,
    json: async () => ({
      choices: [{ message: { content: JSON.stringify(content) } }],
      usage: { prompt_tokens: 4200, completion_tokens: 2600, total_tokens: 6800 },
    }),
  };
}) as unknown as typeof fetch;

// 跑真正的稽核腳本
await import("./writing-audit");

/* ── 檢查 ── */

let failed = false;
const check = (name: string, cond: boolean, detail = "") => {
  console.log(`  ${cond ? "PASS" : "FAIL"}  ${name}${detail ? ` — ${detail}` : ""}`);
  if (!cond) failed = true;
};

console.log("\n空跑檢查：");
check("三篇都產出了報告", existsSync(OUT) && readdirSync(OUT).length === 3, existsSync(OUT) ? `${readdirSync(OUT).length} 份` : "沒有目錄");

if (existsSync(OUT)) {
  const md = readdirSync(OUT).map((f) => readFileSync(`${OUT}/${f}`, "utf8"));
  const one = md[0];
  check("報告有延遲與重試表", one.includes("## 2. 延遲與重試") && one.includes("| Pass 1 Competency |"));
  check("報告記錄了缺漏重試", one.includes("| Pass 1 Competency | 通過 | ") && one.includes("| 2 | 是 |"));
  check("報告有自動查核區塊", one.includes("## 3. 自動查核"));
  // 引用現在由驗證層逐字比對，捏造的引用根本進不到報告裡
  // （擋下行為由 verify-writing-contract 覆蓋）。這裡確認快樂路徑是乾淨的。
  check(
    "三篇的引用都通過查核（stub 從當篇原文取句）",
    md.every((m) => m.includes("| 引用逐字存在於作文中 | 全部通過 |")),
  );
  check("報告有綜合層", one.includes("## 4. 綜合層（學生會看到的第一屏）"));
  check("報告有三軸明細", one.includes("## 5. 寫作能力") && one.includes("## 6. 錯誤") && one.includes("## 7. 高分特徵"));
  check("報告有人工判讀對照表", one.includes("## 8. 人工判讀對照表"));
  check("報告附上作文原文", one.includes("## 9. 作文原文"));
  check("報告有 token 與成本估算", one.includes("約 US$"));
  check("報告【沒有】洩漏 API key", md.every((m) => !m.includes("dryrun-not-a-real-key")));
}

// 每一篇的 Competency 都會走一次缺漏重試，所以是 3 篇 ×（5 支 + 1 次重試）。
check("呼叫次數符合預期（3 篇 × 6 = 18）", calls === 18, `${calls}`);

rmSync(OUT, { recursive: true, force: true });
console.log(failed ? "\n空跑檢查未通過" : "\n空跑檢查通過");
process.exit(failed ? 1 : 0);
