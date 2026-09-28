import { useCallback, useEffect, useRef, useState } from "react";
import {
  accumulate, initialWatchState, reportable, resetAnchor,
  type WatchState,
} from "@/lib/learn/course/watchProgress";
import type { LessonPlayback } from "@/lib/learn/course/types";

/**
 * 從跨網域的播放器取回「現在播到第幾秒」，累計成實際觀看時間。
 *
 * 兩家的取法不同，所以分開處理：
 *
 *   YouTube  用官方的 IFrame Player API（載入 youtube.com/iframe_api）。
 *            它的 postMessage 協定沒有公開文件，自己實作會在某次改版
 *            靜靜壞掉——而壞掉的樣子是「進度永遠 0」，沒有錯誤訊息。
 *
 *   Bunny    自己實作 player.js 協定的一小段。那是公開規格（playerjs.io），
 *            穩定而且只要三十行，不值得為它多載一支第三方腳本。
 *
 * 🛑 擋廣告的外掛常常擋掉 youtube.com/iframe_api。載不起來時 unavailable
 *    會是 true，畫面要據此告訴學生「自動記錄沒有運作」——而不是讓他看完
 *    之後發現什麼都沒記到。
 *
 * 🛑 這是【客戶端回報】。它比按一顆按鈕嚴謹得多，但不是關卡。
 *    伺服器那邊會把單次增量夾在真實經過的時間內，擋掉最省事的作弊。
 */

interface YouTubePlayer {
  getCurrentTime: () => number;
  getDuration: () => number;
  destroy: () => void;
}
interface YouTubeApi {
  Player: new (el: HTMLElement | string, opts: { events?: Record<string, unknown> }) => YouTubePlayer;
}
declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
  }
}

/** 整個分頁只載一次，而且只有真的用到 YouTube 才載 */
let youtubeApiPromise: Promise<YouTubeApi | null> | null = null;

function loadYouTubeApi(): Promise<YouTubeApi | null> {
  if (youtubeApiPromise) return youtubeApiPromise;

  youtubeApiPromise = new Promise((resolve) => {
    if (window.YT?.Player) { resolve(window.YT); return; }

    const script = document.createElement("script");
    script.src = "https://www.youtube.com/iframe_api";
    script.async = true;
    // 被擋掉就回 null，不要讓整頁等一個永遠不會來的東西
    script.onerror = () => resolve(null);

    const previous = window.onYouTubeIframeAPIReady;
    window.onYouTubeIframeAPIReady = () => {
      previous?.();
      resolve(window.YT ?? null);
    };

    document.head.appendChild(script);
    // 12 秒還沒好就當作被擋掉
    setTimeout(() => resolve(window.YT ?? null), 12000);
  });

  return youtubeApiPromise;
}

/** 多久回報一次伺服器。太密會變成每分鐘四次 RPC，太疏關掉分頁會掉太多 */
const REPORT_INTERVAL_MS = 15000;
/** YouTube 沒有 timeupdate 事件，只能自己輪詢 */
const YOUTUBE_POLL_MS = 500;

export interface VideoWatchResult {
  /** 目前累計的秒數（含伺服器已經記下的） */
  watched: number;
  /** 追蹤器有沒有成功接上 */
  tracking: boolean;
  /** 🛑 接不上。多半是擋廣告的外掛擋掉了 YouTube 的 API */
  unavailable: boolean;
  /**
   * 播放器回報的影片總長度，還沒讀到是 0。
   *
   * 資料庫的 duration_seconds 是管理員手動填的，沒填就是 0——那會讓
   * 畫面顯示 0:00，而且觀看門檻（長度 × 90%）也是 0，那支影片永遠
   * 不會被判定完成。管理員預覽時順手把這個值補回去。
   */
  duration: number;
}

