/**
 * 假的 supabase client：用 ?err= 指定 signInWithPassword 要回哪一種錯誤，
 * 好驗證登入頁對不同錯誤的反應。
 */
class FakeAuthError extends Error {
  code?: string;
  status?: number;
  protected __isAuthError = true;
  constructor(message: string, code?: string, status = 400) {
    super(message);
    this.name = 'AuthApiError';
    this.code = code;
    this.status = status;
  }
}

const CASES: Record<string, FakeAuthError | null> = {
  // Supabase 對「帳密不符」的實際回應
  invalid: new FakeAuthError('Invalid login credentials', 'invalid_credentials'),
  // 沒有 code 的舊版／邊界情況，只能靠訊息比對
  'invalid-nocode': new FakeAuthError('Invalid login credentials'),
  // 另一種錯誤：不該出現 Google 提示
  unconfirmed: new FakeAuthError('Email not confirmed', 'email_not_confirmed'),
  ok: null,
};

const which = () => new URLSearchParams(location.search).get('err') || 'invalid';

export const supabase = {
  auth: {
    getSession: async () => ({ data: { session: null }, error: null }),
    onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
    signInWithPassword: async () => ({ data: { session: null, user: null }, error: CASES[which()] ?? null }),
    signUp: async () => ({ data: { session: null, user: null }, error: null }),
    signInWithOAuth: async () => {
      (window as unknown as { __oauth: number }).__oauth =
        ((window as unknown as { __oauth: number }).__oauth || 0) + 1;
      return { data: null, error: null };
    },
    signOut: async () => {},
    resetPasswordForEmail: async () => ({ data: null, error: null }),
  },
  rpc: async () => ({ data: null, error: null }),
  from: () => {
    const c: Record<string, unknown> = {};
    for (const m of ['select', 'eq', 'in', 'order', 'range', 'single']) c[m] = () => c;
    (c as { then: unknown }).then = (r: (v: unknown) => void) => r({ data: [], error: null });
    return c;
  },
};
