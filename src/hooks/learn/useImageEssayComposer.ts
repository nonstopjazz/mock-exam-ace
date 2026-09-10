import { useCallback, useEffect, useState } from "react";
import { supabase } from "@/lib/supabase";
import { useAuth } from "@/contexts/AuthContext";
import { prepareImage } from "@/lib/writing/prepareImage";
import { MAX_PAGES, RAW_BUCKET } from "@/config/writingImages";

/**
 * 拍照作文的流程
 *
 *   select → uploading → processing → review → submitting → （導向作文頁）
 *
 * 每一步失敗都停在原地並保留已完成的部分：上傳好的照片不會因為辨識失敗而消失，
 * 重試就是再走一次同樣的呼叫（伺服器端是可重入的，處理好的頁面會被跳過）。
 *
 * 為什麼原檔由瀏覽器直傳 Storage 而不是走 API：
 * Vercel serverless 的請求本文上限約 4.5 MB，10 MB 的手機照片穿不過去。
 * 直傳時用的是學生自己的登入身分，writing-raw 的 RLS 只讓他寫自己的資料夾。
 */

export type ComposerPhase = "select" | "uploading" | "processing" | "review" | "submitting";

export interface PageState {
  pageNumber: number;
  state: "UPLOADED" | "NORMALIZED" | "NORMALIZE_FAILED";
  errorCode: string | null;
  errorMessage: string | null;
}

export interface EssayMeta {
  title: string;
  essayTopic?: string;
  essayDate?: string;
  studentNotes?: string;
}

interface ProcessResponse {
  pages?: PageState[];
  ocr?: { runId: string; text: string } | null;
  error?: string;
}

/** 未完成的草稿（離開後再回來時用） */
export interface ResumableDraft {
  essayId: string;
  title: string;
  pageCount: number;
  hasText: boolean;
  createdAt: string;
}

async function authHeaders(): Promise<Record<string, string>> {
  const { data } = await supabase.auth.getSession();
  const token = data.session?.access_token;
  if (!token) throw new Error("登入狀態已過期，請重新登入");
  return { Authorization: `Bearer ${token}`, "Content-Type": "application/json" };
}

