import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { useAdmin, clearAdminCache } from '@/hooks/useAdmin';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Loader2, LogOut, User, Shield } from 'lucide-react';

interface UserStatusProps {
  compact?: boolean;
}

export function UserStatus({ compact = false }: UserStatusProps) {
  const { user, loading: authLoading, signOut } = useAuth();
  const { isAdmin, loading: adminLoading } = useAdmin();
  const navigate = useNavigate();

  const handleLogin = () => {
    navigate('/login');
  };

  const handleLogout = async () => {
    clearAdminCache();
    await signOut();
    navigate('/');
  };

  // Loading state
  if (authLoading) {
    return (
      <Button variant="ghost" size="sm" disabled>
        <Loader2 className="h-4 w-4 animate-spin" />
      </Button>
    );
  }

  // Not logged in
  if (!user) {
    return (
      <Button variant="outline" size="sm" onClick={handleLogin}>
        登入
      </Button>
    );
  }

  // Logged in - compact mode (mobile)
  if (compact) {
    return (
      <div className="space-y-3 px-4 py-2">
        <div className="flex items-center gap-2">
          <User className="h-4 w-4 text-muted-foreground" />
          <span className="text-sm font-medium truncate max-w-[180px]">
            {user.email}
          </span>
        </div>
        <div className="flex items-center gap-2 text-xs text-muted-foreground">
          <code className="bg-muted px-1.5 py-0.5 rounded">
            {user.id.slice(0, 8)}
          </code>
          {adminLoading ? (
            <Loader2 className="h-3 w-3 animate-spin" />
          ) : isAdmin ? (
            <Badge variant="default" className="text-xs">
              <Shield className="h-3 w-3 mr-1" />
              Admin
            </Badge>
          ) : (
            <Badge variant="secondary" className="text-xs">User</Badge>
          )}
        </div>
        <Button
          variant="outline"
          size="sm"
          className="w-full"
          onClick={handleLogout}
        >
          <LogOut className="h-4 w-4 mr-2" />
          登出
        </Button>
      </div>
    );
  }

  // Logged in - desktop dropdown
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="gap-2">
          <User className="h-4 w-4" />
          <span className="max-w-[120px] truncate hidden lg:inline">
            {user.email?.split('@')[0]}
          </span>
          {!adminLoading && isAdmin && (
            <Shield className="h-3 w-3 text-primary" />
          )}
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-64">
        <DropdownMenuLabel className="font-normal">
          <div className="flex flex-col space-y-1">
            <p className="text-sm font-medium truncate">{user.email}</p>
            <div className="flex items-center gap-2 text-xs text-muted-foreground">
              <code className="bg-muted px-1.5 py-0.5 rounded">
                {user.id.slice(0, 8)}
              </code>
              {adminLoading ? (
                <Loader2 className="h-3 w-3 animate-spin" />
              ) : isAdmin ? (
                <Badge variant="default" className="text-xs">Admin</Badge>
              ) : (
                <Badge variant="secondary" className="text-xs">User</Badge>
              )}
            </div>
          </div>
        </DropdownMenuLabel>
        <DropdownMenuSeparator />
        {isAdmin && (
          <>
            <DropdownMenuItem onClick={() => navigate('/admin/packs')}>
              <Shield className="h-4 w-4 mr-2" />
              後台管理
            </DropdownMenuItem>
            <DropdownMenuSeparator />
          </>
        )}
        <DropdownMenuItem onClick={handleLogout}>
          <LogOut className="h-4 w-4 mr-2" />
          登出
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
