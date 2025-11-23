/**
 * 自動生成的字卡資料
 * 生成時間: 2025-11-23T08:02:55.590Z
 * 總字數: 10
 */

export interface VocabularyWord {
  id: string;
  word: string;
  ipa: string;
  translation: string;
  partOfSpeech?: string;
  example: string;
  exampleTranslation: string;
  synonyms: string[];
  antonyms: string[];
  difficulty: 'beginner' | 'intermediate' | 'advanced';
  category?: string;
  level: number;
  tags?: string[];
}

export interface VocabularyPack {
  id: string;
  title: string;
  theme: string;
  description: string;
  difficulty: string;
  totalWords: number;
  author: string;
  datePublished: string;
}

export const vocabularyPack: VocabularyPack = {
  "id": "PACK_EXAMPLE_10",
  "title": "範例單字包（測試用）",
  "theme": "學測常見單字範例",
  "description": "包含 10 個學測常見單字，用於測試匯入流程",
  "difficulty": "mixed",
  "totalWords": 10,
  "author": "Mock Exam Ace",
  "datePublished": "2025-11-23"
};

export const vocabularyWords: VocabularyWord[] = [
  {
    "id": "1",
    "word": "abandon",
    "ipa": "/əˈbændən/",
    "translation": "放棄、遺棄",
    "partOfSpeech": "v.",
    "example": "They had to abandon their home due to the flood.",
    "exampleTranslation": "由於洪水，他們不得不放棄家園。",
    "synonyms": [
      "desert",
      "forsake",
      "give up"
    ],
    "antonyms": [
      "keep",
      "maintain",
      "continue"
    ],
    "difficulty": "intermediate",
    "category": "動詞",
    "level": 1,
    "tags": [
      "學測",
      "Level 4",
      "生活"
    ]
  },
  {
    "id": "2",
    "word": "ability",
    "ipa": "/əˈbɪləti/",
    "translation": "能力、才能",
    "partOfSpeech": "n.",
    "example": "She has the ability to learn languages quickly.",
    "exampleTranslation": "她有快速學習語言的能力。",
    "synonyms": [
      "capability",
      "capacity",
      "talent"
    ],
    "antonyms": [
      "inability",
      "incapacity"
    ],
    "difficulty": "beginner",
    "category": "名詞",
    "level": 1,
    "tags": [
      "學測",
      "Level 2",
      "教育"
    ]
  },
  {
    "id": "3",
    "word": "abolish",
    "ipa": "/əˈbɑːlɪʃ/",
    "translation": "廢除、廢止",
    "partOfSpeech": "v.",
    "example": "The government decided to abolish the outdated law.",
    "exampleTranslation": "政府決定廢除這條過時的法律。",
    "synonyms": [
      "eliminate",
      "eradicate",
      "cancel"
    ],
    "antonyms": [
      "establish",
      "create",
      "institute"
    ],
    "difficulty": "advanced",
    "category": "動詞",
    "level": 1,
    "tags": [
      "學測",
      "Level 5",
      "法律",
      "社會議題"
    ]
  },
  {
    "id": "4",
    "word": "abroad",
    "ipa": "/əˈbrɔːd/",
    "translation": "在國外、到國外",
    "partOfSpeech": "adv.",
    "example": "Many students choose to study abroad.",
    "exampleTranslation": "許多學生選擇出國留學。",
    "synonyms": [
      "overseas",
      "internationally"
    ],
    "antonyms": [
      "domestically",
      "home"
    ],
    "difficulty": "beginner",
    "category": "副詞",
    "level": 1,
    "tags": [
      "學測",
      "Level 2",
      "旅遊",
      "教育"
    ]
  },
  {
    "id": "5",
    "word": "absence",
    "ipa": "/ˈæbsəns/",
    "translation": "缺席、不在",
    "partOfSpeech": "n.",
    "example": "His absence from the meeting was noticed by everyone.",
    "exampleTranslation": "大家都注意到他沒有出席會議。",
    "synonyms": [
      "nonattendance",
      "absenteeism"
    ],
    "antonyms": [
      "presence",
      "attendance"
    ],
    "difficulty": "intermediate",
    "category": "名詞",
    "level": 1,
    "tags": [
      "學測",
      "Level 3",
      "學校"
    ]
  },
  {
    "id": "6",
    "word": "absolute",
    "ipa": "/ˈæbsəluːt/",
    "translation": "絕對的、完全的",
    "partOfSpeech": "adj.",
    "example": "I have absolute confidence in your abilities.",
    "exampleTranslation": "我對你的能力有絕對的信心。",
    "synonyms": [
      "complete",
      "total",
      "utter"
    ],
    "antonyms": [
      "partial",
      "relative",
      "conditional"
    ],
    "difficulty": "intermediate",
    "category": "形容詞",
    "level": 1,
    "tags": [
      "學測",
      "Level 4",
      "抽象概念"
    ]
  },
  {
    "id": "7",
    "word": "absorb",
    "ipa": "/əbˈzɔːrb/",
    "translation": "吸收、理解",
    "partOfSpeech": "v.",
    "example": "Plants absorb nutrients from the soil.",
    "exampleTranslation": "植物從土壤中吸收養分。",
    "synonyms": [
      "soak up",
      "take in",
      "assimilate"
    ],
    "antonyms": [
      "emit",
      "release",
      "discharge"
    ],
    "difficulty": "intermediate",
    "category": "動詞",
    "level": 1,
    "tags": [
      "學測",
      "Level 3",
      "科學",
      "自然"
    ]
  },
  {
    "id": "8",
    "word": "abundant",
    "ipa": "/əˈbʌndənt/",
    "translation": "豐富的、充足的",
    "partOfSpeech": "adj.",
    "example": "The region has abundant natural resources.",
    "exampleTranslation": "這個地區有豐富的自然資源。",
    "synonyms": [
      "plentiful",
      "ample",
      "copious"
    ],
    "antonyms": [
      "scarce",
      "sparse",
      "limited"
    ],
    "difficulty": "advanced",
    "category": "形容詞",
    "level": 1,
    "tags": [
      "學測",
      "Level 5",
      "環境",
      "資源"
    ]
  },
  {
    "id": "9",
    "word": "academic",
    "ipa": "/ˌækəˈdemɪk/",
    "translation": "學術的、學業的",
    "partOfSpeech": "adj.",
    "example": "She achieved excellent academic results last year.",
    "exampleTranslation": "她去年取得了優異的學業成績。",
    "synonyms": [
      "scholarly",
      "educational",
      "scholastic"
    ],
    "antonyms": [
      "practical",
      "nonacademic"
    ],
    "difficulty": "intermediate",
    "category": "形容詞",
    "level": 1,
    "tags": [
      "學測",
      "Level 4",
      "教育",
      "學校"
    ]
  },
  {
    "id": "10",
    "word": "accelerate",
    "ipa": "/əkˈseləreɪt/",
    "translation": "加速、促進",
    "partOfSpeech": "v.",
    "example": "The driver accelerated to pass the slow truck.",
    "exampleTranslation": "司機加速超過了那輛慢速卡車。",
    "synonyms": [
      "speed up",
      "quicken",
      "expedite"
    ],
    "antonyms": [
      "decelerate",
      "slow down",
      "brake"
    ],
    "difficulty": "advanced",
    "category": "動詞",
    "level": 1,
    "tags": [
      "學測",
      "Level 5",
      "交通",
      "科技"
    ]
  }
];

export default {
  vocabularyPack,
  words: vocabularyWords
};