export function useImageEssayComposer() {
  const { user } = useAuth();

  const [phase, setPhase] = useState<ComposerPhase>("select");
  const [essayId, setEssayId] = useState<string | null>(null);
  const [pages, setPages] = useState<PageState[]>([]);
  const [ocrRunId, setOcrRunId] = useState<string | null>(null);
  const [text, setText] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ current: number; total: number }>({ current: 0, total: 0 });
  const [resumable, setResumable] = useState<ResumableDraft | null>(null);

  // ── 未完成的草稿 ─────────────────────────────────────────────
  useEffect(() => {
    if (!user) return;
    let cancelled = false;

    void (async () => {
      const { data } = await supabase
        .from("writing_submissions")
        .select("id, title, created_at, writing_images(id), writing_ocr_runs(id, status, raw_text)")
        .eq("status", "DRAFT")
        .eq("submission_type", "image")
        .order("created_at", { ascending: false })
        .limit(1);

      if (cancelled) return;
      const row = data?.[0] as
        | {
            id: string;
            title: string;
            created_at: string;
            writing_images: { id: string }[] | null;
            writing_ocr_runs: { id: string; status: string; raw_text: string | null }[] | null;
          }
        | undefined;

      if (!row || (row.writing_images?.length ?? 0) === 0) return;
      setResumable({
        essayId: row.id,
        title: row.title,
        pageCount: row.writing_images?.length ?? 0,
        hasText: (row.writing_ocr_runs ?? []).some((r) => r.status === "SUCCEEDED"),
        createdAt: row.created_at,
      });
    })();

    return () => {
      cancelled = true;
    };
  }, [user]);

  /** 呼叫伺服器：正規化 + 辨識。可重入，重試就是再呼叫一次。 */
  const runProcess = useCallback(async (id: string) => {
    setPhase("processing");
    setError(null);

    let payload: ProcessResponse;
    try {
      const res = await fetch("/api/writing-images-process", {
        method: "POST",
        headers: await authHeaders(),
        body: JSON.stringify({ essayId: id }),
      });
      payload = (await res.json()) as ProcessResponse;
      if (!res.ok && !payload.pages) {
        throw new Error(payload.error || "處理失敗，請稍後再試");
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "處理失敗，請稍後再試");
      setPhase("review");
      return;
    }

    setPages(payload.pages ?? []);

    if (payload.ocr) {
      setOcrRunId(payload.ocr.runId);
      setText(payload.ocr.text);
      setError(null);
    } else {
      setError(payload.error ?? "還有照片沒有處理完成");
    }
    setPhase("review");
  }, []);

  /** 回到未完成的草稿：有辨識結果就直接進校對，否則重跑處理。 */
  const resume = useCallback(async () => {
    if (!resumable) return;
    setError(null);
    setEssayId(resumable.essayId);

    const { data } = await supabase
      .from("writing_ocr_runs")
      .select("id, raw_text")
      .eq("essay_id", resumable.essayId)
      .eq("status", "SUCCEEDED")
      .order("finished_at", { ascending: false })
      .limit(1);

    const run = data?.[0] as { id: string; raw_text: string } | undefined;
    if (run) {
      setOcrRunId(run.id);
      setText(run.raw_text);
      setPhase("review");
    } else {
      await runProcess(resumable.essayId);
    }
    setResumable(null);
  }, [resumable, runProcess]);

  /**
   * 建立草稿 → 上傳每一張 → 登記 → 處理。
   *
   * 中途失敗會留下草稿與已上傳的頁面：那是刻意的，重試時不必重傳。
   */
  const start = useCallback(
    async (files: File[], meta: EssayMeta) => {
      if (!user) {
        setError("請先登入");
        return;
      }
      if (files.length === 0) {
        setError("請至少選一張照片");
        return;
      }
      if (files.length > MAX_PAGES) {
        setError(`一篇作文最多 ${MAX_PAGES} 張照片`);
        return;
      }

      setError(null);
      setPhase("uploading");
      setProgress({ current: 0, total: files.length });

      let id = essayId;
      try {
        if (!id) {
          const { data, error: rpcError } = await supabase.rpc("create_writing_image_draft", {
            p_title: meta.title,
            p_essay_topic: meta.essayTopic ?? null,
            p_essay_date: meta.essayDate ?? null,
            p_student_notes: meta.studentNotes ?? null,
          });
          if (rpcError) throw new Error(rpcError.message);
          id = data as string;
          setEssayId(id);
        }

        for (let i = 0; i < files.length; i++) {
          setProgress({ current: i + 1, total: files.length });
          const prepared = await prepareImage(files[i]);
          const pageNumber = i + 1;
          const path = `${user.id}/${id}/${pageNumber}-${crypto.randomUUID()}.${prepared.extension}`;

          const { error: uploadError } = await supabase.storage
            .from(RAW_BUCKET)
            .upload(path, prepared.blob, { contentType: prepared.contentType, upsert: false });
          if (uploadError) throw new Error(`第 ${pageNumber} 張上傳失敗：${uploadError.message}`);

          const { error: registerError } = await supabase.rpc("register_writing_image", {
            p_essay_id: id,
            p_page_number: pageNumber,
            p_raw_path: path,
            p_raw_bytes: prepared.blob.size,
            p_raw_mime: prepared.contentType,
          });
          if (registerError) throw new Error(`第 ${pageNumber} 張登記失敗：${registerError.message}`);
        }
      } catch (err) {
        setError(err instanceof Error ? err.message : "上傳失敗，請再試一次");
        setPhase("select");
        return;
      }

      await runProcess(id!);
    },
    [user, essayId, runProcess],
  );

  const retry = useCallback(async () => {
    if (!essayId) return;
    await runProcess(essayId);
  }, [essayId, runProcess]);

  /** 送出。provenance（OCR / OCR_CORRECTED）由資料庫比對決定，這裡不宣稱。 */
  const submit = useCallback(async (): Promise<string | null> => {
    if (!essayId || !ocrRunId) {
      setError("還沒有可以送出的內容");
      return null;
    }
    setPhase("submitting");
    setError(null);

    const { data, error: rpcError } = await supabase.rpc("submit_writing_image_essay", {
      p_essay_id: essayId,
      p_content: text,
      p_ocr_run_id: ocrRunId,
    });

    if (rpcError) {
      setError(rpcError.message);
      setPhase("review");
      return null;
    }
    return data as string;
  }, [essayId, ocrRunId, text]);

  const failedPages = pages.filter((p) => p.state !== "NORMALIZED");

  return {
    phase,
    essayId,
    pages,
    failedPages,
    text,
    setText,
    error,
    progress,
    resumable,
    resume,
    start,
    retry,
    submit,
    canSubmit: Boolean(ocrRunId) && text.trim().length > 0 && failedPages.length === 0,
  };
}
