import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Checkbox } from "@/components/ui/checkbox";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, ArrowLeft, Loader2, Search, Settings2, Users, X } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/lib/supabase";
import { useFeatureAccess } from "@/hooks/learn/useFeatureAccess";
import { FEATURE } from "@/config/speaking";
import type { StudentSearchResult } from "@/lib/learn/tasks";

/**
 * 功能開放對象（管理端）
 *
 * 目前只有「口說練習」一個功能，但這一頁與 learn_feature_access 都是通用的：
 * 下一個要分批開放的功能只要多一個 feature 代號，不必再做一頁。
 *
 * 【預設是關的】。沒有在這裡勾選任何班級或學生，就沒有人看得到那個功能——
 * 包括已經寫好、已經部署的頁面。這是產品決策，不是還沒做完。
 *
 * 畫面上最重要的數字是「目前共 N 人看得到」：授權有班級與個別兩種來源，
 * 會重疊，所以逐一相加是錯的。那個數字由資料庫去重後算出來，前端不自己算。
 */
export default function FeatureAccessAdmin() {
  const { access, loading, error, saving, refetch, setAccessFor } = useFeatureAccess(FEATURE);

  const [query, setQuery] = useState("");
  const [results, setResults] = useState<StudentSearchResult[]>([]);
  const [searching, setSearching] = useState(false);

  // 搜尋至少 2 個字才送出（與 learn_admin_search_students 的下限一致），
  // 而且等 300ms —— 每一個字母打一次 RPC 沒有意義。
  const search = useCallback(async (text: string) => {
    if (text.trim().length < 2) {
      setResults([]);
      return;
    }
    setSearching(true);
    const { data, error: rpcError } = await supabase.rpc("learn_admin_search_students", {
      p_query: text.trim(),
      p_class_id: null,
    });
    setSearching(false);
    if (rpcError) {
      setResults([]);
      return;
    }
    setResults((data as unknown as StudentSearchResult[]) ?? []);
  }, []);

  useEffect(() => {
    const timer = setTimeout(() => void search(query), 300);
    return () => clearTimeout(timer);
  }, [query, search]);

  const grantedStudentIds = new Set((access?.students ?? []).map((s) => s.student_id));

  const toggleClass = async (classId: string, granted: boolean) => {
    const result = await setAccessFor({ classId }, granted);
    if (result.ok) toast.success(granted ? "已開放給這個班級" : "已收回這個班級");
    else toast.error(result.error);
  };

  const toggleStudent = async (studentId: string, granted: boolean, name: string) => {
    const result = await setAccessFor({ studentId }, granted);
    if (result.ok) toast.success(granted ? `已開放給 ${name}` : `已收回 ${name}`);
    else toast.error(result.error);
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto max-w-4xl px-4 py-8">
        <Button variant="ghost" size="sm" asChild className="mb-4 -ml-2">
          <Link to="/admin">
            <ArrowLeft className="h-4 w-4" />
            回管理中心
          </Link>
        </Button>

        <div className="mb-8 flex items-center gap-3 min-w-0">
          <div className="p-2 md:p-3 rounded-lg bg-accent/10 shrink-0">
            <Settings2 className="h-6 w-6 md:h-8 md:w-8 text-accent" />
          </div>
          <div className="min-w-0">
            <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">功能開放對象</h1>
            <p className="text-sm md:text-base text-muted-foreground hidden sm:block">
              口說練習：決定哪些班級、哪些學生看得到
            </p>
          </div>
        </div>

        {loading ? (
          <Card className="p-6">
            <div className="flex justify-center py-12">
              <Loader2 className="h-12 w-12 animate-spin text-primary" />
            </div>
          </Card>
        ) : error ? (
          <Alert variant="destructive">
            <AlertCircle className="h-4 w-4" />
            <AlertDescription className="flex flex-wrap items-center gap-3">
              <span>{error}</span>
              <Button variant="outline" size="sm" onClick={() => void refetch()}>
                重新載入
              </Button>
            </AlertDescription>
          </Alert>
        ) : (
          <>
            {/* 實際觸及人數 */}
            <Card className="mb-8 p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
              <div className="flex items-center gap-2 mb-2">
                <Users className="h-5 w-5 text-primary shrink-0" />
                <span className="font-semibold text-foreground">目前看得到口說練習的人</span>
              </div>
              <div className="flex items-baseline gap-2">
                <span className="text-3xl font-bold text-foreground">{access?.reach ?? 0}</span>
                <span className="text-sm text-muted-foreground">人</span>
              </div>
              <p className="mt-2 text-sm text-muted-foreground">
                {access && access.reach === 0
                  ? "還沒開放給任何人。管理員自己一律看得到，不算在這個數字裡。"
                  : "同時被班級與個別開放的學生只算一次"}
              </p>
            </Card>

            {/* 班級 */}
            <div className="mb-8">
              <h2 className="mb-4 text-lg font-semibold text-foreground">開放給整個班級</h2>
              {(access?.classes ?? []).length === 0 ? (
                <Card className="p-6">
                  <div className="text-center py-12 text-muted-foreground">
                    <Users className="h-12 w-12 mx-auto mb-4 opacity-40" />
                    <p>還沒有啟用中的班級</p>
                    <p className="text-sm mt-2">
                      先到
                      <Link to="/admin/classes" className="text-primary underline underline-offset-4 mx-1">
                        班級管理
                      </Link>
                      建立班級
                    </p>
                  </div>
                </Card>
              ) : (
                <Card className="p-6">
                  {(access?.classes ?? []).map((item) => (
                    <label
                      key={item.class_id}
                      className="flex cursor-pointer items-center gap-3 py-3 border-b border-border last:border-0"
                    >
                      <Checkbox
                        checked={item.granted}
                        disabled={saving === item.class_id}
                        onCheckedChange={(checked) =>
                          void toggleClass(item.class_id, checked === true)
                        }
                        className="shrink-0"
                      />
                      <div className="min-w-0 flex-1">
                        <p className="font-medium text-foreground truncate">{item.name}</p>
                        <p className="text-sm text-muted-foreground">{item.member_count} 人</p>
                      </div>
                      {saving === item.class_id && (
                        <Loader2 className="h-4 w-4 animate-spin text-muted-foreground shrink-0" />
                      )}
                    </label>
                  ))}
                </Card>
              )}
            </div>

            {/* 個別學生 */}
            <div>
              <h2 className="mb-1 text-lg font-semibold text-foreground">開放給個別學生</h2>
              <p className="mb-4 text-sm text-muted-foreground">
                給不在班級裡、或要單獨試用的學生用
              </p>

              <Card className="p-6">
                <div className="relative mb-4">
                  <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                  <Input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="搜尋姓名或 email（至少 2 個字）"
                    className="pl-9"
                  />
                  {searching && (
                    <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
                  )}
                </div>

                {/* 搜尋結果 */}
                {results.length > 0 && (
                  <div className="mb-6 rounded-lg border border-border">
                    {results.map((student) => {
                      const already = grantedStudentIds.has(student.student_id);
                      return (
                        <div
                          key={student.student_id}
                          className="flex items-center justify-between gap-3 px-4 py-3 border-b border-border last:border-0"
                        >
                          <div className="min-w-0">
                            <p className="font-medium text-foreground truncate">
                              {student.display_name}
                            </p>
                            <p className="text-sm text-muted-foreground truncate">
                              {student.email ?? "—"}
                            </p>
                          </div>
                          <Button
                            variant={already ? "ghost" : "outline"}
                            size="sm"
                            className="shrink-0"
                            disabled={already || saving === student.student_id}
                            onClick={() =>
                              void toggleStudent(student.student_id, true, student.display_name)
                            }
                          >
                            {saving === student.student_id && (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            )}
                            {already ? "已開放" : "開放"}
                          </Button>
                        </div>
                      );
                    })}
                  </div>
                )}

                {query.trim().length >= 2 && !searching && results.length === 0 && (
                  <p className="mb-6 text-sm text-muted-foreground">找不到符合的帳號</p>
                )}

                {/* 已個別開放的 */}
                {(access?.students ?? []).length === 0 ? (
                  <p className="text-sm text-muted-foreground">還沒有個別開放的學生</p>
                ) : (
                  <div className="flex flex-wrap gap-2">
                    {(access?.students ?? []).map((student) => (
                      <Badge
                        key={student.student_id}
                        variant="secondary"
                        className="gap-1 py-1 pl-3 pr-1"
                      >
                        <span className="truncate max-w-[12rem]">{student.name}</span>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-5 w-5 rounded-full"
                          aria-label={`收回 ${student.name} 的開放`}
                          disabled={saving === student.student_id}
                          onClick={() =>
                            void toggleStudent(student.student_id, false, student.name)
                          }
                        >
                          <X className="h-3 w-3" />
                        </Button>
                      </Badge>
                    ))}
                  </div>
                )}
              </Card>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
