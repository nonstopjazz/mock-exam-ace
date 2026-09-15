/**
 * 口說批改的模型呼叫（Gemini，音訊直接輸入）
 *
 * 為什麼是 Gemini 而不是專案既有的 DeepSeek：
 *   DeepSeek 只吃文字。口說的四項裡有一項是【發音與語調】（S4），
 *   先轉成逐字稿再評分等於把那一項整個丟掉——而它是四分之一的評分。
 *   Gemini 聽得到音訊本身，所以四項才都有根據。
 *
 * 🛑 GEMINI_API_KEY 只在這個模組讀，而且只在伺服器端。它不會進到任何
 *    回傳值、錯誤訊息或 telemetry 裡。
 */

/** 主要模型。過載時退到下一個。 */
const MODELS = ["gemini-2.5-flash", "gemini-2.5-flash", "gemini-2.0-flash"] as const;

/**
 * inline 音訊的大小上限。
 *
 * bucket 收到 20 MB，但 base64 會膨脹約 4/3，request 還有 prompt——
 * 15 MB 以上就不要送了，送出去也是浪費一次往返。三分鐘的壓縮音訊
 * 遠小於此（約 1–3 MB），會撞到這條的是異常的檔案。
 */
export const MAX_AUDIO_BYTES = 15 * 1024 * 1024;

export interface SpeakingGradeResult {
  transcript: string;
  fluency: number;
  lexical: number;
  grammar: number;
  pronunciation: number;
  overall: number;
  feedback: string;
  suggestions: string;
  model: string;
  telemetry: {
    prompt_tokens: number | null;
    completion_tokens: number | null;
    total_tokens: number | null;
    attempts: number;
    duration_ms: number;
    audio_bytes: number;
    /** 模型給的分數不是 0.5 的倍數，被四捨五入過的欄位。 */
    quantized: string[];
  };
}

/** 呼叫端要知道「這個錯誤重試有沒有意義」。 */
export class SpeakingGradeError extends Error {
  constructor(
    message: string,
    readonly retryable: boolean,
  ) {
    super(message);
    this.name = "SpeakingGradeError";
  }
}

/**
 * 評分規則。
 *
 * 前四條不是客套話，是 LEARNING_DOMAIN_MODEL.md §9.15 已經凍結的裁決，
 * 每一條都對應一個「聽起來合理但會量錯東西」的代理指標。沒有這四條，
 * 模型會獎勵講得快的、用難字的、口音接近母語者的——那與這個評分表要測的
 * 東西相反。
 */
const PROMPT = `You are an experienced IELTS Speaking examiner. Listen to the candidate's recording and assess it against the official IELTS Speaking band descriptors (0–9, in 0.5 steps) across the four criteria: Fluency & Coherence, Lexical Resource, Grammatical Range & Accuracy, and Pronunciation.

Four rulings you must follow — each one overrides the intuition it names:

1. ACCENT IS NOT A TARGET. Pronunciation is judged on intelligibility and phonological control — segmental accuracy, stress, rhythm, intonation, connected speech. A Taiwanese, American or British accent must never attract a bonus or a penalty for being that accent.
2. FLUENCY IS NOT SPEED. Faster is not better. Fluency is continuity, appropriate pace, pausing and hesitation control, and coherent organisation. Fast but hard to follow must not score higher than measured and clear.
3. RANGE IS NOT DIFFICULTY. Lexical Resource does not reward harder words. It asks whether the candidate has enough vocabulary to complete the task. Accurate, natural, sufficient simple vocabulary beats unnatural or misused advanced vocabulary.
4. INTERACTION APPLIES CONDITIONALLY. A solo monologue must not be penalised for containing no turn-taking.

Return ONLY a JSON object with exactly these keys:
{
  "transcript": string,            // a faithful transcript of what the candidate said
  "fluency_score": number,         // Fluency & Coherence, 0-9 in 0.5 steps
  "lexical_score": number,         // Lexical Resource
  "grammar_score": number,         // Grammatical Range & Accuracy
  "pronunciation_score": number,   // Pronunciation
  "overall_band": number,          // overall band, rounded to the nearest 0.5
  "feedback": string,              // specific, constructive feedback citing concrete moments from the audio
  "suggestions": string            // concrete, actionable next steps
}

For BOTH "feedback" and "suggestions", write the English version first, then a blank line, then a Traditional Chinese (繁體中文) translation, using this exact layout:

[English]
<English text>

[中文]
<繁體中文翻譯>

The student is a Taiwanese senior-high-school learner, so the Chinese must read naturally to that reader and convey the same content as the English. Base every score on what you actually hear. If the recording is silent, unintelligible, or not speech, say so in the feedback and give the scores it actually earns. Do not include any text outside the JSON object.`;

function toBase64(buf: ArrayBuffer): string {
  return Buffer.from(buf).toString("base64");
}

/**
 * 夾到 0–9 並對齊 0.5。
 *
 * 模型偶爾會回 6.3 這種值。表上的 CHECK 會擋下它——但那代表一次已經付過錢的
 * 呼叫整個作廢。四捨五入到最近的半級是更務實的處理，而且被修正過的欄位
 * 會記進 telemetry，真的常常發生的話看得出來。
 */
