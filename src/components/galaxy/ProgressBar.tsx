import { Progress } from "@/components/ui/progress";

interface ProgressBarProps {
  current: number;
  max: number;
  label?: string;
  showValues?: boolean;
}

export const ProgressBar = ({ current, max, label, showValues = true }: ProgressBarProps) => {
  const percentage = (current / max) * 100;
  
  return (
    <div className="w-full space-y-2">
      {label && (
        <div className="flex justify-between items-center text-sm">
          <span className="font-semibold text-foreground">{label}</span>
          {showValues && (
            <span className="text-muted-foreground">
              {current} / {max}
            </span>
          )}
        </div>
      )}
      <Progress value={percentage} className="h-3" />
    </div>
  );
};
