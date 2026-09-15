import { Loader2 } from "lucide-react";
import { Layout } from "@/components/layout/Layout";
import { LockedPage } from "./LockedPage";
import { useFeatureEnabled } from "@/hooks/learn/useFeatureEnabled";

interface StudentFeatureGateProps {
  /** learn_feature_access.feature 的值，例如 "speaking"。 */
  feature: string;
  title?: string;
  description?: string;
  children: React.ReactNode;
}

/**
 * 依【這個使用者】有沒有被開放某功能，決定要不要渲染 children。
 *
 * 與另外兩道閘的分工：
 *   PhaseGate           後端目前的 phase（整站的進度）
 *   FeatureGate         程式碼裡的旗標（整站的開關）
 *   StudentFeatureGate  資料庫裡的授權（這個人看不看得到）
 *
 * 🛑 這道閘只管畫面。真正的把關在每一支資料 RPC 裡——
 *    speaking_available_prompts、speaking_start_practice 都會自己再檢查一次
 *    learn_feature_enabled()。沒有那一層，這道閘就只是把按鈕藏起來而已。
 *
 * 讀取中顯示轉圈而不是 LockedPage：有權限的人不該先看到一瞬間的「未開放」。
 */
export function StudentFeatureGate({
  feature,
  title,
  description,
  children,
}: StudentFeatureGateProps) {
  const { enabled, loading } = useFeatureEnabled(feature);

  if (loading) {
    return (
      <Layout>
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-12 w-12 animate-spin text-primary" />
        </div>
      </Layout>
    );
  }

  if (!enabled) {
    return (
      <LockedPage
        title={title ?? "功能未開放"}
        description={description ?? "這項功能還沒有對你開放，請聯絡老師。"}
      />
    );
  }

  return <>{children}</>;
}
