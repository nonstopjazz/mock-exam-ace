/**
 * 寫作分類法 —— 唯一真實來源（canonical taxonomy）
 *
 * 由 docs/learn/writing-taxonomy/*.csv 產生，請勿手改。
 * 產生器：scripts/generate-writing-taxonomy.py
 *
 * 這個檔案同時被前端（報告 UI）與 api/analyze-writing.ts（DeepSeek 分析）使用，
 * 所以只用純 TypeScript，不 import 任何東西、不使用 `@/` alias
 * （Vercel serverless function 沒有 Vite 的 path alias）。
 *
 * TR-19：code 是 stable opaque identifier，禁止用字串解析推導所屬 Category，
 * 一律透過這裡的 relationship 取得。
 */

export const WRITING_TAXONOMY_VERSION = "writing-v1";

/* ──────────────── Axis 1：Writing Competency（W1–W5 / 23 skills） ──────────────── */

export interface CompetencySkill {
  readonly code: string;
  readonly zh: string;
  readonly en: string;
  readonly categoryCode: string;
}

export interface CompetencyCategory {
  readonly code: string;
  readonly zh: string;
  readonly en: string;
  readonly definition: string;
  readonly skills: readonly CompetencySkill[];
}

export const COMPETENCY_CATEGORIES: readonly CompetencyCategory[] = [
  {
    code: "W1",
    zh: "內容與任務完成",
    en: "Content & Task Fulfillment",
    definition: "是否真正回應題目、聚焦主題、發展觀點並提供足夠支持。",
    skills: [
      {
        code: "WRITE_CONTENT_TASK",
        zh: "任務回應與完成度",
        en: "Task Fulfillment",
        categoryCode: "W1",
      },
      {
        code: "WRITE_CONTENT_FOCUS",
        zh: "聚焦與相關性",
        en: "Focus & Relevance",
        categoryCode: "W1",
      },
      {
        code: "WRITE_CONTENT_DEVELOP",
        zh: "觀點與內容發展",
        en: "Idea Development",
        categoryCode: "W1",
      },
      {
        code: "WRITE_CONTENT_SUPPORT",
        zh: "支持與具體化",
        en: "Support & Elaboration",
        categoryCode: "W1",
      },
    ],
  },
  {
    code: "W2",
    zh: "組織與連貫",
    en: "Organization & Coherence",
    definition: "是否具備整體架構、段落組織、邏輯推進與清楚的銜接／資訊流。",
    skills: [
      {
        code: "WRITE_ORG_OVERALL",
        zh: "整體組織",
        en: "Overall Organization",
        categoryCode: "W2",
      },
      {
        code: "WRITE_ORG_PARAGRAPH",
        zh: "段落結構",
        en: "Paragraph Structure",
        categoryCode: "W2",
      },
      {
        code: "WRITE_ORG_LOGIC",
        zh: "邏輯推進",
        en: "Logical Progression",
        categoryCode: "W2",
      },
      {
        code: "WRITE_ORG_COHESION",
        zh: "銜接與連接",
        en: "Cohesion & Linking",
        categoryCode: "W2",
      },
      {
        code: "WRITE_ORG_FLOW",
        zh: "資訊流與指涉連貫",
        en: "Reference & Information Flow",
        categoryCode: "W2",
      },
    ],
  },
  {
    code: "W3",
    zh: "詞彙運用",
    en: "Lexical Resource",
    definition: "是否使用足夠、準確、自然且有彈性的詞彙，並控制詞形與拼寫。",
    skills: [
      {
        code: "WRITE_LEXICAL_RANGE",
        zh: "詞彙範圍",
        en: "Vocabulary Range",
        categoryCode: "W3",
      },
      {
        code: "WRITE_LEXICAL_PRECISION",
        zh: "用字準確與精確",
        en: "Word Choice & Precision",
        categoryCode: "W3",
      },
      {
        code: "WRITE_LEXICAL_COLLOCATION",
        zh: "搭配與自然用法",
        en: "Collocation & Natural Usage",
        categoryCode: "W3",
      },
      {
        code: "WRITE_LEXICAL_FLEXIBILITY",
        zh: "改述與詞彙彈性",
        en: "Paraphrase & Lexical Flexibility",
        categoryCode: "W3",
      },
      {
        code: "WRITE_LEXICAL_FORM",
        zh: "詞形與拼字控制",
        en: "Word Form & Spelling Control",
        categoryCode: "W3",
      },
    ],
  },
  {
    code: "W4",
    zh: "句構與文法",
    en: "Grammar & Sentence Structure",
    definition: "是否能準確且有變化地使用基本與複雜句構，並維持整體句法控制。",
    skills: [
      {
        code: "WRITE_GRAMMAR_BASIC",
        zh: "基本句構準確度",
        en: "Basic Sentence Accuracy",
        categoryCode: "W4",
      },
      {
        code: "WRITE_GRAMMAR_RANGE",
        zh: "文法結構範圍",
        en: "Grammatical Range",
        categoryCode: "W4",
      },
      {
        code: "WRITE_GRAMMAR_COMPLEX",
        zh: "複雜句構控制",
        en: "Complex Structure Control",
        categoryCode: "W4",
      },
      {
        code: "WRITE_GRAMMAR_VARIETY",
        zh: "句式多樣性與節奏",
        en: "Sentence Variety & Style",
        categoryCode: "W4",
      },
    ],
  },
  {
    code: "W5",
    zh: "語體、讀者與寫作規範",
    en: "Register, Audience & Conventions",
    definition: "是否依讀者與文類使用合宜語體、語氣、慣例，以及標點與基本書寫規範。",
    skills: [
      {
        code: "WRITE_REGISTER_FORMALITY",
        zh: "語體與正式度",
        en: "Register & Formality",
        categoryCode: "W5",
      },
      {
        code: "WRITE_REGISTER_AUDIENCE",
        zh: "讀者意識",
        en: "Audience Awareness",
        categoryCode: "W5",
      },
      {
        code: "WRITE_REGISTER_VOICE",
        zh: "語氣與作者聲音",
        en: "Tone & Voice",
        categoryCode: "W5",
      },
      {
        code: "WRITE_REGISTER_GENRE",
        zh: "文類與任務慣例",
        en: "Genre & Task Conventions",
        categoryCode: "W5",
      },
      {
        code: "WRITE_REGISTER_MECHANICS",
        zh: "標點與書寫規範",
        en: "Punctuation & Mechanics",
        categoryCode: "W5",
      },
    ],
  },
] as const;

