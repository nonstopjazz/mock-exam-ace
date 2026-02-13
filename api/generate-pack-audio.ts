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

export default async function handler(req: any, res: any) {
  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed' });
  }

  const { pack_id, force = false } = req.body || {};

  if (!pack_id) {
    return res.status(400).json({ error: 'pack_id is required' });
  }

  const GOOGLE_TTS_API_KEY = process.env.GOOGLE_TTS_API_KEY;
  const SUPABASE_URL = process.env.VITE_SUPABASE_URL || process.env.SUPABASE_URL;
  const SUPABASE_SERVICE_ROLE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

  if (!GOOGLE_TTS_API_KEY) {
    return res.status(500).json({ error: 'GOOGLE_TTS_API_KEY not configured' });
  }
  if (!SUPABASE_URL || !SUPABASE_SERVICE_ROLE_KEY) {
    return res.status(500).json({ error: 'Supabase credentials not configured' });
  }

  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    const { data: items, error: fetchErr } = await supabase
      .from('pack_items')
      .select('id, word, example_sentence, audio_url, example_audio_url')
      .eq('pack_id', pack_id)
      .order('sort_order', { ascending: true });

    if (fetchErr) throw fetchErr;
    if (!items || items.length === 0) {
      return res.json({ success: true, total: 0, wordGenerated: 0, wordSkipped: 0, exampleGenerated: 0, exampleSkipped: 0 });
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

    return res.json({
      success: true,
      total: items.length,
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
