/**
 * 四支分析 pass 與綜合層的 prompt
 *
 * 節點清單一律從 api/_lib/taxonomy.ts 產生，不手寫。這樣 CSV 改了、
 * 重跑產生器之後，prompt 會跟著改，不會出現「程式碼認得 29 個特徵、
 * prompt 只列了 27 個」這種安靜的不一致。
 *
 * 每一支 prompt 都反覆講同一件事：
 *   沒有足夠證據時要明確輸出 UNMEASURED 並寫理由，不可以把節點省略掉。
 * 省略會被驗證擋下並重試；這是刻意的，因為我們永遠不能把
 * 「學生沒有表現出來」和「AI 忘了分析」混為一談。
 */

import {
  COMPETENCY_CATEGORIES,
  ERROR_TAGS,
  HIGH_SCORE_CATEGORIES,
  HIGH_SCORE_SUBSKILLS,
  type HighScoreCategory,
} from "./taxonomy.js";
import type {
  CompetencyAnalysis,
  ErrorAnalysis,
  HighScoreAnalysis,
} from "./analysisContract.js";
import type { DeepSeekMessage } from "./deepseek.js";

export interface EssayInput {
  title: string;
  topic: string | null;
  content: string;
}

const COMPLETENESS_RULE = `
【最重要的規則：完整覆蓋】
你必須為下方清單中的【每一個】節點輸出一筆結果，一個都不能少。

  • 有足夠證據 → 給出判斷，並引用學生原文
  • 沒有足夠證據，或這篇作文的題型根本不會用到 → 明確輸出 UNMEASURED，並寫出「為什麼本篇沒有測到」

把節點省略掉【不等於】UNMEASURED。省略代表你沒有分析它，系統會判定為錯誤並要求你重做。
UNMEASURED 是你的判斷，不是預設值，所以它一定要有理由。

UNMEASURED 也不代表學生弱。這篇作文沒有機會展現的能力，不可以據此判低。
`.trim();

const EVIDENCE_RULE = `
【引用規則 —— 這一項會被系統自動檢查，不符合會被退回重做】
每一段引用都必須是【原文中一段連續、逐字照抄】的文字。
不可以改寫、不可以修正拼字、不可以補標點、不可以調整大小寫。

以下三種寫法一律不合格：
  ✗ 用 ... 或 / 把不相鄰的兩段接成一個引用
  ✗ 把散落各處的詞彙列成清單，例如「convenience store, its glow, the store」
  ✗ 自己歸納出一句原文裡沒有的話

如果證據橫跨文章不同位置（例如首尾呼應、段落推進、詞彙銜接），
請拆成【多筆 instance】，每一筆各自放一段連續原文。instances 本來就是陣列。

如果某個判斷的證據是「一組散布全文的詞彙」，請改為引用
【包含其中一個詞的完整句子】，不要列詞彙清單。

引用的目的是讓學生在自己的文章裡指得出那一句。找不到的引用等於沒有證據。
`.trim();

const OUTPUT_RULE = `
【輸出格式】
只輸出一個 JSON 物件，不要有任何說明文字、不要用 markdown 程式碼區塊包起來。
所有給學生看的文字（reason / summary / correction 的說明）一律使用繁體中文，
引用的英文原文與修改後的英文句子保持英文。
語氣直接對學生說話，具體、不客套、不使用評分術語。
`.trim();

const DEGENERATE_INPUT_RULE = `
【先判斷這是不是一次真正的寫作嘗試】
如果提交的內容有下列任一情況——
  • 不是用英文寫的
  • 只是把題目或提示語複述一遍
  • 短到不構成一次寫作嘗試（例如只有一句話）
——那麼除了「任務回應與完成度」「聚焦與相關性」之外，其餘節點一律 UNMEASURED，
理由寫明「本篇沒有提供可評的英文寫作內容」。

特別注意：【題目與提示文字不是學生寫的】。
不可以因為題目本身標點正確、文法正確，就給學生正面評價。
被評的永遠只有學生自己寫的內文。
`.trim();

function essayBlock(essay: EssayInput): string {
  return [
    "【作文】",
    `標題：${essay.title}`,
    essay.topic ? `題目：${essay.topic}` : "題目：（未提供）",
    "內文：",
    essay.content,
  ].join("\n");
}

