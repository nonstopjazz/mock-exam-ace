import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from "@/components/ui/select";
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from "@/components/ui/table";
import { AlertCircle, ExternalLink, Loader2, Search, Video, X } from "lucide-react";
import { toast } from "sonner";
import { AdminPageHeader } from "@/components/admin/AdminPageHeader";
import { useCourseAccessMatrix } from "@/hooks/learn/useCourseAccessMatrix";
import { cellMode, type MatrixCourse, type MatrixStudent } from "@/lib/learn/courseAccessMatrix";

/**
 * 課程開放（管理端）
 *
 * 一頁做完原本要跑兩個頁面的事：
 *
 *   /admin/feature-access  第 1 道閘：有沒有「影片課程」這個功能
 *   課程編輯頁最下面        第 4 道閘：被不被選課
 *
 * 🛑 勾選一格會【一併】補上功能授權（RPC 處理，見
 *    learn_admin_course_grant_student）。分成兩個動作的話，老師會遇到
 *    「我明明勾了課，學生還是看不到」—— 那是最難自己想通的狀況。
 *
 * 🛑 繼承來的開放是【唯讀】的，而且要說得出來源。
 *    一個勾不掉的勾會被當成 bug；寫出「A 班（班級）」才解釋得通。
 *
 * 🛑 草稿課照列。2026-10-12 production 的兩門課【都】是草稿，
 *    只列已發布的話這一頁會是空的，看起來像壞掉。
 *    而「先設好開放對象再發布」本來就是正常順序。
 */

/** 課程欄位的標頭。狀態與開放方式都要標出來，不然老師不知道為什麼沒人看得到 */
function CourseHead({ course }: { course: MatrixCourse }) {
  return (
    <div className="min-w-0 space-y-1">
      <p className="truncate font-medium text-foreground" title={course.title}>
        {course.title}
      </p>
      <div className="flex flex-wrap gap-1">
        {course.status === "DRAFT" ? (
          <Badge variant="outline" className="text-[10px] font-normal bg-muted text-muted-foreground">
            未發布
          </Badge>
        ) : null}
        {course.access === "FREE" ? (
          <Badge variant="outline" className="text-[10px] font-normal bg-secondary/10 border-secondary/20">
            免費課
          </Badge>
        ) : null}
      </div>
    </div>
  );
}

