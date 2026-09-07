import { createClient } from '@supabase/supabase-js';

export const config = {
  maxDuration: 60,
};

interface PackItem {
  id: string;
  word: string;
  example_sentence: string | null;
  audio_url: string | null;
  example_audio_url: string | null;
}

async function generateTTS(text: string, apiKey: string): Promise<Buffer | null> {
  try {
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: 'en-US', name: 'en-US-Neural2-D' },
          audioConfig: { audioEncoding: 'MP3', speakingRate: 0.9 },
        }),
      }
    );
    if (!res.ok) {
      console.error('TTS API error:', await res.text());
      return null;
    }
    const data = await res.json();
    return Buffer.from(data.audioContent, 'base64');
  } catch (err) {
    console.error('TTS failed for:', text, err);
    return null;
  }
}

// 並行處理，限制同時最多 CONCURRENCY 個請求
async function processInBatches<T>(
  items: T[],
  concurrency: number,
  fn: (item: T) => Promise<void>
) {
  for (let i = 0; i < items.length; i += concurrency) {
    const batch = items.slice(i, i + concurrency);
    await Promise.all(batch.map(fn));
  }
}

/**
 * A1-3b: how many pack_items one invocation may process.
 *
 * This is a TIMEOUT bound, not a security cap. `maxDuration` above is 60s
 * and each item costs up to two Google TTS syntheses, so a large pack has
 * always exceeded the budget — which is why the admin UI already carries
 * a 504 "try a smaller pack" message. Chunking removes that failure mode
 * instead of merely reporting it.
 *
 * The largest Production pack is 214 items, i.e. up to 428 syntheses —
 * comfortably beyond what one 60s invocation can do. At the default of
 * 100 it completes in 3 chunks.
 *
 * Override per environment with TTS_MAX_ITEMS_PER_REQUEST. Raise it only
 * if a real pack demonstrably completes well within maxDuration.
 */
