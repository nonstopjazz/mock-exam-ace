/**
 * essayAuth（Node / Vercel serverless 版）
 *
 * 決策 L13：在碰到任何特權資源（DeepSeek、service-role 寫入）之前，
 * 每一支作文端點都必須依序完成四個步驟：
 *
 *   1. 驗證呼叫端的 JWT
 *   2. 解析呼叫者身分
 *   3. 檢查該身分對這篇作文的擁有權／授權
 *   4. 通過之後，才呼叫特權服務
 *
 * 這裡把四個步驟包成一個必須先呼叫的函式，讓「忘了檢查」變成寫不出來的狀態，
 * 而不是一條要靠自律遵守的慣例。授權通過之前，service-role client 根本不存在。
 *
 * ⚠️ 不要參考 api/generate-pack-audio.ts 的寫法。那支端點直接用 service-role key
 *    執行、沒有任何呼叫端驗證，是已知的技術債，不是可以沿用的樣板。
 *    （已登記為技術債，不在本階段修。）
 *
 * 這是 supabase/functions/_shared/essayAuth.ts 的 Node 移植版：
 * Deno.env → process.env、Request/Response → Vercel 的 req/res。
 * 授權順序一字未改。Deno 版原檔保留但目前沒有任何使用者。
 */

import { createClient, type SupabaseClient, type User } from "@supabase/supabase-js";

/** Vercel 的 handler 參數。專案沒有裝 @vercel/node，所以在這裡描述需要用到的部分。 */
export interface VercelLikeRequest {
  method?: string;
  headers: Record<string, string | string[] | undefined>;
  body?: unknown;
}

export interface VercelLikeResponse {
  status(code: number): VercelLikeResponse;
  json(body: unknown): void;
  setHeader(name: string, value: string): void;
  end(): void;
}

export function readHeader(req: VercelLikeRequest, name: string): string {
  const raw = req.headers[name] ?? req.headers[name.toLowerCase()];
  if (Array.isArray(raw)) return raw[0] ?? "";
  return raw ?? "";
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
  /**
   * 以呼叫者身分執行的 client。需要讓 auth.uid() / is_admin() 在資料庫端生效的
   * RPC（writing_enqueue_analysis、writing_retry_synthesis）必須用這一個，
   * 資料庫層才會再把關一次。
   */
  caller: SupabaseClient;
}

export interface RequireEssayAccessOptions {
  /** 設為 true 時，僅管理員可通過（例如 AI 分析，決策 L3／L11） */
  adminOnly?: boolean;
}

/** 授權失敗。呼叫端必須以 `"denied" in result` 判斷並提前 return。 */
export interface AccessDenied {
  denied: true;
  status: number;
  error: string;
}

const deny = (status: number, error: string): AccessDenied => ({ denied: true, status, error });

export function isDenied(result: EssayAccess | AccessDenied): result is AccessDenied {
  return (result as AccessDenied).denied === true;
}

/**
 * 依序執行 L13 的四個步驟。
 *
 * @returns 通過時回傳 EssayAccess；未通過時回傳 AccessDenied。
 */
export async function requireEssayAccess(
  req: VercelLikeRequest,
  essayId: string,
  options: RequireEssayAccessOptions = {},
): Promise<EssayAccess | AccessDenied> {
  const supabaseUrl = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const anonKey = process.env.VITE_SUPABASE_ANON_KEY || process.env.SUPABASE_ANON_KEY;
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!supabaseUrl || !anonKey || !serviceKey) {
    // 只記下缺了哪一個名字，不記任何值。
    console.error("[essayAuth] 缺少 Supabase 環境變數");
    return deny(500, "伺服器設定不完整");
  }

  if (!essayId) {
    return deny(400, "缺少 essay_id");
  }

  // ── 步驟 1：驗證 JWT ──────────────────────────────────────────
  const authHeader = readHeader(req, "authorization");
  if (!authHeader.startsWith("Bearer ")) {
    return deny(401, "請先登入");
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
    return deny(401, "登入狀態無效或已過期");
  }

  // ── 步驟 3：授權 ─────────────────────────────────────────────
  // is_admin() 是這個專案唯一的管理員定義，不在這裡另外實作一套，避免兩個定義漂移。
  // 未登入時它回傳 NULL 而非 false，所以這裡用嚴格等於 true 判斷。
  let isAdmin = false;
  const { data: adminFlag, error: adminError } = await caller.rpc("is_admin");
  if (adminError) {
    console.error("[essayAuth] is_admin() 呼叫失敗:", adminError.message);
  } else {
    isAdmin = adminFlag === true;
  }

  if (options.adminOnly && !isAdmin) {
    return deny(403, "沒有執行這項操作的權限");
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
    return deny(500, "讀取作文失敗");
  }
  if (!essay) {
    return deny(404, "找不到這篇作文");
  }

  if (essay.student_id !== user.id && !isAdmin) {
    // 刻意回 403 而非 404：呼叫端已通過驗證，這裡是授權失敗。
    // 作文 id 是 UUID，無法靠猜測列舉，所以不需要用 404 來隱藏它的存在。
    return deny(403, "沒有存取這篇作文的權限");
  }

  // ── 步驟 4：授權通過，特權 client 才交給呼叫端 ─────────────────
  return { user, isAdmin, essay: essay as EssayRow, admin, caller };
}
