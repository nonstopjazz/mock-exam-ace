/**
 * Parent Dashboard — mock data (prototype v1)
 *
 * 這一份是 UI prototype 的假資料，形狀刻意接近未來 API response，
 * 之後只要把 `parentDashboardMock` 換成 fetch 結果即可。
 *
 * 注意：這是 descriptive analytics 的示意，不是正式的 mastery 演算法輸出。
 */

export type Trend = "up" | "flat" | "down";

/** 家長看得懂的三種狀態，避免使用內部 taxonomy 詞彙 */
export type Standing = "improving" | "stable" | "focus";

export interface ScoreItem {
  label: string;
  /** 0–100；insufficient 時為 null，UI 必須顯示「尚無足夠資料」而非 0 */
  value: number | null;
  trend?: Trend;
  note?: string;
}

export interface DomainOverview {
  key: string;
  label: string;
  value: number | null;
  trend: Trend;
  standing: Standing | null;
}

export interface HeatmapDay {
  date: string;
  /** 0 = 無活動，1–4 = 活躍程度 */
  level: 0 | 1 | 2 | 3 | 4;
}

export const parentDashboardMock = {
  student: {
    name: "王小明",
    initials: "王",
    grade: "高二",
    program: "高中英文進階班",
    pendingTasks: 2,
    upcomingGoal: {
      title: "第二次段考",
      dateLabel: "10 月 14 日",
      daysLeft: 23,
    },
    teacherWeeklySummary:
      "這週長句拆解的速度明顯變快，翻譯的句型選擇也更穩定。接下來會把重點放在時態一致與閱讀推論。",
  },

  monthlySummary: {
    monthLabel: "9 月",
    improved: {
      title: "明顯進步",
      body: "閱讀的細節擷取與翻譯表現，這個月都有穩定成長。",
      detail: "細節擷取 +12",
    },
    stable: {
      title: "表現穩定",
      body: "單字量與課堂參與維持得很好，複習習慣沒有中斷。",
      detail: "連續 18 天有練習",
    },
    focus: {
      title: "優先加強",
      body: "閱讀推論題還不太穩，遇到沒有直接寫出答案的題目容易猶豫。",
      detail: "推論引申 58",
    },
    nextStep: {
      title: "老師下一步",
      body: "接下來兩週會針對推論題做專門練習，並補強動詞時態的一致性。",
      detail: "10/1 起 · 每週 2 次",
    },
  },

  engagement: {
    attendanceRate: 95,
    attendanceLabel: "19 / 20 堂",
    homeworkRate: 88,
    homeworkLabel: "22 / 25 份",
    practiceCount: 146,
    practiceLabel: "本月線上練習題數",
    activeDays: 18,
    activeDaysTotal: 30,
    weeklyTrend: [
      { week: "第 1 週", value: 26 },
      { week: "第 2 週", value: 34 },
      { week: "第 3 週", value: 41 },
      { week: "第 4 週", value: 45 },
    ],
    /** 30 天，index 0 = 最早 */
    heatmap: [
      2, 3, 0, 1, 4, 3, 0,
      2, 4, 3, 3, 0, 1, 2,
      3, 4, 4, 2, 0, 3, 3,
      4, 2, 3, 4, 1, 0, 3,
      4, 3,
    ].map((level, i): HeatmapDay => ({
      date: `9/${i + 1}`,
      level: level as HeatmapDay["level"],
    })),
  },

  abilityOverview: [
    { key: "reading", label: "閱讀", value: 74, trend: "up", standing: "improving" },
    { key: "vocabulary", label: "單字", value: 81, trend: "flat", standing: "stable" },
    { key: "grammar", label: "文法", value: 66, trend: "up", standing: "focus" },
    { key: "listening", label: "聽力", value: 70, trend: "flat", standing: "stable" },
    { key: "writing", label: "寫作", value: 63, trend: "up", standing: "focus" },
    // 口說目前沒有足夠的線上練習紀錄 → 必須顯示「尚無足夠資料」
    { key: "speaking", label: "口說", value: null, trend: "flat", standing: null },
  ] as DomainOverview[],

  reading: {
    summary: "整體閱讀在進步，主旨與細節都很穩；推論題是目前最需要加強的部分。",
    categories: [
      { label: "掌握主旨", value: 82, trend: "up" },
      { label: "擷取細節", value: 85, trend: "up", note: "本月 +12" },
      { label: "理解語境", value: 76, trend: "flat" },
      { label: "推論引申", value: 58, trend: "flat", note: "優先加強" },
      { label: "篇章結構", value: 71, trend: "up" },
      { label: "作者意圖與風格", value: 68, trend: "flat" },
    ] as ScoreItem[],
  },

  vocabulary: {
    summary: "第 4 級的字正在累積中，第 5、6 級才剛開始接觸。",
    levels: [
      { label: "第 1 級", learned: 1180, total: 1200 },
      { label: "第 2 級", learned: 1050, total: 1100 },
      { label: "第 3 級", learned: 920, total: 1100 },
      { label: "第 4 級", learned: 610, total: 1100 },
      { label: "第 5 級", learned: 240, total: 1100 },
      { label: "第 6 級", learned: 60, total: 1000 },
    ],
    stats: {
      learned: 4060,
      stable: 3120,
      reviewing: 640,
      newThisMonth: 185,
    },
  },

  grammar: {
    recentScore: 66,
    recentLabel: "近一個月練習正確率",
    trend: "up" as Trend,
    summary: "句子結構的掌握不錯，時態一致與非限定用法還需要多練。",
    strengths: ["關係子句與關係詞", "形容詞、副詞與比較"],
    needsWork: ["動詞、時態與語態", "不定詞、動名詞與分詞"],
  },

  listening: {
    summary: "聽得懂內容細節，但要「推論沒有直接說出來的意思」時比較吃力。",
    categories: [
      { label: "語音辨識", value: 78, trend: "flat" },
      { label: "字面理解", value: 80, trend: "up" },
      { label: "推論理解", value: 61, trend: "flat", note: "優先加強" },
      { label: "篇章整合", value: 66, trend: "up" },
    ] as ScoreItem[],
  },

  writing: {
    summary: "內容想法完整，段落之間的銜接和時態一致性是接下來的重點。",
    categories: [
      { label: "內容與任務完成", short: "內容", value: 72 },
      { label: "組織與連貫", short: "組織", value: 64 },
      { label: "詞彙運用", short: "詞彙", value: 70 },
      { label: "句構與文法", short: "文法", value: 58 },
      { label: "語體與讀者", short: "語體", value: 66 },
    ],
    trend: [
      { label: "6 月", value: 55 },
      { label: "7 月", value: 58 },
      { label: "8 月", value: 61 },
      { label: "9 月", value: 66 },
    ],
    commonErrors: [
      { label: "時態一致", count: 9 },
      { label: "冠詞", count: 6 },
      { label: "中式英文", count: 5 },
      { label: "標點符號", count: 3 },
    ],
    highlights: ["善用對比句型", "結尾有回扣主題", "句型長短交替自然"],
    teacherNote:
      "這個月的作文明顯比上個月完整，論點也更清楚。下一步是把段落之間的連接詞用得更自然。",
  },

  speaking: {
    summary: "口說的線上練習次數還不多，目前只做課堂觀察，尚未產生完整分析。",
    hasEnoughData: false,
    categories: [
      { label: "流暢與連貫", short: "流暢", value: 62 },
      { label: "詞彙運用", short: "詞彙", value: 58 },
      { label: "文法運用", short: "文法", value: 55 },
      { label: "發音與語調", short: "發音", value: 67 },
    ],
    recordings: [
      { label: "8/12", value: 54 },
      { label: "8/26", value: 58 },
      { label: "9/09", value: 61 },
      { label: "9/23", value: 64 },
    ],
  },

  teacherEvaluation: {
    updatedLabel: "9 月 27 日更新",
    metrics: [
      { label: "閱讀理解", rating: 4 },
      { label: "翻譯表現", rating: 4 },
      { label: "單字掌握", rating: 4 },
      { label: "文法運用", rating: 3 },
      { label: "課堂參與", rating: 5 },
      { label: "作業態度", rating: 4 },
    ],
    comment:
      "長句拆解速度明顯提升，近期會集中補強時態與推論閱讀。課堂上很願意舉手回答，這點請家長多鼓勵。",
    teacherName: "林老師",
  },
};

export type ParentDashboardData = typeof parentDashboardMock;
