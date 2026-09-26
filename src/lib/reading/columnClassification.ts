/**
 * 原始題庫匯出檔的【全欄位盤點】。
 *
 * 這支存在的理由：183 欄裡真正該進資料庫的只有一小部分，而「哪些不該進」
 * 不是憑印象決定的。分類寫成程式碼，下一批檔案可以直接重跑，
 * 認不得的欄位會被列出來，不會被安靜忽略。
 *
 * 分成兩層，刻意分開：
 *
 *   · 結構分類 classifyColumn()  ——只看欄位【名稱】，是靜態事實
 *   · 健康狀態 auditColumns()    ——看欄位【值】，只有拿到資料才知道
 *
 * 🛑 第六類（壞掉／placeholder）【必須】是第二層。
 *    `passage_final_text` 從名字看是最終內文，是 CORE；它壞掉是資料的事實，
 *    不是命名的事實。把它靜態寫死成「壞欄位」，等管線修好那天我們會
 *    繼續忽略一個已經正確的欄位，而且沒有人會發現。
 */

export type ColumnCategory =
  | "CORE"        // 1. 內文與六題本體
  | "ENRICHMENT"  // 2. 段落地圖、詞彙、段落錨點
  | "METADATA"    // 3. 分類與品質分數
  | "PROVENANCE"  // 4. 來源追溯
  | "PIPELINE"    // 5. 產製過程的中間產物
  | "UNKNOWN";    // 認不得——報告裡一定要出現

export type ColumnFate =
  | "CANONICAL"   // 進 canonical payload
  | "DERIVED"     // 不直接存，但會被解析成別的東西
  | "IGNORED"     // 安全忽略
  | "DEFERRED";   // 有價值，但目前 schema 沒有承接的地方

export interface ColumnRule {
  category: ColumnCategory;
  fate: ColumnFate;
  /** 為什麼。IGNORED / DEFERRED 一定要寫。 */
  note: string;
}

/** construct 前綴（sm_ / mi_ …）後面的後綴 → 規則 */
const CONSTRUCT_SUFFIX_RULES: Record<string, ColumnRule> = {
  final_question:           { category: "CORE", fate: "CANONICAL", note: "題幹" },
  final_options_json:       { category: "CORE", fate: "CANONICAL", note: "選項（名為 json，實為 A: … | B: …）" },
  final_answer:             { category: "CORE", fate: "CANONICAL", note: "正解，只進 reading_question_keys" },
  final_explanation:        { category: "CORE", fate: "CANONICAL", note: "解說，只進 reading_question_keys" },
  micro_skill_profile_json: { category: "ENRICHMENT", fate: "CANONICAL", note: "micro-skill，v1 只儲存不分析" },

  writer_question:      { category: "PIPELINE", fate: "IGNORED", note: "writer 初稿，已被 final 取代" },
  writer_option_a:      { category: "PIPELINE", fate: "IGNORED", note: "writer 初稿選項" },
  writer_option_b:      { category: "PIPELINE", fate: "IGNORED", note: "writer 初稿選項" },
  writer_option_c:      { category: "PIPELINE", fate: "IGNORED", note: "writer 初稿選項" },
  writer_option_d:      { category: "PIPELINE", fate: "IGNORED", note: "writer 初稿選項" },
  writer_answer:        { category: "PIPELINE", fate: "IGNORED", note: "writer 初稿正解" },
  writer_explanation:   { category: "PIPELINE", fate: "IGNORED", note: "writer 初稿解說" },
  writer_metadata_json: { category: "PIPELINE", fate: "IGNORED", note: "writer 自述的出題依據" },

  reviewer_answer:           { category: "PIPELINE", fate: "IGNORED", note: "reviewer 獨立作答（用來驗正解）" },
  reviewer_confidence:       { category: "PIPELINE", fate: "IGNORED", note: "reviewer 信心值" },
  reviewer_diagnostics_json: { category: "PIPELINE", fate: "IGNORED", note: "reviewer 診斷" },
  review_verdict:            { category: "PIPELINE", fate: "IGNORED", note: "單題審查結論" },
  review_comments:           { category: "PIPELINE", fate: "IGNORED", note: "單題審查意見" },
  revision_instruction:      { category: "PIPELINE", fate: "IGNORED", note: "修訂指示" },
  judge_verdict:             { category: "PIPELINE", fate: "IGNORED", note: "終審結論" },
  repair_item_json:          { category: "PIPELINE", fate: "IGNORED", note: "修補項目" },
};

