// 文法主題結構化數據
// 從 Google Sheets 整理而來

export interface GrammarSubTopic {
  name: string;
  accuracy?: number; // 0-100，未來從資料庫計算
}

export interface GrammarMiddleTopic {
  name: string;
  subTopics: GrammarSubTopic[];
  accuracy?: number;
}

export interface GrammarMainTopic {
  name: string;
  middleTopics: GrammarMiddleTopic[];
  accuracy?: number;
}

export const GRAMMAR_TOPICS: GrammarMainTopic[] = [
  {
    name: "句子基本觀念",
    middleTopics: [
      {
        name: "五大句型",
        subTopics: [
          { name: "第一句型:S Vi." },
          { name: "第二句型:S Vi SC." },
          { name: "第三句型:S Vt O." },
          { name: "第四句型:S Vt IO DO." },
          { name: "第五句型:S Vt O OC." },
          { name: "名詞子句" },
          { name: "副詞子句" },
          { name: "形容詞子句" },
          { name: "句子結構分析" },
        ]
      },
      {
        name: "SV一致",
        subTopics: [
          { name: "單數主詞" },
          { name: "複數主詞" },
          { name: "視意義而定" },
          { name: "視情況而定" },
          { name: "其他" },
        ]
      },
      {
        name: "主詞",
        subTopics: [
          { name: "主詞單複數一致" },
          { name: "集合名詞用法" },
          { name: "不定代名詞作主詞" },
        ]
      },
      {
        name: "動詞",
        subTopics: [
          { name: "動詞時態錯誤" },
          { name: "主動被動語態" },
        ]
      },
      {
        name: "補語",
        subTopics: [
          { name: "名詞補語 vs 形容詞補語" },
          { name: "OC：V-ing vs p.p." },
        ]
      },
      {
        name: "受詞",
        subTopics: [
          { name: "whether vs if 作受詞" },
          { name: "that 名詞子句" },
        ]
      },
    ]
  },
  {
    name: "時態與語態",
    middleTopics: [
      {
        name: "時態",
        subTopics: [
          { name: "現在簡單式" },
          { name: "現在進行式" },
          { name: "現在完成式" },
          { name: "現在完成進行式" },
          { name: "過去簡單式" },
          { name: "過去進行式" },
          { name: "過去完成式" },
          { name: "過去完成進行式" },
          { name: "未來簡單式" },
          { name: "未來進行式" },
          { name: "未來完成式" },
          { name: "未來完成進行式" },
          { name: "混合時態考題" },
        ]
      },
      {
        name: "語態",
        subTopics: [
          { name: "現在簡單被動式" },
          { name: "現在進行被動式" },
          { name: "現在完成被動式" },
          { name: "現在完成進行被動式" },
          { name: "過去簡單被動式" },
          { name: "過去進行被動式" },
          { name: "過去完成被動式" },
          { name: "過去完成進行被動式" },
          { name: "未來簡單被動式" },
          { name: "未來進行被動式" },
          { name: "未來完成被動式" },
          { name: "未來完成進行被動式" },
          { name: "時態語態混合考題" },
        ]
      },
    ]
  },
  {
    name: "助動詞",
    middleTopics: [
      {
        name: "助動詞",
        subTopics: [
          { name: "have" },
          { name: "do" },
          { name: "shall/should" },
          { name: "will/would" },
          { name: "can/could" },
          { name: "may/might" },
          { name: "must/have to" },
          { name: "ought to" },
          { name: "need/dare" },
          { name: "used to" },
          { name: "had better" },
          { name: "should have pp" },
          { name: "must have pp" },
          { name: "其他" },
        ]
      },
      {
        name: "情態動詞",
        subTopics: [
          { name: "情態動詞用法" },
        ]
      },
    ]
  },
  {
    name: "假設與條件句",
    middleTopics: [
      {
        name: "假設語氣",
        subTopics: [
          { name: "條件句" },
          { name: "與現在事實相反" },
          { name: "與過去事實相反" },
          { name: "與未來事實相反" },
          { name: "省略if" },
          { name: "S wish" },
          { name: "as if/as though" },
          { name: "It is time" },
          { name: "But for/Without" },
          { name: "insist/suggest" },
          { name: "It is necessary" },
          { name: "前半過反後半現反" },
        ]
      },
    ]
  },
  {
    name: "動詞相關用法",
    middleTopics: [
      {
        name: "不定詞",
        subTopics: [
          { name: "不定詞當名詞用" },
          { name: "不定詞當形容詞用" },
          { name: "不定詞當副詞用" },
          { name: "省略to的不定詞" },
          { name: "不定詞慣用語" },
          { name: "不定詞時態" },
          { name: "不定詞語態" },
          { name: "獨立不定詞" },
          { name: "to V 作受詞" },
        ]
      },
      {
        name: "動名詞",
        subTopics: [
          { name: "只能加動名詞的V" },
          { name: "加動名詞意思不同的V" },
          { name: "需加動名詞的to" },
          { name: "動名詞慣用語" },
          { name: "含動名詞句型" },
          { name: "V-ing 作受詞" },
        ]
      },
      {
        name: "動名詞與不定詞",
        subTopics: [
          { name: "remember / forget / stop 用法" },
        ]
      },
      {
        name: "分詞",
        subTopics: [
          { name: "分詞構句" },
          { name: "關代分詞化省略" },
          { name: "分詞當形容詞用" },
          { name: "廣義使役V" },
          { name: "複合形容詞" },
          { name: "慣用語" },
          { name: "情緒動詞" },
        ]
      },
      {
        name: "動詞",
        subTopics: [
          { name: "易混V" },
          { name: "及物不及物" },
          { name: "動詞後方所加介系詞/文法結構" },
        ]
      },
    ]
  },
  {
    name: "名詞代詞冠詞",
    middleTopics: [
      {
        name: "冠詞",
        subTopics: [
          { name: "冠詞" },
        ]
      },
      {
        name: "名詞",
        subTopics: [
          { name: "集合名詞" },
          { name: "單位詞" },
          { name: "複數不規則變化" },
          { name: "名詞所有格" },
          { name: "雙重所有格" },
          { name: "名詞相關用法" },
          { name: "情緒名詞" },
          { name: "可數 vs 不可數" },
        ]
      },
      {
        name: "代名詞",
        subTopics: [
          { name: "人稱代名詞" },
          { name: "所有代名詞" },
          { name: "反身代名詞" },
          { name: "指示代名詞this/that" },
          { name: "不定代名詞some/any/another/others/…" },
          { name: "疑問代名詞" },
          { name: "主格 vs 受格" },
          { name: "this / that / these / those" },
          { name: "everyone / anyone / no one 用法" },
        ]
      },
      {
        name: "名詞與限定詞",
        subTopics: [
          { name: "a / an / the" },
          { name: "few / a few / little / a little" },
          { name: "much / many" },
        ]
      },
      {
        name: "量詞",
        subTopics: [
          { name: "each / every / both / either / neither" },
        ]
      },
    ]
  },
  {
    name: "形容詞及副詞",
    middleTopics: [
      {
        name: "形容詞",
        subTopics: [
          { name: "數量形容詞" },
          { name: "可數不可數" },
          { name: "比較級" },
          { name: "最高級" },
          { name: "倍數句型" },
          { name: "其他" },
        ]
      },
      {
        name: "副詞",
        subTopics: [
          { name: "地方副詞" },
          { name: "介副詞" },
          { name: "疑問副詞" },
          { name: "易混淆副詞" },
          { name: "特殊副詞用法" },
          { name: "修飾句子的副詞" },
          { name: "其他" },
        ]
      },
      {
        name: "形容詞副詞",
        subTopics: [
          { name: "good vs well" },
          { name: "hard vs hardly" },
          { name: "比較級/最高級" },
        ]
      },
      {
        name: "修飾語",
        subTopics: [
          { name: "only 的位置" },
        ]
      },
    ]
  },
  {
    name: "關係詞",
    middleTopics: [
      {
        name: "關係詞",
        subTopics: [
          { name: "非限定用法" },
          { name: "準關代" },
          { name: "關係形容詞" },
          { name: "關係副詞" },
          { name: "複合關係代名詞" },
        ]
      },
    ]
  },
  {
    name: "子句",
    middleTopics: [
      {
        name: "名詞子句",
        subTopics: [
          { name: "that 名詞子句" },
          { name: "whether / if 名詞子句" },
          { name: "疑問詞名詞子句" },
        ]
      },
      {
        name: "形容詞子句",
        subTopics: [
          { name: "限定用法關係子句" },
          { name: "非限定用法關係子句" },
          { name: "關係代名詞選擇" },
        ]
      },
      {
        name: "副詞子句",
        subTopics: [
          { name: "時間副詞子句" },
          { name: "原因副詞子句" },
          { name: "讓步副詞子句" },
          { name: "條件副詞子句" },
        ]
      },
    ]
  },
  {
    name: "特殊句構",
    middleTopics: [
      {
        name: "連接詞",
        subTopics: [
          { name: "對等連接詞" },
          { name: "相關連接詞" },
          { name: "引導名詞子句的連接詞" },
          { name: "引導副詞子句的連接詞" },
          { name: "其他" },
          { name: "FANBOYS 對等連接詞" },
          { name: "從屬連接詞" },
          { name: "不定詞連接 (in order to)" },
        ]
      },
      {
        name: "否定句/倒裝句",
        subTopics: [
          { name: "否定句/倒裝句" },
          { name: "倒裝句" },
        ]
      },
      {
        name: "疑問句/附加問句/間接引句",
        subTopics: [
          { name: "疑問句/附加問句/間接引句" },
        ]
      },
      {
        name: "特殊結構",
        subTopics: [
          { name: "分詞構句" },
          { name: "It is ... that ... 強調句" },
        ]
      },
    ]
  },
  {
    name: "介係詞",
    middleTopics: [
      {
        name: "介係詞",
        subTopics: [
          { name: "介係詞" },
        ]
      },
      {
        name: "時間介系詞",
        subTopics: [
          { name: "in / on / at (時間)" },
        ]
      },
      {
        name: "地點介系詞",
        subTopics: [
          { name: "in / on / at (地點)" },
        ]
      },
      {
        name: "片語介系詞",
        subTopics: [
          { name: "片語動詞中的介系詞" },
        ]
      },
    ]
  },
  {
    name: "單字",
    middleTopics: [
      {
        name: "單字",
        subTopics: [
          { name: "單字" },
        ]
      },
    ]
  },
  {
    name: "片語",
    middleTopics: [
      {
        name: "片語",
        subTopics: [
          { name: "片語" },
        ]
      },
    ]
  },
];

