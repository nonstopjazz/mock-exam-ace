import { Trophy, Award, Star, Zap, Target, Crown, Medal, Flame, BookOpen, Brain, Sparkles, Heart, TrendingUp, Calendar, Gift, Shield } from "lucide-react";

export type AchievementRarity = "Common" | "Rare" | "Epic" | "Legendary";
export type AchievementCategory = "累積作答" | "連續挑戰" | "完美答題" | "活動限定";

export interface Achievement {
  id: string;
  name: string;
  nameEn: string;
  description: string;
  icon: typeof Trophy;
  category: AchievementCategory;
  rarity: AchievementRarity;
  condition: string;
  rewards: {
    exp: number;
    gems: number;
    items?: string[];
  };
  maxProgress?: number;
  iconSuggestion: string;
}

/**
 * 完整成就系統數據
 * 
 * 📊 成就分類：
 * - 累積作答：累積答題數量、學習時長等
 * - 連續挑戰：連續登入、連續答對等
 * - 完美答題：滿分、高準確率等
 * - 活動限定：季節活動、特殊挑戰等
 * 
 * 🎁 獎勵內容：
 * - exp: 經驗值（用於升級）
 * - gems: 寶石金幣（商城貨幣）
 * - items: 虛擬道具（稀有徽章、頭像框、特效等）
 */
