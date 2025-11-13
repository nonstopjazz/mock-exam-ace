import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ShoppingBag, Gem, Zap, Heart, Eye, Sparkles, Lock, Unlock } from "lucide-react";
import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { useState } from "react";
import { toast } from "sonner";

interface ShopItem {
  id: string;
  name: string;
  description: string;
  price: number;
  category: "powerup" | "cosmetic" | "content";
  icon: typeof Zap;
  owned?: boolean;
}

const shopItems: ShopItem[] = [
  {
    id: "1",
    name: "額外生命",
    description: "為當前任務獲得一次額外嘗試機會",
    price: 50,
    category: "powerup",
    icon: Heart
  },
  {
    id: "2",
    name: "無限提示",
    description: "在 1 個任務中無限使用提示",
    price: 100,
    category: "powerup",
    icon: Eye
  },
  {
    id: "3",
    name: "雙倍經驗加成",
    description: "1 小時內獲得 2 倍探索者經驗值",
    price: 150,
    category: "powerup",
    icon: Zap
  },
  {
    id: "4",
    name: "跳過題目",
    description: "跳過一個困難題目且不受懲罰",
    price: 75,
    category: "powerup",
    icon: Sparkles
  },
  {
    id: "5",
    name: "黃金頭像框",
    description: "傳奇黃金頭像框",
    price: 300,
    category: "cosmetic",
    icon: Sparkles,
    owned: false
  },
  {
    id: "6",
    name: "寶藏地圖背景",
    description: "古老地圖個人檔案背景",
    price: 200,
    category: "cosmetic",
    icon: Sparkles,
    owned: true
  },
  {
    id: "7",
    name: "探索者稱號",
    description: "在你的個人檔案上顯示「大師探索者」稱號",
    price: 250,
    category: "cosmetic",
    icon: Sparkles
  },
  {
    id: "8",
    name: "提前解鎖領域",
    description: "無需先決條件即可解鎖條件峽谷",
    price: 500,
    category: "content",
    icon: Unlock
  },
  {
    id: "9",
    name: "商務詞彙包",
    description: "獨家 50 堂商務英語課程包",
    price: 400,
    category: "content",
    icon: Lock
  }
];

const Shop = () => {
  const [userGems] = useState(3420);

  const handlePurchase = (item: ShopItem) => {
    if (userGems < item.price) {
      toast.error("寶石不足！", {
        description: `你還需要 ${item.price - userGems} 個寶石才能購買此物品。`
      });
      return;
    }

    toast.success(`已購買 ${item.name}！`, {
      description: `你花費了 ${item.price} 個寶石。`
    });
  };

  const renderItems = (category?: string) => {
    const filtered = category 
      ? shopItems.filter(item => item.category === category)
      : shopItems;

    return (
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {filtered.map((item) => {
          const Icon = item.icon;
          const canAfford = userGems >= item.price;

          return (
            <Card
              key={item.id}
              className="relative overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1"
            >
              {item.owned && (
                <div className="absolute top-4 right-4 z-10">
                  <Badge className="bg-secondary text-secondary-foreground">已擁有</Badge>
                </div>
              )}

              <div className="p-6">
                {/* Icon */}
                <div className="mb-4">
                  <div className="w-16 h-16 rounded-xl bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center mb-3">
                    <Icon className="h-8 w-8 text-primary" />
                  </div>
                  <Badge variant="outline" className="text-xs">
                    {item.category.charAt(0).toUpperCase() + item.category.slice(1)}
                  </Badge>
                </div>

                {/* Title & Description */}
                <h3 className="text-lg font-bold text-foreground mb-2">
                  {item.name}
                </h3>
                <p className="text-sm text-muted-foreground mb-4 min-h-[40px]">
                  {item.description}
                </p>

                {/* Price & Purchase */}
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <Gem className="h-5 w-5 text-treasure" />
                    <span className="text-xl font-bold text-foreground">
                      {item.price}
                    </span>
                  </div>
                  <Button
                    onClick={() => handlePurchase(item)}
                    disabled={!canAfford || item.owned}
                    variant={canAfford ? "default" : "outline"}
                    size="sm"
                  >
                    {item.owned ? "已擁有" : canAfford ? "購買" : "寶石不足"}
                  </Button>
                </div>
              </div>
            </Card>
          );
        })}
      </div>
    );
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between mb-4">
            <div className="flex items-center gap-3">
              <div className="p-3 rounded-lg bg-primary/10">
                <ShoppingBag className="h-8 w-8 text-primary" />
              </div>
              <div>
                <h1 className="text-4xl font-bold text-foreground">寶石商店</h1>
                <p className="text-muted-foreground">花費你辛苦賺來的寶石</p>
              </div>
            </div>

            {/* Gems Balance */}
            <Card className="p-4 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
              <div className="flex items-center gap-2">
                <Gem className="h-6 w-6 text-treasure animate-pulse-glow" />
                <div>
                  <p className="text-xs text-muted-foreground">你的餘額</p>
                  <p className="text-2xl font-bold text-foreground">
                    {userGems.toLocaleString()}
                  </p>
                </div>
              </div>
            </Card>
          </div>
        </div>

        {/* Shop Tabs */}
        <Tabs defaultValue="all" className="space-y-6">
          <TabsList>
            <TabsTrigger value="all">全部商品</TabsTrigger>
            <TabsTrigger value="powerup">強化道具</TabsTrigger>
            <TabsTrigger value="cosmetic">外觀飾品</TabsTrigger>
            <TabsTrigger value="content">額外內容</TabsTrigger>
          </TabsList>

          <TabsContent value="all">{renderItems()}</TabsContent>
          <TabsContent value="powerup">{renderItems("powerup")}</TabsContent>
          <TabsContent value="cosmetic">{renderItems("cosmetic")}</TabsContent>
          <TabsContent value="content">{renderItems("content")}</TabsContent>
        </Tabs>

        {/* Info Card */}
        <Card className="mt-8 p-6 bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20">
          <div className="flex items-start gap-4">
            <div className="p-3 rounded-lg bg-secondary/20">
              <Sparkles className="h-6 w-6 text-secondary" />
            </div>
            <div>
              <h3 className="text-lg font-bold text-foreground mb-2">如何獲得更多寶石？</h3>
              <ul className="text-sm text-muted-foreground space-y-1">
                <li>• 完成任務和課程（每次 +10-50 寶石）</li>
                <li>• 維持每日連勝（每週獎勵 +25 寶石）</li>
                <li>• 解鎖成就（+50-200 寶石）</li>
                <li>• 在困難任務中獲得完美分數（+30 寶石）</li>
              </ul>
            </div>
          </div>
        </Card>
      </div>
    </div>
  );
};

export default Shop;