/* ──────────────── Axis 2：Writing Error（16 codes） ──────────────── */

export interface ErrorTag {
  readonly code: string;
  readonly zh: string;
  readonly en: string;
  /** 掛回 Axis 1 的 Primary Writing Skill；WRITE_ERR_THAT 依句法複雜度有兩種可能 */
  readonly primarySkills: readonly string[];
}

export const ERROR_TAGS: readonly ErrorTag[] = [
  {
    code: "WRITE_ERR_RUN_ON",
    zh: "Run-on 冗長句",
    en: "Run-on Sentence",
    primarySkills: ["WRITE_GRAMMAR_BASIC"],
  },
  {
    code: "WRITE_ERR_FRAGMENT",
    zh: "Fragment 不完整句",
    en: "Sentence Fragment",
    primarySkills: ["WRITE_GRAMMAR_BASIC"],
  },
  {
    code: "WRITE_ERR_NUMBER",
    zh: "單複數錯誤",
    en: "Number Error",
    primarySkills: ["WRITE_GRAMMAR_BASIC"],
  },
  {
    code: "WRITE_ERR_ARTICLE",
    zh: "未加冠詞",
    en: "Missing / Incorrect Article",
    primarySkills: ["WRITE_GRAMMAR_BASIC"],
  },
  {
    code: "WRITE_ERR_COUNTABILITY",
    zh: "不可數名詞用錯",
    en: "Countability Error",
    primarySkills: ["WRITE_GRAMMAR_BASIC"],
  },
  {
    code: "WRITE_ERR_WORD_BOUNDARY",
    zh: "連寫或分開寫錯誤",
    en: "Word Boundary Error",
    primarySkills: ["WRITE_LEXICAL_FORM"],
  },
  {
    code: "WRITE_ERR_SV_AGREEMENT",
    zh: "SV 一致",
    en: "Subject–Verb Agreement Error",
    primarySkills: ["WRITE_GRAMMAR_BASIC"],
  },
  {
    code: "WRITE_ERR_TRANSITIVITY",
    zh: "Vt 與 Vi 用錯",
    en: "Transitivity Error",
    primarySkills: ["WRITE_GRAMMAR_BASIC"],
  },
  {
    code: "WRITE_ERR_GRAMMAR_OTHER",
    zh: "文法錯誤",
    en: "Other Grammar Error",
    primarySkills: ["WRITE_GRAMMAR_BASIC"],
  },
  {
    code: "WRITE_ERR_PREP_CLAUSE",
    zh: "介係詞誤接句子",
    en: "Preposition–Clause Error",
    primarySkills: ["WRITE_GRAMMAR_BASIC"],
  },
  {
    code: "WRITE_ERR_WORD_CLASS",
    zh: "詞類誤用",
    en: "Word Class Error",
    primarySkills: ["WRITE_LEXICAL_FORM"],
  },
  {
    code: "WRITE_ERR_CHINGLISH",
    zh: "中式英文",
    en: "Chinese-transfer / Chinglish Expression",
    primarySkills: ["WRITE_LEXICAL_COLLOCATION"],
  },
  {
    code: "WRITE_ERR_SPELLING",
    zh: "拼寫錯誤",
    en: "Spelling Error",
    primarySkills: ["WRITE_LEXICAL_FORM"],
  },
  {
    code: "WRITE_ERR_PUNCTUATION",
    zh: "標點符號",
    en: "Punctuation Error",
    primarySkills: ["WRITE_REGISTER_MECHANICS"],
  },
  {
    code: "WRITE_ERR_THAT",
    zh: "that 誤用",
    en: "That-usage Error",
    primarySkills: ["WRITE_GRAMMAR_BASIC", "WRITE_GRAMMAR_COMPLEX"],
  },
  {
    code: "WRITE_ERR_DISCOURSE_STRUCTURE",
    zh: "未符合篇章結構概念",
    en: "Discourse Structure Error",
    primarySkills: ["WRITE_ORG_OVERALL"],
  },
] as const;

/* ──────────────── Axis 3：High-Score Feature（H1–H5 / 29 features） ──────────────── */

export interface HighScoreFeature {
  readonly id: string;
  readonly code: string;
  readonly zh: string;
  readonly en: string;
  readonly categoryCode: string;
  /** Effective / Boundary Rule —— TR-06 的判準，會原文帶進 DeepSeek prompt */
  readonly boundaryRule: string;
}

export interface HighScoreCategory {
  readonly code: string;
  readonly zh: string;
  readonly en: string;
  readonly features: readonly HighScoreFeature[];
}