export const ACHIEVEMENTS: Achievement[] = [
  // ========== 累積作答系列 ==========
  {
    id: "cumulative_001",
    name: "初心探索者",
    nameEn: "First Explorer",
    description: "完成第一次任務",
    condition: "完成 1 次任務",
    icon: Star,
    category: "累積作答",
    rarity: "Common",
    rewards: { exp: 50, gems: 10 },
    maxProgress: 1,
    iconSuggestion: "星星圖標，代表起點"
  },
  {
    id: "cumulative_002",
    name: "勤奮學習者",
    nameEn: "Diligent Learner",
    description: "累積完成 10 次任務",
    condition: "完成 10 次任務",
    icon: BookOpen,
    category: "累積作答",
    rarity: "Common",
    rewards: { exp: 100, gems: 25 },
    maxProgress: 10,
    iconSuggestion: "打開的書本"
  },
  {
    id: "cumulative_003",
    name: "知識獵人",
    nameEn: "Knowledge Hunter",
    description: "累積完成 50 次任務",
    condition: "完成 50 次任務",
    icon: Target,
    category: "累積作答",
    rarity: "Rare",
    rewards: { exp: 300, gems: 75, items: ["稀有頭像框：獵人"] },
    maxProgress: 50,
    iconSuggestion: "靶心圖標"
  },
  {
    id: "cumulative_004",
    name: "詞彙大師",
    nameEn: "Vocabulary Master",
    description: "累積學習 500 個單字",
    condition: "學習 500 個單字",
    icon: Brain,
    category: "累積作答",
    rarity: "Epic",
    rewards: { exp: 500, gems: 150, items: ["史詩稱號：詞彙大師", "特殊特效：文字雨"] },
    maxProgress: 500,
    iconSuggestion: "大腦圖標"
  },
  {
    id: "cumulative_005",
    name: "語言傳奇",
    nameEn: "Language Legend",
    description: "累積完成 200 次任務",
    condition: "完成 200 次任務",
    icon: Crown,
    category: "累積作答",
    rarity: "Legendary",
    rewards: { exp: 1000, gems: 500, items: ["傳說徽章：語言之王", "獨特頭像框：金色皇冠", "專屬動畫特效"] },
    maxProgress: 200,
    iconSuggestion: "皇冠，代表最高榮譽"
  },
  {
    id: "cumulative_006",
    name: "千題挑戰者",
    nameEn: "Millennium Challenger",
    description: "累積答題 1000 題",
    condition: "答題 1000 題",
    icon: Trophy,
    category: "累積作答",
    rarity: "Epic",
    rewards: { exp: 800, gems: 300, items: ["史詩徽章：千題達成"] },
    maxProgress: 1000,
    iconSuggestion: "獎盃"
  },
  {
    id: "cumulative_007",
    name: "時光旅者",
    nameEn: "Time Traveler",
    description: "累積學習時間達 100 小時",
    condition: "學習 100 小時",
    icon: Calendar,
    category: "累積作答",
    rarity: "Rare",
    rewards: { exp: 400, gems: 100, items: ["稀有稱號：時光旅者"] },
    maxProgress: 100,
    iconSuggestion: "日曆或時鐘"
  },

  // ========== 連續挑戰系列 ==========
  {
    id: "streak_001",
    name: "三日之約",
    nameEn: "Three Day Promise",
    description: "連續 3 天登入並完成任務",
    condition: "連續登入 3 天",
    icon: Flame,
    category: "連續挑戰",
    rarity: "Common",
    rewards: { exp: 80, gems: 20 },
    maxProgress: 3,
    iconSuggestion: "小火焰"
  },
  {
    id: "streak_002",
    name: "週戰士",
    nameEn: "Week Warrior",
    description: "連續 7 天登入並完成任務",
    condition: "連續登入 7 天",
    icon: Zap,
    category: "連續挑戰",
    rarity: "Rare",
    rewards: { exp: 250, gems: 60, items: ["稀有特效：閃電連擊"] },
    maxProgress: 7,
    iconSuggestion: "閃電符號"
  },
  {
    id: "streak_003",
    name: "月度傳奇",
    nameEn: "Monthly Legend",
    description: "連續 30 天登入並完成任務",
    condition: "連續登入 30 天",
    icon: Medal,
    category: "連續挑戰",
    rarity: "Epic",
    rewards: { exp: 600, gems: 200, items: ["史詩徽章：堅持之星", "稀有頭像框：月光"] },
    maxProgress: 30,
    iconSuggestion: "獎牌"
  },
  {
    id: "streak_004",
    name: "百日築基",
    nameEn: "Hundred Day Foundation",
    description: "連續 100 天登入並完成任務",
    condition: "連續登入 100 天",
    icon: Shield,
    category: "連續挑戰",
    rarity: "Legendary",
    rewards: { exp: 1500, gems: 800, items: ["傳說徽章：百日宗師", "獨特稱號：不懈探索者", "專屬動畫：盾牌光環"] },
    maxProgress: 100,
    iconSuggestion: "盾牌，象徵堅韌"
  },
  {
    id: "streak_005",
    name: "連勝五星",
    nameEn: "Five Wins Streak",
    description: "連續 5 次任務獲得 90% 以上準確率",
    condition: "連續 5 次 90%+ 準確率",
    icon: TrendingUp,
    category: "連續挑戰",
    rarity: "Rare",
    rewards: { exp: 200, gems: 50 },
    maxProgress: 5,
    iconSuggestion: "上升趨勢圖"
  },
  {
    id: "streak_006",
    name: "連擊大師",
    nameEn: "Combo Master",
    description: "單次任務中達成 10 連擊",
    condition: "達成 10 連擊",
    icon: Sparkles,
    category: "連續挑戰",
    rarity: "Epic",
    rewards: { exp: 350, gems: 120, items: ["史詩特效：連擊火花"] },
    maxProgress: 10,
    iconSuggestion: "火花閃爍"
  },

  // ========== 完美答題系列 ==========
  {
    id: "perfect_001",
    name: "初次完美",
    nameEn: "First Perfect",
    description: "首次在任務中達成 100% 準確率",
    condition: "獲得 100% 準確率",
    icon: Star,
    category: "完美答題",
    rarity: "Common",
    rewards: { exp: 100, gems: 30 },
    maxProgress: 1,
    iconSuggestion: "金色星星"
  },
  {
    id: "perfect_002",
    name: "完美五連",
    nameEn: "Perfect Five",
    description: "連續 5 次任務達成 100% 準確率",
    condition: "連續 5 次 100% 準確率",
    icon: Target,
    category: "完美答題",
    rarity: "Rare",
    rewards: { exp: 300, gems: 100, items: ["稀有稱號：完美主義者"] },
    maxProgress: 5,
    iconSuggestion: "完美靶心"
  },
  {
    id: "perfect_003",
    name: "速度與激情",
    nameEn: "Speed and Passion",
    description: "在 10 秒內答對 5 題",
    condition: "10 秒內答對 5 題",
    icon: Zap,
    category: "完美答題",
    rarity: "Epic",
    rewards: { exp: 400, gems: 150, items: ["史詩徽章：極速回答", "特殊特效：閃電軌跡"] },
    maxProgress: 5,
    iconSuggestion: "閃電"
  },
  {
    id: "perfect_004",
    name: "完美十傑",
    nameEn: "Perfect Ten",
    description: "累積達成 10 次完美任務",
    condition: "累積 10 次 100% 準確率",
    icon: Crown,
    category: "完美答題",
    rarity: "Epic",
    rewards: { exp: 500, gems: 200, items: ["史詩頭像框：完美光環"] },
    maxProgress: 10,
    iconSuggestion: "皇冠"
  },
  {
    id: "perfect_005",
    name: "無瑕傳說",
    nameEn: "Flawless Legend",
    description: "連續 20 次任務達成 100% 準確率",
    condition: "連續 20 次 100% 準確率",
    icon: Medal,
    category: "完美答題",
    rarity: "Legendary",
    rewards: { exp: 2000, gems: 1000, items: ["傳說徽章：無瑕之神", "獨特稱號：完美化身", "專屬特效：聖光環繞"] },
    maxProgress: 20,
    iconSuggestion: "發光獎牌"
  },
  {
    id: "perfect_006",
    name: "一擊必殺",
    nameEn: "One Hit Perfect",
    description: "單次任務：首次答題且全對",
    condition: "首次嘗試全對",
    icon: Award,
    category: "完美答題",
    rarity: "Rare",
    rewards: { exp: 250, gems: 80 },
    maxProgress: 1,
    iconSuggestion: "獎勵徽章"
  },

  // ========== 活動限定系列 ==========
  {
    id: "event_001",
    name: "春日覺醒",
    nameEn: "Spring Awakening",
    description: "參與春季活動並完成 10 個特別任務",
    condition: "春季活動：完成 10 個任務",
    icon: Gift,
    category: "活動限定",
    rarity: "Rare",
    rewards: { exp: 300, gems: 100, items: ["限定徽章：春之花", "季節頭像框：櫻花"] },
    maxProgress: 10,
    iconSuggestion: "禮物盒"
  },
  {
    id: "event_002",
    name: "夏日挑戰",
    nameEn: "Summer Challenge",
    description: "參與夏季活動並達成 50 次連擊",
    condition: "夏季活動：累積 50 連擊",
    icon: Sparkles,
    category: "活動限定",
    rarity: "Epic",
    rewards: { exp: 500, gems: 200, items: ["史詩徽章：夏日火焰", "限定特效：煙火慶典"] },
    maxProgress: 50,
    iconSuggestion: "閃耀星星"
  },
  {
    id: "event_003",
    name: "秋收慶典",
    nameEn: "Autumn Harvest",
    description: "參與秋季活動並收集 100 個特殊寶石",
    condition: "秋季活動：收集 100 寶石",
    icon: Trophy,
    category: "活動限定",
    rarity: "Epic",
    rewards: { exp: 600, gems: 250, items: ["史詩徽章：豐收之秋", "限定稱號：收穫者"] },
    maxProgress: 100,
    iconSuggestion: "獎盃"
  },
  {
    id: "event_004",
    name: "冬日奇蹟",
    nameEn: "Winter Miracle",
    description: "參與冬季活動並在 12 月達成 20 次完美任務",
    condition: "冬季活動：20 次完美任務",
    icon: Crown,
    category: "活動限定",
    rarity: "Legendary",
    rewards: { exp: 1000, gems: 500, items: ["傳說徽章：冬之奇蹟", "獨特頭像框：雪花水晶", "專屬特效：雪花飛舞"] },
    maxProgress: 20,
    iconSuggestion: "皇冠"
  },
  {
    id: "event_005",
    name: "週末戰士",
    nameEn: "Weekend Warrior",
    description: "在週末兩天完成 5 個任務",
    condition: "週末完成 5 個任務",
    icon: Zap,
    category: "活動限定",
    rarity: "Common",
    rewards: { exp: 150, gems: 40 },
    maxProgress: 5,
    iconSuggestion: "閃電"
  },
  {
    id: "event_006",
    name: "新年新氣象",
    nameEn: "New Year New Me",
    description: "在 1 月 1 日完成首個任務",
    condition: "新年首日完成任務",
    icon: Gift,
    category: "活動限定",
    rarity: "Rare",
    rewards: { exp: 200, gems: 100, items: ["限定徽章：新年祝福"] },
    maxProgress: 1,
    iconSuggestion: "禮物"
  },
  {
    id: "event_007",
    name: "全球挑戰賽",
    nameEn: "Global Challenge",
    description: "參與全球挑戰賽並進入前 100 名",
    condition: "全球排名前 100",
    icon: Medal,
    category: "活動限定",
    rarity: "Legendary",
    rewards: { exp: 1500, gems: 800, items: ["傳說徽章：全球菁英", "獨特稱號：世界挑戰者", "專屬動畫：全球光環"] },
    maxProgress: 1,
    iconSuggestion: "金牌"
  },

  // ========== 特殊成就系列 ==========
  {
    id: "special_001",
    name: "社交達人",
    nameEn: "Social Master",
    description: "邀請 5 位好友加入",
    condition: "邀請 5 位好友",
    icon: Heart,
    category: "累積作答",
    rarity: "Rare",
    rewards: { exp: 200, gems: 100, items: ["稀有稱號：社交達人"] },
    maxProgress: 5,
    iconSuggestion: "愛心"
  },
  {
    id: "special_002",
    name: "全能學者",
    nameEn: "All-Round Scholar",
    description: "在所有 10 個主題領域都取得至少一個完美任務",
    condition: "所有領域各 1 次完美",
    icon: Brain,
    category: "完美答題",
    rarity: "Epic",
    rewards: { exp: 700, gems: 300, items: ["史詩徽章：全能學者", "特殊頭像框：彩虹光環"] },
    maxProgress: 10,
    iconSuggestion: "大腦"
  }
];

