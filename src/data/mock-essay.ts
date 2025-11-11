// TODO: 未來從 API 拉取作文題目與批改結果
// GET /api/essay/prompts - 取得作文題目列表
// POST /api/essay/grade - 提交作文並取得 AI 批改結果
// GET /api/essay/history/:userId - 取得學生歷史作文記錄

export interface EssayPrompt {
  id: string;
  title: string;
  prompt: string;
  wordLimit: {
    min: number;
    max: number;
  };
  timeLimit?: number; // 分鐘
  hints?: string[];
}

export interface EssayGradingRequest {
  promptId: string;
  content: string;
  studentId?: string;
}

export interface EssayGradingResponse {
  attemptId: string;
  overall_score: number; // 0-100
  level: string; // A1, A2, B1, B2, C1, C2
  rubric: {
    TaskResponse: {
      score: number;
      maxScore: number;
      comment: string;
    };
    Coherence: {
      score: number;
      maxScore: number;
      comment: string;
    };
    LexicalResource: {
      score: number;
      maxScore: number;
      comment: string;
    };
    Grammar: {
      score: number;
      maxScore: number;
      comment: string;
    };
    Creativity?: {
      score: number;
      maxScore: number;
      comment: string;
    };
  };
  highlights: Array<{
    start: number; // 字元位置
    end: number;
    type: 'grammar' | 'vocabulary' | 'spelling' | 'punctuation' | 'style';
    severity: 'error' | 'warning' | 'suggestion';
    note: string;
    suggestion?: string;
  }>;
  suggestions: {
    sentence_fixes: Array<{
      original: string;
      improved: string;
      why: string;
      category: string; // 如 'grammar', 'word choice', 'clarity'
    }>;
    paragraph_comments: Array<{
      paraIndex: number;
      comment: string;
      strength?: string;
      improvement?: string;
    }>;
    top_advice: string[];
    full_rewrite?: string;
  };
  summary: string;
  strengths: string[];
  weaknesses: string[];
  timestamp: number;
}

// ===== Mock 作文題目 =====
export const MOCK_ESSAY_PROMPTS: EssayPrompt[] = [
  {
    id: 'essay-prompt-001',
    title: '科技對人際關係的影響',
    prompt:
      'In recent years, technology has significantly changed the way people communicate with each other. Some people believe that technology has brought people closer together, while others argue that it has made people more isolated. Write an essay discussing both views and give your own opinion.',
    wordLimit: {
      min: 250,
      max: 350,
    },
    timeLimit: 40,
    hints: [
      '可以討論社群媒體、即時通訊軟體等科技工具',
      '提供具體例子支持你的論點',
      '記得在結論中清楚表達你的立場',
    ],
  },
  {
    id: 'essay-prompt-002',
    title: '環境保護與經濟發展',
    prompt:
      'Many countries face a dilemma between environmental protection and economic development. Discuss the challenges and propose solutions to balance these two important goals.',
    wordLimit: {
      min: 250,
      max: 350,
    },
    timeLimit: 40,
    hints: [
      '分析環保與經濟發展的矛盾',
      '提出可行的解決方案',
      '使用實際案例或數據支持論點',
    ],
  },
  {
    id: 'essay-prompt-003',
    title: '教育的目的',
    prompt:
      'What do you think is the main purpose of education? Should it focus on preparing students for future careers, or should it aim to develop well-rounded individuals? Discuss both perspectives and express your views.',
    wordLimit: {
      min: 250,
      max: 350,
    },
    timeLimit: 40,
    hints: [
      '考慮教育的多元目標',
      '提及技能培養與人格發展',
      '結合個人經驗或觀察',
    ],
  },
];

