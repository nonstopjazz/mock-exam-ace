import { CheckCircle, XCircle } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useEffect } from "react";
import { useConfetti } from "@/hooks/galaxy/useConfetti";
import { ConfettiCanvas } from "@/components/galaxy/ConfettiCanvas";

interface FeedbackAnimationProps {
  isCorrect: boolean;
  explanation: string;
  correctAnswer?: string;
  onContinue: () => void;
}

export const FeedbackAnimation = ({
  isCorrect,
  explanation,
  correctAnswer,
  onContinue,
}: FeedbackAnimationProps) => {
  const { confettiRef, celebrate } = useConfetti();

  useEffect(() => {
    if (isCorrect) {
      setTimeout(() => celebrate('sparkles'), 100);
    }
  }, [isCorrect, celebrate]);

  return (
    <>
      <ConfettiCanvas ref={confettiRef} />
      <div className="fixed inset-0 bg-background/95 backdrop-blur-sm z-50 flex items-center justify-center animate-fade-in">
      <Card
        className={`max-w-lg w-full mx-4 p-8 border-4 animate-scale-in ${
          isCorrect
            ? "border-secondary bg-secondary/5"
            : "border-destructive bg-destructive/5"
        }`}
      >
        <div className="text-center space-y-4">
          {/* Icon */}
          <div className="flex justify-center">
            {isCorrect ? (
              <CheckCircle className="h-20 w-20 text-secondary animate-pulse-glow" />
            ) : (
              <XCircle className="h-20 w-20 text-destructive animate-pulse" />
            )}
          </div>

          {/* Title */}
          <h2
            className={`text-3xl font-bold ${
              isCorrect ? "text-secondary" : "text-destructive"
            }`}
          >
            {isCorrect ? "Correct! 🎉" : "Not Quite... 😔"}
          </h2>

          {/* Explanation */}
          <div className="space-y-2">
            <p className="text-foreground font-medium">{explanation}</p>
            {!isCorrect && correctAnswer && (
              <div className="bg-muted p-3 rounded-lg">
                <p className="text-sm text-muted-foreground">Correct answer:</p>
                <p className="text-foreground font-bold">{correctAnswer}</p>
              </div>
            )}
          </div>

          {/* Continue Button */}
          <Button
            onClick={onContinue}
            size="lg"
            className={`w-full ${
              isCorrect
                ? "bg-secondary hover:bg-secondary/90"
                : "bg-primary hover:bg-primary/90"
            }`}
          >
            Continue
          </Button>
        </div>
      </Card>
    </div>
    </>
  );
};
