import { supabase } from './supabase';
import type { WordProgress } from '@/store/vocabularyStore';

/**
 * 從 Supabase 載入使用者的所有單字學習進度
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

  const progressMap: Record<string, WordProgress> = {};

  for (const item of data.progress) {
    // Use composite key for pack items to avoid collision with level words
    const key = item.source === 'pack' && item.pack_id
      ? `pack:${item.pack_id}:${item.word_id}`
      : item.word_id;

    progressMap[key] = {
      wordId: item.word_id,
      masteryLevel: item.mastery_level,
      nextReviewTime: Number(item.next_review_time),
      reviewCount: item.review_count,
      correctCount: item.correct_count,
      lastReviewTime: item.last_review_time ? Number(item.last_review_time) : null,
      source: item.source || 'level',
      packId: item.pack_id || null,
    };
  }

  return progressMap;
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
