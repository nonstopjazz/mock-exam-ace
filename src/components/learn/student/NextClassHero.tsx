import { useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import {
  Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle,
} from "@/components/ui/dialog";
import { toast } from "sonner";
import type { StudentTask } from "@/data/learn/taskCenterMock";
import { TYPE } from "./shared";
import { TaskRow, type TaskActions } from "./tasks/TaskRow";
import { TaskDetailDrawer } from "./tasks/TaskDetailDrawer";
import type { StudentDashboard } from "@/hooks/learn/useStudentDashboard";

/**
 * 準備度圓環：外圈是老師已確認的，內側較淺的是自行標記待確認的。
 * 一眼就能看出「我以為完成的」和「真的被確認的」不是同一件事。
 */
const ReadinessRing = ({
  verified, selfReported, total,
}: { verified: number; selfReported: number; total: number }) => {
  const R = 47, C = 2 * Math.PI * R;
  const seg = (n: number) => (total ? (n / total) * C : 0);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    const t = requestAnimationFrame(() => setShown(true));
    return () => cancelAnimationFrame(t);
  }, []);
  const arc = (n: number) => `${shown ? seg(n) : 0} ${C}`;

  return (
    <div className="relative h-[104px] w-[104px] shrink-0" role="img"
      aria-label={`準備度 ${verified + selfReported} / ${total}，其中老師已確認 ${verified} 項`}>
      <svg viewBox="0 0 120 120" className="h-full w-full -rotate-90">
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="7" className="stroke-border" />
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="7" strokeLinecap="round"
          className="stroke-secondary/30 transition-[stroke-dasharray] duration-700 ease-out"
          strokeDasharray={arc(verified + selfReported)} />
        <circle cx="60" cy="60" r={R} fill="none" strokeWidth="7" strokeLinecap="round"
          className="stroke-secondary transition-[stroke-dasharray] duration-700 ease-out delay-100"
          strokeDasharray={arc(verified)} />
      </svg>
      <div className="absolute inset-0 flex flex-col items-center justify-center">
        <span className="text-[11px] text-muted-foreground leading-none">準備度</span>
        <span className="text-xl font-bold text-foreground tabular-nums leading-none mt-1">
          {verified + selfReported}
          <span className="text-sm text-muted-foreground font-semibold"> / {total}</span>
        </span>
      </div>
    </div>
  );
};

/**
 * Next Class Hero —— 整頁唯一的主視覺，回答：下次上課前，我還要做什麼？
 *
 * v1.3：任務列改用與任務原型共用的 TaskRow / TaskDetailDrawer，
 * 因此紙本、線上、外部三種任務在這裡就能走完完整的狀態流程，
 * 不需要另一個獨立的任務頁面。Hero 的結構本身沒有改變。
 */
