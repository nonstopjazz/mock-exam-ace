import {
  CEFR_LEVELS, CONSTRUCTS, CONSTRUCT_ORDER, PREFIX_TO_CONSTRUCT, VOCAB_TIERS,
  type CefrLevel, type Construct, type ContentSource, type VocabTier,
} from "./constructs";

/**
 * 把題庫管線匯出的一列（183 欄）解析成可以入庫的形狀。
 *
 * 這個模組【不碰檔案、不碰資料庫】，輸入是 Record<string, unknown>，
 * 所以可以直接測。xlsx 的讀取在 scripts/ 那一層。
 *
 * 🛑 來源資料有幾個地方名不副實，解析時要當成事實而不是意外：
 *
 *   · `*_final_options_json` 【不是 JSON】，是 "A: … | B: … | C: … | D: …"
 *   · `*_micro_skill_profile_json` 也不是，是 "skill: 90 | skill: 85 | skill: "
 *   · `passage_final_text` / `passage_final_title` 在 2026-09 那批 21 篇裡
 *     【整批壞掉】——值是字串 "passage_revised_text"，也就是欄位名稱本身
 *
 *   最後一項是 detectPlaceholder() 存在的理由：一個值如果剛好等於
 *   來源檔的某個欄位名稱，它幾乎不可能是真正的內容，而是管線沒有
 *   把參照解開。把它當內容存進去，學生會讀到「passage_revised_text」。
 */

export interface ParsedOption { label: "A" | "B" | "C" | "D"; text: string }
export interface ParsedSkill { skillCode: string; emphasis: number | null }

export interface ParsedQuestion {
  construct: Construct;
  displayOrder: number;
  question: string | null;
  options: ParsedOption[];
  correctAnswer: string | null;
  explanation: string | null;
  skills: ParsedSkill[];
  /** 這一題為什麼不能用。空陣列 = 可以用 */
  problems: string[];
}

export interface ParsedParagraph { paragraphNo: number; description: string }
export interface ParsedVocab {
  tier: VocabTier; term: string; definition: string | null; paragraphNo: number | null;
}

export interface ParsedPassage {
  passageId: string;
  title: string | null;
  passageText: string | null;
  contentSource: ContentSource | null;
  cefrLevel: CefrLevel | null;
  contentFamily: string | null;
  subdomain: string | null;
  narrativeArchetype: string | null;
  geography: string | null;
  timePeriod: string | null;
  fameLevel: string | null;
  fameRank: number | null;
  qualityScore: number | null;
  readabilityScore: number | null;
  sixwayScore: number | null;
  topicQualityScore: number | null;
  factualRisk: string | null;
  sourcePackageId: string | null;
  sourceBatchId: string | null;
  paragraphs: ParsedParagraph[];
  vocab: ParsedVocab[];
  questions: ParsedQuestion[];
  /** 整篇層級的問題 */
  problems: string[];
  /** 六個 construct 都完整 = 可以上架 */
  publishReady: boolean;
  /**
   * 這一篇會被怎麼處理。三態是【產品規則】，不是解析細節：
   *
   *   BLOCKED       沒有有效內文／標題，或一題都沒有 → 不進資料庫
   *   DRAFT         1–5 題 → 進資料庫，但學生看不到
   *   PUBLISH_READY 六題完整 → 可以上架
   *
   * 🛑 「一題都沒有」指的是【可用的題目】數，不是來源欄位有沒有值。
   *    一篇六個 construct 欄位都有、但每一題都缺正解的文章，
   *    usableQuestions 是 0，那就是 BLOCKED。
   */
  importStatus: ImportStatus;
  /** problems 為空的題目數，也就是真的會被寫進資料庫的題數 */
  usableQuestions: number;
}

export type ImportStatus = "BLOCKED" | "DRAFT" | "PUBLISH_READY";

const str = (v: unknown): string | null => {
  if (v === null || v === undefined) return null;
  const s = String(v).trim();
  return s.length > 0 ? s : null;
};

