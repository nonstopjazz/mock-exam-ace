/**
 * 重傳單頁的自我檢查（不需要網路，也不需要資料庫）
 *
 *   npm run verify:image-replace
 *
 * 這支端點用 service-role 寫入，也就是【繞過 RLS】。所以平常由資料庫守住的
 * 規則，在這條路上都必須自己守。用受控替身證明六件事：
 *
 *   R1 路徑不在「作文擁有者/這篇作文/」底下就拒絕，而且【不動任何資料】
 *   R2 路徑不符時【不刪那個檔案】—— 它可能是別人的
 *   R3 上傳被截斷（大小對不上）→ 拒絕，並把半吊子的新檔案收掉
 *   R4 換頁成功時，舊的封存圖欄位【一定被清掉】
 *   R5 更新資料列【在】刪舊檔案之前
 *   R6 更新失敗時，剛上傳的新檔案要收掉（不留孤兒）
 *
 * 🛑 R4 最容易被忽略也最難發現：舊封存圖留著的話，那一頁會同時宣稱
 *    「未處理」與「已經有封存圖」，而辨識讀的正是封存圖 ——
 *    結果是換了照片，辨識出來的還是舊的那一張。
 */

import { replaceImagePage, type ReplaceInput } from "../api/writing-image-replace";

let failures = 0;

function check(cond: boolean, label: string): void {
  if (cond) {
    console.log(`PASS  ${label}`);
  } else {
    console.error(`FAIL  ${label}`);
    failures += 1;
  }
}

const OWNER = "11111111-1111-1111-1111-111111111111";
const ESSAY = "22222222-2222-2222-2222-222222222222";
const NEW_PATH = `${OWNER}/${ESSAY}/1-new.jpg`;

interface Journal {
  events: string[];
  removed: string[];
  update: Record<string, unknown> | null;
}

function baseInput(over: Partial<ReplaceInput> = {}): ReplaceInput {
  return {
    essayId: ESSAY,
    pageNumber: 1,
    rawPath: NEW_PATH,
    rawBytes: 1000,
    rawMime: "image/jpeg",
    ownerId: OWNER,
    ...over,
  };
}

/**
 * 替身。
 * @param storedBytes  Storage 回報的新檔案大小（null = 檔案不存在）
 * @param existing     writing_images 現有那一列（null = 找不到）
 * @param updateFails  讓 update 失敗
 */
function fakeClient(
  journal: Journal,
  storedBytes: number | null,
  existing: { id: string; raw_path: string | null; archive_path: string | null } | null,
  updateFails = false,
) {
  return {
    from() {
      return {
        select() {
          const chain = {
            eq: () => chain,
            maybeSingle: () => {
              journal.events.push("select:writing_images");
              return Promise.resolve({ data: existing, error: null });
            },
          };
          return chain;
        },
        update(patch: Record<string, unknown>) {
          return {
            eq: () => {
              journal.events.push("update:writing_images");
              journal.update = patch;
              return Promise.resolve({
                error: updateFails ? { message: "update exploded" } : null,
              });
            },
          };
        },
      };
    },
    storage: {
      from(bucket: string) {
        return {
          list: (_dir: string, opts: { search: string }) => {
            const name = opts.search;
            if (storedBytes === null) return Promise.resolve({ data: [], error: null });
            return Promise.resolve({
              data: [{ name, metadata: { size: storedBytes } }],
              error: null,
            });
          },
          remove: (paths: string[]) => {
            journal.events.push(`remove:${bucket}`);
            journal.removed.push(...paths);
            return Promise.resolve({ data: paths.map((p) => ({ name: p })), error: null });
          },
        };
      },
    },
  } as never;
}

const fresh = (): Journal => ({ events: [], removed: [], update: null });

function quiet<T>(fn: () => Promise<T>): Promise<T> {
  const original = console.error;
  console.error = () => {};
  return fn().finally(() => {
    console.error = original;
  });
}