export default function CourseAccessAdmin() {
  const [classId, setClassId] = useState<string>("ALL");
  const [nameInput, setNameInput] = useState("");
  const [nameQuery, setNameQuery] = useState("");

  // 每一次按鍵都打一次 RPC 沒有意義。等 300ms 再送。
  useEffect(() => {
    const t = setTimeout(() => setNameQuery(nameInput), 300);
    return () => clearTimeout(t);
  }, [nameInput]);

  const { data, loading, error, pending, grant } = useCourseAccessMatrix(
    classId === "ALL" ? null : classId,
    nameQuery,
  );

  /** 伺服器實際套用的姓名條件。畫面講這個，不是輸入框裡的字 */
  const appliedName = data?.query ?? null;
  const namePending = nameInput.trim() !== (appliedName ?? "");

  const onToggle = async (student: MatrixStudent, course: MatrixCourse, next: boolean) => {
    const res = await grant(student.student_id, course.course_id, next);
    if (!res) return;
    if (!res.granted) {
      toast.success(`已收回 ${student.name} 的「${course.title}」`);
      return;
    }
    toast.success(
      res.feature_added
        ? `已開放，並一併開放「影片課程」功能給 ${student.name}`
        : `已開放 ${course.title} 給 ${student.name}`,
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        <AdminPageHeader
          icon={Video}
          title="課程開放"
          subtitle="一頁看完哪個學生開放了哪些課"
          trail={[{ label: "影片課程", to: "/admin/courses" }]}
        />

        {/* 兩道閘的說明。老師最常卡在「勾了課卻看不到」，所以把機制講在最前面。 */}
        <Alert className="mb-6">
          <AlertCircle className="h-4 w-4" />
          <AlertDescription>
            勾選就開放，而且會<span className="text-foreground">一併開放「影片課程」功能</span>
            —— 兩道閘要一起過，學生才看得到。
            淡色標記的是<span className="text-foreground">從班級繼承</span>來的，
            要改請到
            <Link
              to="/admin/courses"
              className="pl-1 underline underline-offset-4 hover:text-foreground"
            >
              那門課的編輯頁
            </Link>
            。
          </AlertDescription>
        </Alert>

        {/* ── 篩選 ──────────────────────────────────────── */}
        <Card className="p-6 mb-6">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <Select value={classId} onValueChange={setClassId}>
              <SelectTrigger><SelectValue placeholder="班級" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="ALL">所有學生</SelectItem>
                {(data?.classes ?? []).map((c) => (
                  <SelectItem key={c.class_id} value={c.class_id}>
                    {c.name}（{c.member_count} 人在籍）
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground pointer-events-none" />
              <Input
                value={nameInput}
                onChange={(e) => setNameInput(e.target.value)}
                placeholder="搜尋學生姓名"
                aria-label="搜尋學生姓名"
                className="pl-9 pr-9"
              />
              {nameInput ? (
                <button
                  type="button"
                  onClick={() => setNameInput("")}
                  aria-label="清除搜尋"
                  className="absolute right-2 top-1/2 -translate-y-1/2 rounded-md p-1 text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                >
                  <X className="h-4 w-4" />
                </button>
              ) : null}
            </div>
          </div>

          {/* 🛑 講的是伺服器實際套用的條件，不是輸入框裡的字 */}
          {appliedName || namePending ? (
            <p className="text-xs text-muted-foreground mt-4">
              {namePending ? "搜尋中…" : <>符合「<span className="text-foreground">{appliedName}</span>」的學生</>}
            </p>
          ) : null}
        </Card>

        {error ? (
          <Alert variant="destructive" className="mb-6">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription>讀取課程開放資料失敗：{error}</AlertDescription>
          </Alert>
        ) : null}

        {loading && !data ? (
          <Card className="p-6">
            <div className="flex flex-col items-center justify-center py-12 gap-3">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
              <p className="text-sm text-muted-foreground">載入課程開放</p>
            </div>
          </Card>
        ) : !data || data.courses.length === 0 ? (
          <Card className="p-6">
            <div className="text-center py-12 text-muted-foreground">
              <Video className="h-12 w-12 mx-auto mb-3 opacity-40" />
              <p>還沒有可以開放的課程</p>
              <p className="text-sm mt-2">
                先到
                <Link to="/admin/courses" className="px-1 underline underline-offset-4 hover:text-foreground">
                  影片課程
                </Link>
                建立課程。草稿也會出現在這裡，可以先設好開放對象再發布。
              </p>
            </div>
          </Card>
        ) : data.students.length === 0 ? (
          <Card className="p-6">
            <div className="text-center py-12 text-muted-foreground">
              {appliedName ? (
                <>
                  <p>沒有姓名包含「{appliedName}」的學生</p>
                  <p className="text-sm mt-2">換個字看看，或清除搜尋看完整清單。</p>
                </>
              ) : (
                <>
                  <p>這個範圍內沒有學生</p>
                  <p className="text-sm mt-2">換一個班級，或選「所有學生」。</p>
                </>
              )}
            </div>
          </Card>
        ) : (
          <Card className="p-6">
            <div className="flex flex-wrap items-baseline gap-x-2 gap-y-1 mb-4">
              <h2 className="font-semibold text-foreground">學生 × 課程</h2>
              <span className="text-sm text-muted-foreground ml-auto shrink-0">
                {data.students.length} 位
              </span>
            </div>

            {/* 🛑 寬表格在自己的容器裡橫向捲動，不是讓整頁出現橫向捲軸 */}
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="min-w-[10rem] sticky left-0 bg-card">學生</TableHead>
                    {data.courses.map((c) => (
                      <TableHead key={c.course_id} className="min-w-[8rem]">
                        <CourseHead course={c} />
                      </TableHead>
                    ))}
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {data.students.map((s) => (
                    <TableRow key={s.student_id}>
                      <TableCell className="sticky left-0 bg-card align-top">
                        <div className="min-w-0">
                          <p className="truncate font-medium text-foreground">{s.name}</p>
                          <p className="text-xs text-muted-foreground truncate">
                            {s.classes.length > 0 ? s.classes.join("、") : "未分班"}
                          </p>
                          {/* 沒有功能的話什麼課都看不到。勾任何一格就會自動補上，
                              所以這裡只是說明現況，不是要你另外去處理。 */}
                          {!s.has_feature ? (
                            <Badge
                              variant="outline"
                              className="mt-1 text-[10px] font-normal bg-muted text-muted-foreground"
                            >
                              尚無課程功能
                            </Badge>
                          ) : null}
                        </div>
                      </TableCell>

                      {data.courses.map((c) => {
                        const cell = s.courses[c.course_id];
                        const key = `${s.student_id}:${c.course_id}`;
                        const busy = pending.has(key);

                        // 🛑 免費課不給勾選框。對免費課做個別開放不會改變任何人
                        //    看得到什麼，只會在資料庫留一列沒有意義的授權，
                        //    然後下一個人來看會以為它有作用。
                        if (cellMode(c) === "free") {
                          return (
                            <TableCell key={c.course_id} className="align-top">
                              <span className="text-xs text-muted-foreground">不需選課</span>
                            </TableCell>
                          );
                        }

                        return (
                          <TableCell key={c.course_id} className="align-top">
                            <div className="flex items-start gap-2">
                              {busy ? (
                                <Loader2 className="h-4 w-4 animate-spin text-muted-foreground mt-0.5" />
                              ) : (
                                <Checkbox
                                  checked={!!cell?.direct}
                                  onCheckedChange={(v) => void onToggle(s, c, v === true)}
                                  aria-label={`${s.name} 的「${c.title}」開放`}
                                  className="mt-0.5"
                                />
                              )}
                              {/* 繼承來源。只說「繼承」的話老師得自己猜是哪一班。 */}
                              {cell?.via_class ? (
                                <span className="text-xs text-muted-foreground min-w-0 truncate">
                                  {cell.via_class}
                                  <span className="hidden sm:inline">（班級）</span>
                                </span>
                              ) : null}
                            </div>
                          </TableCell>
                        );
                      })}
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {/* 🛑 截斷要講出來，不然老師會以為某個學生不存在 */}
            {data.truncated ? (
              <p className="text-xs text-warning mt-4">
                只顯示前 {data.student_limit} 位學生，共 {data.student_total} 位
                {appliedName ? `（符合「${appliedName}」的）` : ""}。
                用姓名搜尋或切換班級縮小範圍。
              </p>
            ) : null}

            <p className="text-xs text-muted-foreground mt-4">
              標著「未發布」的課，學生還看不到 —— 開放對象可以先設好，
              發布之後才生效。
              <Link
                to="/admin/feature-access"
                className="pl-1 underline underline-offset-4 hover:text-foreground inline-flex items-center gap-1"
              >
                按班級開放功能
                <ExternalLink className="h-3 w-3" />
              </Link>
            </p>
          </Card>
        )}
      </div>
    </div>
  );
}
