/**
 * 口說練習的前端設定
 *
 * 錄音相關的上限在三個地方各擋一次：這裡（前端）、speaking_register_recording
 * （資料庫）、以及 bucket 的 file_size_limit。與拍照作文同一個原則——
 * 前端可以被繞過，bucket 那層繞不過。
 */

/** 私有 bucket。播放一律走 signed URL，沒有公開網址。 */
export const BUCKET = "speaking-recordings";

/** 開放控制用的功能代號。與 learn_feature_access.feature 的值一致。 */
export const FEATURE = "speaking";

/**
 * 單次錄音上限 3 分鐘。
 *
 * IELTS Part 2 講滿是 2 分鐘，Part 3 一題也很少超過 2 分鐘。留 3 分鐘是給
 * 「講完才發現還沒按停止」的餘裕，不是鼓勵講更久——時間到會自動停，
 * 學生不會錄了十分鐘才發現傳不上去。
 */
export const MAX_RECORD_SECONDS = 180;

/** 低於這個秒數視為誤觸，不讓上傳。 */
export const MIN_RECORD_SECONDS = 3;

/** 與 bucket 的 file_size_limit 一致（20 MB）。 */
export const MAX_UPLOAD_BYTES = 20 * 1024 * 1024;

/** 錄音檔保存天數。與 speaking_cleanup_candidates 裡的 90 天一致。 */
export const RETENTION_DAYS = 90;

/** 播放用 signed URL 的有效期（秒）。畫面會即時取得，短一點沒關係。 */
export const SIGNED_URL_TTL_SECONDS = 600;
