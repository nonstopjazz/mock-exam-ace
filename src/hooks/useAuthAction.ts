import { useCallback } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';

/**
 * Hook for handling actions that require authentication.
 * If user is not logged in, redirects to login with returnUrl.
 * If logged in, executes the action.
 */
export function useAuthAction() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();

  const requireAuth = useCallback(
    (action: () => void) => {
      if (!user) {
        // Redirect to login with return URL
        const returnUrl = encodeURIComponent(location.pathname + location.search);
        navigate(`/login?returnUrl=${returnUrl}`);
        return false;
      }
      action();
      return true;
    },
    [user, navigate, location]
  );

  const redirectToLogin = useCallback(
    (customReturnUrl?: string) => {
      const returnUrl = encodeURIComponent(
        customReturnUrl || location.pathname + location.search
      );
      navigate(`/login?returnUrl=${returnUrl}`);
    },
    [navigate, location]
  );

  return {
    isAuthenticated: !!user,
    user,
    requireAuth,
    redirectToLogin,
  };
}
