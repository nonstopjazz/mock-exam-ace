import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/lib/supabase";
import {
  BUCKET,
  MAX_RECORD_SECONDS,
  MAX_UPLOAD_BYTES,
  MIN_RECORD_SECONDS,
} from "@/config/speaking";
import {
  baseMimeOf,
  extensionFor,
  micErrorMessage,
  pickSupportedMimeType,
} from "@/lib/speaking/audio";

/**
 *  idle       還沒開始
 *  permission 正在要麥克風權限
 *  recording  錄音中
 *  review     錄完了，可以試聽、重錄或上傳
 *  uploading  上傳中
 *  done       已上傳
 *  error      任何一步失敗；error 裡有原因
 */
export type RecorderPhase =
  | "idle"
  | "permission"
  | "recording"
  | "review"
  | "uploading"
  | "done"
  | "error";

/**
 * 錄音 + 上傳。
 *
 * 【為什麼練習紀錄是按下「上傳」才建立】
 *
 *   speaking_start_practice() 在 save() 裡才呼叫，不是在 start() 裡。
 *   學生按了錄音、講兩句覺得不行、關掉分頁——這種事每天都會發生。
 *   若在開始錄音時就建立一列，資料庫會慢慢積滿永遠不會有檔案的 PENDING，
 *   而老師打開清單會看到一堆不存在的練習。
 *
 *   代價是題目快照晚幾分鐘才拍下來。那不要緊：題目文字是老師改的，
 *   不會在學生錄音的那兩分鐘之內變。
 *
 * 【失敗要留下痕跡】
 *
 *   一旦那一列建立了，後面任何一步失敗都會回頭呼叫 speaking_fail_recording()。
 *   沒有這一步，失敗的練習會永遠停在 PENDING，看起來像「還沒錄」——
 *   學生不會知道要重試，老師也看不出出過事。
 */
