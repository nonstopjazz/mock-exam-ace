import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import type {
  LearningPack, PackListRow, PackSources,
} from "@/lib/learn/learningPacks";

/** 後台學習包清單。 */
export function useLearningPackList() {
  const [packs, setPacks] = useState<PackListRow[] | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc("learning_pack_admin_list");
    if (rpcError) {
      setError(rpcError.message);
      setPacks(null);
    } else {
      setError(null);
      setPacks((data ?? []) as unknown as PackListRow[]);
    }
    setLoading(false);
  }, []);

  useEffect(() => { void load(); }, [load]);

  return { packs, loading, error, reload: load };
}

/**
 * 單一學習包的讀與寫。
 *
 * 🛑 每一個異動 RPC 都回傳【整包最新狀態】（含重新算過的 problems），
 *    所以寫完直接換掉本地狀態，不另外重撈。分開撈的話，
 *    「剛加的單元」與「發布檢查的結果」會有一瞬間不一致。
 */
export function useLearningPack(packId: string | null) {
  const [pack, setPack] = useState<LearningPack | null>(null);
  const [loading, setLoading] = useState(packId !== null);
  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    if (!packId) { setPack(null); setLoading(false); return; }
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc("learning_pack_admin_get", {
      p_pack_id: packId,
    });
    if (rpcError) { setError(rpcError.message); setPack(null); }
    else { setError(null); setPack(data as unknown as LearningPack); }
    setLoading(false);
  }, [packId]);

  useEffect(() => { void load(); }, [load]);

  /**
   * 送一個 RPC，把回傳的整包換上去。
   *
   * 🛑 失敗時【不】清掉畫面上的資料。把 pack 設成 null 的話，
   *    一次網路中斷就會讓老師正在編的內容從眼前消失。
   */
  const call = useCallback(
    async (fn: string, args: Record<string, unknown>): Promise<LearningPack | null> => {
      setSaving(true);
      const { data, error: rpcError } = await supabase.rpc(fn, args);
      setSaving(false);
      if (rpcError) { setError(rpcError.message); return null; }
      setError(null);
      const next = data as unknown as LearningPack;
      setPack(next);
      return next;
    },
    [],
  );

  return {
    pack, loading, error, saving, reload: load,
    setError,
    /** NULL 代表「不改這一欄」，所以只送有動到的欄位 */
    savePack: (fields: Record<string, unknown>) =>
      call("learning_pack_admin_upsert", { p_pack_id: packId, ...fields }),
    saveUnit: (fields: Record<string, unknown>) =>
      call("learning_pack_admin_unit_upsert", { p_pack_id: packId, ...fields }),
    deleteUnit: (unitId: string) =>
      call("learning_pack_admin_unit_delete", { p_unit_id: unitId }),
    reorder: (unitIds: string[]) =>
      call("learning_pack_admin_reorder", { p_pack_id: packId, p_unit_ids: unitIds }),
    setStatus: (status: string) =>
      call("learning_pack_admin_set_status", { p_pack_id: packId, p_status: status }),
  };
}

/** 可選的教材來源（閱讀文章、單字集），含可用數量。 */
export function useLearningPackSources(enabled: boolean) {
  const [sources, setSources] = useState<PackSources | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;
    void (async () => {
      const { data, error: rpcError } = await supabase.rpc("learning_pack_admin_sources");
      if (cancelled) return;
      if (rpcError) setError(rpcError.message);
      else { setError(null); setSources(data as unknown as PackSources); }
    })();
    return () => { cancelled = true; };
  }, [enabled]);

  return { sources, error };
}