const PASSAGE_RULES: Record<string, ColumnRule> = {
  // ---- 1. Core content ----
  topic_id:             { category: "PROVENANCE", fate: "CANONICAL", note: "passage_id，唯一鍵" },
  passage_final_title:  { category: "CORE", fate: "CANONICAL", note: "標題 fallback 第 1 順位" },
  passage_final_text:   { category: "CORE", fate: "CANONICAL", note: "內文 fallback 第 1 順位" },
  passage_revised_text: { category: "CORE", fate: "CANONICAL", note: "內文 fallback 第 2 順位" },
  passage_writer_title: { category: "CORE", fate: "CANONICAL", note: "標題 fallback 第 2 順位" },
  passage_writer_text:  { category: "CORE", fate: "CANONICAL", note: "內文 fallback 第 3 順位" },
  topic_title:          { category: "CORE", fate: "CANONICAL", note: "標題最後一道 fallback" },

  // ---- 2. High-value enrichment ----
  passage_writer_paragraph_map: { category: "ENRICHMENT", fate: "CANONICAL", note: "段落地圖 → reading_passage_paragraphs" },
  passage_writer_vocab_json:    { category: "ENRICHMENT", fate: "CANONICAL", note: "三層詞彙＋(P1) 段落錨點 → reading_passage_vocab" },
  passage_final_vocab_json:     { category: "ENRICHMENT", fate: "CANONICAL", note: "詞彙 fallback 第 1 順位" },
  /**
   * 🛑 這是整篇的主旨，等同 MI 那題的答案。
   *    結論：存，但【只能存進 reading_question_keys 那側的權限範圍】，
   *    絕不可以放進學生作答前拿得到的 payload。
   *    v1 先 DEFERRED——schema 目前沒有一個「只有老師看得到」的欄位，
   *    與其擠進 passages（學生讀得到）不如先不收。
   */
  passage_writer_main_idea: { category: "ENRICHMENT", fate: "DEFERRED", note: "⚠️ 等同 MI 題答案；schema 尚無教師專屬欄位，v1 不收" },

  // ---- 3. Useful metadata ----
  difficulty_target:         { category: "METADATA", fate: "CANONICAL", note: "CEFR" },
  content_family:            { category: "METADATA", fate: "CANONICAL", note: "主題大類" },
  subdomain:                 { category: "METADATA", fate: "CANONICAL", note: "主題子類" },
  narrative_archetype:       { category: "METADATA", fate: "CANONICAL", note: "敘事原型" },
  geography:                 { category: "METADATA", fate: "CANONICAL", note: "地理" },
  time_period:               { category: "METADATA", fate: "CANONICAL", note: "時代" },
  fame_level:                { category: "METADATA", fate: "CANONICAL", note: "知名度，另解析出 fame_rank" },
  passage_quality_score:     { category: "METADATA", fate: "CANONICAL", note: "品質分數" },
  passage_readability_score: { category: "METADATA", fate: "CANONICAL", note: "可讀性分數" },
  passage_sixway_score:      { category: "METADATA", fate: "CANONICAL", note: "六向適配分數" },
  topic_quality_score:       { category: "METADATA", fate: "CANONICAL", note: "選題分數" },
  passage_factual_risk:      { category: "METADATA", fate: "CANONICAL", note: "事實風險" },

  // 有價值但 schema 還沒有位置
  specific_anchor:      { category: "METADATA", fate: "DEFERRED", note: "一句話的主題錨點，適合做列表副標" },
  knowledge_payoff:     { category: "METADATA", fate: "DEFERRED", note: "「讀完會懂什麼」，適合做課前導引" },
  intellectual_hook:    { category: "METADATA", fate: "DEFERRED", note: "切入點，適合做卡片標語" },
  source_verifiability: { category: "METADATA", fate: "DEFERRED", note: "來源可查證度，與 factual_risk 互補" },
  duplicate_risk:       { category: "METADATA", fate: "DEFERRED", note: "重複風險，選篇時有用" },

  // ---- 4. Provenance ----
  package_id: { category: "PROVENANCE", fate: "CANONICAL", note: "來源套件" },
  batch_id:   { category: "PROVENANCE", fate: "CANONICAL", note: "來源批次" },
  created_at: { category: "PROVENANCE", fate: "IGNORED", note: "管線時間戳，不等於我們的入庫時間" },
  updated_at: { category: "PROVENANCE", fate: "IGNORED", note: "同上" },

  // ---- 5. Pipeline-only ----
  central_story:               { category: "PIPELINE", fate: "IGNORED", note: "給 writer 的選題 brief，內文已包含" },
  tension_or_complication:     { category: "PIPELINE", fate: "IGNORED", note: "選題 brief" },
  broader_significance:        { category: "PIPELINE", fate: "IGNORED", note: "選題 brief" },
  recommended_angle:           { category: "PIPELINE", fate: "IGNORED", note: "給 writer 的寫作指示" },
  narrative_arc:               { category: "PIPELINE", fate: "IGNORED", note: "給 writer 的結構指示" },
  key_facts:                   { category: "PIPELINE", fate: "IGNORED", note: "選題 brief 的事實清單" },
  potential_clarifying_device: { category: "PIPELINE", fate: "IGNORED", note: "寫作手法建議" },
  inference_opportunity:       { category: "PIPELINE", fate: "IGNORED", note: "出題建議，等同 CO 題的提示" },
  topic_status:                { category: "PIPELINE", fate: "IGNORED", note: "選題流程狀態" },
  topic_notes:                 { category: "PIPELINE", fate: "IGNORED", note: "選題備註" },
  target_word_count:           { category: "PIPELINE", fate: "IGNORED", note: "寫作目標字數，非實際字數" },
  language_variant:            { category: "PIPELINE", fate: "IGNORED", note: "寫作設定" },
  review_strictness:           { category: "PIPELINE", fate: "IGNORED", note: "審查設定" },
  special_instruction:         { category: "PIPELINE", fate: "IGNORED", note: "特殊指示" },
  source_citation_requirement: { category: "PIPELINE", fate: "IGNORED", note: "引用規則設定" },
  passage_review_verdict:      { category: "PIPELINE", fate: "IGNORED", note: "審查結論，分數已另外收" },
  passage_review_comments:     { category: "PIPELINE", fate: "IGNORED", note: "審查意見全文" },
  passage_revision_instruction:{ category: "PIPELINE", fate: "IGNORED", note: "修訂指示" },
  passage_judge_verdict:       { category: "PIPELINE", fate: "IGNORED", note: "終審結論" },
  passage_status:              { category: "PIPELINE", fate: "IGNORED", note: "管線狀態，不等於我們的上架狀態" },
  workflow_status:             { category: "PIPELINE", fate: "IGNORED", note: "workflow 狀態" },
  current_stage:               { category: "PIPELINE", fate: "IGNORED", note: "workflow 階段" },
  retry_count:                 { category: "PIPELINE", fate: "IGNORED", note: "重試次數" },
  error_message:               { category: "PIPELINE", fate: "IGNORED", note: "管線錯誤訊息" },
  pabbly_trigger:              { category: "PIPELINE", fate: "IGNORED", note: "自動化觸發器欄位" },
};