// 生成 Mock 數據（未來會從資料庫計算）
export function generateMockGrammarData(): GrammarMainTopic[] {
  return GRAMMAR_TOPICS.map((mainTopic) => ({
    ...mainTopic,
    middleTopics: mainTopic.middleTopics.map((middleTopic) => ({
      ...middleTopic,
      subTopics: middleTopic.subTopics.map((subTopic) => ({
        ...subTopic,
        // 生成隨機正確率 (50-95%)
        accuracy: Math.floor(Math.random() * 45) + 50,
      })),
      // 計算中主題平均正確率
      accuracy: 0,
    })),
    accuracy: 0,
  })).map((mainTopic) => {
    // 計算中主題平均
    mainTopic.middleTopics = mainTopic.middleTopics.map((middleTopic) => {
      const avg = Math.round(
        middleTopic.subTopics.reduce((sum, st) => sum + (st.accuracy || 0), 0) /
        middleTopic.subTopics.length
      );
      return { ...middleTopic, accuracy: avg };
    });

    // 計算大主題平均
    const mainAvg = Math.round(
      mainTopic.middleTopics.reduce((sum, mt) => sum + (mt.accuracy || 0), 0) /
      mainTopic.middleTopics.length
    );

    return { ...mainTopic, accuracy: mainAvg };
  });
}
