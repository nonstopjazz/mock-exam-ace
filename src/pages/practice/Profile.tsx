import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { 
  User, 
  Gem, 
  Trophy, 
  Target, 
  Clock, 
  TrendingUp, 
  Calendar,
  Award,
  BookOpen,
  CheckCircle
} from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";

const Profile = () => {
  const userData = {
    username: "冒險追尋者",
    level: 7,
    title: "詞彙探索者",
    totalGems: 3420,
    totalBadges: 12,
    currentStreak: 14,
    totalQuestions: 456,
    accuracy: 87,
    studyTime: 1240, // minutes
    joinDate: "2024 年 1 月"
  };

  const recentActivity = [
    { 
      id: 1, 
      action: "完成", 
      target: "現在式森林 - 第 8 課", 
      time: "2 小時前",
      reward: "+25 寶石"
    },
    { 
      id: 2, 
      action: "解鎖", 
      target: "週戰士徽章", 
      time: "1 天前",
      reward: "+100 寶石"
    },
    { 
      id: 3, 
      action: "完成", 
      target: "過去式平原 - 第 3 課", 
      time: "1 天前",
      reward: "+20 寶石"
    },
    { 
      id: 4, 
      action: "購買", 
      target: "寶藏地圖背景", 
      time: "2 天前",
      reward: "-200 寶石"
    }
  ];

  const topicMastery = [
    { topic: "現在式", progress: 85, color: "bg-secondary" },
    { topic: "詞彙", progress: 92, color: "bg-primary" },
    { topic: "過去式", progress: 45, color: "bg-accent" },
    { topic: "慣用語", progress: 20, color: "bg-explorer" }
  ];

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Profile Header */}
        <Card className="p-8 mb-8 bg-gradient-to-br from-primary/5 to-secondary/5">
          <div className="flex flex-col md:flex-row items-start md:items-center gap-6">
            {/* Avatar */}
            <div className="w-24 h-24 rounded-full bg-gradient-to-br from-primary to-accent flex items-center justify-center">
              <User className="h-12 w-12 text-primary-foreground" />
            </div>

            {/* User Info */}
            <div className="flex-1">
              <h1 className="text-3xl font-bold text-foreground mb-2">
                {userData.username}
              </h1>
              <div className="flex flex-wrap items-center gap-3 mb-3">
                <Badge className="bg-primary text-primary-foreground">
                  等級 {userData.level}
                </Badge>
                <Badge variant="outline">{userData.title}</Badge>
              </div>
              <p className="text-sm text-muted-foreground">
                加入於 {userData.joinDate}
              </p>
            </div>

            {/* Quick Stats */}
            <div className="flex gap-4">
              <div className="text-center">
                <div className="flex items-center gap-1 justify-center mb-1">
                  <Gem className="h-5 w-5 text-treasure" />
                  <p className="text-2xl font-bold text-foreground">
                    {userData.totalGems.toLocaleString()}
                  </p>
                </div>
                <p className="text-xs text-muted-foreground">寶石</p>
              </div>
              <div className="text-center">
                <div className="flex items-center gap-1 justify-center mb-1">
                  <Trophy className="h-5 w-5 text-primary" />
                  <p className="text-2xl font-bold text-foreground">{userData.totalBadges}</p>
                </div>
                <p className="text-xs text-muted-foreground">徽章</p>
              </div>
            </div>
          </div>
        </Card>

        {/* Tabs */}
        <Tabs defaultValue="statistics" className="space-y-6">
          <TabsList>
            <TabsTrigger value="statistics">統計數據</TabsTrigger>
            <TabsTrigger value="activity">最近活動</TabsTrigger>
            <TabsTrigger value="settings">設定</TabsTrigger>
          </TabsList>

          {/* Statistics Tab */}
          <TabsContent value="statistics" className="space-y-6">
            {/* Stats Grid */}
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4">
              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-primary/10">
                    <Target className="h-6 w-6 text-primary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {userData.accuracy}%
                    </p>
                    <p className="text-sm text-muted-foreground">正確率</p>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-secondary/10">
                    <CheckCircle className="h-6 w-6 text-secondary" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {userData.totalQuestions}
                    </p>
                    <p className="text-sm text-muted-foreground">題目</p>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-accent/10">
                    <Clock className="h-6 w-6 text-accent" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {Math.round(userData.studyTime / 60)}h
                    </p>
                    <p className="text-sm text-muted-foreground">學習時間</p>
                  </div>
                </div>
              </Card>

              <Card className="p-6">
                <div className="flex items-center gap-3">
                  <div className="p-3 rounded-lg bg-explorer/10">
                    <TrendingUp className="h-6 w-6 text-explorer" />
                  </div>
                  <div>
                    <p className="text-2xl font-bold text-foreground">
                      {userData.currentStreak}
                    </p>
                    <p className="text-sm text-muted-foreground">連續天數</p>
                  </div>
                </div>
              </Card>
            </div>

            {/* Topic Mastery */}
            <Card className="p-6">
              <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
                <BookOpen className="h-5 w-5" />
                主題精通度
              </h3>
              <div className="space-y-4">
                {topicMastery.map((topic) => (
                  <div key={topic.topic}>
                    <div className="flex justify-between mb-2">
                      <span className="text-sm font-medium text-foreground">
                        {topic.topic}
                      </span>
                      <span className="text-sm text-muted-foreground">
                        {topic.progress}%
                      </span>
                    </div>
                    <Progress value={topic.progress} className="h-3" />
                  </div>
                ))}
              </div>
            </Card>

            {/* Daily Goal */}
            <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
              <div className="flex items-start gap-4">
                <div className="p-3 rounded-lg bg-primary/20">
                  <Calendar className="h-6 w-6 text-primary" />
                </div>
                <div className="flex-1">
                  <h3 className="text-lg font-bold text-foreground mb-2">每日目標</h3>
                  <p className="text-sm text-muted-foreground mb-3">
                    今天完成 3 堂課程
                  </p>
                  <Progress value={66.67} className="h-3 mb-2" />
                  <p className="text-xs text-muted-foreground">已完成 2/3 堂課程</p>
                </div>
              </div>
            </Card>
          </TabsContent>

          {/* Activity Tab */}
          <TabsContent value="activity">
            <Card className="p-6">
              <h3 className="text-xl font-bold text-foreground mb-6 flex items-center gap-2">
                <Award className="h-5 w-5" />
                最近活動
              </h3>
              <div className="space-y-4">
                {recentActivity.map((activity) => (
                  <div
                    key={activity.id}
                    className="flex items-center justify-between p-4 rounded-lg bg-muted/50 hover:bg-muted transition-colors"
                  >
                    <div className="flex-1">
                      <p className="font-medium text-foreground">
                        <span className="text-primary">{activity.action}</span> {activity.target}
                      </p>
                      <p className="text-sm text-muted-foreground">{activity.time}</p>
                    </div>
                    <Badge
                      variant={activity.reward.includes("+") ? "default" : "outline"}
                      className={activity.reward.includes("+") ? "bg-secondary" : ""}
                    >
                      {activity.reward}
                    </Badge>
                  </div>
                ))}
              </div>
            </Card>
          </TabsContent>

          {/* Settings Tab */}
          <TabsContent value="settings">
            <Card className="p-6">
              <h3 className="text-xl font-bold text-foreground mb-6">設定</h3>
              <div className="space-y-6">
                <div>
                  <h4 className="font-semibold text-foreground mb-3">偏好設定</h4>
                  <div className="space-y-3">
                    <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                      <span className="text-sm text-foreground">音效</span>
                      <Button variant="outline" size="sm">開啟</Button>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                      <span className="text-sm text-foreground">難度等級</span>
                      <Button variant="outline" size="sm">中級</Button>
                    </div>
                    <div className="flex items-center justify-between p-3 rounded-lg border border-border">
                      <span className="text-sm text-foreground">每日提醒</span>
                      <Button variant="outline" size="sm">上午 9:00</Button>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="font-semibold text-foreground mb-3">帳號</h4>
                  <div className="space-y-2">
                    <Button variant="outline" className="w-full justify-start">
                      變更密碼
                    </Button>
                    <Button variant="outline" className="w-full justify-start">
                      編輯個人檔案
                    </Button>
                    <Button variant="destructive" className="w-full justify-start">
                      登出
                    </Button>
                  </div>
                </div>
              </div>
            </Card>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
};

export default Profile;
