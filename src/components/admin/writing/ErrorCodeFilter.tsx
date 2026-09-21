import { Check, ChevronsUpDown, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Command, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList,
} from "@/components/ui/command";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { ERROR_TAGS, ERROR_TAG_BY_CODE } from "@/lib/writing/taxonomy";

/**
 * 錯誤碼複選。
 *
 * 選項一律從 ERROR_TAGS 來，中文標籤走 ERROR_TAG_BY_CODE —— 不自己寫字串，
 * taxonomy 變動時這裡會跟著動。
 *
 * ⚠️ WRITE_ERR_GRAMMAR_OTHER 照常列出，只在旁邊標「其他」。
 *    它是已知被濫用的 fallback（production 佔全部 findings 的 11%），
 *    但老師的需求是「不要漏掉任何錯」，所以【標記而不隱藏】。
 */

interface Props {
  value: string[];
  onChange: (codes: string[]) => void;
  /** 每個 code 在目前範圍內的作文數，用來在選單裡顯示規模 */
  counts?: Map<string, number>;
}

export function ErrorCodeFilter({ value, onChange, counts }: Props) {
  const selected = new Set(value);

  function toggle(code: string) {
    const next = new Set(selected);
    if (next.has(code)) next.delete(code);
    else next.add(code);
    onChange([...next]);
  }

  return (
    <div className="min-w-0">
      <Popover>
        <PopoverTrigger asChild>
          <Button
            variant="outline"
            role="combobox"
            className="w-full justify-between font-normal"
          >
            <span className="truncate">
              {value.length === 0 ? "所有錯誤類型" : `已選 ${value.length} 種錯誤`}
            </span>
            <ChevronsUpDown className="h-4 w-4 shrink-0 opacity-50" />
          </Button>
        </PopoverTrigger>
        <PopoverContent className="w-[min(22rem,calc(100vw-2rem))] p-0" align="start">
          <Command>
            <CommandInput placeholder="搜尋錯誤類型…" />
            <CommandList>
              <CommandEmpty>找不到符合的錯誤類型</CommandEmpty>
              <CommandGroup>
                {ERROR_TAGS.map((tag) => {
                  const n = counts?.get(tag.code);
                  return (
                    <CommandItem
                      key={tag.code}
                      value={`${tag.zh} ${tag.code}`}
                      onSelect={() => toggle(tag.code)}
                      // 鍵盤停在哪一列，那一列就整條變 accent（terracotta）。
                      // 底下兩個灰字在那個底色上會讀不到，所以跟著翻成 accent-foreground。
                      className="group gap-2"
                    >
                      <Check
                        className={`h-4 w-4 shrink-0 ${
                          selected.has(tag.code) ? "opacity-100" : "opacity-0"
                        }`}
                      />
                      <span className="truncate">{tag.zh}</span>
                      {tag.code === "WRITE_ERR_GRAMMAR_OTHER" ? (
                        <Badge
                          variant="outline"
                          className="ml-1 text-[10px] font-normal shrink-0 group-data-[selected=true]:text-accent-foreground group-data-[selected=true]:border-accent-foreground/40"
                        >
                          其他
                        </Badge>
                      ) : null}
                      {n !== undefined ? (
                        <span className="ml-auto text-xs text-muted-foreground shrink-0 group-data-[selected=true]:text-accent-foreground">
                          {n} 篇
                        </span>
                      ) : null}
                    </CommandItem>
                  );
                })}
              </CommandGroup>
            </CommandList>
          </Command>
        </PopoverContent>
      </Popover>

      {value.length > 0 ? (
        <div className="flex flex-wrap items-center gap-1.5 mt-2">
          {value.map((code) => (
            <Badge
              key={code}
              variant="outline"
              className="text-xs font-normal bg-primary/10 border-primary/20"
            >
              {ERROR_TAG_BY_CODE.get(code)?.zh ?? code}
              <button
                type="button"
                onClick={() => toggle(code)}
                className="ml-1 rounded-sm hover:text-foreground focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                aria-label={`取消選取 ${ERROR_TAG_BY_CODE.get(code)?.zh ?? code}`}
              >
                <X className="h-3 w-3" />
              </button>
            </Badge>
          ))}
          <Button
            variant="ghost"
            size="sm"
            className="h-6 px-2 text-xs text-muted-foreground"
            onClick={() => onChange([])}
          >
            清除
          </Button>
        </div>
      ) : null}
    </div>
  );
}
