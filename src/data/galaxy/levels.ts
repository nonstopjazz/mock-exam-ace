/**
 * 等級系統設計 (Lv.1 - Lv.10)
 * 
 * 📈 等級進度：
 * - 每個等級所需經驗值遞增
 * - 升級時觸發動畫與音效
 * - 解鎖新稱號與獎勵
 */

export interface LevelData {
  level: number;
  requiredExp: number;
  title: string;
  titleEn: string;
  rewards: {
    gems: number;
    items?: string[];
  };
  description: string;
  unlocks?: string[];
}

/**
 * 等級數據表
 * 
 * 經驗值計算公式：
 * Lv.1-3: 基礎成長（100, 250, 450）
 * Lv.4-7: 加速成長（700, 1000, 1400, 1900）
 * Lv.8-10: 進階挑戰（2500, 3200, 4000）
 */
export const LEVELS: LevelData[] = [
  {
    level: 1,
    requiredExp: 0,
    title: "初心探索者",
    titleEn: "Novice Explorer",
    rewards: { gems: 0 },
    description: "踏上語言學習的旅程，每一步都是新的發現",
    unlocks: ["基礎任務", "每日挑戰"]
  },
  {
    level: 2,
    requiredExp: 100,
    title: "好奇學徒",
    titleEn: "Curious Apprentice",
    rewards: { gems: 50, items: ["頭像框：學徒之路"] },
    description: "好奇心是學習的動力，繼續探索吧",
    unlocks: ["中級任務", "成就系統"]
  },
  {
    level: 3,
    requiredExp: 250,
    title: "勤奮冒險家",
    titleEn: "Diligent Adventurer",
    rewards: { gems: 100, items: ["稱號：勤奮者", "特效：星光閃爍"] },
    description: "你的努力開始展現成果",
    unlocks: ["進階任務", "寶箱稀有度提升"]
  },
  {
    level: 4,
    requiredExp: 450,
    title: "知識獵人",
    titleEn: "Knowledge Hunter",
    rewards: { gems: 150, items: ["頭像框：獵人標記"] },
    description: "主動追求知識，你已經掌握了學習的節奏",
    unlocks: ["專家任務", "連擊獎勵加成"]
  },
  {
    level: 5,
    requiredExp: 700,
    title: "智慧行者",
    titleEn: "Wisdom Walker",
    rewards: { gems: 250, items: ["稀有徽章：智慧之路", "特效：智慧光環"] },
    description: "你的智慧在每次挑戰中成長",
    unlocks: ["挑戰模式", "好友對戰"]
  },
  {
    level: 6,
    requiredExp: 1000,
    title: "語言達人",
    titleEn: "Language Expert",
    rewards: { gems: 350, items: ["頭像框：達人認證", "稱號：語言通"] },
    description: "你已經精通語言的奧秘",
    unlocks: ["大師任務", "全球排行榜"]
  },
  {
    level: 7,
    requiredExp: 1400,
    title: "博學賢者",
    titleEn: "Erudite Sage",
    rewards: { gems: 500, items: ["史詩徽章：博學者", "特效：知識漩渦", "專屬背景主題"] },
    description: "你的學識已達到令人驚嘆的高度",
    unlocks: ["傳說任務", "自訂挑戰"]
  },
  {
    level: 8,
    requiredExp: 1900,
    title: "傳奇學者",
    titleEn: "Legendary Scholar",
    rewards: { gems: 750, items: ["傳說頭像框：學者榮耀", "稱號：傳奇", "獨特特效：書卷飛舞"] },
    description: "你的名字將被銘記在學習殿堂中",
    unlocks: ["終極挑戰", "導師模式"]
  },
  {
    level: 9,
    requiredExp: 2500,
    title: "語言宗師",
    titleEn: "Language Grandmaster",
    rewards: { gems: 1000, items: ["傳說徽章：宗師之證", "專屬稱號：語言宗師", "特效：金色光芒", "VIP功能解鎖"] },
    description: "你已經站在語言學習的巔峰",
    unlocks: ["創建自訂關卡", "社群導師"]
  },
  {
    level: 10,
    requiredExp: 3200,
    title: "至高學神",
    titleEn: "Supreme Deity of Learning",
    rewards: { 
      gems: 2000, 
      items: [
        "最高榮譽徽章：學神之證",
        "獨特頭像框：至高榮耀",
        "專屬稱號：學神",
        "終極特效：神聖光環",
        "全功能解鎖",
        "永久VIP會員"
      ] 
    },
    description: "你已經達到語言學習的最高境界，成為傳說",
    unlocks: ["所有功能", "永久特權", "名人堂"]
  }
];

/**
 * 計算當前經驗值對應的等級
 */
export const calculateLevel = (currentExp: number): { 
  level: number; 
  currentLevelExp: number; 
  nextLevelExp: number;
  progress: number;
} => {
  let level = 1;
  let currentLevelExp = 0;
  let nextLevelExp = LEVELS[1].requiredExp;

  for (let i = LEVELS.length - 1; i >= 0; i--) {
    if (currentExp >= LEVELS[i].requiredExp) {
      level = LEVELS[i].level;
      currentLevelExp = LEVELS[i].requiredExp;
      nextLevelExp = i < LEVELS.length - 1 ? LEVELS[i + 1].requiredExp : currentLevelExp;
      break;
    }
  }

  const expInCurrentLevel = currentExp - currentLevelExp;
  const expNeededForNextLevel = nextLevelExp - currentLevelExp;
  const progress = expNeededForNextLevel > 0 
    ? (expInCurrentLevel / expNeededForNextLevel) * 100 
    : 100;

  return {
    level,
    currentLevelExp,
    nextLevelExp,
    progress: Math.min(progress, 100)
  };
};

/**
 * 獲取等級數據
 */
export const getLevelData = (level: number): LevelData | undefined => {
  return LEVELS.find(l => l.level === level);
};

/**
 * 檢查是否升級
 */
export const checkLevelUp = (oldExp: number, newExp: number): {
  leveledUp: boolean;
  oldLevel: number;
  newLevel: number;
  levelData?: LevelData;
} => {
  const oldLevelData = calculateLevel(oldExp);
  const newLevelData = calculateLevel(newExp);

  const leveledUp = newLevelData.level > oldLevelData.level;

  return {
    leveledUp,
    oldLevel: oldLevelData.level,
    newLevel: newLevelData.level,
    levelData: leveledUp ? getLevelData(newLevelData.level) : undefined
  };
};

/**
 * 等級系統統計
 */
export const getLevelSystemStats = () => {
  const maxLevel = LEVELS[LEVELS.length - 1].level;
  const totalExpRequired = LEVELS[LEVELS.length - 1].requiredExp;
  const totalGemsReward = LEVELS.reduce((sum, level) => sum + level.rewards.gems, 0);
  const totalItemsReward = LEVELS.reduce((sum, level) => sum + (level.rewards.items?.length || 0), 0);

  return {
    maxLevel,
    totalExpRequired,
    totalGemsReward,
    totalItemsReward,
    levels: LEVELS.length
  };
};