export const HIGH_SCORE_CATEGORIES: readonly HighScoreCategory[] = [
  {
    code: "H1",
    zh: "句構與句式技巧",
    en: "Sentence Craft",
    features: [
      {
        id: "H1-1",
        code: "WRITE_HSF_PARALLEL",
        zh: "平行結構",
        en: "Parallel Structure",
        categoryCode: "H1",
        boundaryRule: "需真正形成結構對稱與表意增強；僅出現 paired conjunction 不代表有效。",
      },
      {
        id: "H1-2",
        code: "WRITE_HSF_SENT_VARIETY",
        zh: "句式多樣性",
        en: "Sentence Variety",
        categoryCode: "H1",
        boundaryRule: "多樣性必須服務 clarity / rhythm；刻意複雜化或機械換句型不算高分特徵。",
      },
      {
        id: "H1-3",
        code: "WRITE_HSF_COMPLEX",
        zh: "有效複雜句",
        en: "Effective Complex Sentences",
        categoryCode: "H1",
        boundaryRule: "複雜句需清楚且受控；若結構錯誤或造成可讀性下降，不算 EFFECTIVE。",
      },
      {
        id: "H1-4",
        code: "WRITE_HSF_REDUCED",
        zh: "分詞／簡化結構",
        en: "Reduced Structures",
        categoryCode: "H1",
        boundaryRule: "只有正確且自然地壓縮資訊才算；dangling / illogical modifier 應標 MISUSED。",
      },
      {
        id: "H1-5",
        code: "WRITE_HSF_INVERSION",
        zh: "倒裝",
        en: "Inversion",
        categoryCode: "H1",
        boundaryRule: "不得因出現倒裝形式就自動稱讚；必須語法正確且有合理強調功能。",
      },
      {
        id: "H1-6",
        code: "WRITE_HSF_APPOSITIVE",
        zh: "同位語／補充結構",
        en: "Appositive & Supplementary Structures",
        categoryCode: "H1",
        boundaryRule: "需增加資訊密度或清晰度；若插入造成歧義或句構失控，不算 EFFECTIVE。",
      },
    ],
  },
  {
    code: "H2",
    zh: "字彙成熟度",
    en: "Lexical Sophistication",
    features: [
      {
        id: "H2-1",
        code: "WRITE_HSF_LEX_VARIETY",
        zh: "字彙多樣性",
        en: "Lexical Variety",
        categoryCode: "H2",
        boundaryRule: "不為換字而換字；近義詞若造成語意偏差不算有效。",
      },
      {
        id: "H2-2",
        code: "WRITE_HSF_LEX_PRECISION",
        zh: "精準用字",
        en: "Lexical Precision",
        categoryCode: "H2",
        boundaryRule: "以語意精準與情境適切為核心，不以字詞難度判分。",
      },
      {
        id: "H2-3",
        code: "WRITE_HSF_ADV_VOCAB",
        zh: "適切進階字彙",
        en: "Appropriate Advanced Vocabulary",
        categoryCode: "H2",
        boundaryRule: "只有自然、正確且符合語境的進階詞彙才算；misuse 應降為 PARTIALLY_EFFECTIVE / MISUSED。",
      },
      {
        id: "H2-4",
        code: "WRITE_HSF_COLLOCATION",
        zh: "自然搭配",
        en: "Natural Collocation",
        categoryCode: "H2",
        boundaryRule: "重點是 natural usage；僅使用固定片語但語境不合不算。",
      },
      {
        id: "H2-5",
        code: "WRITE_HSF_PARAPHRASE",
        zh: "詞彙改述",
        en: "Lexical Paraphrasing",
        categoryCode: "H2",
        boundaryRule: "改述需保留原意且自然；概念偏移或硬換字不算。",
      },
    ],
  },
  {
    code: "H3",
    zh: "篇章與連貫技巧",
    en: "Discourse Craft",
    features: [
      {
        id: "H3-1",
        code: "WRITE_HSF_TRANSITIONS",
        zh: "自然轉承",
        en: "Natural Transitions",
        categoryCode: "H3",
        boundaryRule: "不以 transition words 數量判分；真正重點是語意關係自然、必要且不機械。",
      },
      {
        id: "H3-2",
        code: "WRITE_HSF_LEX_COHESION",
        zh: "詞彙銜接",
        en: "Lexical Cohesion",
        categoryCode: "H3",
        boundaryRule: "需形成可追蹤的概念鏈；單純重複同一字不一定是高分特徵。",
      },
      {
        id: "H3-3",
        code: "WRITE_HSF_REF_COHESION",
        zh: "指涉連貫",
        en: "Reference Cohesion",
        categoryCode: "H3",
        boundaryRule: "所有指涉必須清楚可回指；ambiguous reference 不算有效。",
      },
      {
        id: "H3-4",
        code: "WRITE_HSF_INFO_FLOW",
        zh: "資訊流",
        en: "Information Flow",
        categoryCode: "H3",
        boundaryRule: "重點是新舊資訊推進自然；單句各自正確但主題跳躍不算。",
      },
      {
        id: "H3-5",
        code: "WRITE_HSF_PARA_PROGRESSION",
        zh: "段落間銜接",
        en: "Paragraph Progression",
        categoryCode: "H3",
        boundaryRule: "段落需有功能性推進；只在段首放 moreover / however 不等於有效銜接。",
      },
      {
        id: "H3-6",
        code: "WRITE_HSF_CALLBACK",
        zh: "前後呼應",
        en: "Callback / Structural Echo",
        categoryCode: "H3",
        boundaryRule: "必須形成有意義的結構回扣，而非機械重複開頭字句。",
      },
    ],
  },
  {
    code: "H4",
    zh: "修辭與風格",
    en: "Rhetoric & Style",
    features: [
      {
        id: "H4-1",
        code: "WRITE_HSF_CONTRAST",
        zh: "對比與反襯",
        en: "Contrast & Juxtaposition",
        categoryCode: "H4",
        boundaryRule: "需產生明確修辭效果或概念張力；一般 compare/contrast 組織不一定是本 Feature。",
      },
      {
        id: "H4-2",
        code: "WRITE_HSF_PATTERNING",
        zh: "排比與節奏",
        en: "Rhetorical Patterning",
        categoryCode: "H4",
        boundaryRule: "需有節奏或修辭效果；一般句法平行但無風格功能可只標 H1-1。",
      },
      {
        id: "H4-3",
        code: "WRITE_HSF_RHET_QUESTION",
        zh: "修辭問句",
        en: "Rhetorical Questions",
        categoryCode: "H4",
        boundaryRule: "真正目的須是引導、挑戰或反思；純資訊問句不算。",
      },
      {
        id: "H4-4",
        code: "WRITE_HSF_FIGURATIVE",
        zh: "比喻與類比",
        en: "Figurative Comparison",
        categoryCode: "H4",
        boundaryRule: "比喻需清楚且恰當；混亂比喻或 clichéd misuse 可標 PARTIALLY_EFFECTIVE / MISUSED。",
      },
      {
        id: "H4-5",
        code: "WRITE_HSF_IMAGERY",
        zh: "生動描寫與意象",
        en: "Vivid Description & Imagery",
        categoryCode: "H4",
        boundaryRule: "需增加可感知性與具體性；堆疊形容詞但無清晰意象不算。",
      },
      {
        id: "H4-6",
        code: "WRITE_HSF_POWERFUL_CLOSE",
        zh: "有力收束",
        en: "Powerful Closing",
        categoryCode: "H4",
        boundaryRule: "聚焦結尾的表達力度；與 H5-6 Meaningful Closure（內容收束）及 H3-6 Callback（結構呼應）可並存。",
      },
    ],
  },
  {
    code: "H5",
    zh: "內容發展與思維技巧",
    en: "Content & Idea Craft",
    features: [
      {
        id: "H5-1",
        code: "WRITE_HSF_CLEAR_FOCUS",
        zh: "清楚核心焦點",
        en: "Clear Focus",
        categoryCode: "H5",
        boundaryRule: "不限定論說文；任何文類都可依其核心目的與焦點判斷。",
      },
      {
        id: "H5-2",
        code: "WRITE_HSF_ELABORATION",
        zh: "具體而充分的發展",
        en: "Specific & Elaborated Development",
        categoryCode: "H5",
        boundaryRule: "需實質推進內容；單純拉長句子或重述同一點不算。",
      },
      {
        id: "H5-3",
        code: "WRITE_HSF_LOGIC",
        zh: "邏輯發展",
        en: "Logical Development",
        categoryCode: "H5",
        boundaryRule: "重點是思路關係清楚且合理；形式上有 because/therefore 但推理跳躍不算。",
      },
      {
        id: "H5-4",
        code: "WRITE_HSF_MULTIANGLE",
        zh: "比較、分類與多角度分析",
        en: "Comparative & Multi-angle Thinking",
        categoryCode: "H5",
        boundaryRule: "不要求每篇都多角度；只有 task/內容真的適用時才產生 positive evidence。",
      },
      {
        id: "H5-5",
        code: "WRITE_HSF_INSIGHT",
        zh: "反思與洞察",
        en: "Reflection & Insight",
        categoryCode: "H5",
        boundaryRule: "需超越表面重述並提出意義、洞見或視角變化；空泛人生大道理不算。",
      },
      {
        id: "H5-6",
        code: "WRITE_HSF_MEANINGFUL_CLOSE",
        zh: "有意義的收束",
        en: "Meaningful Closure",
        categoryCode: "H5",
        boundaryRule: "聚焦內容／思想是否真正收束；與 H4-6 的修辭力度、H3-6 的前後呼應可同時成立。",
      },
    ],
  },
] as const;

