import { useState, useRef } from "react";
import { Link } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle, DialogTrigger } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Progress } from "@/components/ui/progress";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import {
  Plus, Edit, Trash2, ArrowLeft, Upload, FileSpreadsheet,
  Eye, EyeOff, Archive, CheckCircle, AlertCircle, Loader2,
  BookOpen, FileText, PenTool, Languages
} from "lucide-react";
import { toast } from "sonner";
import { useExams, useExamStatistics, useExamAdmin, type Exam, type DifficultyLevel, type ExamStatus } from "@/hooks/useExam";
import * as XLSX from 'xlsx';

const ExamAdmin = () => {
  const { exams, loading: examsLoading, error: examsError } = useExams();
  const { statistics } = useExamStatistics();
  const {
    loading: adminLoading,
    error: adminError,
    createExam,
    updateExam,
    deleteExam,
    publishExam,
    archiveExam,
    addVocabularyQuestions,
    addQuestionGroup,
    addGroupQuestion,
    addTranslationQuestion,
    addEssayQuestion,
  } = useExamAdmin();

  const [isDialogOpen, setIsDialogOpen] = useState(false);
  const [isUploadDialogOpen, setIsUploadDialogOpen] = useState(false);
  const [selectedExam, setSelectedExam] = useState<Exam | null>(null);
  const [uploadProgress, setUploadProgress] = useState(0);
  const [uploadStatus, setUploadStatus] = useState<'idle' | 'uploading' | 'success' | 'error'>('idle');
  const [uploadMessage, setUploadMessage] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState<Partial<Exam>>({
    difficulty: '中等',
    totalScore: 100,
    durationMinutes: 100,
    status: 'draft',
  });

  const handleEdit = (exam: Exam) => {
    setSelectedExam(exam);
    setFormData(exam);
    setIsDialogOpen(true);
  };

  const handleDelete = async (examId: string) => {
    if (!confirm('確定要刪除這份試卷嗎？此操作無法復原。')) return;

    const success = await deleteExam(examId);
    if (success) {
      toast.success("試卷已刪除");
      window.location.reload();
    } else {
      toast.error("刪除失敗");
    }
  };

  const handleSave = async () => {
    if (!formData.id || !formData.title || !formData.year) {
      toast.error("請填寫必要欄位：試卷ID、名稱、年份");
      return;
    }

    if (selectedExam) {
      const result = await updateExam(selectedExam.id, formData);
      if (result) {
        toast.success("試卷已更新");
        window.location.reload();
      }
    } else {
      const result = await createExam(formData as Omit<Exam, 'createdAt' | 'updatedAt'>);
      if (result) {
        toast.success("試卷已建立");
        window.location.reload();
      }
    }
    setIsDialogOpen(false);
  };

  const handlePublish = async (examId: string) => {
    const result = await publishExam(examId);
    if (result) {
      toast.success("試卷已發布");
      window.location.reload();
    }
  };

  const handleArchive = async (examId: string) => {
    const result = await archiveExam(examId);
    if (result) {
      toast.success("試卷已封存");
      window.location.reload();
    }
  };

  // Excel 上傳處理
  const handleExcelUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setUploadStatus('uploading');
    setUploadProgress(0);
    setUploadMessage('正在讀取 Excel 檔案...');

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data);

      setUploadProgress(10);
      setUploadMessage('正在解析試卷資訊...');

      // 1. 解析試卷基本資訊
      const infoSheet = workbook.Sheets['1.試卷基本資訊'];
      if (!infoSheet) {
        throw new Error('找不到「1.試卷基本資訊」工作表');
      }

      const infoData = XLSX.utils.sheet_to_json(infoSheet, { header: 1 }) as any[][];
      const examInfo = infoData[1]; // 第二行是資料

      if (!examInfo || !examInfo[0]) {
        throw new Error('試卷基本資訊不完整');
      }

      const examId = examInfo[0];
      const examTitle = examInfo[1];
      const year = parseInt(examInfo[2]);
      const month = examInfo[3] ? parseInt(examInfo[3]) : undefined;
      const difficulty = examInfo[4] || '中等';
      const totalScore = parseFloat(examInfo[5]) || 100;
      const duration = parseInt(examInfo[6]) || 100;
      const notes = examInfo[8] || '';

      // 建立試卷
      setUploadProgress(15);
      setUploadMessage('正在建立試卷...');

      const exam = await createExam({
        id: examId,
        title: examTitle,
        year,
        month,
        difficulty: difficulty as DifficultyLevel,
        totalScore,
        durationMinutes: duration,
        notes,
        status: 'draft',
      });

      if (!exam) {
        throw new Error('建立試卷失敗');
      }

      // 2. 解析單字題
      setUploadProgress(20);
      setUploadMessage('正在匯入單字題...');

      const vocabSheet = workbook.Sheets['2.單字題'];
      if (vocabSheet) {
        const vocabData = XLSX.utils.sheet_to_json(vocabSheet, { header: 1 }) as any[][];
        const vocabQuestions = vocabData.slice(1).filter(row => row[0]).map(row => ({
          examId,
          questionNumber: parseInt(row[0]),
          questionText: row[2] || '',
          optionA: row[3] || '',
          optionB: row[4] || '',
          optionC: row[5] || '',
          optionD: row[6] || '',
          correctAnswer: row[7] as 'A' | 'B' | 'C' | 'D',
          explanation: row[8] || '',
          levelTag: row[9] ? parseInt(row[9]) : undefined,
          topicTags: row[10] ? row[10].split(',').map((t: string) => t.trim()) : [],
          score: parseFloat(row[11]) || 1,
        }));

        if (vocabQuestions.length > 0) {
          await addVocabularyQuestions(vocabQuestions);
        }
      }

      // 3. 解析克漏字
      setUploadProgress(30);
      setUploadMessage('正在匯入克漏字...');
      await parseQuestionGroup(workbook, examId, 'cloze', '3.克漏字組別', '4.克漏字題目');

      // 4. 解析文意選填
      setUploadProgress(45);
      setUploadMessage('正在匯入文意選填...');
      await parseQuestionGroup(workbook, examId, 'contextual', '5.文意選填組別', '6.文意選填題目');

      // 5. 解析篇章結構
      setUploadProgress(55);
      setUploadMessage('正在匯入篇章結構...');
      await parseQuestionGroup(workbook, examId, 'structure', '7.篇章結構組別', '8.篇章結構題目');

      // 6. 解析閱讀測驗
      setUploadProgress(65);
      setUploadMessage('正在匯入閱讀測驗...');
      await parseQuestionGroup(workbook, examId, 'reading', '9.閱讀測驗組別', '10.閱讀測驗題目');

      // 7. 解析混合題
      setUploadProgress(75);
      setUploadMessage('正在匯入混合題...');
      await parseQuestionGroup(workbook, examId, 'mixed', '11.混合題組別', '12.混合題題目');

      // 8. 解析翻譯題
      setUploadProgress(85);
      setUploadMessage('正在匯入翻譯題...');

      const transSheet = workbook.Sheets['13.翻譯題'];
      if (transSheet) {
        const transData = XLSX.utils.sheet_to_json(transSheet, { header: 1 }) as any[][];
        for (const row of transData.slice(1).filter(r => r[0])) {
          await addTranslationQuestion({
            examId,
            questionNumber: row[0],
            chineseText: row[2] || '',
            referenceAnswer: row[3] || '',
            scoringCriteria: row[4] || '',
            explanation: row[5] || '',
            grammarTags: row[6] ? row[6].split(',').map((t: string) => t.trim()) : [],
            levelTag: row[7] ? parseInt(row[7]) : undefined,
            phraseTag: row[8] || '',
            topicTags: row[9] ? row[9].split(',').map((t: string) => t.trim()) : [],
            score: parseFloat(row[10]) || 4,
          });
        }
      }

      // 9. 解析作文題
      setUploadProgress(95);
      setUploadMessage('正在匯入作文題...');

      const essaySheet = workbook.Sheets['14.作文題'];
      if (essaySheet) {
        const essayData = XLSX.utils.sheet_to_json(essaySheet, { header: 1 }) as any[][];
        for (const row of essayData.slice(1).filter(r => r[0])) {
          await addEssayQuestion({
            examId,
            questionNumber: row[0],
            prompt: row[2] || '',
            essayType: (row[3] || '記敘文') as any,
            wordCountRequirement: parseInt(row[4]) || 120,
            scoringCriteria: row[5] || '',
            sampleEssay: row[6] || '',
            writingTips: row[7] || '',
            errorTypeTags: row[8] ? row[8].split(',').map((t: string) => t.trim()) : [],
            topicTags: row[9] ? row[9].split(',').map((t: string) => t.trim()) : [],
            score: parseFloat(row[10]) || 20,
          });
        }
      }

      setUploadProgress(100);
      setUploadStatus('success');
      setUploadMessage(`試卷「${examTitle}」匯入成功！`);

      setTimeout(() => {
        window.location.reload();
      }, 2000);

    } catch (error: any) {
      console.error('Excel upload error:', error);
      setUploadStatus('error');
      setUploadMessage(error.message || '匯入失敗，請檢查 Excel 格式');
    }
  };

  // 解析題組的輔助函數
  const parseQuestionGroup = async (
    workbook: XLSX.WorkBook,
    examId: string,
    groupType: 'cloze' | 'contextual' | 'structure' | 'reading' | 'mixed',
    groupSheetName: string,
    questionSheetName: string
  ) => {
    const groupSheet = workbook.Sheets[groupSheetName];
    const questionSheet = workbook.Sheets[questionSheetName];

    if (!groupSheet) return;

    const groupData = XLSX.utils.sheet_to_json(groupSheet, { header: 1 }) as any[][];
    const questionData = questionSheet
      ? XLSX.utils.sheet_to_json(questionSheet, { header: 1 }) as any[][]
      : [];

    for (const row of groupData.slice(1).filter(r => r[0])) {
      const groupId = row[0];

      // 根據題組類型建立不同的資料結構
      const groupPayload: any = {
        id: groupId,
        examId,
        groupType,
        groupOrder: parseInt(row[2]) || 1,
        title: row[3] || '',
        content: row[4] || '',
        contentTranslation: row[5] || '',
        topicTags: [],
      };

      // 特殊欄位處理
      if (groupType === 'contextual') {
        groupPayload.optionCount = parseInt(row[5]) || 10;
        groupPayload.optionList = row[6] || '';
        groupPayload.topicTags = row[7] ? row[7].split(',').map((t: string) => t.trim()) : [];
      } else if (groupType === 'structure') {
        groupPayload.optionCount = parseInt(row[5]) || 4;
        groupPayload.structureOptionA = row[6] || '';
        groupPayload.structureOptionB = row[7] || '';
        groupPayload.structureOptionC = row[8] || '';
        groupPayload.structureOptionD = row[9] || '';
        groupPayload.structureOptionE = row[10] || '';
        groupPayload.topicTags = row[11] ? row[11].split(',').map((t: string) => t.trim()) : [];
      } else if (groupType === 'reading') {
        groupPayload.articleType = row[6] || '';
        groupPayload.topicTags = row[7] ? row[7].split(',').map((t: string) => t.trim()) : [];
      } else if (groupType === 'mixed') {
        groupPayload.chartDescription = row[4] || '';
        groupPayload.topicTags = row[6] ? row[6].split(',').map((t: string) => t.trim()) : [];
      } else {
        groupPayload.topicTags = row[6] ? row[6].split(',').map((t: string) => t.trim()) : [];
      }

      const group = await addQuestionGroup(groupPayload);
      if (!group) continue;

      // 匯入題組內的題目
      const groupQuestions = questionData.slice(1).filter(q => q[1] === groupId);
      for (const qRow of groupQuestions) {
        await addGroupQuestion({
          groupId,
          questionNumber: parseInt(qRow[0]),
          blankNumber: qRow[2] ? parseInt(qRow[2]) : undefined,
          questionText: qRow[3] || '',
          optionA: qRow[4] || '',
          optionB: qRow[5] || '',
          optionC: qRow[6] || '',
          optionD: qRow[7] || '',
          correctAnswer: qRow[8] || qRow[3] || '',
          explanation: qRow[9] || qRow[4] || '',
          grammarSmall: qRow[10] || qRow[5] || '',
          grammarMedium: qRow[11] || qRow[6] || '',
          grammarLarge: qRow[12] || '',
          levelTag: qRow[13] ? parseInt(qRow[13]) : undefined,
          phraseTag: qRow[14] || '',
          questionTypeTag: qRow[10] || '',
          score: parseFloat(qRow[15] || qRow[6]) || 2,
        });
      }
    }
  };

  const getStatusBadge = (status: ExamStatus) => {
    switch (status) {
      case 'draft':
        return <Badge variant="secondary">草稿</Badge>;
      case 'published':
        return <Badge variant="default" className="bg-green-600">已發布</Badge>;
      case 'archived':
        return <Badge variant="outline">已封存</Badge>;
    }
  };

  const getExamStats = (examId: string) => {
    return statistics.find(s => s.id === examId);
  };

  if (examsLoading) {
    return (
      <div className="container mx-auto p-6 flex items-center justify-center min-h-[400px]">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  return (
    <div className="container mx-auto p-6 space-y-6">
      <Link to="/admin">
        <Button variant="ghost" size="sm" className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回管理中心
        </Button>
      </Link>

      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold text-foreground">模擬考試管理</h1>
          <p className="text-muted-foreground mt-2">上傳與編輯學測英文模擬考試</p>
        </div>
        <div className="flex gap-2">
          {/* Excel 上傳 */}
          <Dialog open={isUploadDialogOpen} onOpenChange={setIsUploadDialogOpen}>
            <DialogTrigger asChild>
              <Button variant="outline">
                <Upload className="h-4 w-4 mr-2" />
                匯入 Excel
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-lg">
              <DialogHeader>
                <DialogTitle>匯入試卷 Excel</DialogTitle>
                <DialogDescription>
                  請上傳符合模板格式的 Excel 檔案
                </DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                {uploadStatus === 'idle' && (
                  <>
                    <div
                      className="border-2 border-dashed rounded-lg p-8 text-center cursor-pointer hover:bg-muted/50 transition-colors"
                      onClick={() => fileInputRef.current?.click()}
                    >
                      <FileSpreadsheet className="h-12 w-12 mx-auto text-muted-foreground mb-4" />
                      <p className="text-sm text-muted-foreground">
                        點擊或拖曳 Excel 檔案到此處
                      </p>
                      <p className="text-xs text-muted-foreground mt-2">
                        支援 .xlsx 格式
                      </p>
                    </div>
                    <input
                      ref={fileInputRef}
                      type="file"
                      accept=".xlsx"
                      className="hidden"
                      onChange={handleExcelUpload}
                    />
                    <Alert>
                      <FileText className="h-4 w-4" />
                      <AlertTitle>模板下載</AlertTitle>
                      <AlertDescription>
                        請使用「學測英文試卷上傳模板」格式
                        <br />
                        <a
                          href="/templates/學測英文試卷上傳模板.xlsx"
                          download
                          className="text-primary underline"
                        >
                          下載模板
                        </a>
                      </AlertDescription>
                    </Alert>
                  </>
                )}

                {uploadStatus === 'uploading' && (
                  <div className="space-y-4">
                    <div className="flex items-center gap-3">
                      <Loader2 className="h-5 w-5 animate-spin text-primary" />
                      <span>{uploadMessage}</span>
                    </div>
                    <Progress value={uploadProgress} />
                  </div>
                )}

                {uploadStatus === 'success' && (
                  <Alert className="border-green-500 bg-green-50">
                    <CheckCircle className="h-4 w-4 text-green-600" />
                    <AlertTitle className="text-green-800">匯入成功</AlertTitle>
                    <AlertDescription className="text-green-700">
                      {uploadMessage}
                    </AlertDescription>
                  </Alert>
                )}

                {uploadStatus === 'error' && (
                  <Alert variant="destructive">
                    <AlertCircle className="h-4 w-4" />
                    <AlertTitle>匯入失敗</AlertTitle>
                    <AlertDescription>{uploadMessage}</AlertDescription>
                  </Alert>
                )}
              </div>
              <DialogFooter>
                <Button
                  variant="outline"
                  onClick={() => {
                    setIsUploadDialogOpen(false);
                    setUploadStatus('idle');
                    setUploadProgress(0);
                  }}
                >
                  關閉
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>

          {/* 新增試卷 */}
          <Dialog open={isDialogOpen} onOpenChange={setIsDialogOpen}>
            <DialogTrigger asChild>
              <Button onClick={() => { setSelectedExam(null); setFormData({ difficulty: '中等', totalScore: 100, durationMinutes: 100, status: 'draft' }); }}>
                <Plus className="h-4 w-4 mr-2" />
                新增試卷
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-2xl">
              <DialogHeader>
                <DialogTitle>{selectedExam ? "編輯試卷" : "新增試卷"}</DialogTitle>
                <DialogDescription>設定試卷的基本資訊</DialogDescription>
              </DialogHeader>
              <div className="space-y-4 py-4">
                <div className="grid grid-cols-2 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="examId">試卷 ID *</Label>
                    <Input
                      id="examId"
                      placeholder="例如：EXAM_2025_001"
                      value={formData.id || ""}
                      onChange={(e) => setFormData({ ...formData, id: e.target.value })}
                      disabled={!!selectedExam}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="year">年份 *</Label>
                    <Input
                      id="year"
                      type="number"
                      placeholder="例如：114"
                      value={formData.year || ""}
                      onChange={(e) => setFormData({ ...formData, year: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="title">試卷名稱 *</Label>
                  <Input
                    id="title"
                    placeholder="例如：114年學測英文試題"
                    value={formData.title || ""}
                    onChange={(e) => setFormData({ ...formData, title: e.target.value })}
                  />
                </div>
                <div className="grid grid-cols-3 gap-4">
                  <div className="space-y-2">
                    <Label htmlFor="month">月份</Label>
                    <Input
                      id="month"
                      type="number"
                      placeholder="1-12"
                      value={formData.month || ""}
                      onChange={(e) => setFormData({ ...formData, month: parseInt(e.target.value) })}
                    />
                  </div>
                  <div className="space-y-2">
                    <Label>難度</Label>
                    <Select
                      value={formData.difficulty}
                      onValueChange={(v) => setFormData({ ...formData, difficulty: v as DifficultyLevel })}
                    >
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                      <SelectContent>
                        <SelectItem value="簡單">簡單</SelectItem>
                        <SelectItem value="中等">中等</SelectItem>
                        <SelectItem value="困難">困難</SelectItem>
                      </SelectContent>
                    </Select>
                  </div>
                  <div className="space-y-2">
                    <Label htmlFor="duration">時間 (分鐘)</Label>
                    <Input
                      id="duration"
                      type="number"
                      value={formData.durationMinutes || 100}
                      onChange={(e) => setFormData({ ...formData, durationMinutes: parseInt(e.target.value) })}
                    />
                  </div>
                </div>
                <div className="space-y-2">
                  <Label htmlFor="notes">備註</Label>
                  <Textarea
                    id="notes"
                    placeholder="選填"
                    value={formData.notes || ""}
                    onChange={(e) => setFormData({ ...formData, notes: e.target.value })}
                    rows={2}
                  />
                </div>
              </div>
              <DialogFooter>
                <Button variant="outline" onClick={() => setIsDialogOpen(false)}>取消</Button>
                <Button onClick={handleSave} disabled={adminLoading}>
                  {adminLoading && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                  儲存
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {examsError && (
        <Alert variant="destructive">
          <AlertCircle className="h-4 w-4" />
          <AlertTitle>載入錯誤</AlertTitle>
          <AlertDescription>{examsError}</AlertDescription>
        </Alert>
      )}

      <Card>
        <CardHeader>
          <CardTitle>試卷列表</CardTitle>
          <CardDescription>共 {exams.length} 份試卷</CardDescription>
        </CardHeader>
        <CardContent>
          {exams.length === 0 ? (
            <div className="text-center py-12 text-muted-foreground">
              <FileSpreadsheet className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>尚無試卷</p>
              <p className="text-sm mt-2">點擊「匯入 Excel」或「新增試卷」開始</p>
            </div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>試卷名稱</TableHead>
                  <TableHead>年份</TableHead>
                  <TableHead>題目統計</TableHead>
                  <TableHead>難度</TableHead>
                  <TableHead>狀態</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {exams.map((exam) => {
                  const stats = getExamStats(exam.id);
                  return (
                    <TableRow key={exam.id}>
                      <TableCell>
                        <div>
                          <div className="font-medium">{exam.title}</div>
                          <div className="text-xs text-muted-foreground">{exam.id}</div>
                        </div>
                      </TableCell>
                      <TableCell>{exam.year} 年{exam.month ? ` ${exam.month} 月` : ''}</TableCell>
                      <TableCell>
                        {stats ? (
                          <div className="flex gap-1 flex-wrap">
                            {stats.vocabCount > 0 && (
                              <Badge variant="outline" className="text-xs">
                                <BookOpen className="h-3 w-3 mr-1" />
                                {stats.vocabCount}
                              </Badge>
                            )}
                            {(stats.clozeGroupCount + stats.contextualGroupCount + stats.structureGroupCount + stats.readingGroupCount + stats.mixedGroupCount) > 0 && (
                              <Badge variant="outline" className="text-xs">
                                <FileText className="h-3 w-3 mr-1" />
                                {stats.clozeGroupCount + stats.contextualGroupCount + stats.structureGroupCount + stats.readingGroupCount + stats.mixedGroupCount} 組
                              </Badge>
                            )}
                            {stats.translationCount > 0 && (
                              <Badge variant="outline" className="text-xs">
                                <Languages className="h-3 w-3 mr-1" />
                                {stats.translationCount}
                              </Badge>
                            )}
                            {stats.essayCount > 0 && (
                              <Badge variant="outline" className="text-xs">
                                <PenTool className="h-3 w-3 mr-1" />
                                {stats.essayCount}
                              </Badge>
                            )}
                          </div>
                        ) : (
                          <span className="text-muted-foreground text-sm">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge variant="outline">{exam.difficulty}</Badge>
                      </TableCell>
                      <TableCell>{getStatusBadge(exam.status)}</TableCell>
                      <TableCell className="text-right">
                        <div className="flex justify-end gap-1">
                          {exam.status === 'draft' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handlePublish(exam.id)}
                              title="發布"
                            >
                              <Eye className="h-4 w-4" />
                            </Button>
                          )}
                          {exam.status === 'published' && (
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => handleArchive(exam.id)}
                              title="封存"
                            >
                              <Archive className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleEdit(exam)}
                            title="編輯"
                          >
                            <Edit className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="sm"
                            onClick={() => handleDelete(exam.id)}
                            title="刪除"
                            className="text-destructive hover:text-destructive"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ExamAdmin;
