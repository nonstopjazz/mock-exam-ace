import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { useNavigate } from "react-router-dom";
import { Video, FileText, BookOpen, Map, ShoppingBag, Trophy, Tag, Upload, Users, BarChart3, Package } from "lucide-react";

const AdminDashboard = () => {
  const navigate = useNavigate();

  const modules = [
    {
      title: "上傳試卷",
      description: "上傳學測英文試卷 PDF 與設定題目",
      icon: Upload,
      path: "/admin/upload",
      color: "bg-indigo-500",
    },
    {
      title: "題目管理",
      description: "管理與編輯所有試題題庫",
      icon: FileText,
      path: "/admin/upload",
      color: "bg-green-500",
    },
    {
      title: "學生管理",
      description: "查看與管理學生帳號與成績",
      icon: Users,
      path: "/admin/upload",
      color: "bg-cyan-500",
    },
    {
      title: "數據分析",
      description: "整體使用統計與成績分析",
      icon: BarChart3,
      path: "/admin/upload",
      color: "bg-teal-500",
    },
    {
      title: "影片課程管理",
      description: "管理標準課程與滴漏式課程內容",
      icon: Video,
      path: "/admin/course-management",
      color: "bg-blue-500",
    },
    {
      title: "模擬考試管理",
      description: "上傳與編輯模擬考試題目",
      icon: FileText,
      path: "/admin/exam-management",
      color: "bg-green-500",
    },
    {
      title: "單字複習管理",
      description: "管理單字複習題目與題庫",
      icon: BookOpen,
      path: "/admin/vocabulary-management",
      color: "bg-purple-500",
    },
    {
      title: "單字包管理",
      description: "管理單字包並分享連結給社群成員",
      icon: Package,
      path: "/admin/vocabulary-packs",
      color: "bg-violet-500",
    },
    {
      title: "任務地圖管理",
      description: "設定任務關卡與獎勵",
      icon: Map,
      path: "/admin/quest-map-management",
      color: "bg-orange-500",
    },
    {
      title: "寶石商店管理",
      description: "管理商店道具與價格",
      icon: ShoppingBag,
      path: "/admin/shop-management",
      color: "bg-pink-500",
    },
    {
      title: "成就管理",
      description: "設定成就條件與獎勵",
      icon: Trophy,
      path: "/admin/achievement-management",
      color: "bg-yellow-500",
    },
    {
      title: "標籤管理",
      description: "管理題目與內容標籤",
      icon: Tag,
      path: "/admin/tag-management",
      color: "bg-red-500",
    },
  ];

  return (
    <div className="container mx-auto p-6 space-y-6">
      <div>
        <h1 className="text-3xl font-bold text-foreground">後台管理中心</h1>
        <p className="text-muted-foreground mt-2">管理系統的所有內容與設定</p>
      </div>

      <div className="grid gap-6 md:grid-cols-2 lg:grid-cols-3">
        {modules.map((module) => (
          <Card key={module.path} className="overflow-hidden hover:shadow-lg transition-shadow cursor-pointer" onClick={() => navigate(module.path)}>
            <CardHeader>
              <div className="flex items-start gap-4">
                <div className={`p-3 rounded-lg ${module.color}`}>
                  <module.icon className="h-6 w-6 text-white" />
                </div>
                <div className="flex-1">
                  <CardTitle className="text-lg">{module.title}</CardTitle>
                  <CardDescription className="mt-2">
                    {module.description}
                  </CardDescription>
                </div>
              </div>
            </CardHeader>
            <CardContent>
              <Button variant="outline" className="w-full" onClick={(e) => {
                e.stopPropagation();
                navigate(module.path);
              }}>
                進入管理
              </Button>
            </CardContent>
          </Card>
        ))}
      </div>
    </div>
  );
};

export default AdminDashboard;
