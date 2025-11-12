import { Flame } from "lucide-react";
import { Badge } from "@/components/ui/badge";

interface ComboIndicatorProps {
  combo: number;
}

export const ComboIndicator = ({ combo }: ComboIndicatorProps) => {
  const getComboLevel = () => {
    if (combo >= 7) return { level: 3, multiplier: "3x", flames: 3, color: "from-orange-500 to-red-600" };
    if (combo >= 5) return { level: 2, multiplier: "2x", flames: 2, color: "from-yellow-500 to-orange-500" };
    if (combo >= 3) return { level: 1, multiplier: "1.5x", flames: 1, color: "from-yellow-400 to-yellow-600" };
    return { level: 0, multiplier: "1x", flames: 0, color: "from-muted to-muted" };
  };

  const comboData = getComboLevel();

  if (combo < 3) {
    return (
      <div className="text-center">
        <p className="text-sm text-muted-foreground">Combo: {combo}</p>
      </div>
    );
  }

  return (
    <div className="relative">
      <Badge 
        className={`bg-gradient-to-r ${comboData.color} text-white px-4 py-2 text-lg font-bold animate-pulse-glow`}
      >
        <div className="flex items-center gap-2">
          {Array.from({ length: comboData.flames }).map((_, i) => (
            <Flame key={i} className="h-5 w-5 animate-float" />
          ))}
          <span>{combo} Combo!</span>
          <span className="ml-2 text-white/90">{comboData.multiplier}</span>
        </div>
      </Badge>
      {comboData.level === 3 && (
        <p className="text-xs text-orange-600 font-bold mt-1 animate-pulse">
          LEGENDARY STREAK! 🔥
        </p>
      )}
    </div>
  );
};
