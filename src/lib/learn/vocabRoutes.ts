/**
 * 既有字卡系統的入口。Dashboard 只做摘要與導流，不重建 library。
 *
 * （原本住在 studentDashboardMock.ts 裡，但它是真實路由而不是示範資料，
 *   所以在移除 mock 的時候搬到這裡。）
 */
export const VOCAB_ROUTES = {
  review: "/practice/vocabulary/srs",
  library: "/practice/vocabulary/collections",
  hub: "/practice/vocabulary",
} as const;