const num = (v: unknown, lo: number, hi: number): number | null => {
  const s = str(v);
  if (s === null) return null;
  const n = Number(s);
  return Number.isFinite(n) && n >= lo && n <= hi ? Math.round(n) : null;
};

/**
 * schema 會用到的非 construct 欄位，以及少了它會怎樣。
 *
 * 🛑 少一欄不會讓解析失敗——`str(undefined)` 回 null，那一欄就是空的。
 *    那個行為是對的（不同批次帶的欄位不一樣），但它【很安靜】。
 *    2026-09-26 的 296 篇檔案只有 36 欄，是 183 欄那份的子集，
 *    少掉的 12 個欄位全部靜默變成 null——包含整個段落地圖與詞彙。
 *
 *    所以報告必須分得出「檔案沒有這一欄」與「有這一欄但值是空的」。
 *    前者是格式差異，要知道；後者是資料缺漏，要修。
 */
export const EXPECTED_COLUMNS: { column: string; effect: string }[] = [
  { column: "topic_id",                     effect: "🛑 沒有就完全無法匯入" },
  { column: "difficulty_target",            effect: "cefr_level 為空" },
  { column: "content_family",               effect: "content_family 為空" },
  { column: "subdomain",                    effect: "subdomain 為空" },
  { column: "narrative_archetype",          effect: "narrative_archetype 為空" },
  { column: "geography",                    effect: "geography 為空" },
  { column: "time_period",                  effect: "time_period 為空" },
  { column: "fame_level",                   effect: "fame_level / fame_rank 為空" },
  { column: "passage_quality_score",        effect: "quality_score 為空" },
  { column: "passage_readability_score",    effect: "readability_score 為空" },
  { column: "passage_sixway_score",         effect: "sixway_score 為空" },
  { column: "topic_quality_score",          effect: "topic_quality_score 為空" },
  { column: "passage_factual_risk",         effect: "factual_risk 為空" },
  { column: "package_id",                   effect: "source_package_id 為空" },
  { column: "batch_id",                     effect: "source_batch_id 為空" },
  { column: "passage_writer_paragraph_map", effect: "⚠️ reading_passage_paragraphs 整批沒有資料" },
  { column: "passage_writer_vocab_json",    effect: "⚠️ reading_passage_vocab 整批沒有資料" },
];

/** 內文與標題的來源欄位。至少要有一組，否則整篇匯不進來。 */
export const CONTENT_COLUMNS = [
  "passage_final_title", "passage_final_text",
  "passage_writer_title", "passage_revised_text", "passage_writer_text",
  "topic_title",
];

/** 這份檔案缺了哪些 schema 會用到的欄位 */
export function missingColumns(headers: string[]): { column: string; effect: string }[] {
  const have = new Set(headers);
  return EXPECTED_COLUMNS.filter((c) => !have.has(c.column));
}

/** 這份檔案有、但我們完全不看的欄位。數量異常時代表格式可能換了。 */
export function unusedColumns(headers: string[]): string[] {
  const known = new Set<string>([
    ...EXPECTED_COLUMNS.map((c) => c.column),
    ...CONTENT_COLUMNS,
  ]);
  const constructSuffixes = [
    "_final_question", "_final_options_json", "_final_answer",
    "_final_explanation", "_micro_skill_profile_json",
  ];
  return headers.filter((h) => {
    if (known.has(h)) return false;
    return !constructSuffixes.some((suf) => h.endsWith(suf));
  });
}

/**
 * 從實際欄位名推導出有哪些 construct 前綴。
 *
 * 🛑 【不可以】回傳硬編碼的六個。這支的全部意義就是「相信資料，不相信記憶」。
 *    回傳的是「檔案裡真的有 `<prefix>_final_question` 的那些前綴」，
 *    並對照 PREFIX_TO_CONSTRUCT。認不得的前綴會被列出來，不會被吞掉。
 */
