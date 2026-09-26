/**
 * Six-Way Reading parser 的自我檢查（不需要檔案、不需要資料庫）
 *
 *   npm run verify:reading-parser
 *
 * 🛑 P1 是這裡最重要的一條：construct 必須【從欄位名推導】。
 *    2026-09-26 我硬編碼猜 inference_conclusion 的前綴是 ic（實際是 co），
 *    查到 0 筆就錯誤地宣告那個 construct 整組不存在，還用一個循環的
 *    算式「佐證」它。這條斷言讓同樣的錯誤下次會被測試擋下，而不是
 *    變成一份寫得很有信心的錯誤報告。
 *
 * 🛑 S2：空的 emphasis 必須是 null，不是 0。
 *    來源真的有空值，而 0 的意思是「完全不強調」——跟「沒有資訊」
 *    是兩回事，混淆會讓 micro-skill 的統計悄悄偏移。
 *
 * 🛑 C1：內文來源必須依 final → revised → writer 挑，且跳過
 *    「值等於欄位名稱」的未解析參照。寫死只讀 writer 會在管線
 *    修好之後仍然用舊稿。
 */

import {
  skillsUnparseable,
  detectConstructs, isPlaceholder, parseOptions, parseSkills,
  parseVocab, parseParagraphMap, parseFameRank, pickContent, parseRow,
  missingColumns, unusedColumns,
} from "../src/lib/reading/parseSourceRow";
import { toCanonicalPayload } from "../src/lib/reading/canonicalPayload";
import {
  auditColumns, brokenColumns, classifyColumn,
} from "../src/lib/reading/columnClassification";

let failures = 0;
const check = (cond: boolean, label: string): void => {
  if (cond) console.log(`PASS  ${label}`);
  else { console.error(`FAIL  ${label}`); failures += 1; }
};

const SIX = ["sm", "mi", "sd", "co", "cd", "vc"];
const headersFor = (prefixes: string[]): string[] => [
  "topic_id", "topic_title", "difficulty_target",
  "passage_final_title", "passage_final_text",
  "passage_writer_title", "passage_writer_text", "passage_revised_text",
  "passage_writer_paragraph_map", "passage_writer_vocab_json",
  ...prefixes.flatMap((p) => [
    `${p}_final_question`, `${p}_final_options_json`,
    `${p}_final_answer`, `${p}_final_explanation`, `${p}_micro_skill_profile_json`,
  ]),
];

// ── P. construct 推導 ──────────────────────────────────
{
  const d = detectConstructs(headersFor(SIX));
  check(d.found.length === 6, `P1 六個 construct 全部從欄位名推導出來（${d.found.length}）`);
  check(d.found.map((f) => f.construct).sort().join() === "CD,CO,MI,SD,SM,VC",
    "P1 推導出的短碼正確");
  check(d.missingConstructs.length === 0, "P1 沒有回報缺少");

  // 🛑 少一個就要講出來，不可以靜悄悄
  const partial = detectConstructs(headersFor(["sm", "mi", "sd", "cd", "vc"]));
  check(partial.missingConstructs.join() === "CO", "P2 少了 co 時明確回報缺 CO");
  check(partial.found.length === 5, "P2 其餘五個仍然找得到");

  // 認不得的前綴要被列出來，不能被當成沒看到
  const odd = detectConstructs(headersFor([...SIX, "zz"]));
  check(odd.unknownPrefixes.join() === "zz", "P3 認不得的前綴被列出來，不會被吞掉");
  check(odd.found.length === 6, "P3 而且不影響認得的那六個");

  // 大小寫不該讓推導失敗
  const upper = detectConstructs(["SM_final_question", "CO_final_question"]);
  check(upper.found.length === 2, "P4 前綴大小寫不影響推導");
}

