import { useState, useRef } from 'react';
import * as XLSX from 'xlsx';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Upload,
  FileSpreadsheet,
  Download,
  CheckCircle2,
  XCircle,
  AlertCircle,
  Loader2,
} from 'lucide-react';
import { supabase } from '@/lib/supabase';

interface ParsedItem {
  word: string;
  definition: string;
  part_of_speech: string;
  example_sentence: string;
  phonetic: string;
  isValid: boolean;
  error?: string;
}

interface BatchUploadDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  packId: string;
  existingCount: number;
  onSuccess: () => void;
}

// Column mapping configuration
const COLUMN_MAPPINGS: Record<string, string[]> = {
  word: ['word', '單字', 'vocabulary', 'english', '英文', 'term'],
  definition: ['definition', '定義', '意義', 'meaning', '中文', 'translation', '翻譯'],
  part_of_speech: ['part_of_speech', 'pos', '詞性', 'type', 'category'],
  example_sentence: ['example_sentence', 'example', '例句', 'sentence', '句子'],
  phonetic: ['phonetic', 'ipa', '音標', 'pronunciation', '發音'],
};

function findColumnMapping(headers: string[]): Record<string, number> {
  const mapping: Record<string, number> = {};
  const normalizedHeaders = headers.map(h => h.toLowerCase().trim());

  for (const [field, aliases] of Object.entries(COLUMN_MAPPINGS)) {
    for (let i = 0; i < normalizedHeaders.length; i++) {
      if (aliases.some(alias => normalizedHeaders[i].includes(alias.toLowerCase()))) {
        mapping[field] = i;
        break;
      }
    }
  }

  return mapping;
}

function parseRow(row: any[], mapping: Record<string, number>, rowIndex: number): ParsedItem {
  const word = mapping.word !== undefined ? String(row[mapping.word] || '').trim() : '';
  const definition = mapping.definition !== undefined ? String(row[mapping.definition] || '').trim() : '';
  const part_of_speech = mapping.part_of_speech !== undefined ? String(row[mapping.part_of_speech] || '').trim() : '';
  const example_sentence = mapping.example_sentence !== undefined ? String(row[mapping.example_sentence] || '').trim() : '';
  const phonetic = mapping.phonetic !== undefined ? String(row[mapping.phonetic] || '').trim() : '';

  let isValid = true;
  let error: string | undefined;

  if (!word) {
    isValid = false;
    error = '缺少單字';
  }

  return {
    word,
    definition,
    part_of_speech,
    example_sentence,
    phonetic,
    isValid,
    error,
  };
}

