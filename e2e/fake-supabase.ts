/**
 * E2E 用的假後端。
 *
 * 【它是什麼，不是什麼】
 *   這支替掉 @/lib/supabase，所以瀏覽器裡跑的是【真正的 React 應用程式】——
 *   真的路由、真的 state、真的 render 排程。被換掉的只有網路那一層。
 *
 *   🛑 所以這些測試驗的是【前端對契約的行為】，不是伺服器。
 *      伺服器那一半由 supabase/tests/*.sql 驗（reading_shuffle_test 等），
 *      以及 reading-staging/SHUFFLE-verify.sql 在真實資料上的驗算。
 *      兩邊都要有；這一邊擋的是「畫面把契約用錯」。
 *
 * 🛑 所以這裡的規則要跟真的伺服器【一致】，不是隨便回個看起來像的東西：
 *      • 選項依 (session_id, question_id) 重排後才貼上 A–D
 *      • 送進來的是顯示位置，伺服器換算回原始標籤才比對
 *      • 存下來的是顯示位置
 *      • 一題只能答一次，重送回傳第一次的結果，不新增第二筆
 *      • 同一篇已經有 IN_PROGRESS 就接續，不開第二個
 *    照抄形狀但規則不同的假後端，會讓測試變成「證明假後端跟自己一致」。
 *
 * 狀態放在 localStorage，所以 reload 之後還在——resume 的測試需要這個。
 */

const DB_KEY = "e2e_db";

export interface FakeSession {
  id: string;
  passage_id: string;
  status: "IN_PROGRESS" | "SUBMITTED" | "ABANDONED";
  started_at: string;
  submitted_at: string | null;
}

export interface FakeAttempt {
  session_id: string;
  question_id: string;
  /** 🛑 顯示位置，不是題庫的原始標籤 */
  selected_answer: string;
  is_correct: boolean;
  response_time_ms: number | null;
  answer_change_count: number;
  first_answer: string | null;
}

export interface FakeDb {
  signedIn: boolean;
  featureEnabled: boolean;
  /** RequireAdmin 用。預設 false——管理頁要明確說才進得去。 */
  isAdmin?: boolean;
  sessions: FakeSession[];
  attempts: FakeAttempt[];
}

const DEFAULT_DB: FakeDb = {
  signedIn: true,
  featureEnabled: true,
  sessions: [],
  attempts: [],
};

function readDb(): FakeDb {
  try {
    const raw = window.localStorage.getItem(DB_KEY);
    return raw ? { ...DEFAULT_DB, ...(JSON.parse(raw) as Partial<FakeDb>) } : { ...DEFAULT_DB };
  } catch {
    return { ...DEFAULT_DB };
  }
}

function writeDb(db: FakeDb): void {
  window.localStorage.setItem(DB_KEY, JSON.stringify(db));
}

// ── 題庫 ─────────────────────────────────────────────────────────────

const CONSTRUCTS = ["SM", "MI", "SD", "CO", "CD", "VC"] as const;
const LABELS = ["A", "B", "C", "D"] as const;

export interface FakeQuestion {
  question_id: string;
  passage_id: string;
  construct: string;
  question: string;
  /** 題庫原本的四個選項，index 0 = A */
  options: string[];
  /** 🛑 題庫的原始標籤。一律 'B'——就是真實題庫 47.2% 的那個偏斜 */
  correct: string;
  /** VC 題才有：要標出來的字，以及是第幾次出現 */
  target_text?: string;
  target_occurrence?: number;
}

export const PASSAGES = [
  { passage_id: "KR0001", title: "The Mountain That Moved Only on Paper" },
  { passage_id: "KR0002", title: "Reading the Ocean's Silent Signals" },
  { passage_id: "KR0003", title: "Seeds in the Permafrost" },
];

