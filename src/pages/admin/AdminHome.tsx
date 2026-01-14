import { Link } from 'react-router-dom';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Package,
  Key,
  FileText,
  Settings,
  ArrowRight,
  LayoutDashboard,
  Users,
  TrendingUp,
  GraduationCap,
} from 'lucide-react';

interface AdminCardProps {
  title: string;
  description: string;
  icon: React.ReactNode;
  href: string;
  badge?: string;
  stats?: string;
}

function AdminCard({ title, description, icon, href, badge, stats }: AdminCardProps) {
  return (
    <Link to={href}>
      <Card className="group h-full cursor-pointer border-2 transition-all hover:border-primary hover:shadow-lg">
        <CardHeader className="pb-3">
          <div className="flex items-start justify-between">
            <div className="rounded-lg bg-primary/10 p-3 text-primary transition-colors group-hover:bg-primary group-hover:text-primary-foreground">
              {icon}
            </div>
            {badge && (
              <Badge variant="secondary" className="text-xs">
                {badge}
              </Badge>
            )}
          </div>
          <CardTitle className="mt-4 flex items-center gap-2 text-lg">
            {title}
            <ArrowRight className="h-4 w-4 opacity-0 transition-all group-hover:translate-x-1 group-hover:opacity-100" />
          </CardTitle>
          <CardDescription>{description}</CardDescription>
        </CardHeader>
        {stats && (
          <CardContent className="pt-0">
            <p className="text-sm text-muted-foreground">{stats}</p>
          </CardContent>
        )}
      </Card>
    </Link>
  );
}

export default function AdminHome() {
  const adminModules = [
    {
      title: '單字包管理',
      description: '建立、編輯單字包，管理單字內容與圖片',
      icon: <Package className="h-6 w-6" />,
      href: '/admin/packs',
      badge: '核心功能',
    },
    {
      title: 'Token 管理',
      description: '產生邀請碼，追蹤兌換狀態',
      icon: <Key className="h-6 w-6" />,
      href: '/admin/tokens',
    },
    {
      title: 'Blog 文章管理',
      description: '撰寫、編輯部落格文章，管理 SEO 設定',
      icon: <FileText className="h-6 w-6" />,
      href: '/admin/blog',
    },
    {
      title: '模擬考管理',
      description: '上傳學測試卷、管理題目，查看作答統計',
      icon: <GraduationCap className="h-6 w-6" />,
      href: '/admin/exams',
      badge: '新功能',
    },
  ];

  return (
    <div className="min-h-screen bg-gradient-to-br from-background via-background to-muted/30">
      <div className="container mx-auto py-8 px-4 max-w-6xl">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center gap-3 mb-2">
            <div className="rounded-lg bg-primary p-2 text-primary-foreground">
              <LayoutDashboard className="h-6 w-6" />
            </div>
            <div>
              <h1 className="text-3xl font-bold">後台管理中心</h1>
              <p className="text-muted-foreground">管理網站內容與設定</p>
            </div>
          </div>
        </div>

        {/* Quick Stats */}
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-8">
          <Card className="bg-gradient-to-br from-blue-500/10 to-blue-600/5 border-blue-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="rounded-full bg-blue-500/20 p-3">
                  <Package className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">單字包</p>
                  <p className="text-2xl font-bold">管理中</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-green-500/10 to-green-600/5 border-green-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="rounded-full bg-green-500/20 p-3">
                  <Key className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">邀請碼</p>
                  <p className="text-2xl font-bold">管理中</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-purple-500/10 to-purple-600/5 border-purple-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="rounded-full bg-purple-500/20 p-3">
                  <FileText className="h-5 w-5 text-purple-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">Blog 文章</p>
                  <p className="text-2xl font-bold">管理中</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card className="bg-gradient-to-br from-orange-500/10 to-orange-600/5 border-orange-200/50">
            <CardContent className="pt-6">
              <div className="flex items-center gap-4">
                <div className="rounded-full bg-orange-500/20 p-3">
                  <GraduationCap className="h-5 w-5 text-orange-600" />
                </div>
                <div>
                  <p className="text-sm text-muted-foreground">模擬考試</p>
                  <p className="text-2xl font-bold">管理中</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Admin Modules */}
        <div className="mb-6">
          <h2 className="text-xl font-semibold mb-4">管理功能</h2>
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {adminModules.map((module) => (
              <AdminCard key={module.href} {...module} />
            ))}
          </div>
        </div>

        {/* Quick Actions */}
        <div className="mt-8 pt-8 border-t">
          <h2 className="text-xl font-semibold mb-4">快速操作</h2>
          <div className="flex flex-wrap gap-3">
            <Link to="/admin/packs">
              <Button variant="outline" className="gap-2">
                <Package className="h-4 w-4" />
                新增單字包
              </Button>
            </Link>
            <Link to="/admin/tokens">
              <Button variant="outline" className="gap-2">
                <Key className="h-4 w-4" />
                產生邀請碼
              </Button>
            </Link>
            <Link to="/admin/blog">
              <Button variant="outline" className="gap-2">
                <FileText className="h-4 w-4" />
                撰寫文章
              </Button>
            </Link>
            <Link to="/admin/exams">
              <Button variant="outline" className="gap-2">
                <GraduationCap className="h-4 w-4" />
                上傳試卷
              </Button>
            </Link>
            <Link to="/" target="_blank">
              <Button variant="ghost" className="gap-2">
                <TrendingUp className="h-4 w-4" />
                查看前台
              </Button>
            </Link>
          </div>
        </div>

        {/* Footer */}
        <div className="mt-12 text-center text-sm text-muted-foreground">
          <p>學測英文學習平台 · 後台管理系統</p>
        </div>
      </div>
    </div>
  );
}