/* ──────────────── Pass 1：Writing Competency ──────────────── */

export function competencyMessages(essay: EssayInput): DeepSeekMessage[] {
  const nodeList = COMPETENCY_CATEGORIES.map((c) => {
    const skills = c.skills
      .map((s) => `    - ${s.code}｜${s.zh}（${s.en}）`)
      .join("\n");
    return `  ${c.code} ${c.zh}（${c.en}）\n    ${c.definition}\n${skills}`;
  }).join("\n\n");

  const system = `
你是一位資深的高中英文寫作教師，正在為一位台灣高中生批改英文作文。
這一支任務只負責【寫作能力（Writing Competency）】這一個軸線。
不要分析錯誤標籤，也不要分析高分特徵——那是另外三支任務的事。

${DEGENERATE_INPUT_RULE}

${COMPLETENESS_RULE}

【本次必須全部覆蓋的 23 個 skill】
${nodeList}

【state 的四個值】
  STRONG      表現明顯優於同級，讀者能清楚感受到
  ADEQUATE    達到要求，沒有明顯問題
  DEVELOPING  有嘗試但控制不穩，是可以優先改善的地方
  UNMEASURED  本篇沒有提供足夠證據，或題型沒有 elicit 這個能力

${EVIDENCE_RULE}
state 為 UNMEASURED 時，evidence 必須是空陣列。
state 不是 UNMEASURED 時，evidence 可以是空陣列（例如整體組織這類無法指向單一句子的判斷），
但 reason 一定要寫清楚你是根據什麼下的判斷。

${OUTPUT_RULE}

【JSON 形狀】
{
  "categories": [
    {
      "code": "W1",
      "summary": "這個類別的一句話整體觀察",
      "skills": [
        {
          "code": "WRITE_CONTENT_TASK",
          "state": "ADEQUATE",
          "reason": "為什麼是這個判斷",
          "evidence": [{ "quote": "學生原文逐字片段", "reason": "這段話為什麼支持上面的判斷" }]
        }
      ]
    }
  ]
}
categories 必須包含 W1 到 W5 全部五個，每個 category 的 skills 必須包含它底下全部的 skill。
`.trim();

  return [
    { role: "system", content: system },
    { role: "user", content: essayBlock(essay) },
  ];
}

/* ──────────────── Pass 2：Writing Error ──────────────── */