export function BatchUploadDialog({
  open,
  onOpenChange,
  packId,
  existingCount,
  onSuccess,
}: BatchUploadDialogProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [step, setStep] = useState<'upload' | 'preview' | 'uploading' | 'done'>('upload');
  const [parsedItems, setParsedItems] = useState<ParsedItem[]>([]);
  const [fileName, setFileName] = useState<string>('');
  const [uploadProgress, setUploadProgress] = useState({ current: 0, total: 0 });
  const [uploadResult, setUploadResult] = useState({ success: 0, failed: 0 });
  const [error, setError] = useState<string | null>(null);

  const validItems = parsedItems.filter(item => item.isValid);
  const invalidItems = parsedItems.filter(item => !item.isValid);

  const resetState = () => {
    setStep('upload');
    setParsedItems([]);
    setFileName('');
    setUploadProgress({ current: 0, total: 0 });
    setUploadResult({ success: 0, failed: 0 });
    setError(null);
    if (fileInputRef.current) {
      fileInputRef.current.value = '';
    }
  };

  const handleClose = () => {
    resetState();
    onOpenChange(false);
  };

  const handleFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setError(null);
    setFileName(file.name);

    try {
      const data = await file.arrayBuffer();
      const workbook = XLSX.read(data, { type: 'array' });

      // Get the first sheet
      const sheetName = workbook.SheetNames[0];
      const sheet = workbook.Sheets[sheetName];

      // Convert to JSON with header row
      const jsonData = XLSX.utils.sheet_to_json(sheet, { header: 1 }) as any[][];

      if (jsonData.length < 2) {
        setError('檔案必須至少包含標題列和一行資料');
        return;
      }

      // First row is headers
      const headers = jsonData[0].map(h => String(h || ''));
      const mapping = findColumnMapping(headers);

      if (mapping.word === undefined) {
        setError('找不到「單字」欄位。請確保有 word、單字、vocabulary 或 english 欄位');
        return;
      }

      // Parse data rows
      const items: ParsedItem[] = [];
      for (let i = 1; i < jsonData.length; i++) {
        const row = jsonData[i];
        if (!row || row.every(cell => !cell)) continue; // Skip empty rows

        const parsed = parseRow(row, mapping, i);
        if (parsed.word) { // Only add if word is not empty
          items.push(parsed);
        }
      }

      if (items.length === 0) {
        setError('沒有找到有效的資料');
        return;
      }

      setParsedItems(items);
      setStep('preview');
    } catch (err) {
      console.error('Parse error:', err);
      setError('檔案解析失敗，請確認檔案格式正確');
    }
  };

  const handleUpload = async () => {
    if (validItems.length === 0) return;

    setStep('uploading');
    setUploadProgress({ current: 0, total: validItems.length });

    let successCount = 0;
    let failedCount = 0;

    // Batch insert in chunks of 50
    const chunkSize = 50;
    for (let i = 0; i < validItems.length; i += chunkSize) {
      const chunk = validItems.slice(i, i + chunkSize);

      const itemsToInsert = chunk.map((item, index) => ({
        pack_id: packId,
        word: item.word,
        definition: item.definition || null,
        part_of_speech: item.part_of_speech || null,
        example_sentence: item.example_sentence || null,
        phonetic: item.phonetic || null,
        sort_order: existingCount + i + index + 1,
      }));

      const { error } = await supabase.from('pack_items').insert(itemsToInsert);

      if (error) {
        console.error('Insert error:', error);
        failedCount += chunk.length;
      } else {
        successCount += chunk.length;
      }

      setUploadProgress({ current: Math.min(i + chunkSize, validItems.length), total: validItems.length });
    }

    setUploadResult({ success: successCount, failed: failedCount });
    setStep('done');

    if (successCount > 0) {
      onSuccess();
    }
  };

  const downloadTemplate = () => {
    const template = [
      ['word', 'definition', 'part_of_speech', 'phonetic', 'example_sentence'],
      ['climate change', '氣候變遷', 'n.', '/ˈklaɪmət tʃeɪndʒ/', 'Climate change is affecting weather patterns worldwide.'],
      ['sustainable', '可持續的', 'adj.', '/səˈsteɪnəbəl/', 'We need to find sustainable solutions.'],
    ];

    const ws = XLSX.utils.aoa_to_sheet(template);
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Template');
    XLSX.writeFile(wb, 'vocabulary_template.xlsx');
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-w-4xl max-h-[90vh]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <FileSpreadsheet className="h-5 w-5" />
            批次上傳單字
          </DialogTitle>
          <DialogDescription>
            上傳 Excel (.xlsx) 或 CSV 檔案來批次新增單字
          </DialogDescription>
        </DialogHeader>

        {/* Step 1: Upload */}
        {step === 'upload' && (
          <div className="space-y-6 py-4">
            {/* Template Download */}
            <Alert>
              <AlertCircle className="h-4 w-4" />
              <AlertDescription className="flex items-center justify-between">
                <span>
                  需要範本嗎？下載範本檔案查看正確格式
                </span>
                <Button variant="outline" size="sm" onClick={downloadTemplate}>
                  <Download className="h-4 w-4 mr-2" />
                  下載範本
                </Button>
              </AlertDescription>
            </Alert>

            {/* File Upload */}
            <div className="border-2 border-dashed rounded-lg p-8 text-center">
              <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
              <div className="space-y-2">
                <Label htmlFor="file-upload" className="cursor-pointer">
                  <span className="text-lg font-medium">
                    點擊選擇檔案或拖放檔案到此處
                  </span>
                </Label>
                <p className="text-sm text-muted-foreground">
                  支援 .xlsx, .xls, .csv 格式
                </p>
                <Input
                  ref={fileInputRef}
                  id="file-upload"
                  type="file"
                  accept=".xlsx,.xls,.csv"
                  onChange={handleFileSelect}
                  className="hidden"
                />
                <Button
                  variant="outline"
                  onClick={() => fileInputRef.current?.click()}
                >
                  選擇檔案
                </Button>
              </div>
            </div>

            {error && (
              <Alert variant="destructive">
                <XCircle className="h-4 w-4" />
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {/* Column Format Guide */}
            <div className="bg-muted/50 rounded-lg p-4">
              <h4 className="font-medium mb-2">支援的欄位名稱</h4>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-2 text-sm">
                <div>
                  <span className="font-medium">單字*：</span>
                  <span className="text-muted-foreground">word, 單字, english</span>
                </div>
                <div>
                  <span className="font-medium">定義：</span>
                  <span className="text-muted-foreground">definition, 定義, meaning</span>
                </div>
                <div>
                  <span className="font-medium">詞性：</span>
                  <span className="text-muted-foreground">part_of_speech, 詞性, pos</span>
                </div>
                <div>
                  <span className="font-medium">音標：</span>
                  <span className="text-muted-foreground">phonetic, 音標, ipa</span>
                </div>
                <div>
                  <span className="font-medium">例句：</span>
                  <span className="text-muted-foreground">example_sentence, 例句</span>
                </div>
              </div>
            </div>
          </div>
        )}

        {/* Step 2: Preview */}
        {step === 'preview' && (
          <div className="space-y-4 py-4">
            {/* Important Notice */}
            <Alert className="bg-amber-50 border-amber-200">
              <AlertCircle className="h-4 w-4 text-amber-600" />
              <AlertDescription className="text-amber-800">
                請確認下方資料無誤後，點擊底部的「<strong>確認上傳</strong>」按鈕完成匯入
              </AlertDescription>
            </Alert>

            {/* Summary */}
            <div className="flex items-center gap-4">
              <Badge variant="outline" className="text-base py-1 px-3">
                <FileSpreadsheet className="h-4 w-4 mr-2" />
                {fileName}
              </Badge>
              <Badge variant="secondary" className="text-base py-1 px-3">
                共 {parsedItems.length} 筆
              </Badge>
              {validItems.length > 0 && (
                <Badge className="text-base py-1 px-3 bg-success">
                  <CheckCircle2 className="h-4 w-4 mr-2" />
                  {validItems.length} 筆有效
                </Badge>
              )}
              {invalidItems.length > 0 && (
                <Badge variant="destructive" className="text-base py-1 px-3">
                  <XCircle className="h-4 w-4 mr-2" />
                  {invalidItems.length} 筆錯誤
                </Badge>
              )}
            </div>

            {/* Preview Table */}
            <ScrollArea className="h-[400px] border rounded-lg">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead className="w-[50px]">#</TableHead>
                    <TableHead className="w-[80px]">狀態</TableHead>
                    <TableHead>單字</TableHead>
                    <TableHead>詞性</TableHead>
                    <TableHead>定義</TableHead>
                    <TableHead>音標</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {parsedItems.map((item, index) => (
                    <TableRow
                      key={index}
                      className={item.isValid ? '' : 'bg-destructive/10'}
                    >
                      <TableCell className="text-muted-foreground">
                        {index + 1}
                      </TableCell>
                      <TableCell>
                        {item.isValid ? (
                          <CheckCircle2 className="h-4 w-4 text-success" />
                        ) : (
                          <div className="flex items-center gap-1">
                            <XCircle className="h-4 w-4 text-destructive" />
                            <span className="text-xs text-destructive">{item.error}</span>
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="font-medium">{item.word || '-'}</TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.part_of_speech || '-'}
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate">
                        {item.definition || '-'}
                      </TableCell>
                      <TableCell className="text-muted-foreground">
                        {item.phonetic || '-'}
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </ScrollArea>
          </div>
        )}

        {/* Step 3: Uploading */}
        {step === 'uploading' && (
          <div className="py-12 text-center space-y-4">
            <Loader2 className="h-12 w-12 animate-spin mx-auto text-primary" />
            <div>
              <p className="text-lg font-medium">正在上傳...</p>
              <p className="text-muted-foreground">
                {uploadProgress.current} / {uploadProgress.total}
              </p>
            </div>
            <div className="w-full max-w-xs mx-auto bg-muted rounded-full h-2">
              <div
                className="bg-primary h-2 rounded-full transition-all"
                style={{
                  width: `${(uploadProgress.current / uploadProgress.total) * 100}%`,
                }}
              />
            </div>
          </div>
        )}

        {/* Step 4: Done */}
        {step === 'done' && (
          <div className="py-12 text-center space-y-4">
            {uploadResult.success > 0 ? (
              <CheckCircle2 className="h-16 w-16 mx-auto text-success" />
            ) : (
              <XCircle className="h-16 w-16 mx-auto text-destructive" />
            )}
            <div>
              <p className="text-xl font-medium">
                {uploadResult.success > 0 ? '上傳完成！' : '上傳失敗'}
              </p>
              <div className="flex justify-center gap-4 mt-2">
                {uploadResult.success > 0 && (
                  <Badge className="text-base py-1 px-3 bg-success">
                    成功: {uploadResult.success} 筆
                  </Badge>
                )}
                {uploadResult.failed > 0 && (
                  <Badge variant="destructive" className="text-base py-1 px-3">
                    失敗: {uploadResult.failed} 筆
                  </Badge>
                )}
              </div>
            </div>
          </div>
        )}

        <DialogFooter>
          {step === 'upload' && (
            <Button variant="outline" onClick={handleClose}>
              取消
            </Button>
          )}

          {step === 'preview' && (
            <>
              <Button variant="outline" onClick={resetState}>
                重新選擇
              </Button>
              <Button
                onClick={handleUpload}
                disabled={validItems.length === 0}
                size="lg"
                className="bg-green-600 hover:bg-green-700 text-white px-8"
              >
                <CheckCircle2 className="h-5 w-5 mr-2" />
                確認上傳 {validItems.length} 筆
              </Button>
            </>
          )}

          {step === 'done' && (
            <Button onClick={handleClose}>
              完成
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