// ── C. 內文來源挑選 ────────────────────────────────────
{
  const hs = headersFor(SIX);
  const base: Record<string, unknown> = {
    topic_id: "KR0001", topic_title: "備援標題",
    passage_writer_title: "Writer 標題",
    passage_writer_text: "Writer 內文夠長可以當內容。",
    passage_revised_text: "Revised 內文夠長可以當內容。",
  };

  // final 是未解析的參照 → 跳過，用 revised
  const a = pickContent({ ...base, passage_final_title: "passage_writer_title",
                          passage_final_text: "passage_revised_text" }, new Set(hs));
  check(a.source === "REVISED", `C1 final 是欄位參照時退到 REVISED（實際 ${a.source}）`);
  check(a.text === "Revised 內文夠長可以當內容。", "C1 取到的是 revised 的內容");
  check(a.title === "Writer 標題", "C1 標題壞掉時退回別的來源，不讓整篇降級");

  // final 正常 → 用 final
  const b = pickContent({ ...base, passage_final_title: "Final 標題",
                          passage_final_text: "Final 內文。" }, new Set(hs));
  check(b.source === "FINAL" && b.text === "Final 內文。",
    "C2 final 正常時就用 final（沒有寫死只讀 writer）");

  // final 與 revised 都不行 → writer
  const c = pickContent({ ...base, passage_final_text: "passage_final_text",
                          passage_revised_text: null }, new Set(hs));
  check(c.source === "WRITER", `C3 final 壞、revised 空 → WRITER（實際 ${c.source}）`);

  // 三個都不行
  const d = pickContent({ topic_id: "X" }, new Set(hs));
  check(d.source === null && d.text === null, "C4 三個來源都沒有 → 回 null，不亂編");

  check(isPlaceholder("passage_final_text", new Set(hs)), "C5 值等於欄位名 → 判為參照");
  check(!isPlaceholder("Every year the industry…", new Set(hs)), "C5 正常內文不會被誤判");
}

// ── O. 選項 ────────────────────────────────────────────
{
  const ok = parseOptions("A: 第一個 | B: 第二個 | C: 第三個 | D: 第四個");
  check(ok.length === 4 && ok[2].label === "C" && ok[2].text === "第三個", "O1 四個選項解析正確");

  // 🛑 來源真的有「結構在、文字空」的列（KR0006 等三篇）
  const empty = parseOptions("A:  | B:  | C:  | D: ");
  check(empty.length === 0, `O2 選項文字全空 → 0 個，不是 4 個空字串（實際 ${empty.length}）`);

  const partial = parseOptions("A: 有 | B:  | C: 有 | D: 有");
  check(partial.length === 3, "O3 只有部分空白時，空的那個被丟掉");

  // 選項文字裡含冒號不該把它切壞
  const colon = parseOptions("A: 他說：走吧 | B: b | C: c | D: d");
  check(colon[0].text === "他說：走吧", "O4 選項內文含全形冒號不影響切割");
}

// ── S. micro-skill ─────────────────────────────────────
{
  const s = parseSkills("topic_identification: 90 | scope_control: 80 | gist_recognition: 75");
  check(s.length === 3 && s[0].emphasis === 90, "S1 三個 skill 與分數解析正確");

  const withEmpty = parseSkills("rhetorical_function:  | example_function: 90");
  check(withEmpty[0].emphasis === null, "🛑 S2 空的 emphasis 是 null");
  check(withEmpty[0].emphasis !== 0, "🛑 S2 而且不是 0（沒有資訊 ≠ 完全不強調）");
  check(withEmpty[1].emphasis === 90, "S2 同一列的其他 skill 不受影響");

  // 來源有分隔符不一致的情形："context_clue_use: 90| word_sense…"
  const sloppy = parseSkills("context_clue_use: 90| word_sense_disambiguation: 85");
  check(sloppy.length === 2, "S3 分隔符前後缺空白仍然解析得出來");

  check(parseSkills("bad: 150")[0].emphasis === null, "S4 超出 0–100 的分數視為無效 → null");
  // 🛑 代號含數字不可以被靜默丟掉
  check(parseSkills("skill_2: 80 | s3x: 70").length === 2,
    "🛑 S4b 代號含數字照樣解析得出來（原本的 regex 會把它們默默丟掉）");
  check(parseSkills(null).length === 0, "S5 空值回空陣列");
  // 🛑 「沒有 skill」與「解析不出來」必須分得開
  check(!skillsUnparseable(null), "S6 空值不算解析失敗");
  check(skillsUnparseable("topic_identification=90;scope_control=80"),
    "🛑 S6 有內容卻解析出 0 個 → 標記為格式漂移，不當成「本來就沒有」");
  check(!skillsUnparseable("topic_identification: 90"), "S6 正常格式不會誤報");
}