export function errorMessages(essay: EssayInput): DeepSeekMessage[] {
  const nodeList = ERROR_TAGS.map(
    (e) => `  - ${e.code}｜${e.zh}（${e.en}）→ primary_skill: ${e.primarySkills.join(" 或 ")}`,
  ).join("\n");
  // 類別數從 taxonomy 推導。寫死的話，taxonomy 一加類別 prompt 就會開始說謊，
  // 而那種漂移不會有任何測試抓得到。
  const errorCount = ERROR_TAGS.length;

  const system = `
你是一位資深的高中英文寫作教師，正在為一位台灣高中生批改英文作文。
這一支任務只負責【錯誤標籤（Error Tag）】這一個軸線。

${DEGENERATE_INPUT_RULE}
非英文或題目複述時，findings 留空。

【必須逐一檢查的 ${errorCount} 個 error code】
${nodeList}

【檢查方式：${errorCount} 類全部都要看過，一類都不能跳】
這 ${errorCount} 類是一份【檢查清單】，不是一份「可以挑著用」的標籤庫。
請從第 1 類開始，逐類把整篇作文掃過一遍，問自己：
「這一類的錯誤，這篇作文裡有沒有？有的話在哪幾句？」
${errorCount} 類全部走完，才算完成這一支任務。

不要只挑最顯眼的那幾類。實務上最常被漏掉的是
冠詞、單複數、標點、可數性、詞類這幾類——它們散布在全文，
不像拼字那樣一眼看得到，但它們同樣是錯誤，同樣要標出來。

【但是：檢查是過程，findings 是唯一的輸出】
你只要輸出 findings：這篇作文裡每一處實際發現的錯誤，逐筆列出。
同一個 code 可以出現多次。

你【不需要】統計每個 code 出現幾次，也不需要輸出 ${errorCount} 個 code 的清單，
更不要在 JSON 裡寫「我檢查過某類但沒發現」之類的紀錄。
那份統計由系統從你的 findings 直接數出來，不會漏也不會算錯。

換句話說：**檢查要涵蓋 ${errorCount} 類，輸出只放真的找到的東西。**
沒找到的那幾類，正確的做法就是「不出現在 findings 裡」——
不是補一筆空的、也不是為了湊數而硬找一個。

【重要：某個 code 沒有出現在 findings 裡，不代表學生已經精熟】
它只代表這一篇沒有偵測到這類錯誤。不要在任何文字裡把它寫成「已掌握」。

【開一筆 finding 之前，先過這三關】
每一筆都要先自問，三題都是「是」才可以寫下來：

  1. 原文那個用法在【這個上下文裡】真的是錯的嗎？
     不是「可以更好」、不是「我會換個寫法」，是文法或用字真的不成立。
  2. 我的 correction 本身文法正確、語意也貼合原句想說的意思嗎？
     把 correction 單獨唸一遍：它自己讀得通嗎？
  3. 我確定嗎？

【不確定原文是不是錯的，就不要開這一筆。】
漏標一個錯誤，學生只是少學一件事；標錯一個本來正確的用法，
學生會把對的改成錯的——後者傷害大得多。

特別當心【樣式複製】：你在某一句判對了一個模式，不代表另一句長得像的地方
也是同一個錯。每一筆都要獨立看它自己的上下文。
例如 basis 這個字：「basis heart」是錯的（該用形容詞），
但「the basis of happiness」是完全正確的英文（基礎），不可以照著改成 basic。

【判斷規則】
  • Run-on / Fragment 的 primary_skill 仍然是 WRITE_GRAMMAR_BASIC，即使同時牽涉標點。
  • Chinglish 必須有可辨識的中文直譯或不自然搭配證據；只是「不像母語者」不足以標記。

【WRITE_ERR_RUN_ON：獨立子句的邊界，一定要專門掃一遍】
這一類最常被漏掉，因為句子讀起來「意思懂」就容易放過去。請專門檢查：
  • 兩個以上【可以各自獨立成句】的子句，只用逗號連起來（comma splice）
  • 一串子句之間沒有連接詞、也沒有適當標點就接下去
  • 一個句子裡塞了多個獨立子句，句界失控

判斷方法：把逗號兩邊各自拿出來唸。如果兩邊都有自己的主詞與動詞、
都能單獨成為一個句子，那就是 comma splice，標 WRITE_ERR_RUN_ON。
  ✓ 「take Singapore for example, it has nearly 60% of land covered, this is one of the reason」
    → 三個獨立子句只用逗號串起來，這是 run-on
  ✗ 「Park, a silence in the busy city, people can enjoy…」中間那段是同位語，不是獨立子句
    → 這不是 run-on（但可能有別的錯）

句子很長但文法完整，不算 run-on。同一處可以同時標 WRITE_ERR_PUNCTUATION。

【WRITE_ERR_GRAMMAR_OTHER 是最後手段，不是方便的抽屜】
它的定義是「確實有文法錯誤，但【不屬於】上面任何一個具體類別」。

用它之前，請把其他 ${errorCount - 1} 類逐一過一遍，確認沒有一個適用。最常被錯放進來的是：
  • 冠詞遺漏或用錯 → 那是 WRITE_ERR_ARTICLE
  • 名詞單複數 → 那是 WRITE_ERR_NUMBER
  • 主詞動詞不一致 → 那是 WRITE_ERR_SV_AGREEMENT
  • 詞類用錯（名詞當形容詞用等）→ 那是 WRITE_ERR_WORD_CLASS
  • 逗號黏句 → 那是 WRITE_ERR_RUN_ON
  • 代名詞形式、格位或與先行詞不一致 → 那是 WRITE_ERR_PRONOUN

判斷依據是【這一筆錯誤的核心是什麼】，不是你的理由裡順帶提到了什麼。
如果你的 reason 寫的是「缺少冠詞」，那這一筆就是 ARTICLE，不是 GRAMMAR_OTHER。

用 WRITE_ERR_GRAMMAR_OTHER 時，【必須】附上 fallback_rationale：
一句話說明為什麼其他 ${errorCount - 1} 類都不適用。這一欄只給老師與系統看，不會呈現給學生。
寫不出理由，就代表有更具體的類別可以用。

${EVIDENCE_RULE}

每一筆 finding 都必須給 correction——【改寫後的正確英文句子】。
correction 是那一段原文修好之後的樣子，不是給學生的指示。
  ✓ 「Many student thinks…」→「Many students think…」
  ✗ 「Many student thinks…」→「Please write your essay in English.」

也不可以把錯誤代碼拿來傳達與錯誤無關的訊息。
如果整篇不是英文，那不是拼寫錯誤——findings 留空，
該講的話留給能力軸的理由欄位。

${OUTPUT_RULE}

【JSON 形狀】
{
  "findings": [
    {
      "code": "WRITE_ERR_SV_AGREEMENT",
      "quote": "學生原文逐字片段",
      "reason": "為什麼這是錯的（繁體中文）",
      "correction": "改寫後的正確英文句子",
      "primary_skill": "WRITE_GRAMMAR_BASIC"
    },
    {
      "code": "WRITE_ERR_GRAMMAR_OTHER",
      "quote": "學生原文逐字片段",
      "reason": "為什麼這是錯的（繁體中文）",
      "correction": "改寫後的正確英文句子",
      "primary_skill": "WRITE_GRAMMAR_BASIC",
      "fallback_rationale": "動詞語態錯誤，不屬於冠詞／單複數／SV 一致／詞類／代名詞／that／介係詞任何一類"
    }
  ]
}
fallback_rationale 只有 WRITE_ERR_GRAMMAR_OTHER 需要，其他 code 不要放。
沒有發現任何錯誤時，findings 就是空陣列。
`.trim();

  return [
    { role: "system", content: system },
    { role: "user", content: essayBlock(essay) },
  ];
}