export function classifyColumn(
  name: string,
  constructPrefixes: string[],
): ColumnRule {
  const direct = PASSAGE_RULES[name];
  if (direct) return direct;

  for (const p of constructPrefixes) {
    if (name.startsWith(`${p}_`)) {
      const rule = CONSTRUCT_SUFFIX_RULES[name.slice(p.length + 1)];
      if (rule) return { ...rule, note: `${p.toUpperCase()}：${rule.note}` };
      return { category: "UNKNOWN", fate: "IGNORED", note: `${p} 有這個後綴，但分類表不認得` };
    }
  }
  return { category: "UNKNOWN", fate: "IGNORED", note: "分類表不認得這個欄位" };
}

// ---------------------------------------------------------------------------
// 第二層：健康狀態。只有拿到真實資料才算得出來。
// ---------------------------------------------------------------------------

export type ColumnHealth = "OK" | "EMPTY" | "PLACEHOLDER" | "PARTIAL";

export interface ColumnAudit extends ColumnRule {
  column: string;
  nonEmpty: number;
  total: number;
  /** 值剛好等於某個欄位名稱的列數——管線沒把參照解開 */
  placeholder: number;
  health: ColumnHealth;
  sample: string | null;
}

/**
 * 🛑 PLACEHOLDER 的判準：值去掉空白之後剛好等於來源檔的某個欄位名稱。
 *    一個真正的段落不會剛好等於 "passage_revised_text"。
 *    這是唯一能自動抓到「看起來是 final、其實只是欄位名」的辦法。
 */
export function auditColumns(
  headers: string[],
  rows: Record<string, unknown>[],
  constructPrefixes: string[],
): ColumnAudit[] {
  const headerSet = new Set(headers);
  return headers.map((column) => {
    const rule = classifyColumn(column, constructPrefixes);
    let nonEmpty = 0;
    let placeholder = 0;
    let sample: string | null = null;
    for (const row of rows) {
      const v = String(row[column] ?? "").trim();
      if (v === "") continue;
      nonEmpty++;
      if (headerSet.has(v)) placeholder++;
      else if (sample === null) sample = v.slice(0, 60).replace(/\s+/g, " ");
    }
    let health: ColumnHealth;
    if (nonEmpty === 0) health = "EMPTY";
    else if (placeholder === nonEmpty) health = "PLACEHOLDER";
    else if (placeholder > 0) health = "PARTIAL";
    else health = "OK";
    return { column, ...rule, nonEmpty, total: rows.length, placeholder, health, sample };
  });
}

/**
 * 壞掉的欄位。
 *
 * 只回報【本來應該有內容】的欄位——CANONICAL 與 DEFERRED。
 * PIPELINE 欄位整欄空白是正常的（管線只匯出最終結果），
 * 把那 96 欄一起列出來只會把真正的問題淹掉。
 */
export function brokenColumns(audits: ColumnAudit[]): ColumnAudit[] {
  return audits.filter(
    (a) =>
      (a.fate === "CANONICAL" || a.fate === "DEFERRED") &&
      (a.health === "PLACEHOLDER" || a.health === "PARTIAL" || a.health === "EMPTY"),
  );
}