async function main(): Promise<void> {
  const OLD_RAW = `${OWNER}/${ESSAY}/1-old.jpg`;
  const OLD_ARCHIVE = `${OWNER}/${ESSAY}/1-old-arch.jpg`;
  const row = { id: "img-1", raw_path: OLD_RAW, archive_path: OLD_ARCHIVE };

  // ── R1 + R2：路徑不屬於這篇作文 ──────────────────────────────
  {
    const j = fresh();
    const outcome = await replaceImagePage(
      fakeClient(j, 1000, row),
      baseInput({ rawPath: "99999999-9999-9999-9999-999999999999/other/1.jpg" }),
    );
    check(!outcome.ok && outcome.status === 403, "R1 路徑不符 → 403");
    check(j.update === null, "R1 路徑不符時沒有改到任何資料列");
    check(j.removed.length === 0, "R2 路徑不符時【沒有】刪那個檔案（可能是別人的）");
  }

  // ── R3：上傳被截斷 ──────────────────────────────────────────
  {
    const j = fresh();
    const outcome = await replaceImagePage(fakeClient(j, 400, row), baseInput({ rawBytes: 1000 }));
    check(!outcome.ok && outcome.status === 400, "R3 大小對不上 → 400");
    check(j.update === null, "R3 截斷時沒有換頁");
    check(j.removed.includes(NEW_PATH), "R3 截斷的新檔案被收掉");
  }

  // 找不到新檔案
  {
    const j = fresh();
    const outcome = await replaceImagePage(fakeClient(j, null, row), baseInput());
    check(!outcome.ok && outcome.status === 400, "找不到剛上傳的檔案 → 400");
    check(j.update === null, "找不到檔案時沒有換頁");
  }

  // ── R4 + R5：正常換頁 ───────────────────────────────────────
  {
    const j = fresh();
    const outcome = await replaceImagePage(fakeClient(j, 1000, row), baseInput());
    check(outcome.ok, "正常情況下換頁成功");
    check(j.update?.raw_path === NEW_PATH, "R4 資料列指向新檔案");
    check(j.update?.state === "UPLOADED", "R4 狀態回到 UPLOADED（下次處理會重跑這一頁）");
    check(j.update?.error_code === null, "R4 舊的錯誤碼被清掉");
    check(
      j.update?.archive_path === null && j.update?.archive_verified_at === null,
      "R4 舊的封存圖欄位被清掉（否則辨識會讀到上一張照片）",
    );

    const updateAt = j.events.indexOf("update:writing_images");
    const firstRemove = j.events.findIndex((e) => e.startsWith("remove:"));
    check(
      updateAt !== -1 && firstRemove !== -1 && updateAt < firstRemove,
      "R5 先更新資料列，才刪舊檔案",
    );
    check(
      j.removed.includes(OLD_RAW) && j.removed.includes(OLD_ARCHIVE),
      "R5 舊原檔與舊封存圖都刪掉了",
    );
    check(!j.removed.includes(NEW_PATH), "R5 新檔案沒有被誤刪");
  }

  // ── R6：更新失敗 → 收掉新檔案 ───────────────────────────────
  {
    const j = fresh();
    const outcome = await quiet(() =>
      replaceImagePage(fakeClient(j, 1000, row, true), baseInput()),
    );
    check(!outcome.ok && outcome.status === 500, "R6 更新失敗 → 500");
    check(j.removed.includes(NEW_PATH), "R6 更新失敗時把新檔案收掉，不留孤兒");
    check(!j.removed.includes(OLD_RAW), "R6 更新失敗時【不】刪舊檔案（那一頁還指著它）");
  }

  // 找不到這一頁
  {
    const j = fresh();
    const outcome = await replaceImagePage(fakeClient(j, 1000, null), baseInput());
    check(!outcome.ok && outcome.status === 404, "找不到這一頁 → 404");
    check(j.removed.includes(NEW_PATH), "找不到這一頁時也要收掉新檔案");
  }

  console.log("");
  if (failures > 0) {
    console.error(`${failures} 項未通過`);
    process.exit(1);
  }
  console.log("全部通過");
}

void main();