/**
 * Sub-skill 是 detection criteria / subtype，不是 taxonomy node（TR-07 / TR-20），
 * CSV 標記為 Visibility = OWNER_ONLY。這裡只提供顯示標籤：
 * 學生端的矩陣節點永遠是上面 29 個 Feature，sub-skill 只在詳情裡當佐證文字出現。
 * 因為它不是 canonical node，所以【不】納入完整覆蓋驗證。
 */
export interface HighScoreSubskill {
  readonly code: string;
  readonly zh: string;
  readonly featureCode: string;
}

export const HIGH_SCORE_SUBSKILLS: readonly HighScoreSubskill[] = [
  {
    code: "WRITE_HSF_PARALLEL_WORD",
    zh: "單字層級平行",
    featureCode: "WRITE_HSF_PARALLEL",
  },
  {
    code: "WRITE_HSF_PARALLEL_PHRASE",
    zh: "片語層級平行",
    featureCode: "WRITE_HSF_PARALLEL",
  },
  {
    code: "WRITE_HSF_PARALLEL_CLAUSE",
    zh: "子句層級平行",
    featureCode: "WRITE_HSF_PARALLEL",
  },
  {
    code: "WRITE_HSF_PARALLEL_PAIRED_STRUCTURES",
    zh: "成對結構",
    featureCode: "WRITE_HSF_PARALLEL",
  },
  {
    code: "WRITE_HSF_PARALLEL_NOT_ONLY_BUT_ALSO",
    zh: "not only…but also 句型",
    featureCode: "WRITE_HSF_PARALLEL",
  },
  {
    code: "WRITE_HSF_PARALLEL_BOTH_AND",
    zh: "both…and 句型",
    featureCode: "WRITE_HSF_PARALLEL",
  },
  {
    code: "WRITE_HSF_SENT_VARIETY_SUB01",
    zh: "長短句交替",
    featureCode: "WRITE_HSF_SENT_VARIETY",
  },
  {
    code: "WRITE_HSF_SENT_VARIETY_SIMPLE_COMPOUND_COMPLEX_VARIATION",
    zh: "句型交替變化",
    featureCode: "WRITE_HSF_SENT_VARIETY",
  },
  {
    code: "WRITE_HSF_SENT_VARIETY_SUB03",
    zh: "不同句首",
    featureCode: "WRITE_HSF_SENT_VARIETY",
  },
  {
    code: "WRITE_HSF_SENT_VARIETY_SUB04",
    zh: "避免單一句型反覆",
    featureCode: "WRITE_HSF_SENT_VARIETY",
  },
  {
    code: "WRITE_HSF_COMPLEX_RELATIVE_CLAUSES",
    zh: "關係子句",
    featureCode: "WRITE_HSF_COMPLEX",
  },
  {
    code: "WRITE_HSF_COMPLEX_NOUN_CLAUSES",
    zh: "名詞子句",
    featureCode: "WRITE_HSF_COMPLEX",
  },
  {
    code: "WRITE_HSF_COMPLEX_ADVERB_CLAUSES",
    zh: "副詞子句",
    featureCode: "WRITE_HSF_COMPLEX",
  },
  {
    code: "WRITE_HSF_COMPLEX_SUB04",
    zh: "多層從屬但仍清楚易讀",
    featureCode: "WRITE_HSF_COMPLEX",
  },
  {
    code: "WRITE_HSF_REDUCED_V_ING_PARTICIPIAL_PHRASES",
    zh: "V-ing 分詞片語",
    featureCode: "WRITE_HSF_REDUCED",
  },
  {
    code: "WRITE_HSF_REDUCED_P_P_PHRASES",
    zh: "p.p. 分詞片語",
    featureCode: "WRITE_HSF_REDUCED",
  },
  {
    code: "WRITE_HSF_REDUCED_REDUCED_RELATIVE_CLAUSES",
    zh: "簡化關係子句",
    featureCode: "WRITE_HSF_REDUCED",
  },
  {
    code: "WRITE_HSF_REDUCED_WITH_O_COMPLEMENT",
    zh: "with + O + complement 等簡化",
    featureCode: "WRITE_HSF_REDUCED",
  },
  {
    code: "WRITE_HSF_INVERSION_NEGATIVE_INVERSION",
    zh: "否定倒裝",
    featureCode: "WRITE_HSF_INVERSION",
  },
  {
    code: "WRITE_HSF_INVERSION_ONLY_ADV_INVERSION",
    zh: "only + 副詞倒裝",
    featureCode: "WRITE_HSF_INVERSION",
  },
  {
    code: "WRITE_HSF_INVERSION_SO_SUCH_INVERSION",
    zh: "so／such 倒裝",
    featureCode: "WRITE_HSF_INVERSION",
  },
  {
    code: "WRITE_HSF_INVERSION_CONDITIONAL_INVERSION",
    zh: "條件句倒裝",
    featureCode: "WRITE_HSF_INVERSION",
  },
  {
    code: "WRITE_HSF_APPOSITIVE_APPOSITIVES",
    zh: "同位語",
    featureCode: "WRITE_HSF_APPOSITIVE",
  },
  {
    code: "WRITE_HSF_APPOSITIVE_SUB02",
    zh: "插入補充",
    featureCode: "WRITE_HSF_APPOSITIVE",
  },
  {
    code: "WRITE_HSF_APPOSITIVE_DASH_STRUCTURES",
    zh: "破折號結構",
    featureCode: "WRITE_HSF_APPOSITIVE",
  },
  {
    code: "WRITE_HSF_APPOSITIVE_COLON_EXPANSION",
    zh: "冒號展開",
    featureCode: "WRITE_HSF_APPOSITIVE",
  },
  {
    code: "WRITE_HSF_APPOSITIVE_NON_RESTRICTIVE_SUPPLEMENTARY_PHRASES",
    zh: "非限定補充片語",
    featureCode: "WRITE_HSF_APPOSITIVE",
  },
  {
    code: "WRITE_HSF_LEX_VARIETY_SUB01",
    zh: "避免不必要重複",
    featureCode: "WRITE_HSF_LEX_VARIETY",
  },
  {
    code: "WRITE_HSF_LEX_VARIETY_SUB02",
    zh: "不同詞彙表達相關概念",
    featureCode: "WRITE_HSF_LEX_VARIETY",
  },
  {
    code: "WRITE_HSF_LEX_VARIETY_SUB03",
    zh: "詞類／詞彙變化",
    featureCode: "WRITE_HSF_LEX_VARIETY",
  },
  {
    code: "WRITE_HSF_LEX_PRECISION_SPECIFIC_VERBS",
    zh: "精準動詞",
    featureCode: "WRITE_HSF_LEX_PRECISION",
  },
  {
    code: "WRITE_HSF_LEX_PRECISION_PRECISE_NOUNS",
    zh: "精準名詞",
    featureCode: "WRITE_HSF_LEX_PRECISION",
  },
  {
    code: "WRITE_HSF_LEX_PRECISION_ADJECTIVE_ADVERB",
    zh: "適切修飾語選擇",
    featureCode: "WRITE_HSF_LEX_PRECISION",
  },
  {
    code: "WRITE_HSF_LEX_PRECISION_SUB04",
    zh: "細微語義差異",
    featureCode: "WRITE_HSF_LEX_PRECISION",
  },
  {
    code: "WRITE_HSF_ADV_VOCAB_SOPHISTICATED_BUT_NATURAL_VOCABULARY",
    zh: "成熟且自然的詞彙",
    featureCode: "WRITE_HSF_ADV_VOCAB",
  },
  {
    code: "WRITE_HSF_ADV_VOCAB_ACADEMIC_VOCABULARY",
    zh: "學術詞彙",
    featureCode: "WRITE_HSF_ADV_VOCAB",
  },
  {
    code: "WRITE_HSF_ADV_VOCAB_SUB03",
    zh: "避免硬塞難字",
    featureCode: "WRITE_HSF_ADV_VOCAB",
  },
  {
    code: "WRITE_HSF_COLLOCATION_VERB_NOUN",
    zh: "動詞－名詞搭配",
    featureCode: "WRITE_HSF_COLLOCATION",
  },
  {
    code: "WRITE_HSF_COLLOCATION_ADJECTIVE_NOUN",
    zh: "形容詞－名詞搭配",
    featureCode: "WRITE_HSF_COLLOCATION",
  },
  {
    code: "WRITE_HSF_COLLOCATION_ADVERB_ADJECTIVE",
    zh: "副詞－形容詞搭配",
    featureCode: "WRITE_HSF_COLLOCATION",
  },
  {
    code: "WRITE_HSF_COLLOCATION_PREPOSITIONAL_COLLOCATIONS",
    zh: "介係詞搭配",
    featureCode: "WRITE_HSF_COLLOCATION",
  },
  {
    code: "WRITE_HSF_COLLOCATION_SUB05",
    zh: "慣用搭配",
    featureCode: "WRITE_HSF_COLLOCATION",
  },
  {
    code: "WRITE_HSF_PARAPHRASE_SYNONYMS",
    zh: "同義詞",
    featureCode: "WRITE_HSF_PARAPHRASE",
  },
  {
    code: "WRITE_HSF_PARAPHRASE_NEAR_SYNONYMS",
    zh: "近義詞",
    featureCode: "WRITE_HSF_PARAPHRASE",
  },
  {
    code: "WRITE_HSF_PARAPHRASE_PHRASE_REPLACEMENT",
    zh: "片語替換",
    featureCode: "WRITE_HSF_PARAPHRASE",
  },
  {
    code: "WRITE_HSF_PARAPHRASE_CONCEPTUAL_REWORDING",
    zh: "概念改寫",
    featureCode: "WRITE_HSF_PARAPHRASE",
  },
  {
    code: "WRITE_HSF_PARAPHRASE_SUB05",
    zh: "避免原詞重複",
    featureCode: "WRITE_HSF_PARAPHRASE",
  },
  {
    code: "WRITE_HSF_TRANSITIONS_ADDITION",
    zh: "增補轉承",
    featureCode: "WRITE_HSF_TRANSITIONS",
  },
  {
    code: "WRITE_HSF_TRANSITIONS_CONTRAST",
    zh: "對比轉承",
    featureCode: "WRITE_HSF_TRANSITIONS",
  },
  {
    code: "WRITE_HSF_TRANSITIONS_CAUSE_EFFECT",
    zh: "因果轉承",
    featureCode: "WRITE_HSF_TRANSITIONS",
  },
  {
    code: "WRITE_HSF_TRANSITIONS_EXAMPLE",
    zh: "舉例轉承",
    featureCode: "WRITE_HSF_TRANSITIONS",
  },
  {
    code: "WRITE_HSF_TRANSITIONS_CONCESSION",
    zh: "讓步轉承",
    featureCode: "WRITE_HSF_TRANSITIONS",
  },
  {
    code: "WRITE_HSF_TRANSITIONS_SEQUENCE",
    zh: "順序轉承",
    featureCode: "WRITE_HSF_TRANSITIONS",
  },
  {
    code: "WRITE_HSF_TRANSITIONS_SUMMARY_TRANSITIONS",
    zh: "總結轉承",
    featureCode: "WRITE_HSF_TRANSITIONS",
  },
  {
    code: "WRITE_HSF_TRANSITIONS_SUB08",
    zh: "隱性轉承",
    featureCode: "WRITE_HSF_TRANSITIONS",
  },
  {
    code: "WRITE_HSF_LEX_COHESION_REPETITION_OF_KEY_CONCEPTS",
    zh: "關鍵概念重述",
    featureCode: "WRITE_HSF_LEX_COHESION",
  },
  {
    code: "WRITE_HSF_LEX_COHESION_SYNONYM_CHAIN",
    zh: "同義詞鏈",
    featureCode: "WRITE_HSF_LEX_COHESION",
  },
  {
    code: "WRITE_HSF_LEX_COHESION_SEMANTIC_FIELD",
    zh: "語意場",
    featureCode: "WRITE_HSF_LEX_COHESION",
  },
  {
    code: "WRITE_HSF_LEX_COHESION_SUPERORDINATE_SUBORDINATE_TERMS",
    zh: "上位／下位詞關係",
    featureCode: "WRITE_HSF_LEX_COHESION",
  },
  {
    code: "WRITE_HSF_LEX_COHESION_LEXICAL_RECURRENCE",
    zh: "詞彙復現",
    featureCode: "WRITE_HSF_LEX_COHESION",
  },
  {
    code: "WRITE_HSF_REF_COHESION_THIS_THAT_THESE_THOSE",
    zh: "指示詞指涉",
    featureCode: "WRITE_HSF_REF_COHESION",
  },
  {
    code: "WRITE_HSF_REF_COHESION_IT_THEY",
    zh: "代名詞指涉",
    featureCode: "WRITE_HSF_REF_COHESION",
  },
  {
    code: "WRITE_HSF_REF_COHESION_SUCH_N",
    zh: "such + N 指涉",
    featureCode: "WRITE_HSF_REF_COHESION",
  },
  {
    code: "WRITE_HSF_REF_COHESION_THE_FORMER_LATTER",
    zh: "the former／latter 指涉",
    featureCode: "WRITE_HSF_REF_COHESION",
  },
  {
    code: "WRITE_HSF_REF_COHESION_CLEAR_BACKWARD_REFERENCE",
    zh: "清楚的回指",
    featureCode: "WRITE_HSF_REF_COHESION",
  },
  {
    code: "WRITE_HSF_INFO_FLOW_GIVEN_NEW_INFORMATION",
    zh: "已知→新資訊",
    featureCode: "WRITE_HSF_INFO_FLOW",
  },
  {
    code: "WRITE_HSF_INFO_FLOW_SENTENCE_TO_SENTENCE_PROGRESSION",
    zh: "句與句遞進",
    featureCode: "WRITE_HSF_INFO_FLOW",
  },
  {
    code: "WRITE_HSF_INFO_FLOW_A_B_C_DEVELOPMENT",
    zh: "A→B→C 推展",
    featureCode: "WRITE_HSF_INFO_FLOW",
  },
  {
    code: "WRITE_HSF_INFO_FLOW_ABRUPT_TOPIC_JUMPS",
    zh: "避免 abrupt topic jumps",
    featureCode: "WRITE_HSF_INFO_FLOW",
  },
  {
    code: "WRITE_HSF_PARA_PROGRESSION_SUB01",
    zh: "前段→後段邏輯承接",
    featureCode: "WRITE_HSF_PARA_PROGRESSION",
  },
  {
    code: "WRITE_HSF_PARA_PROGRESSION_BRIDGE_SENTENCE",
    zh: "橋接句",
    featureCode: "WRITE_HSF_PARA_PROGRESSION",
  },
  {
    code: "WRITE_HSF_PARA_PROGRESSION_CONCEPT_CARRY_OVER",
    zh: "概念承接",
    featureCode: "WRITE_HSF_PARA_PROGRESSION",
  },
  {
    code: "WRITE_HSF_PARA_PROGRESSION_SUB04",
    zh: "段落功能順序",
    featureCode: "WRITE_HSF_PARA_PROGRESSION",
  },
  {
    code: "WRITE_HSF_CALLBACK_INTRODUCTION_CONCLUSION_ECHO",
    zh: "首尾呼應",
    featureCode: "WRITE_HSF_CALLBACK",
  },
  {
    code: "WRITE_HSF_CALLBACK_MOTIF_CALLBACK",
    zh: "母題回扣",
    featureCode: "WRITE_HSF_CALLBACK",
  },
  {
    code: "WRITE_HSF_CALLBACK_KEY_PHRASE_RETURN",
    zh: "關鍵語句重現",
    featureCode: "WRITE_HSF_CALLBACK",
  },
  {
    code: "WRITE_HSF_CALLBACK_OPENING_IMAGE_REVISITED",
    zh: "開場意象重訪",
    featureCode: "WRITE_HSF_CALLBACK",
  },
  {
    code: "WRITE_HSF_CALLBACK_CENTRAL_IDEA_RECURRENCE",
    zh: "核心概念復現",
    featureCode: "WRITE_HSF_CALLBACK",
  },
  {
    code: "WRITE_HSF_CONTRAST_CONTRAST",
    zh: "對比轉承",
    featureCode: "WRITE_HSF_CONTRAST",
  },
  {
    code: "WRITE_HSF_CONTRAST_ANTITHESIS",
    zh: "對偶反襯",
    featureCode: "WRITE_HSF_CONTRAST",
  },
  {
    code: "WRITE_HSF_CONTRAST_JUXTAPOSITION",
    zh: "並置",
    featureCode: "WRITE_HSF_CONTRAST",
  },
  {
    code: "WRITE_HSF_CONTRAST_BEFORE_AFTER",
    zh: "前後對照",
    featureCode: "WRITE_HSF_CONTRAST",
  },
  {
    code: "WRITE_HSF_CONTRAST_LIGHT_DARK_CONTRAST",
    zh: "明暗對照",
    featureCode: "WRITE_HSF_CONTRAST",
  },
  {
    code: "WRITE_HSF_PATTERNING_RHETORICAL_PARALLELISM",
    zh: "修辭平行",
    featureCode: "WRITE_HSF_PATTERNING",
  },
  {
    code: "WRITE_HSF_PATTERNING_RULE_OF_THREE",
    zh: "三段式",
    featureCode: "WRITE_HSF_PATTERNING",
  },
  {
    code: "WRITE_HSF_PATTERNING_ANAPHORA",
    zh: "anaphora 首語重複",
    featureCode: "WRITE_HSF_PATTERNING",
  },
  {
    code: "WRITE_HSF_PATTERNING_REPETITION",
    zh: "重複",
    featureCode: "WRITE_HSF_PATTERNING",
  },
  {
    code: "WRITE_HSF_PATTERNING_CLIMACTIC_SEQUENCE",
    zh: "漸強序列",
    featureCode: "WRITE_HSF_PATTERNING",
  },
  {
    code: "WRITE_HSF_RHET_QUESTION_QUESTION_OPENING",
    zh: "提問開場",
    featureCode: "WRITE_HSF_RHET_QUESTION",
  },
  {
    code: "WRITE_HSF_RHET_QUESTION_CHALLENGE_QUESTION",
    zh: "挑戰式提問",
    featureCode: "WRITE_HSF_RHET_QUESTION",
  },
  {
    code: "WRITE_HSF_RHET_QUESTION_REFLECTIVE_QUESTION",
    zh: "反思式提問",
    featureCode: "WRITE_HSF_RHET_QUESTION",
  },
  {
    code: "WRITE_HSF_RHET_QUESTION_QUESTION_ANSWER_PATTERN",
    zh: "自問自答",
    featureCode: "WRITE_HSF_RHET_QUESTION",
  },
  {
    code: "WRITE_HSF_FIGURATIVE_SIMILE",
    zh: "明喻",
    featureCode: "WRITE_HSF_FIGURATIVE",
  },
  {
    code: "WRITE_HSF_FIGURATIVE_METAPHOR",
    zh: "隱喻",
    featureCode: "WRITE_HSF_FIGURATIVE",
  },
  {
    code: "WRITE_HSF_FIGURATIVE_ANALOGY",
    zh: "類比",
    featureCode: "WRITE_HSF_FIGURATIVE",
  },
  {
    code: "WRITE_HSF_FIGURATIVE_EXTENDED_METAPHOR",
    zh: "延伸隱喻",
    featureCode: "WRITE_HSF_FIGURATIVE",
  },
  {
    code: "WRITE_HSF_FIGURATIVE_PERSONIFICATION",
    zh: "擬人",
    featureCode: "WRITE_HSF_FIGURATIVE",
  },
  {
    code: "WRITE_HSF_IMAGERY_VISUAL",
    zh: "視覺意象",
    featureCode: "WRITE_HSF_IMAGERY",
  },
  {
    code: "WRITE_HSF_IMAGERY_AUDITORY",
    zh: "聽覺意象",
    featureCode: "WRITE_HSF_IMAGERY",
  },
  {
    code: "WRITE_HSF_IMAGERY_TACTILE",
    zh: "觸覺意象",
    featureCode: "WRITE_HSF_IMAGERY",
  },
  {
    code: "WRITE_HSF_IMAGERY_OLFACTORY",
    zh: "嗅覺意象",
    featureCode: "WRITE_HSF_IMAGERY",
  },
  {
    code: "WRITE_HSF_IMAGERY_GUSTATORY",
    zh: "味覺意象",
    featureCode: "WRITE_HSF_IMAGERY",
  },
  {
    code: "WRITE_HSF_IMAGERY_SENSORY_DETAILS",
    zh: "感官細節",
    featureCode: "WRITE_HSF_IMAGERY",
  },
  {
    code: "WRITE_HSF_IMAGERY_CONCRETE_IMAGERY",
    zh: "具體意象",
    featureCode: "WRITE_HSF_IMAGERY",
  },
  {
    code: "WRITE_HSF_POWERFUL_CLOSE_PUNCH_LINE",
    zh: "收束金句",
    featureCode: "WRITE_HSF_POWERFUL_CLOSE",
  },
  {
    code: "WRITE_HSF_POWERFUL_CLOSE_APHORISTIC_ENDING",
    zh: "格言式結尾",
    featureCode: "WRITE_HSF_POWERFUL_CLOSE",
  },
  {
    code: "WRITE_HSF_POWERFUL_CLOSE_CALLBACK_ENDING",
    zh: "回扣式結尾",
    featureCode: "WRITE_HSF_POWERFUL_CLOSE",
  },
  {
    code: "WRITE_HSF_POWERFUL_CLOSE_CONTRAST_ENDING",
    zh: "對比式結尾",
    featureCode: "WRITE_HSF_POWERFUL_CLOSE",
  },
  {
    code: "WRITE_HSF_POWERFUL_CLOSE_RHETORICAL_QUESTION_ENDING",
    zh: "提問式結尾",
    featureCode: "WRITE_HSF_POWERFUL_CLOSE",
  },
  {
    code: "WRITE_HSF_POWERFUL_CLOSE_MEMORABLE_FINAL_SENTENCE",
    zh: "令人印象深刻的結尾句",
    featureCode: "WRITE_HSF_POWERFUL_CLOSE",
  },
  {
    code: "WRITE_HSF_CLEAR_FOCUS_CENTRAL_IDEA",
    zh: "核心概念",
    featureCode: "WRITE_HSF_CLEAR_FOCUS",
  },
  {
    code: "WRITE_HSF_CLEAR_FOCUS_CONTROLLING_IDEA",
    zh: "統攝概念",
    featureCode: "WRITE_HSF_CLEAR_FOCUS",
  },
  {
    code: "WRITE_HSF_CLEAR_FOCUS_THESIS",
    zh: "thesis（論說文）",
    featureCode: "WRITE_HSF_CLEAR_FOCUS",
  },
  {
    code: "WRITE_HSF_CLEAR_FOCUS_PARAGRAPH_FOCUS",
    zh: "段落焦點",
    featureCode: "WRITE_HSF_CLEAR_FOCUS",
  },
  {
    code: "WRITE_HSF_CLEAR_FOCUS_PURPOSE_AWARENESS",
    zh: "寫作目的意識",
    featureCode: "WRITE_HSF_CLEAR_FOCUS",
  },
  {
    code: "WRITE_HSF_ELABORATION_SPECIFICITY",
    zh: "具體性",
    featureCode: "WRITE_HSF_ELABORATION",
  },
  {
    code: "WRITE_HSF_ELABORATION_CONCRETIZATION",
    zh: "具象化",
    featureCode: "WRITE_HSF_ELABORATION",
  },
  {
    code: "WRITE_HSF_ELABORATION_EFFECTIVE_EXAMPLES",
    zh: "有效例證",
    featureCode: "WRITE_HSF_ELABORATION",
  },
  {
    code: "WRITE_HSF_ELABORATION_ILLUSTRATION",
    zh: "例示",
    featureCode: "WRITE_HSF_ELABORATION",
  },
  {
    code: "WRITE_HSF_ELABORATION_EXPLANATION",
    zh: "解釋",
    featureCode: "WRITE_HSF_ELABORATION",
  },
  {
    code: "WRITE_HSF_ELABORATION_DETAIL",
    zh: "細節",
    featureCode: "WRITE_HSF_ELABORATION",
  },
  {
    code: "WRITE_HSF_ELABORATION_IDEA_EXPLAIN_EXTEND",
    zh: "Idea → Explain → Extend 展開",
    featureCode: "WRITE_HSF_ELABORATION",
  },
  {
    code: "WRITE_HSF_LOGIC_CAUSE_EFFECT",
    zh: "因果轉承",
    featureCode: "WRITE_HSF_LOGIC",
  },
  {
    code: "WRITE_HSF_LOGIC_CAUSAL_CHAIN",
    zh: "因果鏈",
    featureCode: "WRITE_HSF_LOGIC",
  },
  {
    code: "WRITE_HSF_LOGIC_PROBLEM_SOLUTION",
    zh: "問題－解決",
    featureCode: "WRITE_HSF_LOGIC",
  },
  {
    code: "WRITE_HSF_LOGIC_CONDITION_RESULT",
    zh: "條件－結果",
    featureCode: "WRITE_HSF_LOGIC",
  },
  {
    code: "WRITE_HSF_LOGIC_REASON_RESULT",
    zh: "理由－結果",
    featureCode: "WRITE_HSF_LOGIC",
  },
  {
    code: "WRITE_HSF_LOGIC_PROCESS_DEVELOPMENT",
    zh: "過程推展",
    featureCode: "WRITE_HSF_LOGIC",
  },
  {
    code: "WRITE_HSF_MULTIANGLE_COMPARE_CONTRAST",
    zh: "比較對照",
    featureCode: "WRITE_HSF_MULTIANGLE",
  },
  {
    code: "WRITE_HSF_MULTIANGLE_CATEGORIZATION",
    zh: "分類",
    featureCode: "WRITE_HSF_MULTIANGLE",
  },
  {
    code: "WRITE_HSF_MULTIANGLE_GROUPING",
    zh: "歸類",
    featureCode: "WRITE_HSF_MULTIANGLE",
  },
  {
    code: "WRITE_HSF_MULTIANGLE_MULTIPLE_PERSPECTIVES",
    zh: "多重觀點",
    featureCode: "WRITE_HSF_MULTIANGLE",
  },
  {
    code: "WRITE_HSF_MULTIANGLE_STAKEHOLDER_ANALYSIS",
    zh: "關係人分析",
    featureCode: "WRITE_HSF_MULTIANGLE",
  },
  {
    code: "WRITE_HSF_MULTIANGLE_DIFFERENT_DIMENSIONS",
    zh: "不同面向",
    featureCode: "WRITE_HSF_MULTIANGLE",
  },
  {
    code: "WRITE_HSF_INSIGHT_LESSON_LEARNED",
    zh: "學到的道理",
    featureCode: "WRITE_HSF_INSIGHT",
  },
  {
    code: "WRITE_HSF_INSIGHT_MEANING",
    zh: "意義",
    featureCode: "WRITE_HSF_INSIGHT",
  },
  {
    code: "WRITE_HSF_INSIGHT_IMPLICATION",
    zh: "意涵",
    featureCode: "WRITE_HSF_INSIGHT",
  },
  {
    code: "WRITE_HSF_INSIGHT_PERSPECTIVE_SHIFT",
    zh: "觀點轉變",
    featureCode: "WRITE_HSF_INSIGHT",
  },
  {
    code: "WRITE_HSF_INSIGHT_DEEPER_INTERPRETATION",
    zh: "更深層詮釋",
    featureCode: "WRITE_HSF_INSIGHT",
  },
  {
    code: "WRITE_HSF_INSIGHT_SO_WHAT",
    zh: "「so what?」",
    featureCode: "WRITE_HSF_INSIGHT",
  },
  {
    code: "WRITE_HSF_MEANINGFUL_CLOSE_SYNTHESIS",
    zh: "綜合收束",
    featureCode: "WRITE_HSF_MEANINGFUL_CLOSE",
  },
  {
    code: "WRITE_HSF_MEANINGFUL_CLOSE_RESOLUTION",
    zh: "收束解決",
    featureCode: "WRITE_HSF_MEANINGFUL_CLOSE",
  },
  {
    code: "WRITE_HSF_MEANINGFUL_CLOSE_IMPLICATION",
    zh: "意涵",
    featureCode: "WRITE_HSF_MEANINGFUL_CLOSE",
  },
  {
    code: "WRITE_HSF_MEANINGFUL_CLOSE_RETURN_TO_CENTRAL_IDEA",
    zh: "回到核心概念",
    featureCode: "WRITE_HSF_MEANINGFUL_CLOSE",
  },
  {
    code: "WRITE_HSF_MEANINGFUL_CLOSE_ANSWERING_THE_TASK",
    zh: "回應題目要求",
    featureCode: "WRITE_HSF_MEANINGFUL_CLOSE",
  },
  {
    code: "WRITE_HSF_MEANINGFUL_CLOSE_FUTURE_IMPLICATION",
    zh: "未來意涵",
    featureCode: "WRITE_HSF_MEANINGFUL_CLOSE",
  },
] as const;

