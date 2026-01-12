import { useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { supabase } from '@/lib/supabase';
import { Loader2 } from 'lucide-react';

export default function AuthCallback() {
  const navigate = useNavigate();

  useEffect(() => {
    const handleCallback = async () => {
      const { error } = await supabase.auth.getSession();

      if (error) {
        console.error('Auth callback error:', error);
        navigate('/login?error=auth_failed', { replace: true });
        return;
      }

      // Get return URL from localStorage (set before OAuth redirect)
      const returnUrl = localStorage.getItem('auth_return_url') || '/practice/vocabulary';
      localStorage.removeItem('auth_return_url');

      navigate(returnUrl, { replace: true });
    };

    handleCallback();
  }, [navigate]);

  return (
    <div className="flex flex-col items-center justify-center min-h-screen gap-4">
      <Loader2 className="h-8 w-8 animate-spin text-primary" />
      <p className="text-muted-foreground">正在完成登入...</p>
    </div>
  );
}