export function detectConstructs(headers: string[]): {
  found: { prefix: string; construct: Construct }[];
  unknownPrefixes: string[];
  missingConstructs: Construct[];
} {
  const prefixes = headers
    .filter((h) => h.endsWith("_final_question"))
    .map((h) => h.slice(0, -"_final_question".length).toLowerCase());

  const found: { prefix: string; construct: Construct }[] = [];
  const unknownPrefixes: string[] = [];
  for (const p of prefixes) {
    const c = PREFIX_TO_CONSTRUCT[p];
    if (c) found.push({ prefix: p, construct: c });
    else unknownPrefixes.push(p);
  }
  const have = new Set(found.map((f) => f.construct));
  return {
    found,
    unknownPrefixes,
    missingConstructs: CONSTRUCTS.filter((c) => !have.has(c)),
  };
}

/**
 * 這個值是不是「未解析的欄位參照」。
 *
 * 管線把欄位【名稱】寫進了欄位【值】。判斷方式就是最直接的那個：
 * 去掉空白之後剛好等於來源檔的某個欄位名稱。
 */
export function isPlaceholder(value: unknown, headers: Set<string>): boolean {
  const s = str(value);
  return s !== null && headers.has(s);
}

/** "A: foo | B: bar | C: baz | D: qux" → 四個選項。空文字的選項會被丟掉。 */
export function parseOptions(raw: unknown): ParsedOption[] {
  const s = str(raw);
  if (s === null) return [];
  const out: ParsedOption[] = [];
  for (const part of s.split(/\s*\|\s*/)) {
    const m = /^\s*([A-D])\s*[:：]\s*([\s\S]+)$/.exec(part);
    if (!m) continue;
    const text = m[2].trim();
    if (text.length === 0) continue;
    out.push({ label: m[1] as ParsedOption["label"], text });
  }
  return out;
}

/**
 * "topic_identification: 90 | scope_control: 80 | rhetorical_function: "
 *
 * 🛑 空的分數解析成 null，【不是 0】。來源真的有空值
 *    （cd.rhetorical_function 21/21 全空），而 0 的意思是「完全不強調」，
 *    跟「沒有這個資訊」是兩回事。
 */
export function parseSkills(raw: unknown): ParsedSkill[] {
  const s = str(raw);
  if (s === null) return [];
  const out: ParsedSkill[] = [];
  for (const part of s.split(/\s*\|\s*/)) {
    // 🛑 代號要接受數字。原本寫成 [A-Za-z_]+，於是 `skill_2` 這種代號
    //    會【靜默被丟掉】——目前那 18 個代號剛好都沒有數字，所以看不出來，
    //    但下一批只要出現一個就會無聲少一筆。
    const m = /^\s*([A-Za-z0-9_]+)\s*[:：]\s*(.*)$/.exec(part);
    if (!m) continue;
    out.push({ skillCode: m[1], emphasis: num(m[2], 0, 100) });
  }
  return out;
}

/**
 * 這個 micro-skill 儲存格有內容，卻一個 skill 都解析不出來嗎？
 *
 * 🛑 這是格式漂移的偵測器。解析不出來時 parseSkills 回空陣列，
 *    跟「本來就沒有 skill」長得一模一樣——兩者在報告裡必須分得開，
 *    否則換了分隔符號的那一天，整批 micro-skill 會安靜地消失。
 */
export function skillsUnparseable(raw: unknown): boolean {
  const s = str(raw);
  return s !== null && parseSkills(raw).length === 0;
}


/** "P1: 開場 | P2: 發展 | P3: 轉折" → 段落地圖 */
export function parseParagraphMap(raw: unknown): ParsedParagraph[] {
  const s = str(raw);
  if (s === null) return [];
  const out: ParsedParagraph[] = [];
  for (const part of s.split(/\s*\|\s*/)) {
    const m = /^\s*P\s*(\d{1,2})\s*[:：]\s*([\s\S]+)$/i.exec(part);
    if (!m) continue;
    const no = Number(m[1]);
    const desc = m[2].trim();
    if (no < 1 || no > 20 || desc.length === 0) continue;
    out.push({ paragraphNo: no, description: desc });
  }
  return out;
}

/**
 * "Candidate: a = def (P1); b = def (P2) || Academic: x; y || Knowledge: p; q"
 *
 * 三層用 `||` 分，層內用 `;` 分。只有 Candidate 有定義與段落錨點。
 */