export function useSpeakingRecorder(promptId: string | null) {
  const [phase, setPhase] = useState<RecorderPhase>("idle");
  const [elapsed, setElapsed] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [blob, setBlob] = useState<Blob | null>(null);
  const [blobUrl, setBlobUrl] = useState<string | null>(null);
  const [mimeType, setMimeType] = useState<string | null>(null);

  const recorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const streamRef = useRef<MediaStream | null>(null);
  const startedAtRef = useRef(0);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const blobUrlRef = useRef<string | null>(null);

  /** 這個瀏覽器錄不錄得起來。錄不起來要在按下去【之前】就說。 */
  const supported = typeof MediaRecorder !== "undefined" && pickSupportedMimeType() !== null;

  const stopTimer = () => {
    if (timerRef.current) clearInterval(timerRef.current);
    timerRef.current = null;
  };

  const releaseStream = () => {
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
  };

  // 離開頁面時一定要放掉麥克風，否則分頁上的錄音指示燈會一直亮著。
  useEffect(() => {
    return () => {
      stopTimer();
      releaseStream();
      if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    };
  }, []);

  const putBlobUrl = (next: string | null) => {
    if (blobUrlRef.current) URL.revokeObjectURL(blobUrlRef.current);
    blobUrlRef.current = next;
    setBlobUrl(next);
  };

  const reset = useCallback(() => {
    stopTimer();
    releaseStream();
    putBlobUrl(null);
    setBlob(null);
    setMimeType(null);
    setElapsed(0);
    setError(null);
    setPhase("idle");
  }, []);

  const stop = useCallback(() => {
    stopTimer();
    try {
      recorderRef.current?.stop();
    } catch {
      /* 已經停了 */
    }
  }, []);

  const start = useCallback(async () => {
    const chosen = pickSupportedMimeType();
    if (!chosen) {
      setError("這個瀏覽器不支援錄音。請改用 Chrome、Edge 或 Safari。");
      setPhase("error");
      return;
    }

    setError(null);
    setPhase("permission");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      streamRef.current = stream;

      const recorder = new MediaRecorder(stream, { mimeType: chosen });
      chunksRef.current = [];
      recorder.ondataavailable = (event) => {
        if (event.data && event.data.size > 0) chunksRef.current.push(event.data);
      };
      recorder.onstop = () => {
        const finalBlob = new Blob(chunksRef.current, { type: chosen });
        putBlobUrl(URL.createObjectURL(finalBlob));
        setBlob(finalBlob);
        setMimeType(chosen);
        setPhase("review");
        releaseStream();
      };
      recorderRef.current = recorder;

      // 250ms 一塊。切小塊是為了讓「按停止」之後幾乎立刻就有完整的 blob。
      recorder.start(250);
      startedAtRef.current = Date.now();
      setElapsed(0);
      setPhase("recording");

      timerRef.current = setInterval(() => {
        const seconds = (Date.now() - startedAtRef.current) / 1000;
        setElapsed(seconds);
        // 時間到自動停。讓學生錄滿十分鐘再告訴他傳不上去是最糟的做法。
        if (seconds >= MAX_RECORD_SECONDS) {
          stopTimer();
          try {
            recorderRef.current?.stop();
          } catch {
            /* 已經停了 */
          }
        }
      }, 200);
    } catch (err) {
      setError(micErrorMessage(err));
      setPhase("error");
      releaseStream();
    }
  }, []);

  /**
   * 上傳並登記。成功回傳 recording id。
   *
   * 路徑一定是 `<uid>/<recording_id>/…` —— speaking_register_recording 會驗，
   * 不合的直接 42501。這裡照著組，不是為了通過檢查，而是因為那個形狀
   * 就是「這個檔案屬於誰的哪一次練習」的唯一表示法。
   */
  const save = useCallback(async (): Promise<string | null> => {
    if (!blob || !mimeType || !promptId) return null;

    if (elapsed < MIN_RECORD_SECONDS) {
      setError(`錄音太短了（不到 ${MIN_RECORD_SECONDS} 秒），請重錄一次。`);
      return null;
    }
    if (blob.size > MAX_UPLOAD_BYTES) {
      setError("錄音檔太大了，請錄短一點再試。");
      return null;
    }

    setPhase("uploading");
    setError(null);

    const { data: sessionData } = await supabase.auth.getUser();
    const uid = sessionData.user?.id;
    if (!uid) {
      setError("登入狀態已失效，請重新登入後再試。");
      setPhase("error");
      return null;
    }

    // 1. 先建立練習紀錄（題目在這一刻被快照下來）
    const { data: startData, error: startError } = await supabase.rpc("speaking_start_practice", {
      p_prompt_id: promptId,
    });
    if (startError) {
      setError(startError.message);
      setPhase("error");
      return null;
    }
    const recordingId = startData as unknown as string;

    // 2. 上傳檔案，3. 登記。任何一步失敗都要把那一列標成 FAILED。
    try {
      const base = baseMimeOf(mimeType);
      const path = `${uid}/${recordingId}/${Date.now()}.${extensionFor(mimeType)}`;

      // 🛑 contentType 傳主型別，不能帶 `;codecs=opus`：
      //    bucket 的 allowed_mime_types 是精確比對。
      const { error: uploadError } = await supabase.storage
        .from(BUCKET)
        .upload(path, blob, { contentType: base, upsert: false });
      if (uploadError) throw new Error(`檔案傳不上去（${uploadError.message}）`);

      const { error: registerError } = await supabase.rpc("speaking_register_recording", {
        p_recording_id: recordingId,
        p_storage_path: path,
        p_mime_type: base,
        p_file_bytes: blob.size,
        p_duration_seconds: Math.round(elapsed),
      });
      if (registerError) throw new Error(`檔案傳上去了，但登記失敗（${registerError.message}）`);
    } catch (err) {
      // 存進資料庫的是【原因】，不含「上傳失敗」這四個字——那是顯示時才加的標籤。
      // 兩邊都加的話，畫面上會出現「上傳失敗：上傳失敗：…」。
      const cause = err instanceof Error ? err.message : "未知的錯誤";
      await supabase.rpc("speaking_fail_recording", {
        p_recording_id: recordingId,
        p_detail: cause,
      });
      setError(`上傳失敗：${cause}。你的錄音還在，可以直接再按一次上傳。`);
      setPhase("review");
      return null;
    }

    setPhase("done");
    return recordingId;
  }, [blob, mimeType, promptId, elapsed]);

  return {
    phase,
    elapsed,
    error,
    blobUrl,
    blob,
    supported,
    start,
    stop,
    reset,
    save,
    maxSeconds: MAX_RECORD_SECONDS,
  };
}
