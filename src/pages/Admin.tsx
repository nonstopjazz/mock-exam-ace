import { Layout } from "@/components/layout/Layout";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Badge } from "@/components/ui/badge";
import { useState } from "react";
import { Upload, FileText, Settings, Users, BarChart3 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

// TODO: Implement admin authentication & authorization
const Admin = () => {
  const { toast } = useToast();
  const [uploadedFiles, setUploadedFiles] = useState<any[]>([]);

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    // TODO: Upload to server/storage
    toast({
      title: "檔案上傳中...",
      description: `正在處理 ${files.length} 個檔案`,
    });

    // Mock upload
    setTimeout(() => {
      toast({
        title: "上傳成功！",
        description: "PDF 已上傳，可以開始設定題目",
      });
    }, 1500);
  };

  return (
    <Layout showNav={false}>
      <div className="container mx-auto px-4 py-8">
        <div className="mb-8 flex items-center justify-between">
          <div>
            <h1 className="mb-2 text-2xl sm:text-3xl font-bold">管理後台</h1>
            <p className="text-muted-foreground">管理試卷、題目與系統設定</p>
          </div>
          <Badge variant="outline" className="text-sm">
            管理員
          </Badge>
        </div>

        <Tabs defaultValue="upload" className="space-y-6">
          <TabsList className="grid w-full grid-cols-4 max-w-2xl">
            <TabsTrigger value="upload" className="gap-2">
              <Upload className="h-4 w-4" />
              上傳試卷
            </TabsTrigger>
            <TabsTrigger value="questions" className="gap-2">
              <FileText className="h-4 w-4" />
              題目管理
            </TabsTrigger>
            <TabsTrigger value="students" className="gap-2">
              <Users className="h-4 w-4" />
              學生管理
            </TabsTrigger>
            <TabsTrigger value="analytics" className="gap-2">
              <BarChart3 className="h-4 w-4" />
              數據分析
            </TabsTrigger>
          </TabsList>

          {/* Upload Tab */}
          <TabsContent value="upload">
            <div className="grid gap-6 lg:grid-cols-2">
              <Card>
                <CardHeader>
                  <CardTitle>上傳試卷 PDF</CardTitle>
                  <CardDescription>
                    上傳學測英文試卷的 PDF 檔案
                  </CardDescription>
                </CardHeader>
                <CardContent className="space-y-4">
                  <div>
                    <Label htmlFor="pdf-upload">選擇 PDF 檔案</Label>
                    <Input
                      id="pdf-upload"
                      type="file"
                      accept=".pdf"
                      multiple
                      onChange={handleFileUpload}
                      className="mt-2"
                    />
                  </div>

                  <div className="rounded-lg border-2 border-dashed border-border p-8 text-center">
                    <Upload className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground">
                      拖曳檔案至此或點擊上方按鈕
                    </p>
                  </div>

                  {/* TODO: Show upload progress */}
                </CardContent>
              </Card>

              <Card>
                <CardHeader>
                  <CardTitle>設定題目熱區</CardTitle>
                  <CardDescription>
                    標記 PDF 中的題目區域與選項
                  </CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="rounded-lg border border-border bg-muted/30 p-8 text-center">
                    <Settings className="h-8 w-8 mx-auto mb-2 text-muted-foreground" />
                    <p className="text-sm text-muted-foreground mb-4">
                      上傳 PDF 後開始標記題目
                    </p>
                    <Button variant="outline" disabled>
                      開始標記
                    </Button>
                  </div>

                  <div className="mt-4 space-y-2">
                    <p className="text-sm font-medium">標記說明：</p>
                    <ul className="text-sm text-muted-foreground space-y-1">
                      <li>• 框選題目內容區域</li>
                      <li>• 標記選項位置</li>
                      <li>• 設定正確答案</li>
                      <li>• 分配題型類別</li>
                    </ul>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* Questions Tab */}
          <TabsContent value="questions">
            <Card>
              <CardHeader>
                <CardTitle>題目庫</CardTitle>
                <CardDescription>管理與編輯所有題目</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="space-y-4">
                  {/* TODO: List all questions from database */}
                  <div className="rounded-lg border border-border p-4">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">2024 學測模擬試題 #1</h4>
                        <p className="text-sm text-muted-foreground">50 題 • 更新於 2025-01-15</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">編輯</Button>
                        <Button variant="outline" size="sm">預覽</Button>
                      </div>
                    </div>
                  </div>

                  <div className="rounded-lg border border-border p-4 opacity-50">
                    <div className="flex items-center justify-between">
                      <div>
                        <h4 className="font-medium">2024 學測模擬試題 #2</h4>
                        <p className="text-sm text-muted-foreground">45 題 • 更新於 2025-01-10</p>
                      </div>
                      <div className="flex gap-2">
                        <Button variant="outline" size="sm">編輯</Button>
                        <Button variant="outline" size="sm">預覽</Button>
                      </div>
                    </div>
                  </div>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Students Tab */}
          <TabsContent value="students">
            <Card>
              <CardHeader>
                <CardTitle>學生列表</CardTitle>
                <CardDescription>查看與管理學生帳號</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="text-center py-12 text-muted-foreground">
                  {/* TODO: Implement student management */}
                  <Users className="h-12 w-12 mx-auto mb-4" />
                  <p>學生管理功能開發中</p>
                  <p className="text-sm mt-2">將支援：帳號管理、成績查詢、權限設定</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* Analytics Tab */}
          <TabsContent value="analytics">
            <Card>
              <CardHeader>
                <CardTitle>系統數據分析</CardTitle>
                <CardDescription>整體使用統計與成績分析</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="grid gap-4 md:grid-cols-3 mb-6">
                  <div className="rounded-lg border border-border p-4">
                    <p className="text-sm text-muted-foreground">總學生數</p>
                    <p className="text-2xl font-bold">248</p>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <p className="text-sm text-muted-foreground">本月完成考試</p>
                    <p className="text-2xl font-bold">1,847</p>
                  </div>
                  <div className="rounded-lg border border-border p-4">
                    <p className="text-sm text-muted-foreground">平均分數</p>
                    <p className="text-2xl font-bold">76.5</p>
                  </div>
                </div>

                <div className="text-center py-8 text-muted-foreground">
                  {/* TODO: Add charts for analytics */}
                  <BarChart3 className="h-12 w-12 mx-auto mb-4" />
                  <p>詳細圖表分析即將推出</p>
                </div>
              </CardContent>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </Layout>
  );
};

export default Admin;
