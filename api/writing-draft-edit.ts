/**
 * POST /api/writing-draft-edit —— 對一篇【還沒送出】的作文做維護
 *
 * 請求：
 *   { "essayId": "<uuid>", "action": "delete" }
 *   { "essayId": "<uuid>", "action": "replace-page",
 *     "pageNumber": 1, "rawPath": "<uid>/<essayId>/1-<uuid>.jpg",
 *     "rawBytes": 1234567, "rawMime": "image/jpeg" }
 *
 * 回應：
 *   { deleted: true, files: { removed, missing } }
 *   { replaced: true, staleFiles: number }
 *
 *
 * 為什麼兩個動作合在同一支端點
 *
 *   Vercel Hobby 方案一個部署最多 12 支 serverless function，而這個專案
 *   已經用滿。拆成兩支就是第 13 支，部署會整個失敗 —— 實測過：三個吃同一個
 *   repo 的 Vercel 專案同時變紅，而本機 build 完全正常（那是部署限制，
 *   不是建置錯誤，所以 vite build 看不到）。
 *
 * 🛑 合併的前提是【兩個動作的授權模型完全一樣】：本人或管理員、而且只限 DRAFT。
 *    所以授權在這裡做一次就夠，兩條路徑不可能走到不同的結論。
 *
 *    api/writing-queue-enqueue.ts 上面那段「不要把兩件事塞進同一支端點」講的是
 *    另一種情況 —— 那裡是【兩種身分】（老師的 JWT 與排程的 secret）。
 *    一個入口同時接受兩種身分才是授權漏洞的長相；同一種身分的兩個動作不是。
 *    ⚠️ 哪天這兩個動作的授權開始分歧（例如刪除要改成只有老師能做），
 *       就必須拆開，不能靠在 action 裡面多加一個 if。
 *
 *
 * 為什麼原檔不從這支端點上傳（replace-page）
 *
 *   Vercel serverless 的請求本文上限約 4.5 MB，10 MB 的手機照片穿不過來。
 *   所以瀏覽器先用自己的身分直傳 Storage（writing-raw 的 RLS 只讓他寫自己的
 *   資料夾），再把路徑交給這支端點。路徑歸屬因此必須在這裡驗 —— 見 _lib/draftEdit.ts。
 */

import {
  deleteDraftEssay,
  deleteFailed,
  replaceFailed,
  replaceImagePage,
} from "./_lib/draftEdit.js";
import {
  isDenied,
  requireEssayAccess,
  type VercelLikeRequest,
  type VercelLikeResponse,
} from "./_lib/essayAuth.js";

export const config = {
  maxDuration: 30,
};

const MAX_PAGES = 5;

export default async function handler(req: VercelLikeRequest, res: VercelLikeResponse) {
  if (req.method !== "POST") {
    return res.status(405).json({ error: "只接受 POST" });
  }

  const body = (req.body ?? {}) as Record<string, unknown>;
  const essayId = typeof body.essayId === "string" ? body.essayId : "";
  const action = typeof body.action === "string" ? body.action : "";

  // 授權排在所有其他檢查之前：參數格式的錯誤訊息也是資訊，
  // 未通過授權的呼叫端只該看到 401/403。
  const access = await requireEssayAccess(req, essayId);
  if (isDenied(access)) {
    return res.status(access.status).json({ error: access.error });
  }
  const { admin, essay } = access;

  // 兩個動作共用的前提：只有草稿能改。
  // 已送出的作文不可變，而且底下七張子表全是 ON DELETE CASCADE。
  if (essay.status !== "DRAFT") {
    return res.status(409).json({
      error:
        action === "replace-page"
          ? "已經送出的作文不能再更換照片"
          : "已經送出的作文不能刪除。如果真的需要移除，請聯絡老師。",
    });
  }

  if (action === "delete") {
    const outcome = await deleteDraftEssay(admin, essayId);
    if (deleteFailed(outcome)) {
      return res.status(outcome.status).json({ error: outcome.error });
    }
    return res.status(200).json({ deleted: true, files: outcome.files });
  }

  if (action === "replace-page") {
    const pageNumber = typeof body.pageNumber === "number" ? body.pageNumber : NaN;
    const rawPath = typeof body.rawPath === "string" ? body.rawPath : "";

    if (!Number.isInteger(pageNumber) || pageNumber < 1 || pageNumber > MAX_PAGES) {
      return res.status(400).json({ error: "頁碼不正確" });
    }
    if (!rawPath) {
      return res.status(400).json({ error: "缺少檔案路徑" });
    }

    const outcome = await replaceImagePage(admin, {
      essayId,
      pageNumber,
      rawPath,
      rawBytes: typeof body.rawBytes === "number" ? body.rawBytes : null,
      rawMime: typeof body.rawMime === "string" ? body.rawMime : null,
      // 🛑 用作文擁有者，不是呼叫者：管理員代為重傳時，路徑仍然必須在
      //    學生自己的資料夾底下（Storage 的路徑規則綁的是學生）。
      ownerId: essay.student_id,
    });

    if (replaceFailed(outcome)) {
      return res.status(outcome.status).json({ error: outcome.error });
    }
    return res.status(200).json({ replaced: true, staleFiles: outcome.staleFiles });
  }

  return res.status(400).json({ error: "不支援的動作" });
}
