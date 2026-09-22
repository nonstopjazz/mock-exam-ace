# 技術債：`analysisContract.ts` 的 taxonomy 數字已過時

> 發現於 2026-09-21，Phase 1A 第 1 批的 staging 驗證過程中。
> **獨立項目，不要混進 Phase 1A 的 migration。**
> 狀態：**已處理**（2026-09-22，見本文最後一節）

---

## 一句話

程式碼實際處理 **17** 個 error code，但檔案裡有 **7 處**還寫著 16（或 15）。
其中 **1 處會逐字送進模型的重試提示**，所以不只是註解錯字。

---

## 事實依據

`ALL_ERROR_CODES` 來自 `ERROR_TAGS.map(e => e.code)`（`taxonomy.ts:1383`），
而 `ERROR_TAGS` 目前是 **17** 個。已於 2026-09-20 與 production 實際出現的 code 逐一比對過，
兩邊完全一致，沒有任何一邊多出或少掉。

`deriveErrorCoverage()` 直接 `ALL_ERROR_CODES.map(...)`，所以它**回傳 17 筆**，
但它自己的 docstring 說「一定回傳 16 筆」。

staging 的真實資料也印證了這個轉換點：

| taxonomy | coverage 項數 | `coverage_source` |
|---|---|---|
| `writing-v1` | **16** | 無 |
| `writing-v2` | **17** | `SERVER_DERIVED` |

也就是說 16 是 v1 時代的數字，v2 之後就不對了，但文字沒跟著改。

---

## 七處

| # | 位置 | 現況 | 應為 | 嚴重度 |
|---|---|---|---|---|
| 1 | `analysisContract.ts:125` | 「全 **16** 個 code 都必須出現」 | 17 | 註解 |
| 2 | `:628` | 「一份 **16** 個 code 的 coverage」 | 17 | 註解 |
| 3 | `:637` | 「建出 **16** 個 code 的完整 coverage」 | 17 | 註解 |
| 4 | `:639` | 「**16** 個 code 一定全部到齊」 | 17 | 註解 |
| 5 | **`:715`** | 「說明為什麼其他 **15** 個具體類別都不適用」 | **16** | 🔴 **會進模型提示** |
| 6 | `:876` | 「建出 **16** 個 canonical error code」 | 17 | 註解 |
| 7 | `:878` | 「一定回傳 **16** 筆」 | 17 | 註解 |

另外 `:706` 附近還有一句註解「寫不出『為什麼其他 **15** 類都不適用』」，
與第 5 項是同一件事的說明，要一起改。

---

## 🔴 為什麼第 5 項不只是註解

`:715` 是 `MISSING_JUSTIFICATION` 這個 `ValidationIssue` 的 `detail` 字串。
驗證失敗時，`runValidatedPass()` 會把 issues 交給 `repairInstruction()`：

```ts
// deepseek.ts:262
lines.push("", "【其他格式問題】",
  ...others.map((i) => `  - [${i.kind}] ${i.path}：${i.detail}`));
```

而這個字串會以 `{ role: "user", content: repairInstruction(result.issues) }`
（`deepseek.ts:395`）**原封不動送回模型**。

所以每當模型用了 `WRITE_ERR_GRAMMAR_OTHER` 卻沒附 `fallback_rationale`，
重試提示就會告訴它「其他 **15** 個具體類別」—— 但實際上有 **16** 個。

⚠️ 我沒有量測過這會不會實際影響模型的判斷。**可能完全沒差**，
但這是一個「我們主動餵給模型的錯誤事實」，沒有理由留著。

---

## 建議的修法

1. 註解（1–4、6、7）直接改成 17。
2. 第 5 項改成 16。
3. **更好的做法**：不要寫死數字，改成從 `ALL_ERROR_CODES.length` 算出來 ——
   ```ts
   `說明為什麼其他 ${ALL_ERROR_CODES.length - 1} 個具體類別都不適用`
   ```
   這樣 taxonomy 再變動時不會又漏掉一處。註解沒辦法這樣做，但那一處是真的字串。

---

## 範圍與風險

- **不動任何邏輯**，只改文字與一個模板字串
- **不動 taxonomy 本身**，17 個 code 一個都不變
- `npm run verify:writing-contract` 與 `verify:writing-passes` 必須維持通過
- ⚠️ 改 `:715` 會改變送給模型的文字 → 建議在 staging 實際跑一次分析確認沒有副作用
- 🛑 **不要與 Phase 1A 的 migration 放在同一個 commit** ——
  一個是資料層 rollout，一個是 AI 契約的文字修正，混在一起會讓兩邊都難以回滾

---

## 處理記錄（2026-09-22）

修法用的是上面建議的第 3 種，而不是把 16 改成 17：

* **第 5 項（`:715`，會進模型提示的那一處）** 改成
  `` `說明為什麼其他 ${ALL_ERROR_CODES.length - 1} 個具體類別都不適用` ``。
  現在算出來是 16（17 個 code 扣掉 fallback 自己），taxonomy 再變動也不會再錯一次。
  旁邊留了註解說明這個字串會被送回模型，避免下一個人又把它寫死。
* **其餘六處註解**不改成 17，而是拿掉數字（「全部 canonical code」、
  「一定回傳 `ALL_ERROR_CODES.length` 筆」）。註解沒辦法用模板字串，
  但也沒有任何理由需要在註解裡重述一個會變的數字 —— 寫死多少都只是
  下一次過時的起點。

**沒有動任何邏輯，沒有動 taxonomy。**

驗證：

| 檢查 | 結果 |
|---|---|
| `npm run verify:writing-contract` | 72 / 72 通過 |
| `npm run verify:writing-passes` | 91 / 91 通過 |
| `tsc --noEmit` | 乾淨 |
| `npm run build` | 成功 |

⚠️ **還沒做的**：實際跑一次分析確認新的重試提示沒有副作用。
上面的建議是「在 staging 跑一次」，這件事還沒做 —— 這次改的是模型看得到的字串，
靜態檢查全過不等於模型的反應沒變。下一次有分析跑過 `MISSING_JUSTIFICATION`
的重試路徑時值得看一眼 Vercel log。