// ── V. 詞彙三層 ────────────────────────────────────────
{
  const v = parseVocab(
    "Candidate: settled = firmly decided (P1); neutral = not favoring (P4) " +
    "|| Academic: precision; evidence || Knowledge: longitude");
  check(v.filter((x) => x.tier === "CANDIDATE").length === 2, "V1 Candidate 兩個");
  check(v.filter((x) => x.tier === "ACADEMIC").length === 2, "V1 Academic 兩個");
  check(v.filter((x) => x.tier === "KNOWLEDGE").length === 1, "V1 Knowledge 一個");

  const settled = v.find((x) => x.term === "settled")!;
  check(settled.definition === "firmly decided", "V2 Candidate 的定義有解析出來");
  check(settled.paragraphNo === 1, "V2 段落錨點 (P1) 解析成 1");

  const acad = v.find((x) => x.tier === "ACADEMIC")!;
  check(acad.definition === null && acad.paragraphNo === null,
    "V3 Academic 沒有定義與段落，保持 null");

  const dup = parseVocab("Candidate: a = x (P1); a = y (P2)");
  check(dup.length === 1, "V4 同層同詞只留一次（資料庫有 UNIQUE）");
}

// ── M. 段落地圖與 fame ─────────────────────────────────
{
  const m = parseParagraphMap("P1: 開場 | P2: 發展 | P3: 轉折");
  check(m.length === 3 && m[1].paragraphNo === 2 && m[1].description === "發展",
    "M1 段落地圖解析正確");
  check(parseParagraphMap("沒有段落標記").length === 0, "M2 格式不符回空陣列");
  check(parseFameRank("3 = Hidden Gem") === 3, "M3 fame_level 的序數解析出來");
  check(parseFameRank("Hidden Gem") === null, "M3 沒有序數時回 null");
}

// ── R. 整列 ────────────────────────────────────────────
{
  const hs = headersFor(SIX);
  const row: Record<string, unknown> = {
    topic_id: "KR9999", difficulty_target: "B2", content_family: "science",
    fame_level: "2 = Semi-familiar",
    passage_final_title: "passage_writer_title",   // 壞的
    passage_final_text: "passage_revised_text",    // 壞的
    passage_writer_title: "標題", passage_revised_text: "內文。",
    passage_writer_paragraph_map: "P1: 開場",
    passage_writer_vocab_json: "Candidate: a = x (P1)",
  };
  for (const p of SIX) {
    row[`${p}_final_question`] = "Q?";
    row[`${p}_final_options_json`] = "A: a | B: b | C: c | D: d";
    row[`${p}_final_answer`] = "B";
    row[`${p}_final_explanation`] = "因為 B。";
    row[`${p}_micro_skill_profile_json`] = "topic_identification: 90 | scope_control: ";
  }
  const p1 = parseRow(row, hs);
  check(p1.publishReady, "R1 六題齊全且完整 → publishReady");
  check(p1.contentSource === "REVISED", "R1 內文來源記錄為 REVISED");
  check(p1.cefrLevel === "B2" && p1.fameRank === 2, "R1 CEFR 與 fame 序數正確");
  check(p1.questions.length === 6 && p1.questions[0].displayOrder === 1,
    "R1 六題，display_order 照 Six Ways 順序");

  // 一題缺解說 → 不可上架，但其他欄位照樣解析得出來
  const bad = { ...row, vc_final_explanation: null };
  const p2 = parseRow(bad, hs);
  check(!p2.publishReady, "🛑 R2 一題缺解說就不可上架");
  check(p2.passageText === "內文。", "R2 但內文照樣解析得出來（半成品要能入庫）");
  check(p2.questions.find((q) => q.construct === "VC")!.problems.includes("缺解說"),
    "R2 而且說得出是哪一題、缺什麼");

  // 正解對不到選項
  const p3 = parseRow({ ...row, sm_final_answer: "D", sm_final_options_json: "A: a | B: b" }, hs);
  const smq = p3.questions.find((q) => q.construct === "SM")!;
  check(smq.problems.some((x) => x.includes("沒有對應")), "R3 正解沒有對應選項會被指出來");
}