export function parseVocab(raw: unknown): ParsedVocab[] {
  const s = str(raw);
  if (s === null) return [];
  const out: ParsedVocab[] = [];
  const seen = new Set<string>();
  for (const chunk of s.split(/\s*\|\|\s*/)) {
    const m = /^\s*(Candidate|Academic|Knowledge)\s*[:：]\s*([\s\S]*)$/i.exec(chunk);
    if (!m) continue;
    const tier = m[1].toUpperCase() as VocabTier;
    if (!VOCAB_TIERS.includes(tier)) continue;
    for (const item of m[2].split(/\s*;\s*/)) {
      const t = item.trim();
      if (t.length === 0) continue;
      // Candidate: "settled = firmly decided or established (P1)"
      const cm = /^([^=]+?)\s*=\s*([\s\S]+?)(?:\s*\(P(\d{1,2})\))?$/.exec(t);
      const term = (cm ? cm[1] : t).trim();
      if (term.length === 0) continue;
      const key = `${tier}::${term.toLowerCase()}`;
      if (seen.has(key)) continue;      // 同層同詞只留一次（資料庫有 UNIQUE）
      seen.add(key);
      out.push({
        tier,
        term,
        definition: cm ? cm[2].trim() : null,
        paragraphNo: cm && cm[3] ? Number(cm[3]) : null,
      });
    }
  }
  return out;
}

/**
 * 詞彙的來源欄位，與內文用同一套 fallback 精神：final → writer。
 *
 * 🛑 一樣要擋 placeholder。`passage_final_vocab_json` 跟
 *    `passage_final_text` 出自同一支管線，壞法可以預期是一樣的。
 */
export const VOCAB_COLUMNS = ["passage_final_vocab_json", "passage_writer_vocab_json"];

export function pickVocab(
  row: Record<string, unknown>,
  headers: Set<string>,
): { source: string | null; vocab: ParsedVocab[] } {
  for (const key of VOCAB_COLUMNS) {
    const raw = str(row[key]);
    if (raw === null || isPlaceholder(raw, headers)) continue;
    const vocab = parseVocab(raw);
    if (vocab.length > 0) return { source: key, vocab };
  }
  return { source: null, vocab: [] };
}

/** 「3 = Hidden Gem」→ 3 */
export function parseFameRank(raw: unknown): number | null {
  const s = str(raw);
  if (s === null) return null;
  const m = /^\s*([1-5])\s*=/.exec(s);
  return m ? Number(m[1]) : null;
}

/**
 * 內文來源的挑選順序：final → revised → writer，取第一個「有效」的。
 *
 * 🛑 有效的定義不只是「非空」，還要「不是未解析的欄位參照」。
 *    2026-09 那批的 final 欄位非空，但內容是欄位名稱本身。
 *
 * 🛑 刻意【不】永久寫死只讀 writer。管線修好之後 final 就會是對的，
 *    而這個函式屆時會自動改用它，不需要改程式。
 */
export function pickContent(
  row: Record<string, unknown>,
  headers: Set<string>,
): { source: ContentSource | null; title: string | null; text: string | null } {
  const candidates: { source: ContentSource; titleKey: string; textKey: string }[] = [
    { source: "FINAL",   titleKey: "passage_final_title",  textKey: "passage_final_text" },
    { source: "REVISED", titleKey: "passage_writer_title", textKey: "passage_revised_text" },
    { source: "WRITER",  titleKey: "passage_writer_title", textKey: "passage_writer_text" },
  ];

  for (const c of candidates) {
    const text = str(row[c.textKey]);
    if (text === null || isPlaceholder(text, headers)) continue;

    // 標題可以退回別的來源——標題壞掉不該讓整篇退一級。
    let title = str(row[c.titleKey]);
    if (title !== null && isPlaceholder(title, headers)) title = null;
    if (title === null) {
      for (const k of ["passage_final_title", "passage_writer_title", "topic_title"]) {
        const t = str(row[k]);
        if (t !== null && !isPlaceholder(t, headers)) { title = t; break; }
      }
    }
    return { source: c.source, title, text };
  }
  return { source: null, title: null, text: null };
}

