// 雙層同心圓用的文法分類數據（大分類 + 中分類）

export interface GrammarMiddleCategory {
  id: number; // (1) - (22)
  name: string;
  accuracy?: number;
}

export interface GrammarMainCategory {
  id: number; // 1 - 12
  name: string;
  middleCategories: GrammarMiddleCategory[];
  accuracy?: number;
}

export const GRAMMAR_DOUGHNUT_DATA: GrammarMainCategory[] = [
  {
    id: 1,
    name: "句子基本觀念",
    middleCategories: [
      { id: 1, name: "五大句型" },
      { id: 2, name: "SV一致" },
    ],
  },
  {
    id: 2,
    name: "時態與語態",
    middleCategories: [
      { id: 3, name: "時態" },
      { id: 4, name: "語態" },
    ],
  },
  {
    id: 3,
    name: "助動詞",
    middleCategories: [
      { id: 5, name: "助動詞" },
    ],
  },
  {
    id: 4,
    name: "假設與條件句",
    middleCategories: [
      { id: 6, name: "假設與條件句" },
    ],
  },
  {
    id: 5,
    name: "動詞相關用法",
    middleCategories: [
      { id: 7, name: "不定詞" },
      { id: 8, name: "動名詞" },
      { id: 9, name: "分詞" },
      { id: 10, name: "動詞" },
    ],
  },
  {
    id: 6,
    name: "名詞代詞冠詞",
    middleCategories: [
      { id: 11, name: "冠詞" },
      { id: 12, name: "名詞" },
      { id: 13, name: "代名詞" },
    ],
  },
  {
    id: 7,
    name: "形容詞及副詞",
    middleCategories: [
      { id: 14, name: "形容詞" },
      { id: 15, name: "副詞" },
    ],
  },
  {
    id: 8,
    name: "關係詞",
    middleCategories: [
      { id: 16, name: "關係詞" },
    ],
  },
  {
    id: 9,
    name: "特殊句構",
    middleCategories: [
      { id: 17, name: "連接詞" },
      { id: 18, name: "否定句/倒裝句" },
      { id: 19, name: "疑問句/附加問句/間接問句" },
    ],
  },
  {
    id: 10,
    name: "介係詞",
    middleCategories: [
      { id: 20, name: "介係詞" },
    ],
  },
  {
    id: 11,
    name: "單字",
    middleCategories: [
      { id: 21, name: "單字" },
    ],
  },
  {
    id: 12,
    name: "片語",
    middleCategories: [
      { id: 22, name: "片語" },
    ],
  },
];

// 生成模擬數據（隨機準確度）
export function generateMockDoughnutData(): GrammarMainCategory[] {
  return GRAMMAR_DOUGHNUT_DATA.map((mainCat) => {
    const middleWithAccuracy = mainCat.middleCategories.map((middleCat) => ({
      ...middleCat,
      accuracy: Math.floor(Math.random() * 45) + 50, // 50-95%
    }));

    const avgAccuracy =
      middleWithAccuracy.reduce((sum, cat) => sum + (cat.accuracy || 0), 0) /
      middleWithAccuracy.length;

    return {
      ...mainCat,
      middleCategories: middleWithAccuracy,
      accuracy: Math.round(avgAccuracy),
    };
  });
}