export const NextClassHero = ({ sd }: { sd: StudentDashboard }) => {
  const {
    scenario, tasks, readiness,
    toggleSelfReport, startDigital, completeDigital, chooseFollowUp, submitFollowUp,
  } = sd;
  const [detail, setDetail] = useState<StudentTask | null>(null);
  const [digital, setDigital] = useState<StudentTask | null>(null);

  const actions: TaskActions = {
    onSelfReport: toggleSelfReport,
    onOpenDigital: (t) => setDigital(t),
    onFollowUp: (id) => { chooseFollowUp(id); toast.success("已加入補完，完成後記得標記"); },
    onSubmitFollowUp: (id) => { submitFollowUp(id); toast.success("已送出，等待老師再次確認"); },
    onOpenDetail: (t) => setDetail(t),
  };

  /** §8 的摘要：先講還要處理什麼，readiness 留在圓環裡當佐證 */
  const summaryLines = [
    { n: readiness.needAction, label: "項需要處理" },
    { n: readiness.partial, label: "項部分完成" },
    { n: readiness.awaiting, label: "項待老師確認" },
  ].filter((r) => r.n > 0);

  return (
    <>
      <Card className="overflow-hidden border-primary/25 shadow-card">
        <div className="grid grid-cols-1 lg:grid-cols-[minmax(0,23.5rem)_1fr]">
          {/* 左：日期與準備度 */}
          <div className="bg-gradient-to-br from-primary/12 to-accent/10 p-6 lg:p-7 border-b lg:border-b-0 lg:border-r border-primary/20">
            <p className="text-[11px] font-medium tracking-[0.08em] text-muted-foreground uppercase">
              下一堂課
            </p>
            <p className="text-3xl md:text-[2.5rem] font-bold text-foreground mt-1.5 leading-[1.1] tracking-tight whitespace-nowrap">
              {scenario.nextClass.dateLabel}
            </p>
            <p className="text-base font-semibold text-foreground/75 mt-2">
              {scenario.nextClass.timeLabel}
              <span className="ml-2 text-sm font-normal text-muted-foreground">
                {scenario.className}
              </span>
            </p>
            <p className="inline-flex items-center gap-1.5 mt-3 rounded-full bg-card border border-primary/30 px-3 py-1 text-sm font-semibold text-foreground shadow-sm">
              還有 {scenario.daysUntil} 天
            </p>

            <div className="flex items-center gap-5 mt-6 pt-5 border-t border-primary/15">
              <ReadinessRing
                verified={readiness.verified}
                selfReported={readiness.awaiting}
                total={readiness.total}
              />
              <ul className="space-y-1.5 min-w-0">
                {[
                  { n: readiness.verified, label: "項老師已確認", dot: "bg-secondary" },
                  { n: readiness.awaiting, label: "項待老師確認", dot: "bg-secondary/30" },
                  { n: readiness.total - readiness.verified - readiness.awaiting, label: "項尚待處理", dot: "bg-muted border border-border" },
                ].map((r) => (
                  <li key={r.label} className="flex items-center gap-2 text-[13px]">
                    <span className={`h-2 w-2 rounded-full shrink-0 ${r.dot}`} />
                    <span className="font-semibold text-foreground tabular-nums w-3 text-right">
                      {r.n}
                    </span>
                    <span className="text-muted-foreground">{r.label}</span>
                  </li>
                ))}
              </ul>
            </div>
          </div>

          {/* 右：這一堂課的完整任務清單 */}
          <div className="p-6 lg:p-7 min-w-0 flex flex-col">
            <div className="flex items-baseline gap-2 flex-wrap mb-3">
              {summaryLines.length > 0 ? (
                summaryLines.map((r, i) => (
                  <span key={r.label} className="flex items-baseline gap-1.5">
                    {i > 0 && <span className="text-muted-foreground/50 mr-1">·</span>}
                    <span
                      className={
                        i === 0
                          ? "text-2xl font-bold text-foreground tabular-nums leading-none"
                          : "text-base font-semibold text-foreground tabular-nums"
                      }
                    >
                      {r.n}
                    </span>
                    <span className={i === 0 ? "text-base font-semibold text-foreground" : "text-sm text-muted-foreground"}>
                      {r.label}
                    </span>
                  </span>
                ))
              ) : (
                <span className="text-base font-semibold text-foreground">
                  上課前的項目都處理完了
                </span>
              )}
              <span className={`${TYPE.micro} ml-auto`}>上課前</span>
            </div>

            {/* 🛑 已完成的項目留在清單裡但安靜下來 —— 學生要看得到老師這週交代了什麼 */}
            <div className="space-y-2.5">
              {tasks.map((t) => (
                <TaskRow key={t.id} task={t} actions={actions} />
              ))}
            </div>
          </div>
        </div>
      </Card>

      <TaskDetailDrawer task={detail} onClose={() => setDetail(null)} actions={actions} />

      {/* 線上任務：作答本身在既有活動頁面，原型用這個對話框模擬狀態轉換 */}
      <Dialog open={!!digital} onOpenChange={(o) => !o && setDigital(null)}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{digital?.title}</DialogTitle>
            <DialogDescription>
              正式版會開啟平台既有的作答頁面。原型階段可以在這裡模擬進度與完成，
              完成後由平台自動記錄，不需要你自己標記。
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col gap-2">
            {digital && !digital.progress?.done && (
              <Button
                variant="outline"
                onClick={() => {
                  startDigital(digital.id);
                  toast("已模擬作答到一半");
                  setDigital(null);
                }}
              >
                模擬做到一半
              </Button>
            )}
            <Button
              onClick={() => {
                if (digital) {
                  completeDigital(digital.id, 86);
                  toast.success(`${digital.title} 已完成 · 86 分`);
                }
                setDigital(null);
              }}
            >
              模擬完成
            </Button>
            <Button variant="ghost" onClick={() => setDigital(null)}>關閉</Button>
          </div>
        </DialogContent>
      </Dialog>
    </>
  );
};
