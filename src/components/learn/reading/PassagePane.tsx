import { useState } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, ChevronUp } from "lucide-react";
import type { ReadingPassage } from "@/lib/reading/studentTypes";

/**
 * 文章。桌機常駐在左邊並跟著捲動；手機可以收起來。
 *
 * 🛑 手機【預設是展開的】。收合是為了讓學生答題時把文章推開，
 *    不是為了讓他一進來就看不到文章——閱讀測驗的第一件事是讀文章。
 */
export function PassagePane({ passage }: { passage: ReadingPassage }) {
  const [open, setOpen] = useState(true);

  const paragraphs = passage.passage_text
    .split(/\n{2,}|\r\n{2,}/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  return (
    <Card className="p-6 lg:sticky lg:top-6">
      <div className="flex items-start justify-between gap-2 mb-3">
        <div className="min-w-0">
          <h2 className="font-semibold text-foreground text-lg leading-snug">
            {passage.title}
          </h2>
          <div className="flex flex-wrap items-center gap-2 mt-2">
            {passage.cefr_level && (
              <Badge variant="secondary" className="text-xs">{passage.cefr_level}</Badge>
            )}
            {passage.content_family && (
              <Badge variant="outline" className="text-xs">{passage.content_family}</Badge>
            )}
            {passage.word_count !== null && (
              <span className="text-xs text-muted-foreground">
                約 {passage.word_count} 字
              </span>
            )}
          </div>
        </div>
        {/* 收合只在手機出現——桌機兩欄並排，沒有收起來的理由 */}
        <Button
          variant="ghost"
          size="sm"
          className="lg:hidden shrink-0 gap-1"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
        >
          {open ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
          {open ? "收起" : "展開"}
        </Button>
      </div>

      <div className={open ? "block" : "hidden lg:block"}>
        <div className="space-y-4 lg:max-h-[calc(100vh-12rem)] lg:overflow-y-auto lg:pr-2">
          {paragraphs.map((p, i) => (
            <p key={i} className="text-foreground leading-relaxed">{p}</p>
          ))}
        </div>
        {/* 🛑 文章結尾【再放一次】收起按鈕。手機上文章佔好幾個畫面高，
            讀完人就在這裡——要他捲回最上面才能收起來，等於沒有收合功能。 */}
        <Button
          variant="outline"
          size="sm"
          className="lg:hidden mt-6 w-full gap-1"
          onClick={() => setOpen(false)}
        >
          <ChevronUp className="h-4 w-4" />
          收起文章，開始作答
        </Button>
      </div>
      {!open && (
        <p className="text-sm text-muted-foreground lg:hidden">
          文章收起來了。需要回頭看時按「展開」。
        </p>
      )}
    </Card>
  );
}
