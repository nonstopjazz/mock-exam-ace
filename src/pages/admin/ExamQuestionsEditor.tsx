import { useState, useRef } from "react";
import { useParams, useNavigate } from "react-router-dom";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from "@/components/ui/accordion";
import {
  ArrowLeft, Upload, Image as ImageIcon, Save, Loader2,
  BookOpen, FileText, PenTool, Trash2, Eye, X
} from "lucide-react";
import { toast } from "sonner";
import { useExam, useExamAdmin, type QuestionGroup, type GroupQuestion, type EssayQuestion } from "@/hooks/useExam";
import { supabase } from "@/lib/supabase";

const ExamQuestionsEditor = () => {
  const { examId } = useParams<{ examId: string }>();
  const navigate = useNavigate();
  const { exam, loading, error } = useExam(examId);
  const { updateQuestionGroup, updateGroupQuestion, updateEssayQuestion, loading: saving } = useExamAdmin();

  // Dialog states
  const [editingGroup, setEditingGroup] = useState<QuestionGroup | null>(null);
  const [editingQuestion, setEditingQuestion] = useState<GroupQuestion | null>(null);
  const [editingEssay, setEditingEssay] = useState<EssayQuestion | null>(null);
  const [isGroupDialogOpen, setIsGroupDialogOpen] = useState(false);
  const [isQuestionDialogOpen, setIsQuestionDialogOpen] = useState(false);
  const [isEssayDialogOpen, setIsEssayDialogOpen] = useState(false);

  // Image upload states
  const [uploading, setUploading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [currentUploadTarget, setCurrentUploadTarget] = useState<'group' | 'question' | 'essay' | null>(null);
  const [currentOptionKey, setCurrentOptionKey] = useState<'A' | 'B' | 'C' | 'D' | null>(null);

  // Form states
  const [groupForm, setGroupForm] = useState<Partial<QuestionGroup>>({});
  const [questionForm, setQuestionForm] = useState<Partial<GroupQuestion>>({});
  const [essayForm, setEssayForm] = useState<Partial<EssayQuestion>>({});

  // Image upload handler
  const uploadImage = async (file: File, folder: string): Promise<string | null> => {
    setUploading(true);
    try {
      const fileExt = file.name.split('.').pop();
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(7)}.${fileExt}`;
      const filePath = `${folder}/${fileName}`;

      const { error: uploadError } = await supabase.storage
        .from('exam-images')
        .upload(filePath, file);

      if (uploadError) throw uploadError;

      const { data } = supabase.storage
        .from('exam-images')
        .getPublicUrl(filePath);

      return data.publicUrl;
    } catch (err: any) {
      toast.error(`上傳失敗: ${err.message}`);
      return null;
    } finally {
      setUploading(false);
    }
  };

  const handleFileSelect = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    const url = await uploadImage(file, examId || 'unknown');
    if (!url) return;

    if (currentUploadTarget === 'group') {
      setGroupForm(prev => ({ ...prev, contentImage: url }));
    } else if (currentUploadTarget === 'question' && currentOptionKey) {
      const key = `option${currentOptionKey}` as 'optionA' | 'optionB' | 'optionC' | 'optionD';
      setQuestionForm(prev => ({ ...prev, [key]: url, optionsType: 'image' }));
    } else if (currentUploadTarget === 'essay') {
      setEssayForm(prev => ({ ...prev, promptImage: url }));
    }

    // Reset file input
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const triggerUpload = (target: 'group' | 'question' | 'essay', optionKey?: 'A' | 'B' | 'C' | 'D') => {
    setCurrentUploadTarget(target);
    setCurrentOptionKey(optionKey || null);
    fileInputRef.current?.click();
  };

  // Edit handlers
  const openGroupEdit = (group: QuestionGroup) => {
    setEditingGroup(group);
    setGroupForm({
      title: group.title,
      content: group.content,
      contentImage: group.contentImage,
      contentTranslation: group.contentTranslation,
    });
    setIsGroupDialogOpen(true);
  };

  const openQuestionEdit = (question: GroupQuestion) => {
    setEditingQuestion(question);
    setQuestionForm({
      questionText: question.questionText,
      optionA: question.optionA,
      optionB: question.optionB,
      optionC: question.optionC,
      optionD: question.optionD,
      optionsType: question.optionsType || 'text',
      correctAnswer: question.correctAnswer,
      explanation: question.explanation,
    });
    setIsQuestionDialogOpen(true);
  };

  const openEssayEdit = (essay: EssayQuestion) => {
    setEditingEssay(essay);
    setEssayForm({
      prompt: essay.prompt,
      promptImage: essay.promptImage,
      scoringCriteria: essay.scoringCriteria,
      sampleEssay: essay.sampleEssay,
      writingTips: essay.writingTips,
    });
    setIsEssayDialogOpen(true);
  };

  // Save handlers
  const saveGroup = async () => {
    if (!editingGroup) return;
    const result = await updateQuestionGroup(editingGroup.id, groupForm);
    if (result) {
      toast.success("題組已更新");
      setIsGroupDialogOpen(false);
      window.location.reload();
    } else {
      toast.error("更新失敗");
    }
  };

  const saveQuestion = async () => {
    if (!editingQuestion) return;
    const result = await updateGroupQuestion(editingQuestion.id, questionForm);
    if (result) {
      toast.success("題目已更新");
      setIsQuestionDialogOpen(false);
      window.location.reload();
    } else {
      toast.error("更新失敗");
    }
  };

  const saveEssay = async () => {
    if (!editingEssay) return;
    const result = await updateEssayQuestion(editingEssay.id, essayForm);
    if (result) {
      toast.success("作文題已更新");
      setIsEssayDialogOpen(false);
      window.location.reload();
    } else {
      toast.error("更新失敗");
    }
  };

  // Group type label
  const getGroupTypeLabel = (type: string) => {
    const labels: Record<string, string> = {
      cloze: '克漏字',
      contextual: '文意選填',
      structure: '篇章結構',
      reading: '閱讀測驗',
      mixed: '混合題',
    };
    return labels[type] || type;
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
      </div>
    );
  }

  if (error || !exam) {
    return (
      <div className="min-h-screen bg-background p-8">
        <Alert variant="destructive">
          <AlertDescription>{error || "找不到試卷"}</AlertDescription>
        </Alert>
        <Button onClick={() => navigate("/admin/exams")} className="mt-4">
          <ArrowLeft className="h-4 w-4 mr-2" />
          返回
        </Button>
      </div>
    );
  }

  const readingGroups = exam.questionGroups.filter(g => g.groupType === 'reading');
  const otherGroups = exam.questionGroups.filter(g => g.groupType !== 'reading');

  return (
    <div className="min-h-screen bg-background">
      {/* Hidden file input */}
      <input
        type="file"
        ref={fileInputRef}
        className="hidden"
        accept="image/*"
        onChange={handleFileSelect}
      />

      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="flex items-center gap-4 mb-8">
          <Button variant="ghost" size="icon" onClick={() => navigate("/admin/exams")}>
            <ArrowLeft className="h-5 w-5" />
          </Button>
          <div>
            <h1 className="text-3xl font-bold text-foreground">{exam.title}</h1>
            <p className="text-muted-foreground">編輯題目與上傳圖片</p>
          </div>
        </div>

        <Tabs defaultValue="reading" className="space-y-6">
          <TabsList>
            <TabsTrigger value="reading" className="gap-2">
              <BookOpen className="h-4 w-4" />
              閱讀測驗 ({readingGroups.length})
            </TabsTrigger>
            <TabsTrigger value="essay" className="gap-2">
              <PenTool className="h-4 w-4" />
              作文題 ({exam.essayQuestions.length})
            </TabsTrigger>
            <TabsTrigger value="other" className="gap-2">
              <FileText className="h-4 w-4" />
              其他題組 ({otherGroups.length})
            </TabsTrigger>
          </TabsList>

          {/* Reading Comprehension Tab */}
          <TabsContent value="reading" className="space-y-6">
            {readingGroups.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                尚無閱讀測驗題組
              </Card>
            ) : (
              <Accordion type="single" collapsible className="space-y-4">
                {readingGroups.map((group, idx) => (
                  <AccordionItem key={group.id} value={group.id} className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">第 {idx + 1} 篇</Badge>
                        <span className="font-medium">{group.title || `閱讀測驗 ${idx + 1}`}</span>
                        {group.contentImage && (
                          <Badge variant="secondary" className="gap-1">
                            <ImageIcon className="h-3 w-3" />
                            有圖片
                          </Badge>
                        )}
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4 space-y-4">
                      {/* Passage Preview */}
                      <Card>
                        <CardHeader className="pb-2">
                          <div className="flex items-center justify-between">
                            <CardTitle className="text-base">文章內容</CardTitle>
                            <Button size="sm" variant="outline" onClick={() => openGroupEdit(group)}>
                              <Upload className="h-4 w-4 mr-2" />
                              編輯 / 上傳圖片
                            </Button>
                          </div>
                        </CardHeader>
                        <CardContent>
                          {group.contentImage && (
                            <div className="mb-4 rounded-lg overflow-hidden border">
                              <img src={group.contentImage} alt="文章圖片" className="w-full max-h-64 object-contain bg-muted" />
                            </div>
                          )}
                          <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-6">
                            {group.content}
                          </p>
                        </CardContent>
                      </Card>

                      {/* Questions */}
                      <div className="space-y-3">
                        <h4 className="font-medium text-sm text-muted-foreground">題目 ({group.questions?.length || 0})</h4>
                        {group.questions?.map((q) => (
                          <Card key={q.id} className="p-4">
                            <div className="flex items-start justify-between gap-4">
                              <div className="flex-1 space-y-2">
                                <div className="flex items-center gap-2">
                                  <Badge variant="outline">第 {q.questionNumber} 題</Badge>
                                  {q.optionsType === 'image' && (
                                    <Badge variant="secondary" className="gap-1">
                                      <ImageIcon className="h-3 w-3" />
                                      圖片選項
                                    </Badge>
                                  )}
                                </div>
                                <p className="text-sm">{q.questionText}</p>
                                <div className="grid grid-cols-2 gap-2 text-sm">
                                  {['A', 'B', 'C', 'D'].map((label) => {
                                    const optionKey = `option${label}` as keyof GroupQuestion;
                                    const optionValue = q[optionKey] as string | undefined;
                                    const isImage = q.optionsType === 'image' && optionValue?.startsWith('http');
                                    return (
                                      <div key={label} className={`p-2 rounded border ${q.correctAnswer === label ? 'border-green-500 bg-green-50 dark:bg-green-950' : ''}`}>
                                        <span className="font-medium">({label})</span>{' '}
                                        {isImage ? (
                                          <img src={optionValue} alt={`選項 ${label}`} className="h-12 inline-block object-contain" />
                                        ) : (
                                          optionValue || '-'
                                        )}
                                      </div>
                                    );
                                  })}
                                </div>
                              </div>
                              <Button size="sm" variant="outline" onClick={() => openQuestionEdit(q)}>
                                編輯
                              </Button>
                            </div>
                          </Card>
                        ))}
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </TabsContent>

          {/* Essay Tab */}
          <TabsContent value="essay" className="space-y-6">
            {exam.essayQuestions.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                尚無作文題
              </Card>
            ) : (
              <div className="space-y-4">
                {exam.essayQuestions.map((essay, idx) => (
                  <Card key={essay.id}>
                    <CardHeader>
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <Badge variant="outline">作文 {idx + 1}</Badge>
                          <CardTitle className="text-lg">{essay.essayType}</CardTitle>
                          {essay.promptImage && (
                            <Badge variant="secondary" className="gap-1">
                              <ImageIcon className="h-3 w-3" />
                              有圖片
                            </Badge>
                          )}
                        </div>
                        <Button size="sm" variant="outline" onClick={() => openEssayEdit(essay)}>
                          <Upload className="h-4 w-4 mr-2" />
                          編輯 / 上傳圖片
                        </Button>
                      </div>
                      <CardDescription>字數要求：{essay.wordCountRequirement} 字 | 配分：{essay.score} 分</CardDescription>
                    </CardHeader>
                    <CardContent className="space-y-4">
                      {essay.promptImage && (
                        <div className="rounded-lg overflow-hidden border">
                          <img src={essay.promptImage} alt="作文題目圖片" className="w-full max-h-64 object-contain bg-muted" />
                        </div>
                      )}
                      <div className="bg-muted/30 p-4 rounded-lg">
                        <p className="whitespace-pre-wrap">{essay.prompt}</p>
                      </div>
                    </CardContent>
                  </Card>
                ))}
              </div>
            )}
          </TabsContent>

          {/* Other Groups Tab */}
          <TabsContent value="other" className="space-y-6">
            {otherGroups.length === 0 ? (
              <Card className="p-8 text-center text-muted-foreground">
                尚無其他題組
              </Card>
            ) : (
              <Accordion type="single" collapsible className="space-y-4">
                {otherGroups.map((group, idx) => (
                  <AccordionItem key={group.id} value={group.id} className="border rounded-lg px-4">
                    <AccordionTrigger className="hover:no-underline">
                      <div className="flex items-center gap-3">
                        <Badge variant="outline">{getGroupTypeLabel(group.groupType)}</Badge>
                        <span className="font-medium">{group.title || `題組 ${idx + 1}`}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="pt-4">
                      <p className="text-sm text-muted-foreground whitespace-pre-wrap line-clamp-4">
                        {group.content}
                      </p>
                      <p className="text-sm text-muted-foreground mt-2">
                        共 {group.questions?.length || 0} 題
                      </p>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            )}
          </TabsContent>
        </Tabs>
      </div>

      {/* Group Edit Dialog */}
      <Dialog open={isGroupDialogOpen} onOpenChange={setIsGroupDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>編輯閱讀測驗文章</DialogTitle>
            <DialogDescription>
              編輯文章內容並上傳相關圖片
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>標題</Label>
              <Input
                value={groupForm.title || ''}
                onChange={(e) => setGroupForm(prev => ({ ...prev, title: e.target.value }))}
                placeholder="文章標題（選填）"
              />
            </div>

            <div className="space-y-2">
              <Label>文章圖片</Label>
              {groupForm.contentImage ? (
                <div className="relative">
                  <img src={groupForm.contentImage} alt="文章圖片" className="w-full max-h-48 object-contain rounded-lg border bg-muted" />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-2 right-2"
                    onClick={() => setGroupForm(prev => ({ ...prev, contentImage: undefined }))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full h-24 border-dashed"
                  onClick={() => triggerUpload('group')}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <Upload className="h-5 w-5 mr-2" />
                  )}
                  點擊上傳文章圖片
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label>文章內容</Label>
              <Textarea
                value={groupForm.content || ''}
                onChange={(e) => setGroupForm(prev => ({ ...prev, content: e.target.value }))}
                placeholder="輸入文章內容"
                rows={10}
              />
            </div>

            <div className="space-y-2">
              <Label>翻譯（選填）</Label>
              <Textarea
                value={groupForm.contentTranslation || ''}
                onChange={(e) => setGroupForm(prev => ({ ...prev, contentTranslation: e.target.value }))}
                placeholder="文章中文翻譯"
                rows={5}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsGroupDialogOpen(false)}>取消</Button>
            <Button onClick={saveGroup} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Question Edit Dialog */}
      <Dialog open={isQuestionDialogOpen} onOpenChange={setIsQuestionDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>編輯題目</DialogTitle>
            <DialogDescription>
              編輯題目內容與選項（可上傳圖片選項）
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>題目文字</Label>
              <Textarea
                value={questionForm.questionText || ''}
                onChange={(e) => setQuestionForm(prev => ({ ...prev, questionText: e.target.value }))}
                placeholder="輸入題目文字"
                rows={3}
              />
            </div>

            <div className="space-y-2">
              <div className="flex items-center justify-between">
                <Label>選項類型</Label>
                <Select
                  value={questionForm.optionsType || 'text'}
                  onValueChange={(value: 'text' | 'image') => setQuestionForm(prev => ({ ...prev, optionsType: value }))}
                >
                  <SelectTrigger className="w-32">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="text">文字</SelectItem>
                    <SelectItem value="image">圖片</SelectItem>
                  </SelectContent>
                </Select>
              </div>
            </div>

            <div className="grid grid-cols-2 gap-4">
              {(['A', 'B', 'C', 'D'] as const).map((label) => {
                const key = `option${label}` as 'optionA' | 'optionB' | 'optionC' | 'optionD';
                const value = questionForm[key] || '';
                const isImage = questionForm.optionsType === 'image';

                return (
                  <div key={label} className="space-y-2">
                    <Label className={questionForm.correctAnswer === label ? 'text-green-600 font-bold' : ''}>
                      選項 {label} {questionForm.correctAnswer === label && '(正確答案)'}
                    </Label>
                    {isImage ? (
                      <div>
                        {value && value.startsWith('http') ? (
                          <div className="relative">
                            <img src={value} alt={`選項 ${label}`} className="w-full h-24 object-contain rounded-lg border bg-muted" />
                            <Button
                              size="icon"
                              variant="destructive"
                              className="absolute top-1 right-1 h-6 w-6"
                              onClick={() => setQuestionForm(prev => ({ ...prev, [key]: '' }))}
                            >
                              <X className="h-3 w-3" />
                            </Button>
                          </div>
                        ) : (
                          <Button
                            variant="outline"
                            className="w-full h-24 border-dashed"
                            onClick={() => triggerUpload('question', label)}
                            disabled={uploading}
                          >
                            {uploading ? (
                              <Loader2 className="h-4 w-4 animate-spin" />
                            ) : (
                              <Upload className="h-4 w-4" />
                            )}
                          </Button>
                        )}
                      </div>
                    ) : (
                      <Input
                        value={value}
                        onChange={(e) => setQuestionForm(prev => ({ ...prev, [key]: e.target.value }))}
                        placeholder={`選項 ${label}`}
                      />
                    )}
                  </div>
                );
              })}
            </div>

            <div className="space-y-2">
              <Label>正確答案</Label>
              <Select
                value={questionForm.correctAnswer || ''}
                onValueChange={(value) => setQuestionForm(prev => ({ ...prev, correctAnswer: value }))}
              >
                <SelectTrigger>
                  <SelectValue placeholder="選擇正確答案" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="A">A</SelectItem>
                  <SelectItem value="B">B</SelectItem>
                  <SelectItem value="C">C</SelectItem>
                  <SelectItem value="D">D</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-2">
              <Label>解析（選填）</Label>
              <Textarea
                value={questionForm.explanation || ''}
                onChange={(e) => setQuestionForm(prev => ({ ...prev, explanation: e.target.value }))}
                placeholder="題目解析"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsQuestionDialogOpen(false)}>取消</Button>
            <Button onClick={saveQuestion} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Essay Edit Dialog */}
      <Dialog open={isEssayDialogOpen} onOpenChange={setIsEssayDialogOpen}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>編輯作文題</DialogTitle>
            <DialogDescription>
              編輯作文題目並上傳相關圖片
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <Label>題目圖片</Label>
              {essayForm.promptImage ? (
                <div className="relative">
                  <img src={essayForm.promptImage} alt="作文題目圖片" className="w-full max-h-48 object-contain rounded-lg border bg-muted" />
                  <Button
                    size="icon"
                    variant="destructive"
                    className="absolute top-2 right-2"
                    onClick={() => setEssayForm(prev => ({ ...prev, promptImage: undefined }))}
                  >
                    <X className="h-4 w-4" />
                  </Button>
                </div>
              ) : (
                <Button
                  variant="outline"
                  className="w-full h-24 border-dashed"
                  onClick={() => triggerUpload('essay')}
                  disabled={uploading}
                >
                  {uploading ? (
                    <Loader2 className="h-5 w-5 animate-spin mr-2" />
                  ) : (
                    <Upload className="h-5 w-5 mr-2" />
                  )}
                  點擊上傳題目圖片
                </Button>
              )}
            </div>

            <div className="space-y-2">
              <Label>題目說明</Label>
              <Textarea
                value={essayForm.prompt || ''}
                onChange={(e) => setEssayForm(prev => ({ ...prev, prompt: e.target.value }))}
                placeholder="輸入作文題目說明"
                rows={6}
              />
            </div>

            <div className="space-y-2">
              <Label>評分標準（選填）</Label>
              <Textarea
                value={essayForm.scoringCriteria || ''}
                onChange={(e) => setEssayForm(prev => ({ ...prev, scoringCriteria: e.target.value }))}
                placeholder="評分標準說明"
                rows={4}
              />
            </div>

            <div className="space-y-2">
              <Label>範文（選填）</Label>
              <Textarea
                value={essayForm.sampleEssay || ''}
                onChange={(e) => setEssayForm(prev => ({ ...prev, sampleEssay: e.target.value }))}
                placeholder="參考範文"
                rows={6}
              />
            </div>

            <div className="space-y-2">
              <Label>寫作提示（選填）</Label>
              <Textarea
                value={essayForm.writingTips || ''}
                onChange={(e) => setEssayForm(prev => ({ ...prev, writingTips: e.target.value }))}
                placeholder="寫作建議與提示"
                rows={3}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setIsEssayDialogOpen(false)}>取消</Button>
            <Button onClick={saveEssay} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 animate-spin mr-2" />}
              儲存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default ExamQuestionsEditor;