/**
 * 根據稀有度獲取成就顏色
 */
export const getRarityColor = (rarity: AchievementRarity): string => {
  switch (rarity) {
    case "Common":
      return "bg-muted text-muted-foreground";
    case "Rare":
      return "bg-secondary/20 text-secondary border-secondary/30";
    case "Epic":
      return "bg-accent/20 text-accent border-accent/30";
    case "Legendary":
      return "bg-primary/20 text-primary border-primary/30";
    default:
      return "bg-muted";
  }
};

/**
 * 根據稀有度獲取成就統計
 */
export const getAchievementStats = () => {
  const total = ACHIEVEMENTS.length;
  const byRarity = {
    Common: ACHIEVEMENTS.filter(a => a.rarity === "Common").length,
    Rare: ACHIEVEMENTS.filter(a => a.rarity === "Rare").length,
    Epic: ACHIEVEMENTS.filter(a => a.rarity === "Epic").length,
    Legendary: ACHIEVEMENTS.filter(a => a.rarity === "Legendary").length,
  };
  const byCategory = {
    累積作答: ACHIEVEMENTS.filter(a => a.category === "累積作答").length,
    連續挑戰: ACHIEVEMENTS.filter(a => a.category === "連續挑戰").length,
    完美答題: ACHIEVEMENTS.filter(a => a.category === "完美答題").length,
    活動限定: ACHIEVEMENTS.filter(a => a.category === "活動限定").length,
  };
  
  return { total, byRarity, byCategory };
};