/* ──────────────── 展開後的查表結構 ──────────────── */

export const COMPETENCY_SKILLS: readonly CompetencySkill[] =
  COMPETENCY_CATEGORIES.flatMap((c) => c.skills);

export const HIGH_SCORE_FEATURES: readonly HighScoreFeature[] =
  HIGH_SCORE_CATEGORIES.flatMap((c) => c.features);

/** 完整覆蓋驗證用的 canonical code 清單。順序即 prompt 內的列舉順序。 */
export const ALL_COMPETENCY_SKILL_CODES: readonly string[] =
  COMPETENCY_SKILLS.map((s) => s.code);

export const ALL_ERROR_CODES: readonly string[] = ERROR_TAGS.map((e) => e.code);

export const ALL_HIGH_SCORE_FEATURE_CODES: readonly string[] =
  HIGH_SCORE_FEATURES.map((f) => f.code);

const byCode = <T extends { code: string }>(items: readonly T[]) =>
  new Map(items.map((i) => [i.code, i]));

export const COMPETENCY_SKILL_BY_CODE = byCode(COMPETENCY_SKILLS);
export const COMPETENCY_CATEGORY_BY_CODE = byCode(COMPETENCY_CATEGORIES);
export const ERROR_TAG_BY_CODE = byCode(ERROR_TAGS);
export const HIGH_SCORE_FEATURE_BY_CODE = byCode(HIGH_SCORE_FEATURES);
export const HIGH_SCORE_CATEGORY_BY_CODE = byCode(HIGH_SCORE_CATEGORIES);

export const HIGH_SCORE_SUBSKILL_BY_CODE = byCode(HIGH_SCORE_SUBSKILLS);

