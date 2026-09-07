import { useCallback, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  friendlyGradingError,
  type FriendlyError,
  type GradingPhase,
} from "@/lib/writing/gradingErrors";

/**
 * 觸發一篇作文的 AI 批改。老師只按一次，這裡把整條流程跑完。
 *
 * 分析是兩個以上的請求（見 api/analyze-writing.ts）：
 *   Stage 1 四軸 →（某一支沒過驗證就再一次請求，只重跑那一支）→ 綜合層
 * 每次請求各自擁有完整的 50 秒期限，所以驗證重試不會把整體推爆。
 *
 * 授權在伺服器端與資料庫層各做一次；這裡送的是呼叫者的 JWT，
 * 不是靠前端把按鈕藏起來。
 */

/** 前端的獨立保險，與伺服器每支 pass 的重試預算無關。 */
const MAX_STAGE1_REQUESTS = 4;

interface RunResult {
  ok: boolean;
  error?: FriendlyError;
}

export function useWritingGrading() {
  const [runningEssayId, setRunningEssayId] = useState<string | null>(null);
  const [phase, setPhase] = useState<GradingPhase>("idle");
  const [elapsedMs, setElapsedMs] = useState(0);

  const call = useCallback(
    async (essayId: string, mode: "stage1" | "synthesis", token: string) => {
      const res = await fetch("/api/analyze-writing", {
        method: "POST",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify({ essayId, mode }),
      });
      // 函式在平台上崩潰時回的是 HTML 錯誤頁，不是 JSON。
      const raw = await res.text();
      let body: unknown;
      try {
        body = JSON.parse(raw);
      } catch {
        body = { rawResponse: raw.slice(0, 2000) };
      }
      return { ok: res.ok, status: res.status, body };
    },
    [],
  );

  const run = useCallback(
    async (essayId: string): Promise<RunResult> => {
      setRunningEssayId(essayId);
      setPhase("stage1");
      setElapsedMs(0);
      const startedAt = Date.now();
      const ticker = setInterval(() => setElapsedMs(Date.now() - startedAt), 1000);

      try {
        const { data: session } = await supabase.auth.getSession();
        const token = session.session?.access_token;
        if (!token) {
          return {
            ok: false,
            error: { message: "找不到登入狀態。", action: "請重新登入後再試。", retryable: false },
          };
        }

        let stage1Done = false;
        for (let round = 1; round <= MAX_STAGE1_REQUESTS && !stage1Done; round += 1) {
          setPhase(round === 1 ? "stage1" : "stage1-retry");
          const r = await call(essayId, "stage1", token);
          if (!r.ok) return { ok: false, error: friendlyGradingError(r.status, r.body) };

          const body = r.body as { retryRequired?: boolean };
          if (body?.retryRequired) continue;
          stage1Done = true;
        }
        if (!stage1Done) {
          return {
            ok: false,
            error: {
              message: "AI 重試多次後仍未通過完整性檢查。",
              action: "稍後再試一次。已經分析完成的部分會保留。",
              retryable: true,
            },
          };
        }

        setPhase("synthesis");
        const s = await call(essayId, "synthesis", token);
        if (!s.ok) return { ok: false, error: friendlyGradingError(s.status, s.body) };

        setPhase("done");
        return { ok: true };
      } catch (err) {
        return {
          ok: false,
          error: friendlyGradingError(0, { error: err instanceof Error ? err.message : undefined }),
        };
      } finally {
        clearInterval(ticker);
        setRunningEssayId(null);
      }
    },
    [call],
  );

  return { run, runningEssayId, phase, elapsedMs };
}
