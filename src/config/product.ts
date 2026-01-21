/**
 * Multi-Product Configuration
 *
 * This file defines the product-specific settings for each sub-site.
 * Set APP_PRODUCT environment variable to switch between products:
 * - GSAT: 學測英文 (default)
 * - TOEIC: 多益英文
 * - KIDS: 兒童英語
 */

export type ProductType = 'GSAT' | 'TOEIC' | 'KIDS';

// Get current product from environment variable
export const APP_PRODUCT: ProductType =
  (import.meta.env.VITE_APP_PRODUCT as ProductType) || 'GSAT';

export interface ProductConfig {
  id: ProductType;
  name: string;
  tagline: string;
  logo: string;
  shortName: string;

  // Theming
  primaryColor: string;

  // Features - which features are available for this product
  features: {
    // Core features (shared)
    vocabulary: boolean;
    srs: boolean;
    flashcards: boolean;
    quiz: boolean;
    collections: boolean;
    blog: boolean;

    // Product-specific features
    examGSAT: boolean;        // 學測模擬考
    examTOEIC: boolean;       // 多益模擬考
    essayGrading: boolean;    // AI 作文批改
    listeningPractice: boolean; // 聽力練習
    readingAnalysis: boolean; // 閱讀分析 (Kids)
    gamification: boolean;    // 進階遊戲化 (Kids)
    dashboard: boolean;       // 學習儀表板
    courses: boolean;         // 影片課程
  };

  // Navigation tabs for this product
  navigation: {
    key: string;
    label: string;
    path: string;
    order: number;
  }[];

  // Vocabulary levels available for this product
  vocabularyLevels: number[];

  // Content filtering - used to filter packs, blog posts, etc.
  contentTags: string[];
}

// ═══════════════════════════════════════════════════════════
// Product Configurations
// ═══════════════════════════════════════════════════════════

const GSAT_CONFIG: ProductConfig = {
  id: 'GSAT',
  name: 'Joe救學測英文',
  tagline: '學測英文學習平台',
  logo: '📚',
  shortName: 'Joe救英文',
  primaryColor: 'hsl(221.2 83.2% 53.3%)', // Blue

  features: {
    vocabulary: true,
    srs: true,
    flashcards: true,
    quiz: true,
    collections: true,
    blog: true,
    examGSAT: true,
    examTOEIC: false,
    essayGrading: true,
    listeningPractice: false,
    readingAnalysis: false,
    gamification: false,
    dashboard: true,
    courses: true,
  },

  navigation: [
    { key: 'vocabulary', label: '單字練習', path: '/practice', order: 1 },
    { key: 'exams', label: '學測模考', path: '/exams', order: 2 },
    { key: 'essay', label: 'AI 作文批改', path: '/essay', order: 3 },
    { key: 'blog', label: '學習專欄', path: '/blog', order: 4 },
    { key: 'dashboard', label: '學習儀表板', path: '/dashboard', order: 5 },
  ],

  vocabularyLevels: [1, 2, 3, 4, 5],
  contentTags: ['gsat', 'general', 'academic'],
};

const TOEIC_CONFIG: ProductConfig = {
  id: 'TOEIC',
  name: 'Joe救多益英文',
  tagline: '多益英文學習平台',
  logo: '💼',
  shortName: 'Joe救多益',
  primaryColor: 'hsl(142.1 76.2% 36.3%)', // Green

  features: {
    vocabulary: true,
    srs: true,
    flashcards: true,
    quiz: true,
    collections: true,
    blog: true,
    examGSAT: false,
    examTOEIC: true,
    essayGrading: false,
    listeningPractice: true,
    readingAnalysis: false,
    gamification: false,
    dashboard: true,
    courses: true,
  },

  navigation: [
    { key: 'vocabulary', label: '單字練習', path: '/practice', order: 1 },
    { key: 'exams', label: '多益模考', path: '/exams', order: 2 },
    { key: 'listening', label: '聽力練習', path: '/listening', order: 3 },
    { key: 'blog', label: '學習專欄', path: '/blog', order: 4 },
    { key: 'dashboard', label: '學習儀表板', path: '/dashboard', order: 5 },
  ],

  vocabularyLevels: [1, 2, 3, 4, 5],
  contentTags: ['toeic', 'general', 'business'],
};

const KIDS_CONFIG: ProductConfig = {
  id: 'KIDS',
  name: 'Joe救兒童英語',
  tagline: '兒童英語學習平台',
  logo: '🎮',
  shortName: 'Joe英語',
  primaryColor: 'hsl(24.6 95% 53.1%)', // Orange

  features: {
    vocabulary: true,
    srs: true,
    flashcards: true,
    quiz: true,
    collections: true,
    blog: true,
    examGSAT: false,
    examTOEIC: false,
    essayGrading: false,
    listeningPractice: false,
    readingAnalysis: true,
    gamification: true,
    dashboard: true,
    courses: true,
  },

  navigation: [
    { key: 'vocabulary', label: '單字遊戲', path: '/practice', order: 1 },
    { key: 'reading', label: '閱讀樂園', path: '/reading', order: 2 },
    { key: 'games', label: '學習遊戲', path: '/games', order: 3 },
    { key: 'blog', label: '學習天地', path: '/blog', order: 4 },
    { key: 'dashboard', label: '我的成績', path: '/dashboard', order: 5 },
  ],

  vocabularyLevels: [1, 2, 3], // Kids only uses levels 1-3
  contentTags: ['kids', 'general', 'elementary'],
};

// ═══════════════════════════════════════════════════════════
// Product Configuration Map
// ═══════════════════════════════════════════════════════════

const PRODUCT_CONFIGS: Record<ProductType, ProductConfig> = {
  GSAT: GSAT_CONFIG,
  TOEIC: TOEIC_CONFIG,
  KIDS: KIDS_CONFIG,
};

// ═══════════════════════════════════════════════════════════
// Helper Functions
// ═══════════════════════════════════════════════════════════

/**
 * Get the current product configuration
 */
export function getProductConfig(): ProductConfig {
  return PRODUCT_CONFIGS[APP_PRODUCT] || GSAT_CONFIG;
}

/**
 * Check if a feature is enabled for the current product
 */
export function isProductFeatureEnabled(feature: keyof ProductConfig['features']): boolean {
  const config = getProductConfig();
  return config.features[feature] ?? false;
}

/**
 * Get the navigation items for the current product
 */
export function getProductNavigation() {
  const config = getProductConfig();
  return config.navigation.sort((a, b) => a.order - b.order);
}

/**
 * Get the content tags for filtering content
 */
export function getProductContentTags(): string[] {
  const config = getProductConfig();
  return config.contentTags;
}

/**
 * Check if a content item matches the current product
 * Content should have at least one matching tag, or 'general' tag
 */
export function isContentForProduct(contentTags: string[]): boolean {
  const productTags = getProductContentTags();
  return contentTags.some(tag =>
    productTags.includes(tag) || tag === 'general'
  );
}

/**
 * Get vocabulary levels available for the current product
 */
export function getProductVocabularyLevels(): number[] {
  const config = getProductConfig();
  return config.vocabularyLevels;
}

// Export current product config for convenience
export const PRODUCT_CONFIG = getProductConfig();
