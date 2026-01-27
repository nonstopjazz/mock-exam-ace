import { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { GraduationCap, Loader2 } from 'lucide-react';
import { useUserProfile } from '@/hooks/useUserProfile';
import { PRODUCT_CONFIG } from '@/config/product';
import { toast } from 'sonner';

interface GradeSelectionModalProps {
  open: boolean;
  onComplete: () => void;
  onSkip?: () => void;
  allowSkip?: boolean;
}

export function GradeSelectionModal({
  open,
  onComplete,
  onSkip,
  allowSkip = true,
}: GradeSelectionModalProps) {
  const { updateProfile, gradeOptions } = useUserProfile();
  const [selectedGrade, setSelectedGrade] = useState<string>('');
  const [loading, setLoading] = useState(false);

  const handleSubmit = async () => {
    if (!selectedGrade) {
      toast.error('請選擇你的年級');
      return;
    }

    setLoading(true);
    try {
      const success = await updateProfile({ grade: selectedGrade });
      if (success) {
        toast.success('資料已儲存');
        onComplete();
      } else {
        toast.error('儲存失敗，請稍後再試');
      }
    } catch {
      toast.error('發生錯誤，請稍後再試');
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    if (onSkip) {
      onSkip();
    } else {
      onComplete();
    }
  };

  // Get title based on product
  const getTitle = () => {
    switch (PRODUCT_CONFIG.id) {
      case 'GSAT':
        return '請選擇你的年級';
      case 'TOEIC':
        return '請選擇你的身分';
      case 'KIDS':
        return '請選擇小朋友的年級';
      default:
        return '請選擇你的年級';
    }
  };

  const getDescription = () => {
    switch (PRODUCT_CONFIG.id) {
      case 'GSAT':
        return '讓我們更了解你，提供更適合的學習內容';
      case 'TOEIC':
        return '幫助我們推薦最適合你的學習計畫';
      case 'KIDS':
        return '我們會根據年齡提供合適的學習內容';
      default:
        return '讓我們更了解你';
    }
  };

  return (
    <Dialog open={open} onOpenChange={() => {}}>
      <DialogContent
        className="sm:max-w-md"
        onPointerDownOutside={(e) => e.preventDefault()}
        onEscapeKeyDown={(e) => e.preventDefault()}
      >
        <DialogHeader>
          <div className="flex items-center gap-3 mb-2">
            <div className="p-2 rounded-lg bg-primary/10">
              <GraduationCap className="h-6 w-6 text-primary" />
            </div>
            <div>
              <DialogTitle className="text-xl">{getTitle()}</DialogTitle>
              <DialogDescription className="mt-1">
                {getDescription()}
              </DialogDescription>
            </div>
          </div>
        </DialogHeader>

        <div className="py-4">
          <RadioGroup
            value={selectedGrade}
            onValueChange={setSelectedGrade}
            className="grid grid-cols-2 gap-3"
          >
            {gradeOptions.map((option) => (
              <div key={option.value}>
                <RadioGroupItem
                  value={option.value}
                  id={option.value}
                  className="peer sr-only"
                />
                <Label
                  htmlFor={option.value}
                  className="flex items-center justify-center rounded-lg border-2 border-muted bg-popover p-4 hover:bg-accent hover:text-accent-foreground peer-data-[state=checked]:border-primary peer-data-[state=checked]:bg-primary/5 cursor-pointer transition-all"
                >
                  {option.label}
                </Label>
              </div>
            ))}
          </RadioGroup>
        </div>

        <div className="flex flex-col gap-2">
          <Button
            onClick={handleSubmit}
            disabled={!selectedGrade || loading}
            className="w-full"
          >
            {loading ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                儲存中...
              </>
            ) : (
              '開始學習'
            )}
          </Button>
          {allowSkip && (
            <Button
              variant="ghost"
              onClick={handleSkip}
              disabled={loading}
              className="w-full text-muted-foreground"
            >
              稍後再填
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
