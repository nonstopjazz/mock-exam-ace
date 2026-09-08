import { useCallback, useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { Layout } from "@/components/layout/Layout";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { AlertCircle, PenLine, RefreshCw, ChevronRight } from "lucide-react";
import { supabase } from "@/lib/supabase";
import { WritingLoading } from "@/components/learn/writing/writingShared";
import { queueStatus, type WritingQueueRow } from "@/lib/writing/gradingQueue";

/**
 * 作文批改佇列（僅限管理員）
 *
 * 已送出的作文 + 每篇最新一次分析的狀態。批改本身在 /admin/writing/:essayId。
 */

const WritingGrading = () => {
  const [queue, setQueue] = useState<WritingQueueRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadQueue = useCallback(async () => {
    setLoading(true);
    setError(null);
    const { data, error: rpcError } = await supabase.rpc("writing_admin_queue");
    if (rpcError) {
      setError(rpcError.message);
      setQueue([]);
    } else {
      setQueue((data as WritingQueueRow[]) ?? []);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadQueue();
  }, [loadQueue]);

  return (
    <Layout>
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-8">
          <div className="mb-8 flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 md:p-3 rounded-lg bg-primary/10 shrink-0">
                <PenLine className="h-6 w-6 md:h-8 md:w-8 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">作文批改</h1>
                <p className="text-sm md:text-base text-muted-foreground hidden sm:block">
                  學生送出的作文與批改狀態
                </p>
              </div>
            </div>
            <Button variant="outline" size="sm" onClick={() => void loadQueue()} disabled={loading}>
              <RefreshCw className="h-4 w-4" />
              重新載入
            </Button>
          </div>

          {error ? (
            <Alert variant="destructive" className="mb-6">
              <AlertCircle className="h-4 w-4" />
              <AlertDescription>載入批改佇列失敗：{error}</AlertDescription>
            </Alert>
          ) : null}

          {loading ? (
            <WritingLoading label="載入批改佇列" />
          ) : queue.length === 0 ? (
            <Card className="p-6">
              <div className="text-center py-12 text-muted-foreground">
                <p>目前沒有已送出的作文</p>
                <p className="text-sm mt-2">學生送出作文之後會出現在這裡</p>
              </div>
            </Card>
          ) : (
            <Card className="p-6">
              <div className="divide-y divide-border">
                {queue.map((row) => {
                  const status = queueStatus(row);
                  return (
                    <Link
                      key={row.essay_id}
                      to={`/admin/writing/${row.essay_id}`}
                      className="flex items-center gap-3 py-4 first:pt-0 last:pb-0 hover:bg-muted/40 -mx-2 px-2 rounded-md transition-colors"
                    >
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-foreground truncate">{row.title}</p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {row.word_count ?? "?"} 字
                          {row.analysis_version ? ` · 第 ${row.analysis_version} 次批改` : ""}
                        </p>
                      </div>
                      <Badge variant="outline" className={`text-xs font-normal shrink-0 ${status.tone}`}>
                        {status.label}
                      </Badge>
                      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
                    </Link>
                  );
                })}
              </div>
            </Card>
          )}
        </div>
      </div>
    </Layout>
  );
};

export default WritingGrading;