const DEFAULT_MAX_ITEMS_PER_REQUEST = 100;
const MAX_ITEMS_PER_REQUEST = Math.max(
  1,
  parseInt(process.env.TTS_MAX_ITEMS_PER_REQUEST || '', 10) || DEFAULT_MAX_ITEMS_PER_REQUEST
);

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const {
    pack_id,
    force = false,
    confirm_force = false,
    offset: rawOffset = 0,
    limit: rawLimit,
  } = req.body || {};

  if (!pack_id) {
    return res.status(400).json({ error: 'pack_id is required' });
  }

  // A1-3b: the server clamps — a caller may request a SMALLER slice but
  // can never raise the bound.
  const offset = Math.max(0, parseInt(String(rawOffset), 10) || 0);
  const requestedLimit = parseInt(String(rawLimit), 10);
  const limit = Math.min(
    MAX_ITEMS_PER_REQUEST,
    Number.isFinite(requestedLimit) && requestedLimit > 0 ? requestedLimit : MAX_ITEMS_PER_REQUEST
  );

  const GOOGLE_TTS_API_KEY = process.env.GOOGLE_TTS_API_KEY;
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  // Server-only name, deliberately NOT the VITE_-prefixed one. See
  // .env.example: VITE_SUPABASE_ANON_KEY is the browser copy and is
  // bundled into client JS; SUPABASE_ANON_KEY is this server handler's
  // own variable. Keeping the names distinct is what makes it obvious at
  // a glance which values reach the client.
  const SUPABASE_ANON_KEY = process.env.SUPABASE_ANON_KEY;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!GOOGLE_TTS_API_KEY) {
    return res.status(500).json({ error: 'GOOGLE_TTS_API_KEY not configured' });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY || !SUPABASE_ANON_KEY) {
    return res.status(500).json({ error: 'Supabase credentials not configured' });
  }

  // ===================================================================
  // A1-3a (audit finding 9.11) — authenticate and authorize the caller.
  //
  // Product semantics: TTS generation is an ADMIN CONTENT-AUTHORING tool
  // used from PackItemsAdmin to produce pronunciation audio for
  // vocabulary packs and flashcards. It is NOT a text-to-speech service
  // for students, so ordinary authenticated students must not reach it.
  //
  // Previously this ran with service_role and NO auth check of any kind,
  // so an unauthenticated POST could burn unbounded Google TTS quota,
  // overwrite Storage objects and update pack_items with RLS bypassed.
  //
  // The caller's JWT is validated, then is_admin() is evaluated AS THAT
  // USER so this endpoint reuses the schema's authoritative admin gate
  // rather than inventing a new one.
  // ===================================================================
  const authHeader: string = req.headers?.authorization || req.headers?.Authorization || '';
  const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7).trim() : '';

  if (!token) {
    return res.status(401).json({ error: 'UNAUTHENTICATED' });
  }

  const userClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: `Bearer ${token}` } },
    auth: { persistSession: false, autoRefreshToken: false },
  });

  const { data: userData, error: userError } = await userClient.auth.getUser();
  if (userError || !userData?.user) {
    return res.status(401).json({ error: 'UNAUTHENTICATED' });
  }

  const { data: isAdmin, error: adminError } = await userClient.rpc('is_admin');
  if (adminError || isAdmin !== true) {
    return res.status(403).json({ error: 'FORBIDDEN' });
  }

  // force=true re-synthesises everything, the expensive path. Require a
  // second explicit flag so a stray retry cannot trigger it.
  if (force && !confirm_force) {
    return res.status(400).json({ error: 'FORCE_REQUIRES_CONFIRMATION' });
  }

  console.log(
    `[generate-pack-audio] admin=${userData.user.id} pack=${pack_id} ` +
    `offset=${offset} limit=${limit} force=${force}`
  );

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // A1-3b: fetch only this slice, plus the pack total so the client can
    // drive the loop.
    const { data: items, error: fetchErr, count: packTotal } = await supabase
      .from('pack_items')
      .select('id, word, example_sentence, audio_url, example_audio_url', { count: 'exact' })
      .eq('pack_id', pack_id)
      .order('sort_order', { ascending: true })
      .range(offset, offset + limit - 1);

    if (fetchErr) throw fetchErr;

    const total = packTotal ?? 0;

    if (!items || items.length === 0) {
      return res.json({
        success: true,
        total,
        processed: 0,
        offset,
        next_offset: null,
        has_more: false,
        wordGenerated: 0, wordSkipped: 0, exampleGenerated: 0, exampleSkipped: 0,
      });
    }

    let wordGenerated = 0;
    let wordSkipped = 0;
    let exampleGenerated = 0;
    let exampleSkipped = 0;

    // 建立所有需要處理的任務
    interface Task {
      item: PackItem;
      type: 'word' | 'example';
      text: string;
    }
    const tasks: Task[] = [];

    for (const item of items as PackItem[]) {
      if (!item.audio_url || force) {
        tasks.push({ item, type: 'word', text: item.word });
      } else {
        wordSkipped++;
      }
      if (item.example_sentence) {
        if (!item.example_audio_url || force) {
          tasks.push({ item, type: 'example', text: item.example_sentence });
        } else {
          exampleSkipped++;
        }
      }
    }

    // 5 個並行處理，大幅加速
    await processInBatches(tasks, 5, async (task) => {
      const audio = await generateTTS(task.text, GOOGLE_TTS_API_KEY);
      if (!audio) {
        if (task.type === 'word') wordGenerated++;
        else exampleGenerated++;
        return;
      }

      const suffix = task.type === 'word' ? '_word.mp3' : '_example.mp3';
      const path = `${pack_id}/${task.item.id}${suffix}`;
      const { error: upErr } = await supabase.storage
        .from('pack-audio')
        .upload(path, audio, { contentType: 'audio/mpeg', upsert: true });

      if (!upErr) {
        const { data: urlData } = supabase.storage
          .from('pack-audio')
          .getPublicUrl(path);
        const field = task.type === 'word' ? 'audio_url' : 'example_audio_url';
        await supabase
          .from('pack_items')
          .update({ [field]: urlData.publicUrl })
          .eq('id', task.item.id);
      }

      if (task.type === 'word') wordGenerated++;
      else exampleGenerated++;
    });

    const nextOffset = offset + items.length;
    const hasMore = nextOffset < total;

    return res.json({
      success: true,
      total,
      processed: items.length,
      offset,
      next_offset: hasMore ? nextOffset : null,
      has_more: hasMore,
      wordGenerated,
      wordSkipped,
      exampleGenerated,
      exampleSkipped,
    });
  } catch (err: any) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
