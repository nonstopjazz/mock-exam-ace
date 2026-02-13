import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type",
};

interface PackItem {
  id: string;
  word: string;
  example_sentence: string | null;
  audio_url: string | null;
  example_audio_url: string | null;
}

/** 呼叫 Google Cloud TTS API，回傳 mp3 二進位 */
async function generateTTS(
  text: string,
  apiKey: string
): Promise<Uint8Array | null> {
  try {
    const res = await fetch(
      `https://texttospeech.googleapis.com/v1/text:synthesize?key=${apiKey}`,
      {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          input: { text },
          voice: { languageCode: "en-US", name: "en-US-Neural2-D" },
          audioConfig: { audioEncoding: "MP3", speakingRate: 0.9 },
        }),
      }
    );
    if (!res.ok) {
      console.error("TTS API error:", await res.text());
      return null;
    }
    const data = await res.json();
    const bin = atob(data.audioContent);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
    return bytes;
  } catch (err) {
    console.error("TTS failed for:", text, err);
    return null;
  }
}

Deno.serve(async (req) => {
  // CORS preflight
  if (req.method === "OPTIONS") {
    return new Response("ok", { headers: corsHeaders });
  }

  try {
    const { pack_id, force = false } = await req.json();

    if (!pack_id) {
      return new Response(
        JSON.stringify({ error: "pack_id is required" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    const GOOGLE_TTS_API_KEY = Deno.env.get("GOOGLE_TTS_API_KEY");
    if (!GOOGLE_TTS_API_KEY) {
      return new Response(
        JSON.stringify({ error: "GOOGLE_TTS_API_KEY not configured" }),
        { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // 用 service role key 操作資料庫和 Storage
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    // 取得該包的所有單字
    const { data: items, error: fetchErr } = await supabase
      .from("pack_items")
      .select("id, word, example_sentence, audio_url, example_audio_url")
      .eq("pack_id", pack_id)
      .order("sort_order", { ascending: true });

    if (fetchErr) throw fetchErr;
    if (!items || items.length === 0) {
      return new Response(
        JSON.stringify({ success: true, generated: 0, skipped: 0, total: 0 }),
        { headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
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
            .from("pack-audio")
            .upload(path, audio, { contentType: "audio/mpeg", upsert: true });

          if (!upErr) {
            const { data: urlData } = supabase.storage
              .from("pack-audio")
              .getPublicUrl(path);
            await supabase
              .from("pack_items")
              .update({ audio_url: urlData.publicUrl })
              .eq("id", item.id);
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
            .from("pack-audio")
            .upload(path, audio, { contentType: "audio/mpeg", upsert: true });

          if (!upErr) {
            const { data: urlData } = supabase.storage
              .from("pack-audio")
              .getPublicUrl(path);
            await supabase
              .from("pack_items")
              .update({ example_audio_url: urlData.publicUrl })
              .eq("id", item.id);
          }
        }
      }
    }

    return new Response(
      JSON.stringify({ success: true, generated, skipped, total: items.length }),
      { headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (err) {
    console.error("Edge function error:", err);
    return new Response(
      JSON.stringify({ error: (err as Error).message }),
      { status: 500, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
