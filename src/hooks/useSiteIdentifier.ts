import { useMemo } from 'react';

export type SiteId = 'gsat' | 'toeic' | 'gept';

interface SiteConfig {
  id: SiteId;
  name: string;
  domain: string;
}

const SITE_CONFIGS: Record<SiteId, SiteConfig> = {
  gsat: {
    id: 'gsat',
    name: '學測英文',
    domain: 'gsat.ilearn.blog',
  },
  toeic: {
    id: 'toeic',
    name: '多益英文',
    domain: 'toeic.ilearn.blog',
  },
  gept: {
    id: 'gept',
    name: '全民英檢',
    domain: 'gept.ilearn.blog',
  },
};

// 根據網域判斷當前站點
function detectSiteFromHostname(hostname: string): SiteId {
  if (hostname.includes('gsat')) return 'gsat';
  if (hostname.includes('toeic')) return 'toeic';
  if (hostname.includes('gept')) return 'gept';

  // 開發環境：可以透過環境變數指定，預設為 toeic
  const envSite = import.meta.env.VITE_SITE_ID as SiteId | undefined;
  if (envSite && SITE_CONFIGS[envSite]) {
    return envSite;
  }

  return 'toeic'; // 預設
}

export function useSiteIdentifier() {
  const siteId = useMemo(() => {
    return detectSiteFromHostname(window.location.hostname);
  }, []);

  const siteConfig = SITE_CONFIGS[siteId];

  return {
    siteId,
    siteName: siteConfig.name,
    siteConfig,
    allSites: SITE_CONFIGS,
  };
}

// 給非 React 環境使用的函數
export function getSiteId(): SiteId {
  return detectSiteFromHostname(window.location.hostname);
}

export function getSiteConfig(): SiteConfig {
  return SITE_CONFIGS[getSiteId()];
}
