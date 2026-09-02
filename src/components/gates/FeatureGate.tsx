import { FEATURES } from '@/config/features';
import { LockedPage } from './LockedPage';

interface FeatureGateProps {
  featureId: string;
  children: React.ReactNode;
}

/**
 * 依 src/config/features.ts 的旗標決定是否渲染 children。
 *
 * 與 PhaseGate 的差別：PhaseGate 看的是後端目前的 phase，
 * FeatureGate 看的是程式碼裡明確設定的旗標 —— 用於「這個功能已經寫好，
 * 但我們要能立刻關掉它」的情況。關掉旗標不會動到任何資料。
 */
export function FeatureGate({ featureId, children }: FeatureGateProps) {
  const feature = FEATURES[featureId];

  if (feature?.status === 'enabled') {
    return <>{children}</>;
  }

  return (
    <LockedPage
      title={feature?.label ?? '功能未開放'}
      description={feature?.description ?? '這項功能目前尚未開放，敬請期待！'}
    />
  );
}