export const QUESTIONS: FakeQuestion[] = PASSAGES.flatMap((p) =>
  CONSTRUCTS.map((c, i) => ({
    question_id: `${p.passage_id}-q${i + 1}`,
    passage_id: p.passage_id,
    construct: c,
    question: `${p.passage_id} 第 ${i + 1} 題（${c}）`,
    // 文字互不相同，測試才分得出「哪個位置放了哪個選項」
    options: LABELS.map((l) => `${p.passage_id}-q${i + 1}-opt-${l}`),
    correct: "B",
    // VC 是第六題。文章裡 anchor 這個字【出現三次】，題目考的是第二次。
    ...(c === "VC" ? { target_text: "anchorword", target_occurrence: 2 } : {}),
  })),
);

/** 正解的【文字】。測試點的是它，不是某個固定字母 */
export const correctTextOf = (questionId: string): string => {
  const q = QUESTIONS.find((x) => x.question_id === questionId)!;
  return q.options[LABELS.indexOf(q.correct as typeof LABELS[number])];
};

// ── 排列：與伺服器同一套規則（實作不同，性質相同）───────────────────

const PERMS: string[] = (() => {
  const out: string[] = [];
  const build = (prefix: string, rest: string[]) => {
    if (rest.length === 0) { out.push(prefix); return; }
    rest.forEach((r, i) => build(prefix + r, rest.filter((_, j) => j !== i)));
  };
  build("", [...LABELS]);
  return out;
})();

function hash(s: string): number {
  let h = 0;
  for (let i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) | 0;
  return Math.abs(h);
}

/** perm[i] = 顯示在第 i 個位置的【原始】標籤 */
export function permutation(sessionId: string, questionId: string): string[] {
  return PERMS[hash(`${sessionId}:${questionId}`) % PERMS.length].split("");
}

const toCanonical = (sessionId: string, questionId: string, display: string) =>
  permutation(sessionId, questionId)[LABELS.indexOf(display as typeof LABELS[number])];

const toDisplay = (sessionId: string, questionId: string, canonical: string) =>
  LABELS[permutation(sessionId, questionId).indexOf(canonical)];

// ── RPC ──────────────────────────────────────────────────────────────

type Json = Record<string, unknown>;
type RpcResult = { data: unknown; error: { message: string } | null };

const uuid = () =>
  "xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx".replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === "x" ? r : (r & 0x3) | 0x8).toString(16);
  });

const err = (message: string): RpcResult => ({ data: null, error: { message } });

function startSession(db: FakeDb, passageId: string): RpcResult {
  if (!db.featureEnabled) return err("閱讀練習尚未對你開放");

  // 🛑 同一篇已經有 IN_PROGRESS 就接續。真的伺服器靠 partial unique index
  //    做到這件事，這裡要一樣——否則重新整理會一直開新的 session。
  const existing = db.sessions.find(
    (s) => s.passage_id === passageId && s.status === "IN_PROGRESS",
  );
  const session = existing ?? {
    id: uuid(),
    passage_id: passageId,
    status: "IN_PROGRESS" as const,
    started_at: new Date().toISOString(),
    submitted_at: null,
  };
  if (!existing) { db.sessions.push(session); writeDb(db); }

  return {
    data: {
      session_id: session.id,
      passage_id: passageId,
      resumed: Boolean(existing),
      answered_question_ids: db.attempts
        .filter((a) => a.session_id === session.id)
        .map((a) => a.question_id),
    },
    error: null,
  };
}

