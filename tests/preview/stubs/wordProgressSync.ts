import type { WordProgress } from '@/store/vocabularyStore';
/** 錄下舊路徑的每一次同步，用來證明相容層行為沒變。 */
export async function fetchAllWordProgress(): Promise<Record<string, WordProgress>> { return {}; }
export async function syncWordProgress(p: WordProgress): Promise<boolean> {
  window.__legacy.push({ ...p });
  return true;
}