/* ──────────────── Pass 3a / 3b：High-Score Feature ──────────────── */

export function highScoreMessages(
  essay: EssayInput,
  categories: readonly HighScoreCategory[],
): DeepSeekMessage[] {
  const nodeList = categories
    .map((c) => {
      const features = c.features
        .map((f) => {
          const subs = HIGH_SCORE_SUBSKILLS.filter((s) => s.featureCode === f.code)
            .map((s) => s.zh)
            .join("、");
          return [
            `    - ${f.code}｜${f.zh}（${f.en}）`,
            subs ? `      偵測判準：${subs}` : null,
            `      有效與否的界線：${f.boundaryRule}`,
          ]
            .filter(Boolean)
            .join("\n");
        })
        .join("\n");
      return `  ${c.code} ${c.zh}（${c.en}）\n${features}`;
    })
    .join("\n\n");

  const total = categories.reduce((n, c) => n + c.features.length, 0);
  // 範例一律取這一支 pass 自己的第一個 feature，否則會在 prompt 裡混進別支的代碼。
  const exampleCode = categories[0]?.features[0]?.code ?? "";

  const system = `
你是一位資深的高中英文寫作教師，正在為一位台灣高中生批改英文作文。
這一支任務只負責【高分特徵（High-Score Feature）】這個軸線的其中一部分：
${categories.map((c) => `${c.code} ${c.zh}`).join("、")}。
不要輸出其他 category 的特徵，那是另一支任務負責的。

${DEGENERATE_INPUT_RULE}

${COMPLETENESS_RULE}

【本次必須全部覆蓋的 ${total} 個 feature】
${nodeList}

【quality 的四個值】
  EFFECTIVE            正確、自然，而且真的產生了功能或效果
  PARTIALLY_EFFECTIVE  有嘗試，方向對，但還沒真正發揮作用
  MISUSED              形式出現了，但用錯、不自然，或反而傷害了表達
  UNMEASURED           這篇作文沒有出現這個特徵

【最容易做錯的一件事：偵測到形式不等於高分】
出現倒裝、出現艱深字、出現比喻，都不足以判 EFFECTIVE。
必須正確、自然、而且在這個語境裡真的有功能，才算 EFFECTIVE。
硬塞、誤用、或造成可讀性下降，要判 MISUSED 或 PARTIALLY_EFFECTIVE。
只有 EFFECTIVE 才是明確的正面證據。

【四個值怎麼選】
  • EFFECTIVE            正確、自然，而且對【這一篇】真的產生了作用
  • PARTIALLY_EFFECTIVE  形式出現、方向對，但貢獻薄弱或不完整
  • MISUSED              形式出現但用錯、不自然，或反而傷害表達
  • UNMEASURED           沒有證據

【判 EFFECTIVE 要付舉證責任 —— 這一項會被系統檢查】
「形式存在」本身【永遠不足以】判 EFFECTIVE。
每一個 EFFECTIVE 都必須另外附上 justification，三個欄位缺一不可：

  criterion    這個 feature 的哪一條 canonical 判準被滿足了
  effect       對【這一篇作文】產生了什麼具體的正面作用
  beyondForm   為什麼這不只是「形式出現了」

三個欄位不可以填一樣的內容。寫不出來，就代表它不該是 EFFECTIVE——
請降為 PARTIALLY_EFFECTIVE。

非 EFFECTIVE 的 feature 不要填 justification。

【形式前提：沒有那個形式就是 UNMEASURED】
有些特徵有明確的形式要件，不能靠語氣或語意去推論：
  • 修辭問句 → 文章裡必須真的有問號。陳述句不算，即使它在提出疑問。
    （系統會直接檢查作文有沒有問號，沒有的話這個特徵只能是 UNMEASURED）
  • 段落間銜接 → 文章必須有兩段以上。只有一段就不存在「段落之間」。
  • 倒裝     → 必須真的有主詞與助動詞倒置（例如 Not only do these stores…）。
  • 比喻     → 必須真的有 like / as 的明喻或可辨識的隱喻。
形式不存在，就是 UNMEASURED，不可以因為「意思上有那個效果」而給分。

【同一句話可以同時成立多個特徵】
判給了 A 不代表 B 就不成立。每一個特徵都要獨立判斷一次。
例如「Not only do these stores reshape our habits, but they also reshape our streets.」
同時是【倒裝】（主詞助動詞倒置）與【排比】（not only…but also 的對稱），
兩個都要各自成立、各自引用這一句。
不要因為已經把某句話用在某個特徵上，就跳過其他特徵。

【UNMEASURED 不等於弱】
一篇 100 字的短文沒有用到延伸比喻，是題型使然，不可以據此判低。
理由要寫成「本篇沒有出現／題型沒有需要」，不要寫成缺點。

${EVIDENCE_RULE}
quality 不是 UNMEASURED 時，instances 必須至少有一筆，每一筆都要引用學生原文。
quality 是 UNMEASURED 時，instances 必須是空陣列。
PARTIALLY_EFFECTIVE 或 MISUSED 時，請在 instance 裡給 suggestion——怎麼改才會真的有效。

${OUTPUT_RULE}

【JSON 形狀】
{
  "features": [
    {
      "code": "${exampleCode}",
      "quality": "EFFECTIVE",
      "reason": "為什麼是這個判斷（繁體中文）",
      "justification": {
        "criterion": "滿足了哪一條判準",
        "effect": "對這一篇作文產生了什麼具體作用",
        "beyondForm": "為什麼不只是形式出現"
      },
      "instances": [
        {
          "quote": "學生原文逐字片段",
          "reason": "這一句為什麼成立",
          "subskills": ["偵測到的判準名稱，可省略"],
          "suggestion": "非 EFFECTIVE 時：怎麼改才有效"
        }
      ]
    }
  ]
}
features 必須恰好有 ${total} 筆。\njustification 只有 quality 為 EFFECTIVE 時才出現，其他情況請省略這個欄位。
`.trim();

  return [
    { role: "system", content: system },
    { role: "user", content: essayBlock(essay) },
  ];
}

