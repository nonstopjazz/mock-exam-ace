import { useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { Layout } from '@/components/layout/Layout';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { useAuth } from '@/contexts/AuthContext';
import { useSiteIdentifier } from '@/hooks/useSiteIdentifier';
import { supabase } from '@/lib/supabase';
import { Loader2, CheckCircle2, XCircle, Gift, LogIn } from 'lucide-react';

type ClaimStatus = 'loading' | 'claiming' | 'success' | 'already_claimed' | 'error' | 'need_login';

interface ClaimResult {
  success: boolean;
  error?: string;
  already_claimed?: boolean;
  pack_id?: string;
  pack_title?: string;
}

const ERROR_MESSAGES: Record<string, string> = {
  INVALID_TOKEN: '無效的邀請碼',
  TOKEN_EXPIRED: '邀請碼已過期',
  TOKEN_EXHAUSTED: '邀請碼已達使用上限',
  PACK_NOT_FOUND: '找不到對應的單字包',
  NOT_AUTHENTICATED: '請先登入',
};

export default function ClaimPack() {
  const { token } = useParams<{ token: string }>();
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { siteId } = useSiteIdentifier();

  const [status, setStatus] = useState<ClaimStatus>('loading');
  const [result, setResult] = useState<ClaimResult | null>(null);
  const [errorMessage, setErrorMessage] = useState<string>('');

  useEffect(() => {
    // Wait for auth to finish loading
    if (authLoading) return;

    // Check if user is logged in
    if (!user) {
      setStatus('need_login');
      return;
    }

    // Proceed to claim
    claimPack();
  }, [user, authLoading, token]);

  const claimPack = async () => {
    if (!token) {
      setStatus('error');
      setErrorMessage('缺少邀請碼');
      return;
    }

    setStatus('claiming');

    try {
      const { data, error } = await supabase.rpc('claim_pack_with_token', {
        p_token: token,
        p_site: siteId,
      });

      if (error) {
        console.error('Claim error:', error);

        // Check if it's a duplicate key error (already claimed)
        if (error.code === '23505' || error.message?.includes('duplicate key')) {
          setStatus('already_claimed');
          // Try to get pack info for display
          setResult({
            success: true,
            already_claimed: true,
            pack_title: '此單字包',
          });
          return;
        }

        setStatus('error');
        setErrorMessage(error.message || '領取失敗');
        return;
      }

      const claimResult = data as ClaimResult;
      setResult(claimResult);

      if (!claimResult.success) {
        setStatus('error');
        setErrorMessage(ERROR_MESSAGES[claimResult.error || ''] || '領取失敗');
        return;
      }

      if (claimResult.already_claimed) {
        setStatus('already_claimed');
      } else {
        setStatus('success');
      }
    } catch (err) {
      console.error('Claim exception:', err);
      setStatus('error');
      setErrorMessage('發生未知錯誤');
    }
  };

  const handleLogin = () => {
    // Save current URL for redirect after login
    const returnUrl = encodeURIComponent(`/claim/${token}`);
    navigate(`/login?returnUrl=${returnUrl}`);
  };

  const handleGoToCollections = () => {
    navigate('/practice/vocabulary/collections');
  };

  const handleGoHome = () => {
    navigate('/');
  };

  // Render based on status
  const renderContent = () => {
    switch (status) {
      case 'loading':
      case 'claiming':
        return (
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4">
                <Loader2 className="h-12 w-12 animate-spin text-primary" />
              </div>
              <CardTitle>
                {status === 'loading' ? '載入中...' : '正在領取單字包...'}
              </CardTitle>
              <CardDescription>請稍候</CardDescription>
            </CardHeader>
          </Card>
        );

      case 'need_login':
        return (
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary/10">
                <LogIn className="h-8 w-8 text-primary" />
              </div>
              <CardTitle>需要登入</CardTitle>
              <CardDescription>
                請先登入以領取此單字包
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full" onClick={handleLogin}>
                前往登入
              </Button>
              <Button variant="outline" className="w-full" onClick={handleGoHome}>
                返回首頁
              </Button>
            </CardContent>
          </Card>
        );

      case 'success':
        return (
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-green-100">
                <CheckCircle2 className="h-8 w-8 text-green-600" />
              </div>
              <CardTitle className="text-green-600">領取成功！</CardTitle>
              <CardDescription>
                你已成功領取「{result?.pack_title}」
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full" onClick={handleGoToCollections}>
                <Gift className="mr-2 h-4 w-4" />
                查看我的收藏
              </Button>
              <Button variant="outline" className="w-full" onClick={handleGoHome}>
                返回首頁
              </Button>
            </CardContent>
          </Card>
        );

      case 'already_claimed':
        return (
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-blue-100">
                <CheckCircle2 className="h-8 w-8 text-blue-600" />
              </div>
              <CardTitle className="text-blue-600">已經擁有此單字包</CardTitle>
              <CardDescription>
                「{result?.pack_title}」已在你的收藏中
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button className="w-full" onClick={handleGoToCollections}>
                <Gift className="mr-2 h-4 w-4" />
                查看我的收藏
              </Button>
              <Button variant="outline" className="w-full" onClick={handleGoHome}>
                返回首頁
              </Button>
            </CardContent>
          </Card>
        );

      case 'error':
        return (
          <Card className="max-w-md mx-auto">
            <CardHeader className="text-center">
              <div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-red-100">
                <XCircle className="h-8 w-8 text-red-600" />
              </div>
              <CardTitle className="text-red-600">領取失敗</CardTitle>
              <CardDescription>{errorMessage}</CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              <Button variant="outline" className="w-full" onClick={handleGoHome}>
                返回首頁
              </Button>
            </CardContent>
          </Card>
        );

      default:
        return null;
    }
  };

  return (
    <Layout>
      <div className="container mx-auto px-4 py-12">
        {renderContent()}
      </div>
    </Layout>
  );
}
