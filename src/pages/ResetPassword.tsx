import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { supabase } from '@/lib/supabase';
import { POST_LOGIN_LANDING } from '@/config/landing';
import { Lock, Loader2, AlertCircle, LinkIcon } from 'lucide-react';

/**
 * 重設密碼的落地頁——信裡那個連結指到這裡。
 *
 * ── 連結是怎麼變成一個可用的 session 的 ────────────────────────
 * src/lib/supabase.ts 建立 client 時沒有傳 options，所以用的是預設值：
 *   flowType: 'implicit'      → token 放在網址的 hash（#access_token=...&type=recovery）
 *   detectSessionInUrl: true  → client 一載入就自動消化那個 hash
 *
 * 所以這一頁【不需要】自己解析 token，也不需要 exchangeCodeForSession。
 * getSession() 內部會等那個初始化完成，因此它一旦 resolve：
 *   有 session  → 連結有效，可以改密碼
 *   沒 session  → 連結過期、已經用過、或是有人直接打開這個網址
 *
 * ⚠️ 不要改成用 setTimeout 等 hash 被處理完——getSession() 本身就是那個信號。
 *
 * ── 為什麼「失效」這個狀態一定要做 ─────────────────────────────
 * Supabase 的重設連結有時效，而且【點過一次就失效】。少了這個分支，
 * 使用者會看到一個長得很正常的表單，填完送出才發現沒生效——
 * 而那時他通常會以為是自己密碼打錯。
 */

type Phase = 'checking' | 'ready' | 'invalid';

/**
 * 連結失效時，Supabase 會把原因放在 hash 裡。
 * 盡量在 client 清掉 hash 之前讀到它；讀不到也沒關係，不是必要資訊。
 */
function readHashError(): string | null {
  const hash = window.location.hash.replace(/^#/, '');
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const code = params.get('error_code') ?? params.get('error');
  if (!code) return null;
  if (code.includes('expired') || code === 'otp_expired') return '這個重設連結已經過期了。';
  return '這個重設連結沒辦法使用（可能已經用過了）。';
}

export default function ResetPassword() {
  const navigate = useNavigate();
  const { toast } = useToast();

  const [phase, setPhase] = useState<Phase>('checking');
  const [reason, setReason] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const hashError = readHashError();

    void (async () => {
      // getSession() 會等 detectSessionInUrl 處理完才回來，所以這就是判準。
      const { data } = await supabase.auth.getSession();
      if (cancelled) return;

      if (data.session) {
        setPhase('ready');
      } else {
        setReason(hashError ?? '這個重設連結已經失效，或是你直接開啟了這個網址。');
        setPhase('invalid');
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    // 與註冊時的規則一致（Login.tsx 的註冊表單也是 6）。
    if (password.length < 6) {
      setError('密碼至少需要 6 個字元');
      return;
    }
    if (password !== confirm) {
      setError('兩次輸入的密碼不一樣');
      return;
    }

    setSubmitting(true);
    const { error: updateError } = await supabase.auth.updateUser({ password });
    setSubmitting(false);

    if (updateError) {
      setError(updateError.message);
      return;
    }

    // 改完之後這個 session 仍然有效，所以直接進站，不用再登入一次。
    toast({ title: '密碼已更新', description: '已經用新密碼幫你登入。' });
    navigate(POST_LOGIN_LANDING, { replace: true });
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-md">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">設定新密碼</CardTitle>
              <CardDescription>
                {phase === 'ready' ? '設定好之後會直接幫你登入' : '　'}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {phase === 'checking' ? (
                <div className="flex items-center justify-center gap-2 py-8 text-muted-foreground">
                  <Loader2 className="h-5 w-5 animate-spin" />
                  正在確認連結
                </div>
              ) : phase === 'invalid' ? (
                <>
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <div className="rounded-full bg-muted p-3">
                      <LinkIcon className="h-8 w-8 text-muted-foreground" />
                    </div>
                    <p className="text-foreground">{reason}</p>
                    <p className="text-sm text-muted-foreground">
                      重設連結只能用一次，而且有時效。重新要一封新的就可以了。
                    </p>
                  </div>
                  <Button className="w-full" onClick={() => navigate('/auth/forgot-password')}>
                    重新寄一封
                  </Button>
                  <Link
                    to="/login"
                    className="block text-center text-sm text-muted-foreground hover:text-foreground transition-colors"
                  >
                    回到登入
                  </Link>
                </>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="new-password">新密碼</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="new-password"
                        type="password"
                        placeholder="至少 6 個字元"
                        value={password}
                        onChange={(e) => setPassword(e.target.value)}
                        className="pl-10"
                        autoComplete="new-password"
                        minLength={6}
                        required
                      />
                    </div>
                  </div>

                  <div className="space-y-2">
                    <Label htmlFor="confirm-password">再輸入一次</Label>
                    <div className="relative">
                      <Lock className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="confirm-password"
                        type="password"
                        placeholder="確認新密碼"
                        value={confirm}
                        onChange={(e) => setConfirm(e.target.value)}
                        className="pl-10"
                        autoComplete="new-password"
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    更新密碼
                  </Button>
                </form>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
