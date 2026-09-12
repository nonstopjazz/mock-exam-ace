import { useState } from 'react';
import { Link } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useAuth } from '@/contexts/AuthContext';
import { Mail, Loader2, AlertCircle, MailCheck, ArrowLeft } from 'lucide-react';

/**
 * 忘記密碼：寄出重設連結。
 *
 * 🛑 不論那個 email 有沒有註冊過，成功畫面【完全一樣】。
 *
 *    supabase.auth.resetPasswordForEmail() 本來就不會告訴呼叫端帳號存不存在，
 *    如果這一頁反過來顯示「查無此帳號」，等於把一個帳號列舉工具送給任何人：
 *    輸入一串 email，就能篩出哪些人是這個站的使用者。
 *
 *    所以這裡連 error 都不細分——唯一會顯示錯誤的情況是「根本沒送出去」
 *    （網路斷線、Supabase 掛了），那與帳號存不存在無關。
 */
export default function ForgotPassword() {
  const { resetPassword } = useAuth();
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);

    const { error: resetError } = await resetPassword(email.trim());
    setSubmitting(false);

    if (resetError) {
      // 這裡的 error 是「請求本身失敗」，不是「查無此人」。
      setError('現在沒辦法寄出重設信，請稍後再試一次。');
      return;
    }
    setSent(true);
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        <div className="mx-auto max-w-md">
          <Card>
            <CardHeader className="text-center">
              <CardTitle className="text-2xl">重設密碼</CardTitle>
              <CardDescription>
                {sent ? '請到信箱收信' : '輸入註冊時使用的 Email，我們會寄一封重設連結給你'}
              </CardDescription>
            </CardHeader>

            <CardContent className="space-y-6">
              {sent ? (
                <>
                  <div className="flex flex-col items-center gap-3 py-4 text-center">
                    <div className="rounded-full bg-success/10 p-3">
                      <MailCheck className="h-8 w-8 text-success" />
                    </div>
                    {/* 刻意不說「已寄出到 xxx」——那等於確認了這個帳號存在 */}
                    <p className="text-foreground">
                      如果 <span className="font-medium">{email.trim()}</span> 有註冊過帳號，
                      重設連結已經寄出。
                    </p>
                    <p className="text-sm text-muted-foreground">
                      信可能會進到垃圾郵件匣。連結只能用一次，而且有時效。
                    </p>
                  </div>

                  <Button variant="outline" className="w-full" onClick={() => setSent(false)}>
                    換一個 Email 再試
                  </Button>
                </>
              ) : (
                <form onSubmit={handleSubmit} className="space-y-4">
                  <div className="space-y-2">
                    <Label htmlFor="forgot-email">Email</Label>
                    <div className="relative">
                      <Mail className="absolute left-3 top-3 h-4 w-4 text-muted-foreground" />
                      <Input
                        id="forgot-email"
                        type="email"
                        placeholder="your@email.com"
                        value={email}
                        onChange={(e) => setEmail(e.target.value)}
                        className="pl-10"
                        autoComplete="email"
                        required
                      />
                    </div>
                  </div>

                  <Button type="submit" className="w-full" disabled={submitting}>
                    {submitting ? <Loader2 className="h-4 w-4 animate-spin mr-2" /> : null}
                    寄出重設連結
                  </Button>
                </form>
              )}

              {error && (
                <div className="flex items-center gap-2 p-3 text-sm text-destructive bg-destructive/10 rounded-md">
                  <AlertCircle className="h-4 w-4 shrink-0" />
                  <span>{error}</span>
                </div>
              )}

              {/*
                用 Google 註冊的帳號原本沒有密碼。不講這一句的話，那些人會在這裡
                一直等一封他們其實不需要的信——而那封信對他們是有效的，只是繞遠路。
              */}
              <p className="text-xs text-center text-muted-foreground">
                當初是用 Google 帳號註冊的話，不需要密碼 ——
                直接回登入頁按「使用 Google 帳號繼續」就好。
              </p>

              <Link
                to="/login"
                className="flex items-center justify-center gap-1 text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                <ArrowLeft className="h-4 w-4" />
                回到登入
              </Link>
            </CardContent>
          </Card>
        </div>
      </div>
    </Layout>
  );
}
