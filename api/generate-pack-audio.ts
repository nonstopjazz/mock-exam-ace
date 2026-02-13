import { createClient } from '@supabase/supabase-js';

export const config = {
  maxDuration: 60, // Pro plan: 最多 60 秒
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

export default async function handler(req: any, res: any) {
  // 只接受 POST
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
    // 取得該包的所有單字
    const { data: items, error: fetchErr } = await supabase
      .from('pack_items')
      .select('id, word, example_sentence, audio_url, example_audio_url')
      .eq('pack_id', pack_id)
      .order('sort_order', { ascending: true });

    if (fetchErr) throw fetchErr;
    if (!items || items.length === 0) {
      return res.json({ success: true, generated: 0, skipped: 0, total: 0 });
    }

    let generated = 0;
    let skipped = 0;

    for (const item of items as PackItem[]) {
      // --- 單字發音 ---
      if (!item.audio_url || force) {
        const audio = await generateTTS(item.word, GOOGLE_TTS_API_KEY);
        if (audio) {
          const path = `${pack_id}/${item.id}_word.mp3`;
          const { error: upErr } = await supabase.storage
            .from('pack-audio')
            .upload(path, audio, { contentType: 'audio/mpeg', upsert: true });

          if (!upErr) {
            const { data: urlData } = supabase.storage
              .from('pack-audio')
              .getPublicUrl(path);
            await supabase
              .from('pack_items')
              .update({ audio_url: urlData.publicUrl })
              .eq('id', item.id);
          }
        }
        generated++;
      } else {
        skipped++;
      }

      // --- 例句發音 ---
      if (item.example_sentence && (!item.example_audio_url || force)) {
        const audio = await generateTTS(item.example_sentence, GOOGLE_TTS_API_KEY);
        if (audio) {
          const path = `${pack_id}/${item.id}_example.mp3`;
          const { error: upErr } = await supabase.storage
            .from('pack-audio')
            .upload(path, audio, { contentType: 'audio/mpeg', upsert: true });

          if (!upErr) {
            const { data: urlData } = supabase.storage
              .from('pack-audio')
              .getPublicUrl(path);
            await supabase
              .from('pack_items')
              .update({ example_audio_url: urlData.publicUrl })
              .eq('id', item.id);
          }
        }
      }
    }

    return res.json({ success: true, generated, skipped, total: items.length });
  } catch (err: any) {
    console.error('API error:', err);
    return res.status(500).json({ error: err.message });
  }
}
