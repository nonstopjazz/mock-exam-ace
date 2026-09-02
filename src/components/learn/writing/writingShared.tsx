import { Loader2, PenLine } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import type { EssayStatus } from "@/types/writing";

/** 寫作頁共用的頁首（沿用站上既有的「色塊圖示 + 標題 + 副標」樣式） */
export function WritingPageHeader({
  title,
  subtitle,
  action,
}: {
  title: string;
  subtitle: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="mb-8 flex items-center justify-between gap-2">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 md:p-3 rounded-lg bg-primary/10 shrink-0">
          <PenLine className="h-6 w-6 md:h-8 md:w-8 text-primary" />
        </div>
        <div className="min-w-0">
          <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">{title}</h1>
          <p className="text-sm md:text-base text-muted-foreground hidden sm:block">{subtitle}</p>
        </div>
      </div>
      {action ? <div className="shrink-0">{action}</div> : null}
    </div>
  );
}

export function WritingLoading({ label = "載入中" }: { label?: string }) {
  return (
    <Card className="p-6">
      <div className="flex flex-col items-center justify-center py-12 gap-3">
        <Loader2 className="h-12 w-12 animate-spin text-primary" />
        <p className="text-sm text-muted-foreground">{label}</p>
      </div>
    </Card>
  );
}

/**
 * Phase 1 只會出現 SUBMITTED —— submit_text_essay() 在同一個交易內就把草稿轉為
 * 已送出，所以 DRAFT 不會停留在任何看得到的地方。DRAFT 仍然列在這裡，
 * 是因為之後（圖片作文、暫存草稿）會用到，而不是為了裝飾。
 */
export function EssayStatusBadge({ status }: { status: EssayStatus }) {
  if (status === "DRAFT") {
    return (
      <Badge variant="outline" className="text-xs text-muted-foreground shrink-0">
        草稿
      </Badge>
    );
  }
  return (
    <Badge variant="outline" className="text-xs text-secondary border-secondary/40 shrink-0">
      已送出
    </Badge>
  );
}