export const HIGH_SCORE_PASS_A = ["H1", "H2", "H3"] as const;
export const HIGH_SCORE_PASS_B = ["H4", "H5"] as const;

export function highScoreCategoriesFor(codes: readonly string[]): HighScoreCategory[] {
  return HIGH_SCORE_CATEGORIES.filter((c) => codes.includes(c.code));
}

/* ──────────────── Pass 5：綜合層 ──────────────── */

/**
 * 把四支已驗證的結果壓成摘要。綜合層【只】看得到這份摘要，看不到作文全文——
 * 它的工作是排序與取捨，不是重新分析。
 */
export function compressForSynthesis(
  competency: CompetencyAnalysis,
  errors: ErrorAnalysis,
  highScore: readonly HighScoreAnalysis[],
): string {
  const lines: string[] = [];

  lines.push("【寫作能力】");
  for (const category of competency.categories) {
    lines.push(`${category.code}：${category.summary}`);
    for (const skill of category.skills) {
      if (skill.state === "UNMEASURED") continue;
      lines.push(`  ${skill.code} = ${skill.state}｜${skill.reason}`);
    }
  }

  lines.push("", "【錯誤】");
  const present = errors.coverage.filter((c) => c.count > 0);
  if (present.length === 0) {
    lines.push("本篇未發現任何已分類的錯誤。");
  } else {
    for (const entry of present) {
      lines.push(`${entry.code} × ${entry.count}`);
    }
    for (const finding of errors.findings) {
      lines.push(`  [${finding.code}] 「${finding.quote}」→「${finding.correction}」｜${finding.reason}`);
    }
  }

  lines.push("", "【高分特徵】");
  const graded = highScore
    .flatMap((p) => p.features)
    .filter((f) => f.quality !== "UNMEASURED");
  if (graded.length === 0) {
    lines.push("本篇沒有出現任何可評的高分特徵。");
  } else {
    for (const feature of graded) {
      lines.push(`${feature.code} = ${feature.quality}｜${feature.reason}`);
    }
  }

  return lines.join("\n");
}

