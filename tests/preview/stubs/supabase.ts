/** 假的 supabase client：把每一次 rpc 呼叫錄進 window.__rpc。 */
type Call = { fn: string; args: Record<string, unknown> };
declare global { interface Window { __rpc: Call[]; __legacy: unknown[] } }
if (typeof window !== 'undefined') { window.__rpc = []; window.__legacy = []; }

export const supabase = {
  async rpc(fn: string, args: Record<string, unknown>) {
    window.__rpc.push({ fn, args });
    if (fn === 'writing_my_error_overview') {
      const q = new URLSearchParams(location.search);
      if (q.get('empty')) {
        return { data: { rows: [], total: 0, limit: 20, truncated: false, essay_total: 0 }, error: null };
      }
      // 稀疏狀態：2026-09 的真實形狀是平均每人 2.5 篇作文，
      // 所以大多數 code 都只出現在 1 篇裡。這一頁在那種資料下
      // 不可以看起來像壞掉或像沒資料。
      if (q.get('sparse')) {
        return { data: {
          essay_total: 2, total: 2, limit: 20, truncated: false,
          rows: [
            { error_code: 'WRITE_ERR_ARTICLE',     essay_count: 1, occurrence_count: 1,
              is_fallback_code: false, first_seen_at: '2026-09-20T00:00:00Z', last_seen_at: '2026-09-20T00:00:00Z' },
            { error_code: 'WRITE_ERR_SPELLING',    essay_count: 1, occurrence_count: 1,
              is_fallback_code: false, first_seen_at: '2026-09-18T00:00:00Z', last_seen_at: '2026-09-18T00:00:00Z' },
          ],
        }, error: null };
      }
      return { data: {
        essay_total: 4, total: 3, limit: 20, truncated: false,
        rows: [
          { error_code: 'WRITE_ERR_ARTICLE',      essay_count: 3, occurrence_count: 7,
            is_fallback_code: false, first_seen_at: '2026-08-01T00:00:00Z', last_seen_at: '2026-09-20T00:00:00Z' },
          { error_code: 'WRITE_ERR_SV_AGREEMENT', essay_count: 2, occurrence_count: 4,
            is_fallback_code: false, first_seen_at: '2026-08-05T00:00:00Z', last_seen_at: '2026-09-18T00:00:00Z' },
          // 🛑 只出現一次的也必須在清單裡（與老師版同一條無門檻規則）
          { error_code: 'WRITE_ERR_PUNCTUATION',  essay_count: 1, occurrence_count: 1,
            is_fallback_code: false, first_seen_at: '2026-09-10T00:00:00Z', last_seen_at: '2026-09-10T00:00:00Z' },
        ],
      }, error: null };
    }
    if (fn === 'writing_my_error_findings') {
      return { data: {
        total: 2, limit: 50, truncated: false,
        rows: [
          { finding_id: 'f1', essay_id: 'e1', essay_submitted_at: '2026-09-20T00:00:00Z',
            essay_topic: '我的暑假', finding_index: 0, error_code: args.p_error_code,
            primary_skill: 'W2', quote: 'I went to hospital yesterday.',
            correction: 'I went to the hospital yesterday.', reason: '特定的地點要加冠詞。',
            is_fallback_code: false },
          // 完全無關的兩段：worthShowing 應為 false，畫面要退回純文字
          { finding_id: 'f2', essay_id: 'e2', essay_submitted_at: '2026-09-11T00:00:00Z',
            essay_topic: null, finding_index: 1, error_code: args.p_error_code,
            primary_skill: 'W2', quote: 'apple banana cherry',
            correction: 'xxx yyy zzz', reason: '測試用：兩段完全無關。',
            is_fallback_code: false },
        ],
      }, error: null };
    }
    if (fn === 'record_lexical_attempt') {
      return { data: { recorded: true, attempt_id: crypto.randomUUID(), lexical_item_id: crypto.randomUUID(), mastery_applied: args.p_apply_mastery !== false }, error: null };
    }
    return { data: null, error: null };
  },
  from() {
    const chain: Record<string, unknown> = {};
    const methods = ['select','eq','in','order','range','single','insert','update','delete','filter','or'];
    for (const m of methods) chain[m] = () => chain;
    (chain as { then: unknown }).then = (res: (v: unknown) => void) => res({ data: [], error: null });
    return chain;
  },
  auth: {
    getUser: async () => ({ data: { user: { id: 'stu-1' } }, error: null }),
    // useMyErrors 先確認有 session 才打 RPC。少了這一支 hook 會直接丟例外。
    getSession: async () => ({ data: { session: { user: { id: 'stu-1' } } }, error: null }),
  },
};