function getPassage(db: FakeDb, passageId: string, sessionId: string | null): RpcResult {
  if (!db.featureEnabled) return err("閱讀練習尚未對你開放");
  const passage = PASSAGES.find((p) => p.passage_id === passageId);
  if (!passage) return err("找不到這篇文章");

  return {
    data: {
      passage: {
        ...passage,
        // 🛑 anchorword 刻意出現三次，而且第一段就有一次——
        //    「總是標第一個」那種寫法會在這裡立刻現形。
        passage_text: `First paragraph with anchorword here.\n\n`
          + `Second paragraph with anchorword again.\n\n`
          + `Third paragraph with anchorword once more.`,
        cefr_level: "B1",
        content_family: "Science",
        subdomain: null,
        word_count: 120,
      },
      questions: QUESTIONS.filter((q) => q.passage_id === passageId).map((q) => {
        const perm = sessionId ? permutation(sessionId, q.question_id) : [...LABELS];
        const options: Record<string, string> = {};
        // 🛑 重排之後【才】貼上 A–D。排列本身不隨回傳值送出。
        perm.forEach((canonical, i) => {
          options[LABELS[i]] = q.options[LABELS.indexOf(canonical as typeof LABELS[number])];
        });
        return {
          question_id: q.question_id,
          construct: q.construct,
          question: q.question,
          options,
          target_text: q.target_text ?? null,
          target_occurrence: q.target_occurrence ?? null,
        };
      }),
      paragraphs: [],
      vocab: [],
    },
    error: null,
  };
}

function submitAnswer(db: FakeDb, args: Json): RpcResult {
  const sessionId = args.p_session_id as string;
  const questionId = args.p_question_id as string;
  const display = args.p_selected_answer as string;

  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return err("找不到這次練習");
  if (session.status !== "IN_PROGRESS") return err("這次練習已經結束了");

  const q = QUESTIONS.find((x) => x.question_id === questionId);
  if (!q || q.passage_id !== session.passage_id) return err("這一題不屬於這次練習");

  const explanation = `因為 ${q.correct}。`;
  const correctDisplay = toDisplay(sessionId, questionId, q.correct);

  // 🛑 一題只能答一次。重送回傳第一次的結果，而且【不新增第二筆】。
  const existing = db.attempts.find(
    (a) => a.session_id === sessionId && a.question_id === questionId,
  );
  if (existing) {
    return {
      data: {
        already_answered: true,
        selected_answer: existing.selected_answer,
        is_correct: existing.is_correct,
        correct_answer: correctDisplay,
        explanation,
      },
      error: null,
    };
  }

  // 🛑 比對前先把顯示位置換回原始標籤
  const isCorrect = toCanonical(sessionId, questionId, display) === q.correct;
  db.attempts.push({
    session_id: sessionId,
    question_id: questionId,
    selected_answer: display,
    is_correct: isCorrect,
    response_time_ms: (args.p_response_time_ms as number) ?? null,
    answer_change_count: (args.p_answer_change_count as number) ?? 0,
    first_answer: (args.p_first_answer as string) ?? display,
  });
  writeDb(db);

  return {
    data: {
      already_answered: false,
      selected_answer: display,
      is_correct: isCorrect,
      correct_answer: correctDisplay,
      explanation,
    },
    error: null,
  };
}

function finishSession(db: FakeDb, sessionId: string): RpcResult {
  const session = db.sessions.find((s) => s.id === sessionId);
  if (!session) return err("找不到這次練習");

  if (session.status === "IN_PROGRESS") {
    session.status = "SUBMITTED";
    session.submitted_at = new Date().toISOString();
    writeDb(db);
  }

  const mine = db.attempts.filter((a) => a.session_id === sessionId);
  return {
    data: {
      session_id: session.id,
      passage_id: session.passage_id,
      status: session.status,
      started_at: session.started_at,
      submitted_at: session.submitted_at,
      total_seconds: 421,
      answered: mine.length,
      correct: mine.filter((a) => a.is_correct).length,
      by_construct: QUESTIONS.filter((q) => q.passage_id === session.passage_id).map((q) => {
        const a = mine.find((x) => x.question_id === q.question_id);
        return {
          construct: q.construct,
          question_id: q.question_id,
          // 🛑 沒作答是 SKIPPED，不是 WRONG
          status: !a ? "SKIPPED" : a.is_correct ? "CORRECT" : "WRONG",
          selected_answer: a?.selected_answer ?? null,
          correct_answer: toDisplay(sessionId, q.question_id, q.correct),
          explanation: `因為 ${q.correct}。`,
          response_time_ms: a?.response_time_ms ?? null,
          answer_change_count: a?.answer_change_count ?? null,
        };
      }),
    },
    error: null,
  };
}

