/**
 * Development-only Phase Switcher
 *
 * This component allows developers to simulate different phases
 * to preview how the UI will look for different user tiers.
 *
 * IMPORTANT: This component is completely removed in production builds.
 */

import { useState, useEffect } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Settings2, X } from "lucide-react";

export type SimulatedPhase = 0 | 1 | 2;

const STORAGE_KEY = "dev_simulated_phase";

const phaseLabels: Record<SimulatedPhase, { label: string; description: string; color: string }> = {
  0: { label: "Phase 0", description: "Public MVP", color: "bg-emerald-500" },
  1: { label: "Phase 1", description: "Free Member", color: "bg-blue-500" },
  2: { label: "Phase 2", description: "Premium", color: "bg-purple-500" },
};

// Hook to get/set simulated phase
export function useSimulatedPhase(): [SimulatedPhase, (phase: SimulatedPhase) => void] {
  const [phase, setPhaseState] = useState<SimulatedPhase>(() => {
    if (typeof window === "undefined") return 0;
    const stored = localStorage.getItem(STORAGE_KEY);
    return (stored ? parseInt(stored, 10) : 0) as SimulatedPhase;
  });

  const setPhase = (newPhase: SimulatedPhase) => {
    setPhaseState(newPhase);
    localStorage.setItem(STORAGE_KEY, String(newPhase));
    // Dispatch custom event so other components can react
    window.dispatchEvent(new CustomEvent("dev-phase-change", { detail: newPhase }));
  };

  useEffect(() => {
    const handler = (e: CustomEvent<SimulatedPhase>) => {
      setPhaseState(e.detail);
    };
    window.addEventListener("dev-phase-change", handler as EventListener);
    return () => window.removeEventListener("dev-phase-change", handler as EventListener);
  }, []);

  return [phase, setPhase];
}

// Helper to get current simulated phase (for use outside React)
export function getSimulatedPhase(): SimulatedPhase {
  if (typeof window === "undefined") return 0;
  const stored = localStorage.getItem(STORAGE_KEY);
  return (stored ? parseInt(stored, 10) : 0) as SimulatedPhase;
}

// The actual switcher component
export function DevPhaseSwitcher() {
  // CRITICAL: Never render in production
  if (!import.meta.env.DEV) {
    return null;
  }

  const [phase, setPhase] = useSimulatedPhase();
  const [isOpen, setIsOpen] = useState(false);

  const currentPhase = phaseLabels[phase];

  return (
    <div className="fixed bottom-4 right-4 z-50">
      {isOpen ? (
        <div className="bg-background border-2 border-dashed border-orange-500 rounded-lg shadow-xl p-4 w-64">
          <div className="flex items-center justify-between mb-3">
            <div className="flex items-center gap-2">
              <Settings2 className="h-4 w-4 text-orange-500" />
              <span className="text-sm font-bold text-orange-500">DEV MODE</span>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="h-6 w-6 p-0"
              onClick={() => setIsOpen(false)}
            >
              <X className="h-4 w-4" />
            </Button>
          </div>

          <p className="text-xs text-muted-foreground mb-3">
            模擬不同階段的畫面呈現（僅影響視覺，不影響路由）
          </p>

          <div className="space-y-2">
            {([0, 1, 2] as SimulatedPhase[]).map((p) => {
              const info = phaseLabels[p];
              const isActive = phase === p;
              return (
                <button
                  key={p}
                  onClick={() => setPhase(p)}
                  className={`w-full text-left p-2 rounded-md border transition-all ${
                    isActive
                      ? "border-primary bg-primary/10"
                      : "border-transparent hover:bg-muted"
                  }`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`w-2 h-2 rounded-full ${info.color}`} />
                    <span className="font-medium text-sm">{info.label}</span>
                    {isActive && (
                      <Badge variant="secondary" className="text-xs ml-auto">
                        目前
                      </Badge>
                    )}
                  </div>
                  <p className="text-xs text-muted-foreground ml-4">
                    {info.description}
                  </p>
                </button>
              );
            })}
          </div>

          <div className="mt-3 pt-3 border-t">
            <p className="text-xs text-orange-500/80">
              Production 環境不會顯示此切換器
            </p>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setIsOpen(true)}
          className="flex items-center gap-2 bg-orange-500 text-white px-3 py-2 rounded-lg shadow-lg hover:bg-orange-600 transition-colors"
        >
          <Settings2 className="h-4 w-4" />
          <span className="text-sm font-medium">{currentPhase.label}</span>
          <div className={`w-2 h-2 rounded-full ${currentPhase.color} bg-white`} />
        </button>
      )}
    </div>
  );
}
