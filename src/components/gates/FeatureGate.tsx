import { FEATURES } from '@/config/features';
import { LockedPage } from './LockedPage';

interface FeatureGateProps {
  featureId: string;
  /** 功能被關閉時顯示的標題。省略時退回 FEATURES 的 label。 */
  title?: string;
  /**
   * 功能被關閉時顯示的說明。
   * 刻意不退回 FEATURES 的 description —— 那描述的是「這個功能是什麼」，
   * 不是「為什麼現在看不到」。兩者混用會顯示出讀起來不對的訊息。
   */
  description?: string;
  children: React.ReactNode;
}

/**
 * 依 src/config/features.ts 的旗標決定是否渲染 children。
 *
 * 與 PhaseGate 的差別：PhaseGate 看的是後端目前的 phase，
 * FeatureGate 看的是程式碼裡明確設定的旗標 —— 用於「這個功能已經寫好，
 * 但我們要能立刻關掉它」的情況。關掉旗標不會動到任何資料。
 *
 * 注意順序：這道閘在 ProtectedRoute 之外。功能被關閉時直接顯示 LockedPage，
 * 不會先要求登入 —— 為了一個看不到的功能而逼使用者登入是沒有道理的。
 */
export function FeatureGate({ featureId, title, description, children }: FeatureGateProps) {
  const feature = FEATURES[featureId];

  if (feature?.status === 'enabled') {
    return <>{children}</>;
  }

  return (
    <LockedPage
      title={title ?? feature?.label ?? '功能未開放'}
      description={description ?? '這項功能目前尚未開放，敬請期待！'}
    />
  );
}