function quantizeBand(value: unknown, field: string, quantized: string[]): number | null {
  const n = typeof value === "number" ? value : Number(value);
  if (!Number.isFinite(n)) return null;
  const clamped = Math.min(9, Math.max(0, n));
  const snapped = Math.round(clamped * 2) / 2;
  if (snapped !== n) quantized.push(field);
  return snapped;
}

export interface GradeInput {
  audio: ArrayBuffer;
  mimeType: string;
  promptPart: number | null;
  promptText: string | null;
  /** 超過這個時間就不要再重試了，把控制權還給 worker。 */
  deadlineAt: number;
}

export async function gradeSpeaking(input: GradeInput): Promise<SpeakingGradeResult> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    // 沒設 key 是設定問題，重試一百次也一樣。
    throw new SpeakingGradeError("伺服器尚未設定 GEMINI_API_KEY。", false);
  }

  const audioBytes = input.audio.byteLength;
  if (audioBytes === 0) {
    throw new SpeakingGradeError("錄音檔是空的。", false);
  }
  if (audioBytes > MAX_AUDIO_BYTES) {
    throw new SpeakingGradeError(
      `錄音檔太大（${Math.round(audioBytes / 1024 / 1024)} MB），無法送出批改。`,
      false,
    );
  }

  const startedAt = Date.now();
  const context = `Speaking Part: ${input.promptPart ?? "(unknown)"}
Prompt: ${input.promptText ?? "(no prompt provided)"}`;

  const body = JSON.stringify({
    contents: [
      {
        parts: [
          { text: `${PROMPT}\n\n${context}` },
          { inline_data: { mime_type: input.mimeType, data: toBase64(input.audio) } },
        ],
      },
    ],
    generationConfig: { responseMimeType: "application/json", temperature: 0.2 },
  });

  let text = "";
  let usedModel = "";
  let lastError = "";
  let attempts = 0;
  let usage: { promptTokenCount?: number; candidatesTokenCount?: number; totalTokenCount?: number } = {};

  for (let i = 0; i < MODELS.length; i++) {
    if (Date.now() > input.deadlineAt) {
      throw new SpeakingGradeError("批改超過時間上限，稍後會自動重試。", true);
    }
    attempts = i + 1;
    usedModel = MODELS[i];

    let res: Response;
    try {
      res = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models/${usedModel}:generateContent`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json", "x-goog-api-key": apiKey },
          body,
          signal: AbortSignal.timeout(Math.max(5_000, input.deadlineAt - Date.now())),
        },
      );
    } catch (err) {
      lastError = err instanceof Error ? err.name : "network error";
      continue;
    }

    if (res.ok) {
      const json = (await res.json()) as {
        candidates?: { content?: { parts?: { text?: string }[] } }[];
        usageMetadata?: typeof usage;
      };
      text = json.candidates?.[0]?.content?.parts?.[0]?.text ?? "";
      usage = json.usageMetadata ?? {};
      break;
    }

    // 🛑 只留狀態碼，不要把回應內容帶進錯誤訊息——那是會走到資料庫、
    //    再走到老師畫面上的字串，而模型的原始回應可能夾帶 request 內容。
    lastError = `HTTP ${res.status}`;
    const transient = res.status === 429 || res.status >= 500;
    if (!transient) {
      throw new SpeakingGradeError(`批改服務拒絕了這次請求（${lastError}）。`, false);
    }
    await new Promise((r) => setTimeout(r, 800 * (i + 1)));
  }

  if (!text) {
    throw new SpeakingGradeError(`批改服務目前忙碌（${lastError}），稍後會自動重試。`, true);
  }

  let parsed: Record<string, unknown>;
  try {
    parsed = JSON.parse(text) as Record<string, unknown>;
  } catch {
    // 重試有機會拿到合法的 JSON，所以算可重試。
    throw new SpeakingGradeError("批改服務回傳的內容無法解析。", true);
  }

  const quantized: string[] = [];
  const fluency = quantizeBand(parsed.fluency_score, "fluency", quantized);
  const lexical = quantizeBand(parsed.lexical_score, "lexical", quantized);
  const grammar = quantizeBand(parsed.grammar_score, "grammar", quantized);
  const pronunciation = quantizeBand(parsed.pronunciation_score, "pronunciation", quantized);
  const overall = quantizeBand(parsed.overall_band, "overall", quantized);

  if (
    fluency === null || lexical === null || grammar === null ||
    pronunciation === null || overall === null
  ) {
    throw new SpeakingGradeError("批改服務沒有給出完整的四項分數。", true);
  }

  return {
    transcript: typeof parsed.transcript === "string" ? parsed.transcript : "",
    fluency,
    lexical,
    grammar,
    pronunciation,
    overall,
    feedback: typeof parsed.feedback === "string" ? parsed.feedback : "",
    suggestions: typeof parsed.suggestions === "string" ? parsed.suggestions : "",
    model: usedModel,
    telemetry: {
      prompt_tokens: usage.promptTokenCount ?? null,
      completion_tokens: usage.candidatesTokenCount ?? null,
      total_tokens: usage.totalTokenCount ?? null,
      attempts,
      duration_ms: Date.now() - startedAt,
      audio_bytes: audioBytes,
      quantized,
    },
  };
}
