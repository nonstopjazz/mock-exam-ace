/**
 * 進度 map 的 key 一致性檢查（不需要網路、不需要資料庫）
 *
 *   npm run verify:word-progress-key
 *
 * 為什麼要有這一支
 *
 *   2026-09-24 在 production 確認：題庫單字的熟練度永遠停在第一次。
 *   原因是載入端把 pack 的列放在 `pack:{pack_id}:{word_id}`，
 *   而寫入端（vocabularyStore）一直用【裸的 word_id】查與寫。
 *   查不到 → 從 0 重算 → 把「複習次數 1」覆蓋回伺服器。
 *
 *   這是那種讀程式碼看不出來、跑起來也不會報錯的 bug：
 *   兩邊各自都對，只是講的不是同一種話。所以要有一條斷言把它釘住。
 *
 * 🛑 K1 是這裡唯一真正重要的一條：
 *    fetchAllWordProgress 回傳的 key【必須】逐字等於 word_id。
 *    任何前綴、命名空間、複合 key 都會讓寫入端再也找不到進度。
 *    要改 key 的形狀，就必須同時改 vocabularyStore 的每一個讀寫點，
 *    而那不是一行能改完的事。
 */

import { toWordProgressMap, type WordProgressRow } from "../src/lib/wordProgressMap";

let failures = 0;

function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    console.error(`FAIL  ${label}`);
    failures += 1;
  }
}

const LEVEL_ID = "4448";                                    // level_words.id 是短數字字串
const PACK_ITEM_ID = "96e9604d-ceaf-4d30-a80c-60dbccd7994a"; // pack_items.id 是 UUID
const PACK_ID = "fb2ad8ad-1c74-46ef-90af-15fb1ccfa13c";

function main(): void {
  // ── K1：key 必須就是 word_id ─────────────────────────────
  {
    const map = toWordProgressMap([
        {
          word_id: LEVEL_ID, mastery_level: 3, next_review_time: 1, review_count: 5,
          correct_count: 4, last_review_time: 1, source: "level", pack_id: null,
        },
        {
          word_id: PACK_ITEM_ID, mastery_level: 2, next_review_time: 2, review_count: 7,
          correct_count: 6, last_review_time: 2, source: "pack", pack_id: PACK_ID,
        },
    ]);

    check(Object.keys(map).sort().join("|") === [LEVEL_ID, PACK_ITEM_ID].sort().join("|"),
      "K1 map 的 key 就是 word_id 本身（level 與 pack 都是）");
    check(
      Object.keys(map).every((k) => !k.includes(":")),
      "K1 沒有任何 key 帶前綴 —— 帶了寫入端就查不到",
    );

    // 這兩條是【模擬寫入端的查法】。vocabularyStore.updateWordProgress 與
    // getWordProgress 都是 state.wordProgress[wordId]，就是這樣查的。
    check(map[PACK_ITEM_ID]?.reviewCount === 7,
      "K2 用裸的 pack item id 查得到進度（這正是 2026-09-24 壞掉的那一條）");
    check(map[LEVEL_ID]?.reviewCount === 5, "K2 用裸的 level word id 也查得到");
  }

  // ── K3：欄位有正確帶過去 ─────────────────────────────────
  {
    const map = toWordProgressMap([{
        word_id: PACK_ITEM_ID, mastery_level: 2, next_review_time: "1758000000000",
        review_count: 7, correct_count: 6, last_review_time: "1758000000001",
        source: "pack", pack_id: PACK_ID,
    }]);
    const p = map[PACK_ITEM_ID];
    check(p?.source === "pack" && p?.packId === PACK_ID,
      "K3 source 與 packId 有保留（寫回時還要用它們決定衝突鍵）");
    check(typeof p?.nextReviewTime === "number" && p.nextReviewTime === 1758000000000,
      "K3 BIGINT 以字串回來時有轉成 number");
    check(p?.lastReviewTime === 1758000000001, "K3 lastReviewTime 同樣轉成 number");
  }

  // ── K4：空輸入 ───────────────────────────────────────────
  //
  // ⚠️ 這裡【沒有】涵蓋 RPC 失敗或 success:false 的路徑——那段在
  //    fetchAllWordProgress 裡，而那個模組會 import supabase，
  //    在 node 下跑不起來。這一條只證明空陣列進去會得到空物件。
  {
    const empty = toWordProgressMap([]);
    check(Object.keys(empty).length === 0, "K4 空陣列回空物件（非 undefined）");
  }

  // ── K5：last_review_time 為 0 / null 時不能變成 0 以外的東西 ──
  {
    const map = toWordProgressMap([{
        word_id: LEVEL_ID, mastery_level: 0, next_review_time: 0, review_count: 0,
        correct_count: 0, last_review_time: null, source: "level", pack_id: null,
    }]);
    check(map[LEVEL_ID]?.lastReviewTime === null, "K5 last_review_time 為 null 時保持 null");
  }

  console.log("");
  if (failures > 0) {
    console.error(`${failures} 項未通過`);
    process.exit(1);
  }
  console.log("全部通過");
}

main();
