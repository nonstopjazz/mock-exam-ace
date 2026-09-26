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
}

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
    const m = /^\s*([A-Za-z_]+)\s*[:：]\s*(.*)$/.exec(part);
    if (!m) continue;
    out.push({ skillCode: m[1], emphasis: num(m[2], 0, 100) });
  }
  return out;
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
  const publishReady =
    content.text !== null &&
    content.title !== null &&
    usable.length === CONSTRUCTS.length;

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
    vocab:      parseVocab(row["passage_writer_vocab_json"]),
    questions,
    problems,
    publishReady,
  };
}