// ── X. 欄位相容性 ──────────────────────────────────────
{
  // 不用 headersFor()：它本身就帶著一部分欄位，拿它當「齊全」的基準
  // 會讓這組測試在驗自己的輔助函式，而不是驗 missingColumns。
  const ALL = [
    "topic_id", "difficulty_target", "content_family", "subdomain",
    "narrative_archetype", "geography", "time_period", "fame_level",
    "passage_quality_score", "passage_readability_score", "passage_sixway_score",
    "topic_quality_score", "passage_factual_risk", "package_id", "batch_id",
    "passage_writer_paragraph_map", "passage_writer_vocab_json",
  ];
  check(missingColumns(ALL).length === 0, "X1 欄位齊全時沒有回報缺少");

  // 2026-09-26 的 296 篇檔案就是這種子集：只有 topic_id / 難度 / 兩個分類 / 內文
  const subset = ["topic_id", "difficulty_target", "content_family", "subdomain",
                  "passage_writer_title", "passage_revised_text"];
  const miss = missingColumns(subset).map((m) => m.column);
  check(miss.includes("passage_writer_paragraph_map") && miss.includes("fame_level"),
    "🛑 X2 少掉的欄位被列出來（否則它們會靜默變成 null）");
  check(miss.includes("passage_writer_vocab_json"), "X2 詞彙欄位缺少也會講");

  check(unusedColumns([...subset, "some_new_column"]).includes("some_new_column"),
    "X3 認不得的新欄位被列出來");
  check(!unusedColumns(headersFor(SIX)).includes("sm_final_question"),
    "X3 construct 欄位不會被誤報為沒用到");
}

