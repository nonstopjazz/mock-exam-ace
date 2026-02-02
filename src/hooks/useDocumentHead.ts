import { useEffect } from 'react';
import { APP_PRODUCT, PRODUCT_CONFIG } from '@/config/product';

// 產品專屬的 SEO 文案
const SEO_COPY = {
  GSAT: {
    title: 'Joe救學測英文 - 單字練習平台',
    description: 'Joe救學測英文 - 專為學測考生設計的英文單字練習平台，輕鬆掌握學測必備詞彙。',
    keywords: '學測英文, 單字練習, 英文學習, 詞彙練習, 線上學習, 學測',
    ogTitle: 'Joe救學測英文',
    ogDescription: '專為學測考生設計的英文單字練習平台',
  },
  TOEIC: {
    title: 'Joe救多益英文 - 單字練習平台',
    description: 'Joe救多益英文 - 專為多益考生設計的英文單字練習平台，輕鬆掌握多益必備詞彙。',
    keywords: '多益英文, TOEIC, 單字練習, 英文學習, 詞彙練習, 線上學習',
    ogTitle: 'Joe救多益英文',
    ogDescription: '專為多益考生設計的英文單字練習平台',
  },
  KIDS: {
    title: 'Joe的兒童閱讀學院 - 英文學習平台',
    description: 'Joe的兒童閱讀學院 - 專為兒童設計的英文學習平台，遊戲化學習輕鬆有趣。',
    keywords: '兒童英文, 英文學習, 閱讀學習, 遊戲化學習, 線上學習',
    ogTitle: 'Joe的兒童閱讀學院',
    ogDescription: '專為兒童設計的英文學習平台',
  },
};

/**
 * 動態設定 document head（標題、meta tags）
 * 根據當前產品類型自動更新
 */
export function useDocumentHead() {
  useEffect(() => {
    const seo = SEO_COPY[APP_PRODUCT];

    // 更新 title
    document.title = seo.title;

    // 更新 meta description
    const metaDescription = document.querySelector('meta[name="description"]');
    if (metaDescription) {
      metaDescription.setAttribute('content', seo.description);
    }

    // 更新 meta author
    const metaAuthor = document.querySelector('meta[name="author"]');
    if (metaAuthor) {
      metaAuthor.setAttribute('content', PRODUCT_CONFIG.name);
    }

    // 更新 meta keywords
    const metaKeywords = document.querySelector('meta[name="keywords"]');
    if (metaKeywords) {
      metaKeywords.setAttribute('content', seo.keywords);
    }

    // 更新 og:title
    const ogTitle = document.querySelector('meta[property="og:title"]');
    if (ogTitle) {
      ogTitle.setAttribute('content', seo.ogTitle);
    }

    // 更新 og:description
    const ogDescription = document.querySelector('meta[property="og:description"]');
    if (ogDescription) {
      ogDescription.setAttribute('content', seo.ogDescription);
    }
  }, []);
}
