import { Eye, ShieldCheck } from "lucide-react";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";

/**
 * 「你看到的不是學生看到的」。
 *
 * 🛑 管理員本來就會跳過循序解鎖——不然要預覽第 20 支影片得先把前 19 支
 *    看到 90%，內容管理做不下去。那是刻意的。
 *
 *    但沒有這個提示的話，管理員打開循序課看到全部都開著，
 *    只會得到一個結論：鎖壞了。這正是它被回報的方式。
 *
 * 切到預覽之後，鎖與【發影片位址的 RPC】會一起生效——不是只有畫面變。
 */

interface AdminViewNoticeProps {
  /** DRIP 才有解鎖可言，週次課不需要這個提示 */
  isDrip: boolean;
  previewing: boolean;
  onChange: (previewing: boolean) => void;
}

export function AdminViewNotice({ isDrip, previewing, onChange }: AdminViewNoticeProps) {
  return (
    <Alert className={previewing ? "border-primary/20 bg-primary/5" : undefined}>
      {previewing ? <Eye className="h-4 w-4" /> : <ShieldCheck className="h-4 w-4" />}
      <AlertDescription>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div className="min-w-0">
            {previewing ? (
              <p>
                <strong>以學生身分預覽中。</strong>
                {isDrip
                  ? "循序解鎖會照學生的規則生效，沒看完就進不去下一個單元。"
                  : "這門課沒有循序解鎖，所以顯示的內容跟平常一樣。"}
              </p>
            ) : (
              <p>
                <strong>你是管理員，看到的是全部解鎖的樣子。</strong>
                {isDrip
                  ? "這是刻意的——不然要預覽最後一支影片得先把前面全部看完。學生會被鎖住。"
                  : "這門課沒有循序解鎖，所以學生看到的跟你一樣。"}
              </p>
            )}
            <p className="mt-1 text-sm text-muted-foreground">
              切換之後，鎖與發影片位址的 RPC 會一起改變 —— 不是只有畫面。
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <Switch id="preview-as-student" checked={previewing} onCheckedChange={onChange} />
            <Label htmlFor="preview-as-student" className="whitespace-nowrap text-sm font-normal">
              以學生身分預覽
            </Label>
          </div>
        </div>
      </AlertDescription>
    </Alert>
  );
}
