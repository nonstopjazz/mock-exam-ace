/**
 * 登入後的預設落點。
 *
 * 兩個登入路徑（帳密表單、Google OAuth 回呼）以前各自寫死
 * '/practice/vocabulary'，改一個忘一個就會行為不一致，所以集中在這裡。
 *
 * `returnUrl` 一律優先：被 ProtectedRoute 攔下來的人，登入後要回到他原本
 * 想去的地方，不是被丟到首頁。這裡只是「沒有指定去處」時的預設值。
 */
export const POST_LOGIN_LANDING = "/learn/student";
