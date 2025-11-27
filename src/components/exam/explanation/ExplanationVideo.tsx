import { useState } from 'react';
import { QuestionExplanation } from '@/types/exam';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Video, Upload, Eye, EyeOff } from 'lucide-react';
import { Badge } from '@/components/ui/badge';

interface Props {
  explanation?: QuestionExplanation;
  isAdmin?: boolean;
  onUploadVideo?: (file: File) => void;
  onToggleVideo?: (enabled: boolean) => void;
}

export const ExplanationVideo = ({ 
  explanation, 
  isAdmin = false,
  onUploadVideo,
  onToggleVideo 
}: Props) => {
  const [isDragging, setIsDragging] = useState(false);
  const isVideoEnabled = explanation?.videoEnabled ?? false;

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file && onUploadVideo) {
      onUploadVideo(file);
    }
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);
    const file = e.dataTransfer.files?.[0];
    if (file && onUploadVideo) {
      onUploadVideo(file);
    }
  };

  // 如果影片未啟用且不是管理員，不顯示此區塊
  if (!isVideoEnabled && !isAdmin) {
    return null;
  }

  return (
    <Card className="border-l-4 border-l-purple-500">
      <CardHeader>
        <div className="flex items-center justify-between flex-wrap gap-3">
          <CardTitle className="text-lg flex items-center gap-2">
            <Video className="h-5 w-5 text-purple-500" />
            {explanation?.videoTitle || '影片講解'}
          </CardTitle>
          
          {isAdmin && (
            <div className="flex items-center gap-2">
              <Badge variant={isVideoEnabled ? 'default' : 'outline'}>
                {isVideoEnabled ? '已啟用' : '已隱藏'}
              </Badge>
              <Button
                variant="outline"
                size="sm"
                onClick={() => onToggleVideo?.(!isVideoEnabled)}
                className="gap-2"
              >
                {isVideoEnabled ? (
                  <>
                    <EyeOff className="h-4 w-4" />
                    隱藏影片
                  </>
                ) : (
                  <>
                    <Eye className="h-4 w-4" />
                    顯示影片
                  </>
                )}
              </Button>
            </div>
          )}
        </div>
      </CardHeader>
      
      <CardContent className="space-y-4">
        {isVideoEnabled && explanation?.videoUrl ? (
          // 顯示影片播放器
          <div className="aspect-video w-full rounded-lg overflow-hidden bg-black">
            <video
              controls
              className="w-full h-full"
              src={explanation.videoUrl}
            >
              您的瀏覽器不支援影片播放。
            </video>
          </div>
        ) : isAdmin ? (
          // 管理員上傳區域
          <div
            className={`border-2 border-dashed rounded-lg p-8 text-center transition-colors ${
              isDragging
                ? 'border-primary bg-primary/5'
                : 'border-border hover:border-primary/50'
            }`}
            onDragOver={(e) => {
              e.preventDefault();
              setIsDragging(true);
            }}
            onDragLeave={() => setIsDragging(false)}
            onDrop={handleDrop}
          >
            <Upload className="h-12 w-12 mx-auto mb-4 text-muted-foreground" />
            <p className="text-sm text-muted-foreground mb-4">
              拖曳影片檔案至此，或點擊下方按鈕上傳
            </p>
            <input
              type="file"
              accept="video/*"
              onChange={handleFileSelect}
              className="hidden"
              id="video-upload"
            />
            <label htmlFor="video-upload">
              <Button variant="secondary" className="gap-2" asChild>
                <span>
                  <Upload className="h-4 w-4" />
                  選擇影片檔案
                </span>
              </Button>
            </label>
          </div>
        ) : (
          // 影片未啟用時的提示
          <Alert>
            <AlertDescription>
              此題目前沒有提供影片講解
            </AlertDescription>
          </Alert>
        )}

        {isAdmin && (
          <Alert>
            <AlertDescription className="text-xs">
              <strong>管理員提示：</strong> 支援 MP4、WebM、OGG 等格式。建議檔案大小不超過 100MB。
            </AlertDescription>
          </Alert>
        )}
      </CardContent>
    </Card>
  );
};