export function parseRow(
  row: Record<string, unknown>,
  headers: string[],
): ParsedPassage {
  const headerSet = new Set(headers);
  const problems: string[] = [];

  const passageId = str(row["topic_id"]);
  const content = pickContent(row, headerSet);
  if (content.text === null) problems.push("三個來源欄位都沒有有效內文（final/revised/writer）");
  if (content.title === null) problems.push("找不到有效標題");

  const cefrRaw = str(row["difficulty_target"]);
  const cefr = cefrRaw && (CEFR_LEVELS as readonly string[]).includes(cefrRaw.toUpperCase())
    ? (cefrRaw.toUpperCase() as CefrLevel)
    : null;
  if (cefrRaw !== null && cefr === null) problems.push(`CEFR 不合法：${cefrRaw}`);

  const detected = detectConstructs(headers);
  const questions: ParsedQuestion[] = [];

  for (const { prefix, construct } of detected.found) {
    const qProblems: string[] = [];
    const question = str(row[`${prefix}_final_question`]);
    const options = parseOptions(row[`${prefix}_final_options_json`]);
    const answer = str(row[`${prefix}_final_answer`])?.toUpperCase() ?? null;
    const explanation = str(row[`${prefix}_final_explanation`]);
    const skills = parseSkills(row[`${prefix}_micro_skill_profile_json`]);

    if (question === null) qProblems.push("缺題幹");
    if (options.length !== 4) qProblems.push(`選項只有 ${options.length} 個`);
    if (answer === null) qProblems.push("缺正解");
    else if (!["A", "B", "C", "D"].includes(answer)) qProblems.push(`正解不合法：${answer}`);
    else if (!options.some((o) => o.label === answer)) qProblems.push(`正解 ${answer} 沒有對應的選項`);
    if (explanation === null) qProblems.push("缺解說");

    questions.push({
      construct,
      displayOrder: CONSTRUCT_ORDER[construct],
      question, options, correctAnswer: answer, explanation, skills,
      problems: qProblems,
    });
  }

  const usable = questions.filter((q) => q.problems.length === 0);
  const importable = content.text !== null && content.title !== null;
  const publishReady = importable && usable.length === CONSTRUCTS.length;

  // 🛑 三態在這裡算一次，之後所有地方（dry-run、preview、canonical payload）
  //    都讀這一個值。算兩次就會有兩套規則，而它們遲早會不一致。
  const importStatus: ImportStatus =
    !importable || usable.length === 0 ? "BLOCKED"
    : publishReady ? "PUBLISH_READY"
    : "DRAFT";
  if (importable && usable.length === 0) {
    problems.push("一題都沒有可用的題目——不匯入");
  }

  return {
    passageId: passageId ?? "",
    title: content.title,
    passageText: content.text,
    contentSource: content.source,
    cefrLevel: cefr,
    contentFamily:      str(row["content_family"]),
    subdomain:          str(row["subdomain"]),
    narrativeArchetype: str(row["narrative_archetype"]),
    geography:          str(row["geography"]),
    timePeriod:         str(row["time_period"]),
    fameLevel:          str(row["fame_level"]),
    fameRank:           parseFameRank(row["fame_level"]),
    qualityScore:       num(row["passage_quality_score"], 0, 100),
    readabilityScore:   num(row["passage_readability_score"], 0, 100),
    sixwayScore:        num(row["passage_sixway_score"], 0, 100),
    topicQualityScore:  num(row["topic_quality_score"], 0, 100),
    factualRisk:        str(row["passage_factual_risk"])?.toUpperCase() ?? null,
    sourcePackageId:    str(row["package_id"]),
    sourceBatchId:      str(row["batch_id"]),
    paragraphs: parseParagraphMap(row["passage_writer_paragraph_map"]),
    vocab:      pickVocab(row, headerSet).vocab,
    questions,
    problems,
    publishReady,
    importStatus,
    usableQuestions: usable.length,
  };
}