// ===== Mock AI 批改結果 =====
export const MOCK_GRADING_RESPONSE: EssayGradingResponse = {
  attemptId: 'essay_attempt_001',
  overall_score: 76,
  level: 'B2',
  rubric: {
    TaskResponse: {
      score: 18,
      maxScore: 25,
      comment:
        '文章回應了題目的兩個觀點，但對於「科技讓人更孤立」的論述略顯不足。結論清楚表達立場，但可以更有力地總結論點。建議增加更多具體例子來支持論述。',
    },
    Coherence: {
      score: 19,
      maxScore: 25,
      comment:
        '整體結構清晰，段落之間有適當的轉折詞（however, on the other hand）。但第二段與第三段之間的邏輯連接可以更流暢。建議使用更多 discourse markers 來增強文章的連貫性。',
    },
    LexicalResource: {
      score: 20,
      maxScore: 25,
      comment:
        '詞彙使用多樣且恰當，如 "facilitate", "isolation", "virtual interactions" 等。但有些詞彙使用略顯重複（如 "people" 出現過多），建議使用同義詞替換（individuals, citizens, users）。',
    },
    Grammar: {
      score: 19,
      maxScore: 25,
      comment:
        '文法大致正確，句型多樣。但有幾處時態不一致（第2段第3句）和冠詞使用錯誤（第3段第1句）。複雜句使用得當，但建議注意主詞動詞一致性。',
    },
  },
  highlights: [
    {
      start: 145,
      end: 178,
      type: 'grammar',
      severity: 'error',
      note: '時態不一致：前文使用現在完成式，此處應保持一致。',
      suggestion: 'technology has made communication more convenient',
    },
    {
      start: 234,
      end: 247,
      type: 'vocabulary',
      severity: 'warning',
      note: '詞彙選擇可以更精確：建議使用 "genuine" 或 "authentic" 取代 "real"。',
      suggestion: 'genuine face-to-face interactions',
    },
    {
      start: 312,
      end: 325,
      type: 'punctuation',
      severity: 'suggestion',
      note: '建議在此處加上逗號以增強可讀性。',
      suggestion: 'However, on the other hand,',
    },
    {
      start: 456,
      end: 489,
      type: 'style',
      severity: 'suggestion',
      note: '此句過長，建議拆分為兩個句子以提高清晰度。',
      suggestion:
        'Many people spend hours scrolling through social media. This behavior often leads to a sense of isolation.',
    },
    {
      start: 567,
      end: 582,
      type: 'spelling',
      severity: 'error',
      note: '拼寫錯誤：應為 "connection"。',
      suggestion: 'meaningful connection',
    },
  ],
  suggestions: {
    sentence_fixes: [
      {
        original: 'Technology make communication more convenient than before.',
        improved: 'Technology has made communication more convenient than ever before.',
        why: '時態應使用現在完成式表示「到現在為止的影響」；"than before" 改為 "than ever before" 更符合英文習慣用法。',
        category: 'grammar',
      },
      {
        original:
          'People can easily contact with their friends and family through social media.',
        improved: 'People can easily stay in touch with their friends and family through social media.',
        why: '"contact with" 應改為 "stay in touch with" 或直接使用 "contact"（不需 with）；"stay in touch" 更自然地表達「保持聯繫」的意思。',
        category: 'word choice',
      },
      {
        original:
          'However, some people think that technology makes people more isolated from real life.',
        improved:
          'However, some argue that technology has led to increased social isolation in real-world settings.',
        why: '將 "some people think" 改為 "some argue" 更學術化；"makes people more isolated from real life" 改為 "has led to increased social isolation in real-world settings" 更精確且專業。',
        category: 'clarity',
      },
      {
        original:
          'In conclusion, I believe technology is good if we use it in the right way.',
        improved:
          'In conclusion, I believe that while technology offers numerous benefits, its impact ultimately depends on how we choose to use it.',
        why: '結論應更有深度，"is good if we use it in the right way" 過於簡單；建議的版本呈現更成熟的思考與平衡的觀點。',
        category: 'sophistication',
      },
    ],
    paragraph_comments: [
      {
        paraIndex: 0,
        comment: '引言段落：清楚呈現議題背景與爭議點。',
        strength: '成功引起讀者興趣，並預告文章將討論的兩個觀點。',
        improvement: '可以在引言最後加上 thesis statement，明確表達你的立場。',
      },
      {
        paraIndex: 1,
        comment: '主體段落一：討論科技帶來的正面影響。',
        strength: '提供了具體例子（視訊通話、社群媒體），論點清晰。',
        improvement:
          '可以加入統計數據或研究結果來增強說服力；過渡句可以更明確地連接到下一段。',
      },
      {
        paraIndex: 2,
        comment: '主體段落二：討論科技帶來的負面影響。',
        strength: '提出了「線上互動取代面對面交流」的重要論點。',
        improvement:
          '此段略短，建議擴充更多細節或例子；可以討論心理健康影響或社交技能退化等議題。',
      },
      {
        paraIndex: 3,
        comment: '結論段落：總結論點並表達個人立場。',
        strength: '回應了題目要求，表達了平衡的觀點。',
        improvement:
          '結論有些倉促，建議更深入地總結前文論點，並提出前瞻性的思考或建議。',
      },
    ],
    top_advice: [
      '加強論證深度：每個論點都需要更多具體例子或數據支持，避免空泛的陳述。',
      '注意時態一致性：全文應保持一致的時態使用，特別是在討論現況時使用現在完成式。',
      '豐富詞彙表達：避免重複使用相同詞彙，善用同義詞和更精確的專業詞彙。',
      '改善段落發展：確保每段都有充分的發展，包括主題句、支持句和結論句。',
      '強化連貫性：使用更多連接詞和過渡短語，使段落之間的邏輯關係更清晰。',
    ],
    full_rewrite:
      'Technology has revolutionized the way we communicate, sparking debate about whether it brings people closer or drives them further apart. While digital platforms have undeniably enhanced our ability to stay connected across distances, concerns about the quality and authenticity of these interactions persist. This essay will examine both perspectives before presenting my own view.\n\nProponents of technology argue that modern communication tools have strengthened relationships by making it easier to maintain contact with friends and family. Video calling applications like Zoom and FaceTime enable face-to-face conversations regardless of geographical barriers, while social media platforms allow us to share life moments instantly with our networks. Research from the Pew Research Center indicates that 81% of social media users feel more connected to their friends\' lives, suggesting that technology has indeed enhanced social bonds.\n\nHowever, critics contend that excessive reliance on digital communication has led to social isolation and weakened interpersonal skills. Many individuals now prefer texting over phone calls and online interactions over in-person meetings, potentially resulting in superficial relationships. Furthermore, the curated nature of social media can create unrealistic expectations and feelings of inadequacy, paradoxically increasing loneliness despite appearing "connected." Studies have shown that heavy social media users report higher levels of social isolation compared to moderate users.\n\nIn my view, technology itself is neither inherently beneficial nor detrimental to human relationships; rather, its impact depends on how we choose to utilize it. When used mindfully to complement rather than replace face-to-face interactions, technology can indeed bring people closer together. The key lies in maintaining a healthy balance between digital and real-world connections, ensuring that technology serves as a bridge rather than a barrier in our relationships.',
  },
  summary:
    '整體而言，這是一篇結構完整、論點清晰的文章，達到 B2 水平。主要優點包括：1) 清楚回應題目要求，討論了正反兩面觀點；2) 使用了多樣的詞彙和句型；3) 段落結構合理。需要改進的地方：1) 部分論點需要更多具體例子支持；2) 存在幾處文法和用詞錯誤；3) 段落之間的連貫性可以加強；4) 結論可以更有深度。建議多閱讀範文，學習如何更有效地發展論點，並注意文法細節的準確性。',
  strengths: [
    '文章結構清晰，包含引言、主體段落和結論',
    '成功討論了題目要求的兩個觀點',
    '使用了適當的學術詞彙和連接詞',
    '句型有一定變化，包含簡單句和複合句',
  ],
  weaknesses: [
    '部分論點缺乏具體例子或數據支持',
    '存在時態不一致和冠詞使用錯誤',
    '某些詞彙重複使用，缺乏同義詞替換',
    '段落發展不夠充分，特別是第二個主體段落',
    '結論略顯倉促，未能有力地總結論點',
  ],
  timestamp: Date.now(),
};

// ===== Mock 學生作文範例 =====
export const MOCK_STUDENT_ESSAY = `Technology has changed how people communicate in recent years. Some people believe that technology bring people closer, while others think it makes people more isolated. In this essay, I will discuss both views.

First, technology make communication more convenient than before. People can easily contact with their friends and family through social media, even they are in different countries. For example, my grandmother who lives in another city can see my photos and videos on Facebook everyday. Video call apps like Zoom also allow us to have real conversations with others.

However, some people think that technology makes people more isolated from real life. Many young people spend too much time on their phones and computers, and they forget to have real face-to-face interactions. They prefer to send messages instead of meeting in person. This can make people feel lonely even though they have many online friends.

In conclusion, I believe technology is good if we use it in the right way. We should use technology to stay connected with others, but we should not forget the importance of real interactions. Technology can bring people closer if we use it wisely.`;
