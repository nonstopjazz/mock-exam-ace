import { Card } from "@/components/ui/card";
import { LucideIcon } from "lucide-react";

interface StatCardProps {
  icon: LucideIcon;
  label: string;
  value: string | number;
  subtitle?: string;
  variant?: "default" | "treasure" | "explorer";
}

export const StatCard = ({ 
  icon: Icon, 
  label, 
  value, 
  subtitle,
  variant = "default" 
}: StatCardProps) => {
  const variantStyles = {
    default: "bg-card border-border",
    treasure: "bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20",
    explorer: "bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20"
  };

  return (
    <Card className={`p-6 ${variantStyles[variant]} transition-all duration-300 hover:shadow-lg hover:-translate-y-1`}>
      <div className="flex items-start justify-between">
        <div className="space-y-1">
          <p className="text-sm text-muted-foreground">{label}</p>
          <p className="text-3xl font-bold text-foreground">{value}</p>
          {subtitle && <p className="text-xs text-muted-foreground">{subtitle}</p>}
        </div>
        <div className={`p-3 rounded-lg ${
          variant === "treasure" ? "bg-primary/20" :
          variant === "explorer" ? "bg-secondary/20" :
          "bg-muted"
        }`}>
          <Icon className={`h-6 w-6 ${
            variant === "treasure" ? "text-primary" :
            variant === "explorer" ? "text-secondary" :
            "text-foreground"
          }`} />
        </div>
      </div>
    </Card>
  );
};
