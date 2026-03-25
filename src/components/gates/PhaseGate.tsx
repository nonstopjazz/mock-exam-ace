import { usePhase } from '@/contexts/PhaseContext';
import { LockedPage } from './LockedPage';
import type { Phase } from '@/contexts/PhaseContext';

interface PhaseGateProps {
  requiredPhase: Phase;
  title: string;
  description: string;
  children: React.ReactNode;
}

/**
 * Renders children if the current phase >= requiredPhase,
 * otherwise shows a LockedPage.
 */
export function PhaseGate({ requiredPhase, title, description, children }: PhaseGateProps) {
  const currentPhase = usePhase();

  if (currentPhase >= requiredPhase) {
    return <>{children}</>;
  }

  return <LockedPage title={title} description={description} />;
}
