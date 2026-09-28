/**
 * 「實際看了多久」的累計規則。
 *
 * 🛑 記的是【播放經過的秒數】，不是最遠位置。
 *    最遠位置擋不住任何東西——把進度條拖到最後，位置就是 100%。
 *
 * 做法：播放器每隔一下回報一次目前時間，跟上次相差在一個合理範圍內
 * 才當成「真的播過這段」。差太多就是拖曳或暫停後跳接，不計入。
 *
 * 沒有 React、沒有 DOM，所以規則可以直接測。
 */

export interface WatchState {
  /** 累計實際播放過的秒數 */
  watched: number;
  /** 上一次回報的播放位置。null = 還沒有基準點 */
  lastTime: number | null;
}

export const initialWatchState = (watched = 0): WatchState => ({
  watched: Math.max(0, Math.floor(watched) || 0),
  lastTime: null,
});

/**
 * 兩次回報之間最多算幾秒。
 *
 * 播放器大約每 250ms–1s 回報一次，所以正常播放的間隔遠小於這個值。
 * 設太大，拖曳會被算成觀看；設太小，分頁切走再切回來的正常播放會被丟掉。
 */
const MAX_STEP_SECONDS = 2;

/**
 * 收到一次時間回報。回傳新的狀態（不修改傳進來的那個）。
 *
 * 🛑 倒退（重看）不累加也不重置——它只是把基準點移過去。
 *    重看同一段本來就不該再算一次。
 */
export function accumulate(state: WatchState, currentTime: number): WatchState {
  if (!Number.isFinite(currentTime) || currentTime < 0) return state;

  if (state.lastTime === null) {
    return { watched: state.watched, lastTime: currentTime };
  }

  const delta = currentTime - state.lastTime;

  // 0 < delta <= 門檻 才算真的播過
  const gained = delta > 0 && delta <= MAX_STEP_SECONDS ? delta : 0;

  return {
    watched: state.watched + gained,
    lastTime: currentTime,
  };
}

/**
 * 暫停、換影片、拖曳之後要呼叫。
 *
 * 不清掉 watched，只清掉基準點——下一次回報會重新建立基準，
 * 中間那一段（暫停的時間、拖過去的距離）就不會被算進來。
 */
export const resetAnchor = (state: WatchState): WatchState =>
  ({ watched: state.watched, lastTime: null });

/** 要送給伺服器的整數秒 */
export const reportable = (state: WatchState): number =>
  Math.max(0, Math.floor(state.watched));

/** 還差幾秒才到門檻。已達成回 0 */
export function remainingSeconds(watched: number, threshold: number): number {
  if (!Number.isFinite(threshold) || threshold <= 0) return 0;
  const w = Number.isFinite(watched) ? Math.max(0, watched) : 0;
  return Math.max(0, Math.ceil(threshold - w));
}

/** 觀看進度的百分比，給進度條用 */
export function watchPercent(watched: number, threshold: number): number {
  if (!Number.isFinite(threshold) || threshold <= 0) return 0;
  const w = Number.isFinite(watched) ? Math.max(0, watched) : 0;
  return Math.min(100, Math.round((w / threshold) * 100));
}
