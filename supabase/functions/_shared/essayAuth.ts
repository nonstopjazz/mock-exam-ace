/**
 * essayAuth —— 所有作文相關 Edge Function 的共用授權前置檢查
 *
 * 決策 L13：在碰到任何特權資源（Google Vision、DeepSeek、service-role 寫入）之前，
 * 每一支作文 Edge Function 都必須依序完成四個步驟：
 *
 *   1. 驗證呼叫端的 JWT
 *   2. 解析呼叫者身分
 *   3. 檢查該身分對這篇作文的擁有權／授權
 *   4. 通過之後，才呼叫特權服務
 *
 * 這裡把四個步驟包成一個必須先呼叫的函式，讓「忘了檢查」變成寫不出來的狀態，
 * 而不是一條要靠自律遵守的慣例。
 *
 * ⚠️ 不要參考 supabase/functions/generate-pack-audio/index.ts 的寫法。
 *    那支函式直接用 service-role key 執行，沒有任何呼叫端驗證，
 *    是已知的技術債，不是可以沿用的樣板。
 *
 * Phase 1 沒有任何 Edge Function；本模組的第一個使用者是 Phase 2 的 essay-ocr。
 * 先寫在這裡，是為了讓 Phase 2 的函式沒有辦法在缺少它的情況下被寫出來。
 */

import { createClient, type SupabaseClient, type User } from "https://esm.sh/@supabase/supabase-js@2";

export const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

export function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });
}

export interface EssayRow {
  id: string;
  student_id: string;
  submission_type: string;
  status: string;
}

export interface EssayAccess {
  /** 已驗證的呼叫者 */
  user: User;
  /** 呼叫者是否為管理員 */
  isAdmin: boolean;
  /** 目標作文 */
  essay: EssayRow;
  /** service-role client。只有在授權通過之後才會交到呼叫端手上 */
  admin: SupabaseClient;
}

export interface RequireEssayAccessOptions {
  /** 設為 true 時，僅管理員可通過（例如 AI 分析，決策 L3／L11） */
  adminOnly?: boolean;
}

/**
 * 依序執行 L13 的四個步驟。
 *
 * @returns 通過時回傳 EssayAccess；未通過時回傳可直接送出的 Response。
 *          呼叫端必須以 `instanceof Response` 判斷並提前 return。
 */
export async function requireEssayAccess(
  req: Request,
  essayId: string,
  options: RequireEssayAccessOptions = {},
): Promise<EssayAccess | Response> {
  const supabaseUrl = Deno.env.get("SUPABASE_URL");
  const anonKey = Deno.env.get("SUPABASE_ANON_KEY");
  const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");

  if (!supabaseUrl || !anonKey || !serviceKey) {
    console.error("[essayAuth] 缺少 Supabase 環境變數");
    return jsonResponse({ error: "伺服器設定不完整" }, 500);
  }

  if (!essayId) {
    return jsonResponse({ error: "缺少 essay_id" }, 400);
  }

  // ── 步驟 1：驗證 JWT ──────────────────────────────────────────
  const authHeader = req.headers.get("Authorization") ?? "";
  if (!authHeader.startsWith("Bearer ")) {
    return jsonResponse({ error: "請先登入" }, 401);
  }

  // 用呼叫者自己的 token 建立 client：getUser() 會實際向 Auth 驗證這個 token，
  // 過期、竄改或撤銷的 token 都會在這裡失敗。
  const caller = createClient(supabaseUrl, anonKey, {
    global: { headers: { Authorization: authHeader } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // ── 步驟 2：解析身分 ──────────────────────────────────────────
  const { data: userData, error: userError } = await caller.auth.getUser();
  const user = userData?.user;
  if (userError || !user) {
    return jsonResponse({ error: "登入狀態無效或已過期" }, 401);
  }

  // ── 步驟 3：授權 ─────────────────────────────────────────────
  // is_admin() 是 mock 唯一的管理員定義（create_user_profiles_table.sql），
  // 不在這裡另外實作一套，避免兩個定義各自漂移。
  let isAdmin = false;
  const { data: adminFlag, error: adminError } = await caller.rpc("is_admin");
  if (adminError) {
    console.error("[essayAuth] is_admin() 呼叫失敗:", adminError.message);
  } else {
    isAdmin = adminFlag === true;
  }

  if (options.adminOnly && !isAdmin) {
    return jsonResponse({ error: "沒有執行這項操作的權限" }, 403);
  }

  const admin = createClient(supabaseUrl, serviceKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: essay, error: essayError } = await admin
    .from("writing_submissions")
    .select("id, student_id, submission_type, status")
    .eq("id", essayId)
    .maybeSingle();

  if (essayError) {
    console.error("[essayAuth] 讀取作文失敗:", essayError.message);
    return jsonResponse({ error: "讀取作文失敗" }, 500);
  }
  if (!essay) {
    return jsonResponse({ error: "找不到這篇作文" }, 404);
  }

  if (essay.student_id !== user.id && !isAdmin) {
    // 刻意回 403 而非 404：呼叫端已通過驗證，這裡是授權失敗。
    // 作文 id 是 UUID，無法靠猜測列舉，所以不需要用 404 來隱藏它的存在。
    return jsonResponse({ error: "沒有存取這篇作文的權限" }, 403);
  }

  // ── 步驟 4：授權通過，特權 client 才交給呼叫端 ─────────────────
  return { user, isAdmin, essay: essay as EssayRow, admin };
}
