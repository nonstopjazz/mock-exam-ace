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

/** Bunny 的 player.js。只用得到 on / off */
interface PlayerJsPlayer {
  on: (event: string, cb: (data?: { seconds?: number; duration?: number }) => void) => void;
  off?: (event: string) => void;
}
interface PlayerJsApi {
  Player: new (el: HTMLElement | string) => PlayerJsPlayer;
}

declare global {
  interface Window {
    YT?: YouTubeApi;
    onYouTubeIframeAPIReady?: () => void;
    playerjs?: PlayerJsApi;
  }
}

/** 一次就好的腳本載入。失敗回 false，不要讓整頁等一個不會來的東西。 */
function loadScriptOnce(src: string, timeoutMs = 12000): Promise<boolean> {
  return new Promise((resolve) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${src}"]`);
    if (existing?.dataset.loaded === "1") { resolve(true); return; }

    const el = existing ?? document.createElement("script");
    el.src = src;
    el.async = true;
    const done = (ok: boolean) => { if (ok) el.dataset.loaded = "1"; resolve(ok); };
    el.addEventListener("load", () => done(true));
    el.addEventListener("error", () => done(false));
    if (!existing) document.head.appendChild(el);
    setTimeout(() => resolve(el.dataset.loaded === "1"), timeoutMs);
  });
}

/**
 * Bunny 官方的 player.js。
 *
 * 🛑 這裡原本是自己手刻 postMessage 協定。那個判斷是錯的：
 *    player.js 的 addEventListener 訊息要帶 listener 名稱，而 ready
 *    可能在我們掛上 listener 之前就發過了——官方 library 會處理這兩件事，
 *    手刻的版本兩個都漏掉，結果是「接不上」而畫面跳紅字警告。
 *
 *    三十行的規格看起來簡單，但看起來簡單不等於我實作對了。
 */
const BUNNY_PLAYERJS = "https://assets.mediadelivery.net/playerjs/playerjs-latest.min.js";
let bunnyApiPromise: Promise<PlayerJsApi | null> | null = null;

function loadBunnyApi(): Promise<PlayerJsApi | null> {
  if (bunnyApiPromise) return bunnyApiPromise;
  bunnyApiPromise = loadScriptOnce(BUNNY_PLAYERJS)
    .then((ok) => (ok ? window.playerjs ?? null : null));
  return bunnyApiPromise;
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
  /** tracking 的同步副本。setState 的 updater 不可以呼叫另一個 setState */
  const trackingRef = useRef(false);

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
    trackingRef.current = false;
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
        trackingRef.current = true;
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

  // ── Bunny（官方 player.js）──────────────────────────
  useEffect(() => {
    if (provider !== "BUNNY" || !lessonId) return;
    let cancelled = false;
    let giveUp: ReturnType<typeof setTimeout> | null = null;

    void loadBunnyApi().then((api) => {
      if (cancelled) return;
      const el = iframeRef.current;
      if (!api || !el) { setUnavailable(true); return; }

      try {
        const player = new api.Player(el);
        // library 會處理「ready 已經發過了」的情況，所以這裡不需要自己補問
        player.on("ready", () => {
          if (cancelled) return;
          trackingRef.current = true;
          setTracking(true);
          player.on("timeupdate", (data) => {
            if (typeof data?.seconds === "number") onTime(data.seconds);
            // player.js 的 timeupdate 本來就帶 duration，不必另外問
            if (typeof data?.duration === "number") onDuration(data.duration);
          });
        });

        // 🛑 用 ref 判斷，不要在 setState 的 updater 裡呼叫另一個 setState。
        //    updater 必須是純的——React 可以呼叫它一次以上。
        giveUp = setTimeout(() => {
          if (!cancelled && !trackingRef.current) setUnavailable(true);
        }, 10000);
      } catch {
        setUnavailable(true);
      }
    });

    return () => {
      cancelled = true;
      if (giveUp) clearTimeout(giveUp);
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