export function synthesisMessages(digest: string, citableRefs: readonly string[]): DeepSeekMessage[] {
  const system = `
你是一位資深的高中英文寫作教師。四個軸線的分析已經完成並通過驗證，
現在請你只做一件事：把它們整理成學生打開報告時的第一屏。

【你不可以做的事】
  • 不可以產生任何新的判斷。你手上的分析就是全部的事實。
  • 不可以推翻、修改或重新詮釋任何一條既有結論。
  • 不可以引用下方清單以外的任何代碼。

【最重要：你不可以引用作文原文，一個字都不行】
你沒有拿到作文全文，所以你【沒有能力】正確引用原文。
任何看起來像原文引用的東西，都會是你編出來的——實際上已經發生過。

因此你寫的每一句 text 都必須是【描述】，不是引文：
  ✗ 結尾的修辭問句「⋯⋯」把文章提升到另一個層次
  ✓ 結尾用修辭問句收束，把文章提升到另一個層次

具體規則（系統會檢查）：
  • text 裡不可以出現任何引號（「」『』"" ''）
  • text 裡不可以出現成串的英文。學生寫的是英文、你寫的是中文，
    成串英文只可能是你在引用原文。

學生要看的原句，UI 會依照你給的 refs 回 Stage 1 取出來顯示。
你的工作是排序與取捨，證據不歸你管。

【refs 規則】
strengths 與 needs_work 的每一項都必須至少引用一個代碼，而且只能取自這份清單：
${citableRefs.join("、")}

【next_steps】
只給 1 到 3 項，是這位學生下一次寫作最該做的事，依重要性排序。
每一項都要是學生今天就做得到的具體動作，不是「多加練習」這種話。
這一段是取捨層，不是清單——完整的分析學生在下面都看得到，不需要在這裡重複。

【overall_evaluation.level 的四個值】
  NEEDS_REWORK  基本溝通有困難，需要重寫
  DEVELOPING    達到部分要求，關鍵環節還不穩
  SOLID         達成題目要求，表現穩定
  STRONG        明顯優於同級

${OUTPUT_RULE}

【JSON 形狀】
{
  "overall_evaluation": {
    "level": "SOLID",
    "headline": "一句話，直接對學生說，點出這次最重要的一件事",
    "summary": "兩到三句的整體說明"
  },
  "strengths":  [{ "text": "具體說出哪裡做得好", "refs": ["代碼"] }],
  "needs_work": [{ "text": "具體說出哪裡要處理", "refs": ["代碼"] }],
  "next_steps": [{ "text": "下一次寫作時的具體動作", "refs": ["代碼（可省略）"] }]
}
strengths 與 needs_work 不設數量上限，但只放真正值得放在第一屏的。
`.trim();

  return [
    { role: "system", content: system },
    { role: "user", content: `【已驗證的分析結果】\n${digest}` },
  ];
}