function myStats(db: FakeDb): RpcResult {
  const submitted = db.sessions.filter((s) => s.status === "SUBMITTED");
  const all = db.attempts;

  return {
    data: {
      overall: {
        sessions: db.sessions.length,
        passages: new Set(submitted.map((s) => s.passage_id)).size,
        answered: all.length,
        correct: all.filter((a) => a.is_correct).length,
        min_questions_for_skill: 3,
      },
      by_construct: CONSTRUCTS.map((c) => {
        const qs = QUESTIONS.filter((q) => q.construct === c).map((q) => q.question_id);
        const mine = all.filter((a) => qs.includes(a.question_id));
        return {
          construct: c,
          answered: mine.length,
          correct: mine.filter((a) => a.is_correct).length,
          median_ms: mine.length ? 42000 : null,
          changed: 0,
          changed_away_from_correct: 0,
        };
      }).filter((c) => c.answered > 0),
      by_skill: [],
      recent: [...db.sessions]
        .sort((a, b) => (a.started_at < b.started_at ? 1 : -1))
        .map((s) => {
          const mine = all.filter((a) => a.session_id === s.id);
          return {
            session_id: s.id,
            passage_id: s.passage_id,
            title: PASSAGES.find((p) => p.passage_id === s.passage_id)?.title ?? s.passage_id,
            status: s.status,
            started_at: s.started_at,
            submitted_at: s.submitted_at,
            answered: mine.length,
            correct: mine.filter((a) => a.is_correct).length,
            total_seconds: s.submitted_at ? 421 : null,
          };
        }),
    },
    error: null,
  };
}

async function rpc(name: string, args: Json = {}): Promise<RpcResult> {
  // 一點點延遲：讓載入狀態真的會出現，測試才碰得到真實的時序
  await new Promise((r) => setTimeout(r, 30));
  const db = readDb();

  switch (name) {
    case "learn_feature_enabled":
      return { data: db.featureEnabled, error: null };
    case "reading_start_session":
      return startSession(db, args.p_passage_id as string);
    case "reading_get_passage":
      return getPassage(db, args.p_passage_id as string,
        (args.p_session_id as string) ?? null);
    case "reading_submit_answer":
      return submitAnswer(db, args);
    case "reading_finish_session":
      return finishSession(db, args.p_session_id as string);
    case "reading_my_stats":
      return myStats(db);

    // ── 管理端 ──────────────────────────────────────────────────
    // 🛑 這幾支【只回得出能渲染的最小形狀】，不模擬任何規則。
    //    刪除的守門、position 重排、權限三層都由 supabase/tests 的
    //    43 條 SQL 斷言驗證。在這裡照抄一份規則，只會變成
    //    「證明假後端跟自己一致」——那正是這個檔案開頭警告的事。
    //    這裡要擋的是另一件事：頁面在瀏覽器裡到底打不打得開。
    case "learn_course_list":
      return { data: [], error: null };
    case "learn_admin_course_get":
      return { data: {
        course: {
          id: "c-1", slug: "smoke", title: "煙霧測試課", description: "",
          instructor: "", cover_path: null, level: "BEGINNER", category: "",
          type: "STANDARD", access: "ENROLLED", status: "DRAFT", sort_order: 0,
          require_watch: false,
        },
        sections: [],
      }, error: null };
    case "learn_admin_course_access":
      return { data: { course_id: "c-1", access: "ENROLLED",
                       classes: [], students: [], reach: 0 }, error: null };
    case "learn_admin_course_config":
      return { data: { bunny_library_id: null, bunny_token_ttl_seconds: 14400,
                       bunny_token_required: true, vault_key_present: false,
                       bunny_lesson_count: 0 }, error: null };

    default:
      return { data: null, error: null };
  }
}

// ── from()：夠用的查詢建構器 ─────────────────────────────────────────

