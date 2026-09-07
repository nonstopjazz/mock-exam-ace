import { Badge } from "@/components/ui/badge";

/** 報告的共用元件。標籤與色調常數在 reportLabels.ts（react-refresh 要求一檔只 export 元件）。 */

/**
 * 色調。UNMEASURED 一律用 muted——它不是「差」，是「這篇沒有機會展現」，
 * 用警示色會把「未評量」讀成「不及格」（TR-11）。
 */
const TONE: Record<string, string> = {
  STRONG: "bg-primary/10 text-foreground border-primary/20",
  EFFECTIVE: "bg-primary/10 text-foreground border-primary/20",
  SOLID: "bg-secondary/10 text-foreground border-secondary/20",
  ADEQUATE: "bg-secondary/10 text-foreground border-secondary/20",
  DEVELOPING: "bg-accent/10 text-foreground border-accent/20",
  PARTIALLY_EFFECTIVE: "bg-accent/10 text-foreground border-accent/20",
  NEEDS_REWORK: "bg-accent/10 text-foreground border-accent/20",
  MISUSED: "bg-destructive/10 text-foreground border-destructive/20",
  UNMEASURED: "bg-muted text-muted-foreground border-border",
};

export const StatePill = ({ state, label }: { state: string; label: string }) => (
  <Badge
    variant="outline"
    className={`text-xs font-normal shrink-0 ${TONE[state] ?? TONE.UNMEASURED}`}
  >
    {label}
  </Badge>
);

/** 學生原文片段。永遠用原文樣式呈現，讓學生一眼認出「這是我寫的」。 */
export const EvidenceQuote = ({ children }: { children: React.ReactNode }) => (
  <p className="text-sm text-foreground/90 leading-relaxed border-l-2 border-border pl-3 break-words">
    {children}
  </p>
);

/**
 * AI 產出的標示。
 *
 * 出現在每一個 AI 區塊的開頭。學生與家長必須一眼看出這是自動分析，
 * 不是老師逐字寫的評語——老師的話另有專屬區塊。
 */
export const AiBadge = ({ className = "" }: { className?: string }) => (
  <Badge
    variant="outline"
    className={`text-xs font-normal bg-muted text-muted-foreground border-border shrink-0 ${className}`}
  >
    AI 分析
  </Badge>
);
