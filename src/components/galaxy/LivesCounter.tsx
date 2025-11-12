import { Heart } from "lucide-react";

interface LivesCounterProps {
  lives: number;
  maxLives: number;
}

export const LivesCounter = ({ lives, maxLives }: LivesCounterProps) => {
  return (
    <div className="flex items-center gap-2">
      <span className="text-sm font-medium text-foreground">生命值：</span>
      <div className="flex gap-1">
        {Array.from({ length: maxLives }).map((_, i) => (
          <Heart
            key={i}
            className={`h-5 w-5 transition-all duration-300 ${
              i < lives
                ? "fill-red-500 text-red-500 animate-pulse"
                : "fill-muted text-muted-foreground opacity-30"
            }`}
          />
        ))}
      </div>
    </div>
  );
};
