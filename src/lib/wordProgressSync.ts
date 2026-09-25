import { supabase } from './supabase';
import type { WordProgress } from '@/store/vocabularyStore';
import { toWordProgressMap, type WordProgressRow } from './wordProgressMap';

/**
 * 從 Supabase 載入使用者的所有單字學習進度。
 *
 * key 的形狀由 toWordProgressMap() 決定，那裡有一條【不可以加前綴】的規則
 * 與它的由來（2026-09-24 的題庫進度不累積事故）。
 */
export async function fetchAllWordProgress(): Promise<Record<string, WordProgress>> {
  const { data, error } = await supabase.rpc('get_all_word_progress');

  if (error) {
    console.error('Failed to fetch word progress:', error);
    throw error;
  }

  if (!data?.success || !data.progress) {
    return {};
  }

  return toWordProgressMap(data.progress as WordProgressRow[]);
}

/**
 * 將單一單字的學習進度同步到 Supabase
 */
export async function syncWordProgress(progress: WordProgress): Promise<boolean> {
  const { data, error } = await supabase.rpc('upsert_word_progress', {
    p_word_id: progress.wordId,
    p_mastery_level: progress.masteryLevel,
    p_next_review_time: progress.nextReviewTime,
    p_review_count: progress.reviewCount,
    p_correct_count: progress.correctCount,
    p_last_review_time: progress.lastReviewTime ?? 0,
    p_source: progress.source || 'level',
    p_pack_id: progress.packId || null,
  });

  if (error) {
    console.error('Failed to sync word progress:', error);
    return false;
  }

  return data?.success ?? false;
}
