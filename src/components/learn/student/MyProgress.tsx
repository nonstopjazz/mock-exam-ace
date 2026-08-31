import { useState } from "react";
import { Badge } from "@/components/ui/badge";
import { ChevronDown, TrendingUp } from "lucide-react";
import { SKILL_LABEL } from "@/data/learn/teacherSessionMock";
import {
  PROGRESS_LEVEL_LABEL, PROGRESS_LEVEL_STEP, type ProgressRow,
} from "@/data/learn/studentDashboardMock";
import { TrendIcon } from "@/components/learn/parent/shared";
import { SourceBadge } from "@/components/learn/teacher/shared";
import { StudentSection, LevelSteps } from "./shared";
import type { StudentDashboard } from "@/hooks/learn/useStudentDashboard";

const TREND_LABEL = { up: "在進步", flat: "持平", down: "最近較不穩" } as const;

const Row = ({ row }: { row: ProgressRow }) => {
  const [open, setOpen] = useState(false);
  const measured = row.level !== null;

  return (
    <div className="py-2.5">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        aria-expanded={open}
        className="w-full flex items-center gap-3 text-left rounded-md py-1 transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      >
        <span className="w-12 shrink-0 text-sm font-medium text-foreground pl-1">
          {SKILL_LABEL[row.skill]}
        </span>
        <LevelSteps step={measured ? PROGRESS_LEVEL_STEP[row.level!] : null} />
        <span className={`text-sm shrink-0 ${measured ? "text-foreground" : "text-muted-foreground"}`}>
          {/* 🛑 尚未測得不等於能力弱 */}
          {measured ? PROGRESS_LEVEL_LABEL[row.level!] : "尚無足夠資料"}
        </span>
        {measured && (
          <span className="flex items-center gap-1 text-xs text-muted-foreground shrink-0">
            <TrendIcon trend={row.trend} />
            {TREND_LABEL[row.trend]}
          </span>
        )}
        <ChevronDown
          className={`h-3.5 w-3.5 ml-auto mr-1 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`}
        />
      </button>

      <div className="pl-[3.75rem] pr-1">
        <p className="text-sm text-muted-foreground">下一步：{row.nextAction}</p>
        {open && (
          <div className="flex items-center gap-2 mt-2 flex-wrap">
            <span className="text-xs text-muted-foreground">這個判斷來自：</span>
            {row.sources.length > 0 ? (
              row.sources.map((s) => <SourceBadge key={s} source={s} />)
            ) : (
              <span className="text-xs text-muted-foreground">還沒有足夠的紀錄</span>
            )}
          </div>
        )}
      </div>
    </div>
  );
};

/**
 * My Progress —— 學生版的「我在哪裡 / 有沒有進步 / 下一步做什麼」。
 * 🛑 這是較長期的彙整視圖，不是單堂 observation，也沒有正式的 mastery 演算法。
 *    刻意只用四階 + 趨勢，不顯示 83.7% 這種假精密分數。
 */
export const MyProgress = ({ sd }: { sd: StudentDashboard }) => (
  <StudentSection
    icon={TrendingUp}
    title="我的學習狀況"
    hint="綜合最近的課堂觀察與練習紀錄，不是單次成績"
    id="section-progress"
    action={
      <Badge variant="outline" className="text-xs font-normal text-muted-foreground">
        近一個月
      </Badge>
    }
  >
    <div className="divide-y divide-border/60">
      {sd.scenario.progress.map((r) => (
        <Row key={r.skill} row={r} />
      ))}
    </div>
  </StudentSection>
);
