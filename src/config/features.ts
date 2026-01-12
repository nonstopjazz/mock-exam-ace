/**
 * Feature Flags Configuration
 *
 * Phase 0 (MVP): Vocabulary practice only - public, no auth
 * Phase 1 (Future): Login, collections, achievements
 * Phase 2 (Future): Full exams, dashboard, essay
 */

export type FeatureStatus = 'enabled' | 'locked' | 'coming_soon' | 'hidden';
export type Phase = 0 | 1 | 2;

export interface FeatureConfig {
  status: FeatureStatus;
  phase: Phase;
  label: string;
  description?: string;
}

// Current active phase - change this to unlock features
export const CURRENT_PHASE: Phase = 0;

// Environment check for admin routes
export const IS_PRODUCTION = import.meta.env.PROD;

export const FEATURES: Record<string, FeatureConfig> = {
  // ═══════════════════════════════════════════
  // Phase 0: Public MVP (enabled now)
  // ═══════════════════════════════════════════
  vocabulary_hub: {
    status: 'enabled',
    phase: 0,
    label: '單字中心',
  },
  vocabulary_srs: {
    status: 'enabled',
    phase: 0,
    label: 'SRS 智慧複習',
  },
  vocabulary_flashcards: {
    status: 'enabled',
    phase: 0,
    label: '翻轉卡片',
  },
  vocabulary_quiz: {
    status: 'enabled',
    phase: 0,
    label: '快速測驗',
  },

  // ═══════════════════════════════════════════
  // Phase 1: Free Member (locked for now)
  // ═══════════════════════════════════════════
  vocabulary_collections: {
    status: 'locked',
    phase: 1,
    label: '詞彙收藏',
    description: '需要登入才能使用',
  },
  achievements: {
    status: 'locked',
    phase: 1,
    label: '成就系統',
  },
  profile: {
    status: 'locked',
    phase: 1,
    label: '個人檔案',
  },
  quests: {
    status: 'locked',
    phase: 1,
    label: '任務地圖',
  },

  // ═══════════════════════════════════════════
  // Phase 2: Premium (locked for now)
  // ═══════════════════════════════════════════
  exam_list: {
    status: 'locked',
    phase: 2,
    label: '學測模考',
    description: '即將推出',
  },
  exam_session: {
    status: 'locked',
    phase: 2,
    label: '模考測驗',
  },
  exam_result: {
    status: 'locked',
    phase: 2,
    label: '模考結果',
  },
  dashboard: {
    status: 'locked',
    phase: 2,
    label: '學習儀表板',
    description: '即將推出',
  },
  essay: {
    status: 'locked',
    phase: 2,
    label: 'AI 作文批改',
    description: '即將推出',
  },

  // ═══════════════════════════════════════════
  // Future (hidden for now)
  // ═══════════════════════════════════════════
  courses: {
    status: 'hidden',
    phase: 2,
    label: '影片課程',
  },
  shop: {
    status: 'hidden',
    phase: 2,
    label: '商店',
  },
  recommended_packs: {
    status: 'hidden',
    phase: 1,
    label: '推薦主題包',
  },
};

// Helper functions
export function isFeatureEnabled(featureId: string): boolean {
  const feature = FEATURES[featureId];
  return feature?.status === 'enabled';
}

export function isFeatureLocked(featureId: string): boolean {
  const feature = FEATURES[featureId];
  return feature?.status === 'locked' || feature?.status === 'coming_soon';
}

export function isFeatureHidden(featureId: string): boolean {
  const feature = FEATURES[featureId];
  return feature?.status === 'hidden';
}

export function getFeature(featureId: string): FeatureConfig | undefined {
  return FEATURES[featureId];
}
