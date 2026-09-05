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
} from "./taxonomy";
import type {
  CompetencyAnalysis,
  ErrorAnalysis,
  HighScoreAnalysis,
} from "./analysisContract";
import type { DeepSeekMessage } from "./deepseek";

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
【引用規則】
引用學生原文時必須逐字照抄，不可以改寫、修正拼字或補標點。
引用的目的是讓學生認得出「這是我寫的那一句」。
`.trim();

const OUTPUT_RULE = `
【輸出格式】
只輸出一個 JSON 物件，不要有任何說明文字、不要用 markdown 程式碼區塊包起來。
所有給學生看的文字（reason / summary / correction 的說明）一律使用繁體中文，
引用的英文原文與修改後的英文句子保持英文。
語氣直接對學生說話，具體、不客套、不使用評分術語。
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

  const system = `
你是一位資深的高中英文寫作教師，正在為一位台灣高中生批改英文作文。
這一支任務只負責【錯誤標籤（Error Tag）】這一個軸線。

【必須全部覆蓋的 16 個 error code】
${nodeList}

【兩份輸出，都不能少】
1. findings：這篇作文裡每一處實際發現的錯誤，逐筆列出。同一個 code 可以出現多次。
2. coverage：上面 16 個 code【全部】都要列出來，包含一次都沒出現的。
   沒有出現就寫 count: 0。這是你的明確陳述——「本篇未發現此類錯誤」，
   而不是因為你忘了看。

coverage 裡每個 code 的 count 必須等於 findings 裡該 code 的筆數，對不上會被判定為錯誤。

【重要：count = 0 不代表學生已經精熟】
它只代表這一篇沒有出現這類錯誤。不要在任何文字裡把它寫成「已掌握」。

【判斷規則】
  • WRITE_ERR_GRAMMAR_OTHER 只能當 fallback。能用更具體的 tag 就必須用具體的。
  • Run-on / Fragment 的 primary_skill 仍然是 WRITE_GRAMMAR_BASIC，即使同時牽涉標點。
  • Chinglish 必須有可辨識的中文直譯或不自然搭配證據；只是「不像母語者」不足以標記。

${EVIDENCE_RULE}
每一筆 finding 都必須給 correction——改寫後的正確英文句子。錯誤沒有修正對學生沒有用。

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
    }
  ],
  "coverage": [
    { "code": "WRITE_ERR_RUN_ON", "count": 0 }
  ]
}
coverage 必須恰好有 16 筆。
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
features 必須恰好有 ${total} 筆。
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
  • 你沒有拿到作文全文，也不需要——你的工作是排序與取捨，不是重新分析。

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