// ── Y. canonical payload ───────────────────────────────
{
  const hs = headersFor(SIX);
  const row: Record<string, unknown> = {
    topic_id: "KR8888", difficulty_target: "B2", content_family: "science",
    passage_writer_title: "標題", passage_revised_text: "內文夠長。",
    passage_writer_paragraph_map: "P1: 開場",
    passage_writer_vocab_json: "Candidate: a = x (P1)",
  };
  for (const p of SIX) {
    row[`${p}_final_question`] = "Q?";
    row[`${p}_final_options_json`] = "A: a | B: b | C: c | D: d";
    row[`${p}_final_answer`] = "B";
    row[`${p}_final_explanation`] = "因為 B。";
    row[`${p}_micro_skill_profile_json`] = "topic_identification: 90 | scope_control: ";
  }

  const ok = toCanonicalPayload(parseRow(row, hs))!;
  check(ok.questions.length === 6, "Y1 六題都進 payload");
  check(ok.questions[0].construct === "SM" && ok.questions[0].display_order === 1,
    "Y1 依 Six Ways 順序排好");
  check(ok.questions[0].options.A === "a" && ok.questions[0].options.D === "d",
    "Y1 選項轉成 A/B/C/D 物件（不是陣列——字母與位置不該是兩件要對齊的事）");
  check(ok.questions[0].skills.length === 2, "Y2 兩個 skill 都在");
  check(ok.questions[0].skills[1].emphasis === null,
    "🛑 Y2 emphasis 的 null 帶到 payload，沒有變成 0");
  check(ok.paragraphs.length === 1 && ok.vocabulary.length === 1, "Y2 段落與詞彙也帶過去");
  check(!("problems" in (ok as unknown as Record<string, unknown>)),
    "🛑 Y3 payload 不含 problems / publishReady —— 診斷是給畫面看的，不送進資料庫");

  // 🛑 壞掉的題目不進 payload，但文章照樣匯得進去
  const partial = { ...row, sm_final_options_json: "A:  | B:  | C:  | D: " };
  const p2 = toCanonicalPayload(parseRow(partial, hs))!;
  check(p2.questions.length === 5, "🛑 Y4 選項空白的那一題被排除（5 題）");
  check(!p2.questions.some((q) => q.construct === "SM"), "Y4 被排除的正是 SM");
  check(p2.passage.passage_text === "內文夠長。", "Y4 文章本身照樣進得去（DRAFT 允許不完整）");

  // 連內文都沒有 → 連 DRAFT 都不行
  check(toCanonicalPayload(parseRow({ topic_id: "X" }, hs)) === null,
    "Y5 沒有內文時回 null，不送一份殘缺的 payload 給資料庫");
}

// ── 三態：BLOCKED / DRAFT / PUBLISH_READY ───────────────────────────
// 🛑 產品規則寫成斷言。「0 題不匯入」如果只活在文件裡，
//    下一次重構就會把它變回「匯入一篇沒有題目的文章」。
{
  const hs = headersFor(SIX);
  const base: Record<string, unknown> = {
    topic_id: "Z1", passage_writer_title: "標題", passage_revised_text: "內文夠長。",
  };
  const q = (pre: string) => ({
    [`${pre}_final_question`]: "問題？",
    [`${pre}_final_options_json`]: "A: a | B: b | C: c | D: d",
    [`${pre}_final_answer`]: "A",
    [`${pre}_final_explanation`]: "因為。",
  });

  const six = { ...base };
  for (const pre of SIX) Object.assign(six, q(pre));
  check(parseRow(six, hs).importStatus === "PUBLISH_READY", "Z1 六題完整 → PUBLISH_READY");
  check(parseRow(six, hs).usableQuestions === 6, "Z1 usableQuestions = 6");

  const three = { ...base };
  for (const pre of SIX.slice(0, 3)) Object.assign(three, q(pre));
  check(parseRow(three, hs).importStatus === "DRAFT", "Z2 1–5 題 → DRAFT");

  // 有文章、六個欄位也都有值，但每一題都缺正解 → 可用題數 0
  const noneUsable = { ...base };
  for (const pre of SIX) {
    Object.assign(noneUsable, q(pre));
    delete (noneUsable as Record<string, unknown>)[`${pre}_final_answer`];
  }
  const nu = parseRow(noneUsable, hs);
  check(nu.usableQuestions === 0, "Z3 六題都缺正解 → 可用題數 0");
  check(nu.importStatus === "BLOCKED",
    "🛑 Z3 有文章、六個 construct 欄位也都有值，但沒有一題可用 → BLOCKED");
  check(toCanonicalPayload(nu) === null,
    "🛑 Z4 BLOCKED 的文章產不出 payload —— 0 題的文章不進資料庫");

  check(toCanonicalPayload(parseRow(three, hs)) !== null,
    "Z5 DRAFT 仍然產得出 payload（1–5 題可入庫）");
}

