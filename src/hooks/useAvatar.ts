import { useState, useEffect, useCallback } from 'react';
import { useAuth } from '@/contexts/AuthContext';

// 頭像設定
const AVATAR_CONFIG = {
  // 新用戶隨機分配的頭像範圍
  randomAvatars: ['01', '02', '03', '04', '05', '06'],
  // 用戶可選擇的頭像範圍
  selectableAvatars: ['01', '02', '03', '04', '05', '06', '07', '08'],
  // 特殊用戶的頭像
  specialUsers: {
    'nonstopjazz@gmail.com': '99',
  } as Record<string, string>,
  // 頭像路徑
  basePath: '/avatars/',
  // 頭像副檔名（實際檔名格式：01-small.webp）
  extension: '-small.webp',
};

const STORAGE_KEY = 'user_avatar_id';

interface UseAvatarResult {
  avatarId: string;
  avatarUrl: string;
  selectableAvatars: { id: string; url: string }[];
  setAvatarId: (id: string) => void;
  isSpecialUser: boolean;
}

/**
 * 獲取頭像 URL
 */
function getAvatarUrl(avatarId: string): string {
  return `${AVATAR_CONFIG.basePath}${avatarId}${AVATAR_CONFIG.extension}`;
}

/**
 * 隨機選擇一個頭像 ID
 */
function getRandomAvatarId(): string {
  const randomIndex = Math.floor(Math.random() * AVATAR_CONFIG.randomAvatars.length);
  return AVATAR_CONFIG.randomAvatars[randomIndex];
}

/**
 * 頭像管理 Hook
 * - 新用戶隨機分配 01-06
 * - nonstopjazz@gmail.com 自動使用 99
 * - 用戶可自行選擇 01-08
 */
export function useAvatar(): UseAvatarResult {
  const { user } = useAuth();
  const [avatarId, setAvatarIdState] = useState<string>('01');

  // 檢查是否為特殊用戶
  const userEmail = user?.email || '';
  const isSpecialUser = userEmail in AVATAR_CONFIG.specialUsers;
  const specialAvatarId = isSpecialUser ? AVATAR_CONFIG.specialUsers[userEmail] : null;

  // 初始化頭像
  useEffect(() => {
    // 特殊用戶使用指定頭像
    if (specialAvatarId) {
      setAvatarIdState(specialAvatarId);
      return;
    }

    // 從 localStorage 讀取已存的頭像 ID
    const storedAvatarId = localStorage.getItem(STORAGE_KEY);

    if (storedAvatarId) {
      // 驗證存儲的 ID 是否有效
      if (AVATAR_CONFIG.selectableAvatars.includes(storedAvatarId)) {
        setAvatarIdState(storedAvatarId);
      } else {
        // 無效的 ID，重新分配
        const newId = getRandomAvatarId();
        localStorage.setItem(STORAGE_KEY, newId);
        setAvatarIdState(newId);
      }
    } else {
      // 新用戶，隨機分配
      const newId = getRandomAvatarId();
      localStorage.setItem(STORAGE_KEY, newId);
      setAvatarIdState(newId);
    }
  }, [specialAvatarId]);

  // 設定頭像 ID
  const setAvatarId = useCallback((id: string) => {
    // 特殊用戶不能更改頭像
    if (isSpecialUser) {
      return;
    }

    // 驗證 ID 是否在可選範圍內
    if (!AVATAR_CONFIG.selectableAvatars.includes(id)) {
      console.warn(`Invalid avatar ID: ${id}`);
      return;
    }

    localStorage.setItem(STORAGE_KEY, id);
    setAvatarIdState(id);
  }, [isSpecialUser]);

  // 可選擇的頭像列表
  const selectableAvatars = AVATAR_CONFIG.selectableAvatars.map(id => ({
    id,
    url: getAvatarUrl(id),
  }));

  return {
    avatarId,
    avatarUrl: getAvatarUrl(avatarId),
    selectableAvatars,
    setAvatarId,
    isSpecialUser,
  };
}

export default useAvatar;
