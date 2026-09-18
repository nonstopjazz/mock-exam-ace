import { Component, type ErrorInfo, type ReactNode } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { AlertCircle, RefreshCw, Home, Copy, Check } from "lucide-react";

/**
 * 全站錯誤邊界。
 *
 * 為什麼需要它：在這之前，任何一個元件在 render 時丟錯，React 會把整棵樹
 * 卸載，畫面就變成一片空白 —— 沒有訊息、沒有按鈕，使用者只會回報
 * 「登入後是空白頁面」，而我們拿不到任何線索。
 *
 * 這一層把「空白」換成「一句看得懂的話 + 可複製的錯誤內容」。
 *
 * 🛑 這個元件【不可以】依賴 react-router 的 context。
 *    它同時被放在 Router 外面（接住 provider 層的錯誤）與裡面（接住頁面的錯誤），
 *    在外層時 useNavigate / Link 都不存在。所以導頁一律走 window.location。
 */

interface Props {
  children: ReactNode;
  /** 出現在 console 的標籤，用來分辨是哪一層接到的。 */
  label?: string;
}

interface State {
  error: Error | null;
  copied: boolean;
}

/**
 * 只取路徑，不取 query 與 hash。
 *
 * 🛑 這串文字會顯示在畫面上，使用者很可能直接截圖傳給老師：
 *      /auth/reset-password#access_token=...  → hash 裡是一組可登入的權杖
 *      /login?returnUrl=...                   → query 可能帶其他資訊
 *      /claim/ABC12345                        → 路徑本身就是邀請碼
 *    所以 hash 與 query 整段不取，邀請碼也遮掉。
 */
function safePath(): string {
  try {
    const path = window.location.pathname;
    return path.replace(/^\/claim\/.+$/, "/claim/…");
  } catch {
    return "(unknown)";
  }
}

export class ErrorBoundary extends Component<Props, State> {
  state: State = { error: null, copied: false };

  static getDerivedStateFromError(error: Error): Partial<State> {
    return { error };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    // 主控台仍然要留完整堆疊 —— 畫面上那份是給使用者複製的摘要，
    // 這一份才是開發時真正要看的。
    console.error(`[ErrorBoundary${this.props.label ? `:${this.props.label}` : ""}]`, error, info.componentStack);
  }

  private details(): string {
    const { error } = this.state;
    return [
      `訊息：${error?.message ?? "(無)"}`,
      `位置：${safePath()}`,
      `時間：${new Date().toISOString()}`,
      `瀏覽器：${typeof navigator !== "undefined" ? navigator.userAgent : "(unknown)"}`,
    ].join("\n");
  }

  private handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(this.details());
      this.setState({ copied: true });
      window.setTimeout(() => this.setState({ copied: false }), 2000);
    } catch {
      // 舊瀏覽器或非安全來源沒有 clipboard API。
      // 這時不要假裝成功 —— 下面的文字本來就可以直接選取。
      this.setState({ copied: false });
    }
  };

  render() {
    const { error } = this.state;
    if (!error) return this.props.children;

    return (
      <div className="min-h-screen bg-background">
        <div className="container mx-auto px-4 py-12">
          <div className="mx-auto max-w-md">
            <Card className="p-6">
              <div className="text-center">
                <div className="mx-auto mb-4 w-fit rounded-full bg-destructive/10 p-3">
                  <AlertCircle className="h-12 w-12 text-destructive" />
                </div>
                <h1 className="text-2xl font-bold text-foreground">這個頁面出了點問題</h1>
                <p className="mt-2 text-sm text-muted-foreground">
                  不是你的操作有誤。先重新整理試試看，如果一直出現，把下面的訊息傳給老師。
                </p>
              </div>

              <div className="mt-6 flex flex-col gap-2 sm:flex-row">
                <Button className="flex-1 gap-2" onClick={() => window.location.reload()}>
                  <RefreshCw className="h-4 w-4" />
                  重新整理
                </Button>
                <Button
                  variant="outline"
                  className="flex-1 gap-2"
                  onClick={() => {
                    window.location.href = "/";
                  }}
                >
                  <Home className="h-4 w-4" />
                  回首頁
                </Button>
              </div>

              <div className="mt-6 rounded-lg border border-border bg-muted/50 p-4">
                <div className="mb-2 flex items-center justify-between gap-2">
                  <span className="text-sm font-semibold text-foreground">錯誤訊息</span>
                  <Button variant="ghost" size="sm" className="gap-1 shrink-0" onClick={this.handleCopy}>
                    {this.state.copied ? (
                      <>
                        <Check className="h-4 w-4 text-success" />
                        已複製
                      </>
                    ) : (
                      <>
                        <Copy className="h-4 w-4" />
                        複製
                      </>
                    )}
                  </Button>
                </div>
                {/* select-text + break-all：手機上長按也要選得起來、不能撐破版面 */}
                <pre className="max-h-48 overflow-auto whitespace-pre-wrap break-all select-text font-mono text-xs text-muted-foreground">
                  {this.details()}
                </pre>
              </div>
            </Card>
          </div>
        </div>
      </div>
    );
  }
}