// ── 詞彙的 fallback chain ───────────────────────────────────────────
{
  const hs = headersFor(SIX);
  const base: Record<string, unknown> = {
    topic_id: "V1", passage_writer_title: "標題", passage_revised_text: "內文夠長。",
    passage_writer_vocab_json: "Candidate: alpha = 甲 (P1)",
  };
  check(parseRow(base, hs).vocab[0]?.term === "alpha", "V1 沒有 final 時用 writer 的詞彙");

  const withFinal = { ...base, passage_final_vocab_json: "Candidate: beta = 乙 (P2)" };
  check(parseRow(withFinal, hs).vocab[0]?.term === "beta",
    "V2 有 final 詞彙時優先用 final");

  // 🛑 final 欄位壞掉（值 = 欄位名）時必須退回 writer，而不是把欄位名當詞彙存進去
  const broken = { ...base, passage_final_vocab_json: "passage_writer_vocab_json" };
  check(parseRow(broken, hs).vocab[0]?.term === "alpha",
    "🛑 V3 final 詞彙是未解析的欄位參照時退回 writer");
}

// ── 全欄位分類 ──────────────────────────────────────────────────────
{
  check(classifyColumn("passage_final_text", SIX).category === "CORE",
    "K1 passage_final_text 的結構分類是 CORE（名稱決定分類）");
  check(classifyColumn("sm_writer_option_a", SIX).category === "PIPELINE",
    "K2 construct 的 writer 初稿欄位歸 PIPELINE");
  check(classifyColumn("sm_final_answer", SIX).fate === "CANONICAL",
    "K3 正解欄位進 payload（只寫進 reading_question_keys）");
  check(classifyColumn("something_new_2027", SIX).category === "UNKNOWN",
    "🛑 K4 認不得的欄位標成 UNKNOWN，不會被安靜吞掉");

  const headers = ["topic_id", "passage_final_text", "passage_revised_text"];
  const brokenRows = [
    { topic_id: "A", passage_final_text: "passage_revised_text", passage_revised_text: "真的內文" },
    { topic_id: "B", passage_final_text: "passage_revised_text", passage_revised_text: "真的內文" },
  ];
  const a1 = auditColumns(headers, brokenRows, SIX);
  const finalText = a1.find((x) => x.column === "passage_final_text")!;
  check(finalText.health === "PLACEHOLDER" && finalText.placeholder === 2,
    "🛑 K5 值剛好等於另一個欄位名稱 → 判定為 PLACEHOLDER");
  check(brokenColumns(a1).some((x) => x.column === "passage_final_text"),
    "K6 壞欄位清單抓到它");

  // 🛑 這一條是結構分類與健康狀態分兩層的全部意義：
  //    管線修好、final 欄位變成真的內文那一天，它必須【自動】不再被當成壞欄位。
  //    把「passage_final_text 是壞的」寫死成靜態分類，我們會繼續忽略一個
  //    已經正確的欄位，而且沒有任何東西會提醒我們。
  const healthyRows = [
    { topic_id: "A", passage_final_text: "真正的最終內文", passage_revised_text: "舊稿" },
  ];
  const a2 = auditColumns(headers, healthyRows, SIX);
  check(a2.find((x) => x.column === "passage_final_text")!.health === "OK",
    "🛑 K7 同一個欄位，值正常時就是 OK —— 壞掉是資料的事實，不是命名的事實");
  check(!brokenColumns(a2).some((x) => x.column === "passage_final_text"),
    "K8 管線修好之後它自動離開壞欄位清單");

  // 整欄空白的 PIPELINE 欄位不該出現在壞欄位清單裡（96 欄會把真正的問題淹掉）
  const a3 = auditColumns(["topic_id", "sm_writer_answer"], [{ topic_id: "A", sm_writer_answer: "" }], SIX);
  check(!brokenColumns(a3).some((x) => x.column === "sm_writer_answer"),
    "K9 整欄空白的 PIPELINE 欄位不算壞掉（管線本來就只匯出最終結果）");
}

console.log("");
if (failures > 0) { console.error(`${failures} 項未通過`); process.exit(1); }
console.log("全部通過");