export function useVideoWatch(
  playback: LessonPlayback | null,
  iframeRef: React.RefObject<HTMLIFrameElement>,
  report: (lessonId: string, watchedSeconds: number) => void,
): VideoWatchResult {
  const [watched, setWatched] = useState(0);
  const [tracking, setTracking] = useState(false);
  const [unavailable, setUnavailable] = useState(false);
  const [duration, setDuration] = useState(0);

  const stateRef = useRef<WatchState>(initialWatchState());
  const sentRef = useRef(0);
  const lessonRef = useRef<string | null>(null);

  const lessonId = playback?.lesson_id ?? null;
  const provider = playback?.provider ?? null;

  /** 把目前累計送出去（只在真的變多時送） */
  const flush = useCallback(() => {
    const id = lessonRef.current;
    if (!id) return;
    const value = reportable(stateRef.current);
    if (value <= sentRef.current) return;
    sentRef.current = value;
    report(id, value);
  }, [report]);

  const onTime = useCallback((seconds: number) => {
    stateRef.current = accumulate(stateRef.current, seconds);
    setWatched(reportable(stateRef.current));
  }, []);

  /** 播放器回報的長度。0 或不合理的值忽略——播放器 ready 之前會回 0 */
  const onDuration = useCallback((seconds: number) => {
    if (!Number.isFinite(seconds) || seconds <= 0) return;
    setDuration((d) => (d > 0 ? d : Math.round(seconds)));
  }, []);

  // 換影片就重來，並且把上一支的進度送出去
  useEffect(() => {
    flush();
    lessonRef.current = lessonId;
    const base = playback?.watched_seconds ?? 0;
    stateRef.current = initialWatchState(base);
    sentRef.current = base;
    setWatched(base);
    setTracking(false);
    setUnavailable(false);
    setDuration(0);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [lessonId]);

  // ── YouTube ─────────────────────────────────────────
  useEffect(() => {
    if (provider !== "YOUTUBE" || !lessonId) return;
    let cancelled = false;
    let player: YouTubePlayer | null = null;
    let timer: ReturnType<typeof setInterval> | null = null;

    void loadYouTubeApi().then((api) => {
      if (cancelled) return;
      const el = iframeRef.current;
      if (!api || !el) { setUnavailable(true); return; }

      try {
        player = new api.Player(el, {});
        setTracking(true);
        timer = setInterval(() => {
          try {
            const t = player?.getCurrentTime?.();
            if (typeof t === "number") onTime(t);
            const d = player?.getDuration?.();
            if (typeof d === "number") onDuration(d);
          } catch {
            // 播放器還沒 ready 時會丟。下一輪再試，不用處理
          }
        }, YOUTUBE_POLL_MS);
      } catch {
        setUnavailable(true);
      }
    });

    return () => {
      cancelled = true;
      if (timer) clearInterval(timer);
      try { player?.destroy?.(); } catch { /* 已經被 React 卸載掉了 */ }
    };
  }, [provider, lessonId, iframeRef, onTime, onDuration]);

  // ── Bunny（player.js 協定的一小段）──────────────────
  useEffect(() => {
    if (provider !== "BUNNY" || !lessonId) return;

    const el = iframeRef.current;
    if (!el) return;

    const send = (method: string, value?: string) => {
      el.contentWindow?.postMessage(
        JSON.stringify({ context: "player.js", version: "0.0.1", method, value }), "*");
    };

    const onMessage = (event: MessageEvent) => {
      // 只收這個 iframe 送來的
      if (event.source !== el.contentWindow) return;
      let payload: {
        context?: string; event?: string;
        value?: { seconds?: number; duration?: number };
      };
      try {
        payload = typeof event.data === "string" ? JSON.parse(event.data) : event.data;
      } catch { return; }
      if (payload?.context !== "player.js") return;

      if (payload.event === "ready") {
        setTracking(true);
        send("addEventListener", "timeupdate");
      }
      if (payload.event === "timeupdate" && typeof payload.value?.seconds === "number") {
        onTime(payload.value.seconds);
        // player.js 的 timeupdate 本來就帶 duration，不必另外問
        if (typeof payload.value.duration === "number") onDuration(payload.value.duration);
      }
    };

    window.addEventListener("message", onMessage);
    // 有些情況 ready 已經在我們掛上 listener 之前發生了，主動問一次
    send("addEventListener", "ready");
    send("addEventListener", "timeupdate");

    // 8 秒都沒有任何回應就當作接不上
    const giveUp = setTimeout(() => setTracking((t) => { if (!t) setUnavailable(true); return t; }), 8000);

    return () => {
      window.removeEventListener("message", onMessage);
      clearTimeout(giveUp);
    };
  }, [provider, lessonId, iframeRef, onTime, onDuration]);

  // ── 定期回報 ────────────────────────────────────────
  useEffect(() => {
    const timer = setInterval(flush, REPORT_INTERVAL_MS);
    // 關分頁／切走時補送一次，否則最後那一段會掉
    const onHide = () => { if (document.visibilityState === "hidden") flush(); };
    document.addEventListener("visibilitychange", onHide);
    window.addEventListener("pagehide", flush);

    return () => {
      clearInterval(timer);
      document.removeEventListener("visibilitychange", onHide);
      window.removeEventListener("pagehide", flush);
      flush();
    };
  }, [flush]);

  // 分頁切回來時重設基準點——切走那段時間播放器可能繼續跑，也可能沒有
  useEffect(() => {
    const onVisible = () => {
      if (document.visibilityState === "visible") {
        stateRef.current = resetAnchor(stateRef.current);
      }
    };
    document.addEventListener("visibilitychange", onVisible);
    return () => document.removeEventListener("visibilitychange", onVisible);
  }, []);

  return { watched, tracking, unavailable, duration };
}
