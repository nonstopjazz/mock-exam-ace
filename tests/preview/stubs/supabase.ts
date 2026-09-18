/** 假的 supabase client：把每一次 rpc 呼叫錄進 window.__rpc。 */
type Call = { fn: string; args: Record<string, unknown> };
declare global { interface Window { __rpc: Call[]; __legacy: unknown[] } }
if (typeof window !== 'undefined') { window.__rpc = []; window.__legacy = []; }

export const supabase = {
  async rpc(fn: string, args: Record<string, unknown>) {
    window.__rpc.push({ fn, args });
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
  auth: { getUser: async () => ({ data: { user: { id: 'stu-1' } }, error: null }) },
};
