/**
 * 寫作分類法 —— 前端入口。
 *
 * 唯一真實來源在 api/_lib/taxonomy.ts。這裡只是 re-export，讓前端維持
 * `@/lib/writing/taxonomy` 這個乾淨的 import 路徑。
 *
 * 方向不能反過來：Vercel 的 Node builder 打包 serverless function 時，
 * import 到 api/ 目錄外面會讓 function 在載入階段就崩潰
 * （FUNCTION_INVOCATION_FAILED）。所以共用模組必須住在 api/_lib/。
 */
export * from "../../../api/_lib/taxonomy";