interface Builder extends PromiseLike<{ data: unknown[]; error: null }> {
  select: (...a: unknown[]) => Builder;
  eq: (col: string, value: unknown) => Builder;
  order: (...a: unknown[]) => Builder;
  limit: (...a: unknown[]) => Builder;
  in: (...a: unknown[]) => Builder;
  /** 🛑 真的 client 有這兩支。沒有的話呼叫端會丟 TypeError，
   *  而 useAdmin 那種有 try/catch 的地方會把它吞成「不是管理員」——
   *  畫面顯示權限不足，console 一片乾淨。 */
  single: () => Promise<{ data: unknown; error: { code: string } | null }>;
  maybeSingle: () => Promise<{ data: unknown; error: null }>;
}

function from(table: string): Builder {
  const eqs: [string, unknown][] = [];

  const rows = (): unknown[] => {
    const db = readDb();
    const keep = <T extends Record<string, unknown>>(list: T[]) =>
      list.filter((r) => eqs.every(([col, v]) => r[col] === v));

    if (table === "reading_passages") {
      return keep(PASSAGES.map((p) => ({
        ...p, cefr_level: "B1", content_family: "Science",
        subdomain: null, status: "PUBLISHED",
      })));
    }
    if (table === "reading_sessions") {
      // useReadingPassages 依 started_at 遞減讀，順序是規則的一部分
      return keep([...db.sessions].sort((a, b) => (a.started_at < b.started_at ? 1 : -1)));
    }
    if (table === "reading_attempts") return keep(db.attempts);
    // 管理頁的煙霧測試要進得去。RequireAdmin 讀這張表。
    if (table === "app_admins") return db.isAdmin ? [{ user_id: "e2e-student" }] : [];
    return [];
  };

  const builder = {
    select: () => builder,
    eq: (col: string, value: unknown) => { eqs.push([col, value]); return builder; },
    order: () => builder,
    limit: () => builder,
    in: () => builder,
    // PGRST116 = 沒有資料列。PostgREST 對 .single() 就是回這個，
    // 而 useAdmin 特地把它當成「不是錯誤」——形狀要一致才測得準。
    single: async () => {
      const r = rows();
      return r.length > 0
        ? { data: r[0], error: null }
        : { data: null, error: { code: "PGRST116" } };
    },
    maybeSingle: async () => ({ data: rows()[0] ?? null, error: null }),
    then: (resolve: (v: { data: unknown[]; error: null }) => unknown) =>
      Promise.resolve().then(() => resolve({ data: rows(), error: null })),
  } as Builder;

  return builder;
}

// ── auth ─────────────────────────────────────────────────────────────

const FAKE_USER = { id: "e2e-student", email: "e2e@example.test" };

const auth = {
  getSession: async () => {
    const db = readDb();
    return {
      data: { session: db.signedIn ? { user: FAKE_USER, access_token: "fake" } : null },
      error: null,
    };
  },
  getUser: async () => {
    const db = readDb();
    return { data: { user: db.signedIn ? FAKE_USER : null }, error: null };
  },
  onAuthStateChange: () => ({ data: { subscription: { unsubscribe: () => {} } } }),
  signOut: async () => ({ error: null }),
  signInWithOAuth: async () => ({ error: null }),
  signInWithPassword: async () => ({ error: null }),
  signUp: async () => ({ error: null }),
  resetPasswordForEmail: async () => ({ error: null }),
};

const noop = () => ({ data: null, error: null });

/**
 * 沒實作到的東西一律回一個安靜的空值，不要讓應用程式在無關的地方炸掉——
 * 這些測試要看的是閱讀流程，不是單字本有沒有資料。
 */
export const supabase = new Proxy(
  { rpc, from, auth, channel: noop, removeChannel: noop, storage: { from: noop } },
  {
    get(target: Record<string, unknown>, prop: string) {
      if (prop in target) return target[prop];
      return () => noop();
    },
  },
) as never;
