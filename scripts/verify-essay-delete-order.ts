/**
 * 草稿刪除順序的自我檢查（不需要網路，也不需要資料庫）
 *
 *   npm run verify:essay-delete-order
 *
 * 這支端點存在的【唯一理由】是順序：先刪 Storage 的檔案，全部成功才刪資料列。
 * 反過來的話，writing_submissions 那一列一消失，writing_images 跟著 cascade，
 * bucket 裡的照片就再也沒有人找得到 —— 連每天的清理工作都掃不到。
 *
 * 所以這裡用受控替身證明四件讀程式碼保證不了的事：
 *
 *   D1 成功時：檔案的 remove() 一定發生在資料列的 delete() 【之前】
 *   D2 檔案刪不掉時：資料列【不能】被刪掉（寧可留著也不要製造孤兒檔案）
 *   D3 刪資料列時一定帶 status = DRAFT 的條件（競態保險）
 *   D4 兩個 bucket 都要清：raw 與 archive 少刪任何一邊都算失敗
 *
 * 🛑 D2 是這裡最重要的一條。一個「先刪列、再盡力刪檔」的實作會通過 D1 以外的
 *    所有檢查，而那正是這支端點要避免的行為。
 */

import { deleteDraftEssay } from "../api/writing-essay-delete";

let failures = 0;

function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    console.error(`FAIL  ${label}`);
    failures += 1;
  }
}

const ESSAY_ID = "aaaaaaaa-bbbb-cccc-dddd-eeeeeeeeeeee";

interface Journal {
  events: string[];
  deleteFilters: Record<string, unknown>;
}

/**
 * 只實作這支端點會用到的部分：from().select().eq()、from().delete().eq().eq()、
 * storage.from().remove()。刻意不是完整的 SupabaseClient。
 *
 * @param images      writing_images 要回傳的列
 * @param removeError 指定哪一個 bucket 的 remove() 要失敗
 */
function fakeClient(
  journal: Journal,
  images: Array<{ raw_path: string | null; archive_path: string | null }>,
  removeError?: { bucket: string; message: string },
) {
  return {
    from(table: string) {
      return {
        select() {
          return {
            eq() {
              journal.events.push(`select:${table}`);
              return Promise.resolve({
                data: images.map((i) => ({
                  ...i,
                  raw_deleted_at: null,
                  archive_deleted_at: null,
                })),
                error: null,
              });
            },
          };
        },
        delete() {
          const filters: Record<string, unknown> = {};
          const chain = {
            eq(column: string, value: unknown) {
              filters[column] = value;
              // 最後一個 eq 才是真正送出去的那一刻。這裡每次都更新，
              // 讓 journal 記到的是完整的條件組合。
              journal.deleteFilters = filters;
              return chainThenable;
            },
          };
          const chainThenable = Object.assign(chain, {
            then(resolve: (v: unknown) => void) {
              journal.events.push(`delete:${table}`);
              resolve({ error: null });
            },
          });
          return chain;
        },
      };
    },
    storage: {
      from(bucket: string) {
        return {
          remove(paths: string[]) {
            journal.events.push(`remove:${bucket}`);
            if (removeError && removeError.bucket === bucket) {
              return Promise.resolve({ data: null, error: { message: removeError.message } });
            }
            return Promise.resolve({ data: paths.map((p) => ({ name: p })), error: null });
          },
        };
      },
    },
  } as never;
}

/** 這支端點在失敗路徑會 console.error，測試時不要污染輸出。 */
function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  return fn().finally(() => {
    console.error = original;
  });
}

async function main(): Promise<void> {
  // ── D1 + D4：正常路徑 ────────────────────────────────────────
  {
    const journal: Journal = { events: [], deleteFilters: {} };
    const outcome = await deleteDraftEssay(
      fakeClient(journal, [
        { raw_path: "u/1.jpg", archive_path: "u/1-arch.jpg" },
        { raw_path: "u/2.jpg", archive_path: "u/2-arch.jpg" },
      ]),
      ESSAY_ID,
    );

    const rawAt = journal.events.indexOf("remove:writing-raw");
    const archiveAt = journal.events.indexOf("remove:writing-archive");
    const deleteAt = journal.events.indexOf("delete:writing_submissions");

    check(outcome.ok, "D1 正常情況下刪除成功");
    check(rawAt !== -1 && archiveAt !== -1, "D4 raw 與 archive 兩個 bucket 都清了");
    check(
      deleteAt !== -1 && rawAt < deleteAt && archiveAt < deleteAt,
      "D1 兩個 bucket 的 remove() 都發生在 delete() 之前",
    );
    check(
      outcome.ok && outcome.files.removed === 4,
      `D4 回報刪掉 4 個檔案（實際 ${outcome.ok ? outcome.files.removed : "—"}）`,
    );
  }

  // ── D2：檔案刪不掉 → 資料列必須留著 ──────────────────────────
  for (const bucket of ["writing-raw", "writing-archive"]) {
    const journal: Journal = { events: [], deleteFilters: {} };
    const outcome = await quiet(() =>
      deleteDraftEssay(
        fakeClient(
          journal,
          [{ raw_path: "u/1.jpg", archive_path: "u/1-arch.jpg" }],
          { bucket, message: "storage exploded" },
        ),
        ESSAY_ID,
      ),
    );

    check(!outcome.ok, `D2 ${bucket} 刪檔失敗時，整個刪除失敗`);
    check(
      !journal.events.includes("delete:writing_submissions"),
      `D2 ${bucket} 刪檔失敗時【沒有】刪掉資料列`,
    );
    check(
      !outcome.ok && outcome.status === 502,
      `D2 ${bucket} 刪檔失敗回 502（不是 500，這是下游的問題）`,
    );
  }

  // ── D3：刪資料列時帶 DRAFT 條件 ──────────────────────────────
  {
    const journal: Journal = { events: [], deleteFilters: {} };
    await deleteDraftEssay(fakeClient(journal, [{ raw_path: "u/1.jpg", archive_path: null }]), ESSAY_ID);
    check(journal.deleteFilters.id === ESSAY_ID, "D3 delete 有指定 essay id");
    check(
      journal.deleteFilters.status === "DRAFT",
      "D3 delete 有帶 status = DRAFT（中途被送出就不會刪到）",
    );
  }

  // ── 沒有照片的文字草稿也要刪得掉 ─────────────────────────────
  {
    const journal: Journal = { events: [], deleteFilters: {} };
    const outcome = await deleteDraftEssay(fakeClient(journal, []), ESSAY_ID);
    check(outcome.ok, "文字草稿（沒有任何照片）也刪得掉");
    check(
      outcome.ok && outcome.files.removed === 0 && outcome.files.missing === 0,
      "文字草稿回報 0 個檔案，不是錯誤",
    );
  }

  console.log("");
  if (failures > 0) {
    console.error(`${failures} 項未通過`);
    process.exit(1);
  }
  console.log("全部通過");
}

void main();
