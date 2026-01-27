import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Users,
  ArrowLeft,
  Download,
  RefreshCw,
  Search,
  UserCheck,
  UserX,
  TrendingUp,
  Loader2,
  ShieldAlert,
} from 'lucide-react';
import { useAdminUsers, GRADE_OPTIONS } from '@/hooks/useUserProfile';
import { toast } from 'sonner';

export default function UsersAdmin() {
  const {
    users,
    total,
    stats,
    loading,
    error,
    isAdmin,
    fetchUsers,
    fetchStats,
    exportCSV,
  } = useAdminUsers();

  const [productFilter, setProductFilter] = useState<string>('all');
  const [gradeFilter, setGradeFilter] = useState<string>('all');
  const [searchQuery, setSearchQuery] = useState('');
  const [currentPage, setCurrentPage] = useState(0);
  const pageSize = 50;

  // Initial load
  useEffect(() => {
    if (isAdmin) {
      fetchUsers({ limit: pageSize, offset: 0 });
      fetchStats();
    }
  }, [isAdmin, fetchUsers, fetchStats]);

  // Handle filter changes
  const handleFilterChange = () => {
    setCurrentPage(0);
    fetchUsers({
      product: productFilter === 'all' ? undefined : productFilter,
      grade: gradeFilter === 'all' ? undefined : gradeFilter,
      limit: pageSize,
      offset: 0,
    });
  };

  // Handle page change
  const handlePageChange = (newPage: number) => {
    setCurrentPage(newPage);
    fetchUsers({
      product: productFilter === 'all' ? undefined : productFilter,
      grade: gradeFilter === 'all' ? undefined : gradeFilter,
      limit: pageSize,
      offset: newPage * pageSize,
    });
  };

  // Handle CSV export
  const handleExport = () => {
    const csv = exportCSV();
    if (!csv) {
      toast.error('沒有資料可匯出');
      return;
    }

    const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute(
      'download',
      `users_export_${new Date().toISOString().split('T')[0]}.csv`
    );
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    toast.success('已匯出 CSV 檔案');
  };

  // Filter users by search query (client-side)
  const filteredUsers = searchQuery
    ? users.filter(
        (u) =>
          u.email?.toLowerCase().includes(searchQuery.toLowerCase()) ||
          u.display_name?.toLowerCase().includes(searchQuery.toLowerCase())
      )
    : users;

  // Get all grade options across all products
  const allGradeOptions = [
    ...GRADE_OPTIONS.GSAT,
    ...GRADE_OPTIONS.TOEIC,
    ...GRADE_OPTIONS.KIDS,
  ].filter(
    (option, index, self) =>
      index === self.findIndex((o) => o.value === option.value)
  );

  // If not admin, show access denied
  if (!isAdmin && !loading) {
    return (
      <div className="min-h-screen bg-background flex items-center justify-center">
        <Card className="max-w-md w-full mx-4">
          <CardHeader className="text-center">
            <div className="mx-auto mb-4 p-3 rounded-full bg-destructive/10 w-fit">
              <ShieldAlert className="h-8 w-8 text-destructive" />
            </div>
            <CardTitle className="text-xl">無權限存取</CardTitle>
            <CardDescription>
              你沒有權限存取此頁面。請聯繫管理員。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <Link to="/admin">
              <Button variant="outline" className="w-full gap-2">
                <ArrowLeft className="h-4 w-4" />
                返回後台首頁
              </Button>
            </Link>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto py-8 px-4 max-w-7xl">
        {/* Header */}
        <div className="flex items-center justify-between mb-6">
          <div className="flex items-center gap-4">
            <Link to="/admin">
              <Button variant="ghost" size="sm" className="gap-2">
                <ArrowLeft className="h-4 w-4" />
                返回
              </Button>
            </Link>
            <div className="flex items-center gap-3">
              <div className="p-2 rounded-lg bg-primary/10">
                <Users className="h-6 w-6 text-primary" />
              </div>
              <div>
                <h1 className="text-2xl font-bold">使用者管理</h1>
                <p className="text-sm text-muted-foreground">
                  查看所有使用者資料與統計
                </p>
              </div>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => {
                fetchUsers({ limit: pageSize, offset: currentPage * pageSize });
                fetchStats();
              }}
              disabled={loading}
              className="gap-2"
            >
              <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
              重新整理
            </Button>
            <Button
              variant="default"
              size="sm"
              onClick={handleExport}
              disabled={users.length === 0}
              className="gap-2"
            >
              <Download className="h-4 w-4" />
              匯出 CSV
            </Button>
          </div>
        </div>

        {/* Stats Cards */}
        {stats && (
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-4 mb-6">
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="rounded-full bg-blue-500/20 p-3">
                    <Users className="h-5 w-5 text-blue-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">總使用者</p>
                    <p className="text-2xl font-bold">{stats.total_users}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="rounded-full bg-green-500/20 p-3">
                    <UserCheck className="h-5 w-5 text-green-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">已填寫資料</p>
                    <p className="text-2xl font-bold">
                      {stats.users_with_profile}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="rounded-full bg-orange-500/20 p-3">
                    <UserX className="h-5 w-5 text-orange-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">未填寫資料</p>
                    <p className="text-2xl font-bold">
                      {stats.total_users - stats.users_with_profile}
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="flex items-center gap-4">
                  <div className="rounded-full bg-purple-500/20 p-3">
                    <TrendingUp className="h-5 w-5 text-purple-600" />
                  </div>
                  <div>
                    <p className="text-sm text-muted-foreground">填寫率</p>
                    <p className="text-2xl font-bold">
                      {stats.total_users > 0
                        ? Math.round(
                            (stats.users_with_profile / stats.total_users) * 100
                          )
                        : 0}
                      %
                    </p>
                  </div>
                </div>
              </CardContent>
            </Card>
          </div>
        )}

        {/* Grade Stats */}
        {stats && stats.grade_stats.length > 0 && (
          <Card className="mb-6">
            <CardHeader>
              <CardTitle className="text-lg">年級分佈</CardTitle>
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-2">
                {stats.grade_stats.map((g) => (
                  <Badge
                    key={g.grade}
                    variant="secondary"
                    className="text-sm px-3 py-1"
                  >
                    {g.grade}: {g.count} 人
                  </Badge>
                ))}
              </div>
            </CardContent>
          </Card>
        )}

        {/* Filters */}
        <Card className="mb-6">
          <CardContent className="pt-6">
            <div className="flex flex-col sm:flex-row gap-4">
              <div className="flex-1">
                <div className="relative">
                  <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
                  <Input
                    placeholder="搜尋 Email 或名稱..."
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    className="pl-10"
                  />
                </div>
              </div>
              <Select value={productFilter} onValueChange={setProductFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="產品" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部產品</SelectItem>
                  <SelectItem value="gsat">GSAT</SelectItem>
                  <SelectItem value="toeic">TOEIC</SelectItem>
                  <SelectItem value="kids">KIDS</SelectItem>
                </SelectContent>
              </Select>
              <Select value={gradeFilter} onValueChange={setGradeFilter}>
                <SelectTrigger className="w-[150px]">
                  <SelectValue placeholder="年級" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部年級</SelectItem>
                  {allGradeOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Button onClick={handleFilterChange} variant="secondary">
                篩選
              </Button>
            </div>
          </CardContent>
        </Card>

        {/* Users Table */}
        <Card>
          <CardHeader>
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg">
                使用者列表 ({total} 筆)
              </CardTitle>
              {total > pageSize && (
                <div className="flex items-center gap-2">
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage - 1)}
                    disabled={currentPage === 0 || loading}
                  >
                    上一頁
                  </Button>
                  <span className="text-sm text-muted-foreground">
                    第 {currentPage + 1} 頁 / 共{' '}
                    {Math.ceil(total / pageSize)} 頁
                  </span>
                  <Button
                    variant="outline"
                    size="sm"
                    onClick={() => handlePageChange(currentPage + 1)}
                    disabled={
                      (currentPage + 1) * pageSize >= total || loading
                    }
                  >
                    下一頁
                  </Button>
                </div>
              )}
            </div>
          </CardHeader>
          <CardContent>
            {loading && users.length === 0 ? (
              <div className="flex items-center justify-center py-12">
                <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
              </div>
            ) : error ? (
              <div className="text-center py-12 text-destructive">{error}</div>
            ) : filteredUsers.length === 0 ? (
              <div className="text-center py-12 text-muted-foreground">
                沒有找到使用者
              </div>
            ) : (
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>Email</TableHead>
                      <TableHead>顯示名稱</TableHead>
                      <TableHead>產品</TableHead>
                      <TableHead>年級</TableHead>
                      <TableHead>學校</TableHead>
                      <TableHead>註冊時間</TableHead>
                      <TableHead>最後登入</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {filteredUsers.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell className="font-medium">
                          {user.email}
                        </TableCell>
                        <TableCell>{user.display_name || '-'}</TableCell>
                        <TableCell>
                          {user.product ? (
                            <Badge variant="outline">
                              {user.product.toUpperCase()}
                            </Badge>
                          ) : (
                            '-'
                          )}
                        </TableCell>
                        <TableCell>{user.grade || '-'}</TableCell>
                        <TableCell>{user.school || '-'}</TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.registered_at
                            ? new Date(user.registered_at).toLocaleDateString(
                                'zh-TW'
                              )
                            : '-'}
                        </TableCell>
                        <TableCell className="text-muted-foreground">
                          {user.last_sign_in_at
                            ? new Date(user.last_sign_in_at).toLocaleDateString(
                                'zh-TW'
                              )
                            : '-'}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
