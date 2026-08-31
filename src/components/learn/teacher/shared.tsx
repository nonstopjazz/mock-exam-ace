import { ReactNode } from "react";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Avatar, AvatarFallback } from "@/components/ui/avatar";
import { Input } from "@/components/ui/input";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import { LucideIcon } from "lucide-react";
import {
  RATING_LABEL,
  type AssessmentSource, type DueMode, type SkillRating, type Student,
} from "@/data/learn/teacherSessionMock";
import { RATING_ACTIVE, type SegmentOption } from "./pickerOptions";

/* ---------- 版面 ---------- */

export const WorkspaceSection = ({
  icon: Icon,
  title,
  hint,
  action,
  children,
  id,
}: {
  icon: LucideIcon;
  title: string;
  hint?: string;
  action?: ReactNode;
  children: ReactNode;
  id?: string;
}) => (
  <Card id={id} className="p-6 scroll-mt-24">
    <div className="flex items-start justify-between gap-3 mb-5">
      <div className="flex items-center gap-3 min-w-0">
        <div className="p-2 rounded-lg bg-secondary/10 shrink-0">
          <Icon className="h-5 w-5 text-secondary" />
        </div>
        <div className="min-w-0">
          <h2 className="text-lg font-semibold text-foreground truncate">{title}</h2>
          {hint && <p className="text-sm text-muted-foreground">{hint}</p>}
        </div>
      </div>
      {action && <div className="shrink-0 flex items-center gap-2">{action}</div>}
    </div>
    {children}
  </Card>
);

/** 「班級預設 → 個別例外」的預設區塊 */
export const DefaultBlock = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="rounded-lg border border-border bg-muted/30 p-4">
    <p className="text-xs text-muted-foreground mb-2">{label}</p>
    {children}
  </div>
);

export const EmptyHint = ({ children }: { children: ReactNode }) => (
  <p className="text-sm text-muted-foreground">{children}</p>
);

/* ---------- 學生 ---------- */

export const StudentAvatar = ({ student, className = "h-8 w-8" }: { student: Student; className?: string }) => (
  <Avatar className={`${className} shrink-0`}>
    <AvatarFallback className="bg-secondary/10 text-secondary text-xs font-semibold">
      {student.initials}
    </AvatarFallback>
  </Avatar>
);

/* ---------- 通用分段選擇器 ---------- */

export const SegmentedPicker = <T extends string>({
  options,
  value,
  onChange,
  size = "sm",
  disabled,
}: {
  options: SegmentOption<T>[];
  value: T;
  onChange: (v: T) => void;
  size?: "sm" | "xs";
  disabled?: boolean;
}) => (
  <div className="flex flex-wrap gap-1.5" role="group">
    {options.map((o) => {
      const active = o.value === value;
      return (
        <button
          key={o.value}
          type="button"
          disabled={disabled}
          aria-pressed={active}
          onClick={() => onChange(o.value)}
          className={[
            "rounded-md border transition-colors whitespace-nowrap",
            "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2 focus-visible:ring-offset-background",
            "disabled:pointer-events-none disabled:opacity-50",
            size === "xs" ? "px-2 py-1 text-xs" : "px-2.5 py-1.5 text-xs",
            o.dashed ? "border-dashed" : "",
            active
              ? o.activeClass
              : "border-border text-muted-foreground hover:bg-muted hover:text-foreground",
          ].join(" ")}
        >
          {o.label}
        </button>
      );
    })}
  </div>
);

/* ---------- 能力等級 ---------- */

export const RatingBadge = ({ rating }: { rating: SkillRating }) => (
  <Badge
    variant="outline"
    className={`text-xs font-normal ${RATING_ACTIVE[rating]}`}
  >
    {RATING_LABEL[rating]}
  </Badge>
);

/* ---------- 作業狀態 ---------- */

/* ---------- Assessment source ---------- */

const SOURCE_CLASS: Record<AssessmentSource, string> = {
  TEACHER: "bg-muted text-muted-foreground border-border",
  AUTO: "bg-muted text-muted-foreground border-border",
  AI: "bg-muted text-muted-foreground border-border",
  IMPORTED: "bg-muted text-muted-foreground border-border",
};

/** 刻意低調：source 是溯源資訊，不是重點 */
export const SourceBadge = ({ source }: { source: AssessmentSource }) => (
  <Badge
    variant="outline"
    className={`text-[10px] font-medium tracking-wide px-1.5 py-0 ${SOURCE_CLASS[source]}`}
  >
    {source}
  </Badge>
);

/* ---------- Due date ---------- */

export const DueSelect = ({
  mode,
  customDue,
  onModeChange,
  onCustomChange,
  allowNone = true,
}: {
  mode: DueMode;
  customDue: string;
  onModeChange: (m: DueMode) => void;
  onCustomChange: (v: string) => void;
  allowNone?: boolean;
}) => (
  <div className="flex flex-wrap items-center gap-2">
    <Select value={mode} onValueChange={(v) => onModeChange(v as DueMode)}>
      <SelectTrigger className="h-9 w-[140px]">
        <SelectValue />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value="next_class">次堂課</SelectItem>
        <SelectItem value="custom">自訂日期</SelectItem>
        {allowNone && <SelectItem value="none">不設期限</SelectItem>}
      </SelectContent>
    </Select>
    {mode === "custom" && (
      <Input
        type="datetime-local"
        value={customDue}
        onChange={(e) => onCustomChange(e.target.value)}
        className="h-9 w-[210px]"
      />
    )}
  </div>
);

/* ---------- 學生選擇器（用於新增例外） ---------- */

export const StudentSelect = ({
  students,
  value,
  onChange,
  placeholder = "選擇學生",
  exclude = [],
  className = "h-9 w-[140px]",
}: {
  students: Student[];
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  exclude?: string[];
  className?: string;
}) => (
  <Select value={value} onValueChange={onChange}>
    <SelectTrigger className={className}>
      <SelectValue placeholder={placeholder} />
    </SelectTrigger>
    <SelectContent>
      {students
        .filter((s) => !exclude.includes(s.id))
        .map((s) => (
          <SelectItem key={s.id} value={s.id}>
            {s.name}
          </SelectItem>
        ))}
    </SelectContent>
  </Select>
);
