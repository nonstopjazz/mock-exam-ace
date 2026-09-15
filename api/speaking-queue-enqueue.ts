/**
 * POST /api/speaking-queue-enqueue —— 踢一腳給口說批改佇列
 *
 * 排入本身由前端直接呼叫 speaking_enqueue_grading_batch()（老師的身分，
 * 資料庫再驗 is_admin）。這支端點只負責一件事：把自我串接的鏈啟動起來。
 *
 * 為什麼要分開：
 *   排入要用【老師的身分】，踢 worker 要用【CRON_SECRET】。
 *   把兩件事塞進同一個端點，就得讓一個帶著 CRON_SECRET 的請求去代表某位老師
 *   排入工作——那條路一旦存在，secret 外流就等於任何人都能替全校排批改。
 *
 * 收件匣的「繼續處理佇列」按鈕也打這裡（鏈被平台砍斷之後重新啟動）。
 */

import { kickWorker } from "./_lib/workerKick.js";
import { requireAdmin, isDenied } from "./_lib/essayAuth.js";
import type { VercelLikeRequest, VercelLikeResponse } from "./_lib/essayAuth.js";

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  // 🛑 踢 worker 的權力只給管理員。這一腳會啟動一條會花錢的鏈。
  const gate = await requireAdmin(req);
  if (isDenied(gate)) {
    return res.status(gate.status).json({ error: gate.error });
  }

  const kick = await kickWorker(0, "/api/speaking-queue-worker");
  return res.status(200).json(kick);
}
