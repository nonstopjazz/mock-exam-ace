import { Clock } from "lucide-react";
import { Progress } from "@/components/ui/progress";
import { useEffect, useState } from "react";

interface QuestionTimerProps {
  totalSeconds: number;
  onTimeUp?: () => void;
  isPaused?: boolean;
}

export const QuestionTimer = ({ totalSeconds, onTimeUp, isPaused = false }: QuestionTimerProps) => {
  const [secondsLeft, setSecondsLeft] = useState(totalSeconds);

  useEffect(() => {
    setSecondsLeft(totalSeconds);
  }, [totalSeconds]);

  useEffect(() => {
    if (isPaused) return;

    const timer = setInterval(() => {
      setSecondsLeft((prev) => {
        if (prev <= 1) {
          onTimeUp?.();
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => clearInterval(timer);
  }, [isPaused, onTimeUp]);

  const minutes = Math.floor(secondsLeft / 60);
  const seconds = secondsLeft % 60;
  const percentage = (secondsLeft / totalSeconds) * 100;
  const isUrgent = secondsLeft <= 30;

  return (
    <div className="space-y-2">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Clock className={`h-5 w-5 ${isUrgent ? "text-destructive animate-pulse" : "text-foreground"}`} />
          <span className={`text-sm font-medium ${isUrgent ? "text-destructive" : "text-foreground"}`}>
            {String(minutes).padStart(2, "0")}:{String(seconds).padStart(2, "0")}
          </span>
        </div>
        {isUrgent && (
          <span className="text-xs text-destructive font-bold animate-pulse">
            Time running out!
          </span>
        )}
      </div>
      <Progress 
        value={percentage} 
        className={`h-2 ${isUrgent ? "bg-destructive/20" : ""}`}
      />
    </div>
  );
};
