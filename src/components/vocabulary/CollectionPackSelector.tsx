import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  BookOpen,
  Loader2,
  Package,
  ChevronRight,
  AlertCircle,
  LogIn,
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { useUserPacks, UserPack } from "@/hooks/useUserPacks";
import { useAuth } from "@/contexts/AuthContext";

interface CollectionPackSelectorProps {
  onStartReview: (packIds: string[]) => void;
  mode: "srs" | "flashcards" | "quiz";
  minPacks?: number;
}

export function CollectionPackSelector({
  onStartReview,
  mode,
  minPacks = 1,
}: CollectionPackSelectorProps) {
  const navigate = useNavigate();
  const { user, loading: authLoading } = useAuth();
  const { packs, loading, error, refetch } = useUserPacks();
  const [selectedPackIds, setSelectedPackIds] = useState<string[]>([]);

  const modeLabels = {
    srs: "SRS 智慧複習",
    flashcards: "翻轉卡片",
    quiz: "快速測驗",
  };

  const togglePack = (packId: string) => {
    setSelectedPackIds((prev) =>
      prev.includes(packId)
        ? prev.filter((id) => id !== packId)
        : [...prev, packId]
    );
  };

  const selectAll = () => {
    if (selectedPackIds.length === packs.length) {
      setSelectedPackIds([]);
    } else {
      setSelectedPackIds(packs.map((p) => p.pack_id));
    }
  };

  const totalWords = packs
    .filter((p) => selectedPackIds.includes(p.pack_id))
    .reduce((sum, p) => sum + p.word_count, 0);

  const canStart = selectedPackIds.length >= minPacks && totalWords > 0;

  // Not logged in
  if (!authLoading && !user) {
    return (
      <Card className="p-8 text-center">
        <LogIn className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-foreground mb-2">
          需要登入
        </h3>
        <p className="text-muted-foreground mb-4">
          登入後即可使用你收藏的單字包進行複習
        </p>
        <Button onClick={() => navigate("/login?returnUrl=/practice/vocabulary")}>
          前往登入
        </Button>
      </Card>
    );
  }

  // Loading
  if (loading || authLoading) {
    return (
      <Card className="p-8 text-center">
        <Loader2 className="h-8 w-8 animate-spin text-primary mx-auto mb-4" />
        <p className="text-muted-foreground">載入收藏單字包...</p>
      </Card>
    );
  }

  // Error
  if (error) {
    return (
      <Card className="p-8 text-center">
        <AlertCircle className="h-12 w-12 text-destructive mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-foreground mb-2">載入失敗</h3>
        <p className="text-muted-foreground mb-4">{error}</p>
        <Button onClick={refetch}>重試</Button>
      </Card>
    );
  }

  // No packs
  if (packs.length === 0) {
    return (
      <Card className="p-8 text-center">
        <Package className="h-12 w-12 text-muted-foreground mx-auto mb-4" />
        <h3 className="text-xl font-semibold text-foreground mb-2">
          還沒有收藏任何單字包
        </h3>
        <p className="text-muted-foreground mb-4">
          從社群取得邀請碼，領取你的第一個單字包
        </p>
        <Button onClick={() => navigate("/practice/vocabulary/collections")}>
          前往詞彙收藏
        </Button>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold text-foreground">
            選擇要複習的單字包
          </h3>
          <p className="text-sm text-muted-foreground">
            已選擇 {selectedPackIds.length} 個單字包，共 {totalWords} 個單字
          </p>
        </div>
        <Button variant="outline" size="sm" onClick={selectAll}>
          {selectedPackIds.length === packs.length ? "取消全選" : "全選"}
        </Button>
      </div>

      {/* Pack List */}
      <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
        {packs.map((pack) => {
          const isSelected = selectedPackIds.includes(pack.pack_id);
          return (
            <Card
              key={pack.id}
              className={`p-4 cursor-pointer transition-all ${
                isSelected
                  ? "border-primary ring-2 ring-primary/20 bg-primary/5"
                  : "hover:border-primary/50"
              }`}
              onClick={() => togglePack(pack.pack_id)}
            >
              <div className="flex items-start gap-3">
                <Checkbox
                  checked={isSelected}
                  onCheckedChange={() => togglePack(pack.pack_id)}
                  className="mt-1"
                />
                <div className="flex-1 min-w-0">
                  <div className="flex items-center gap-2 mb-1">
                    {pack.theme && (
                      <Badge variant="outline" className="text-xs">
                        {pack.theme}
                      </Badge>
                    )}
                    {pack.difficulty && (
                      <Badge variant="secondary" className="text-xs">
                        {pack.difficulty}
                      </Badge>
                    )}
                  </div>
                  <h4 className="font-semibold text-foreground truncate">
                    {pack.title}
                  </h4>
                  <div className="flex items-center gap-4 mt-2 text-sm text-muted-foreground">
                    <span className="flex items-center gap-1">
                      <BookOpen className="h-3.5 w-3.5" />
                      {pack.word_count} 單字
                    </span>
                    <span>進度 {pack.progress}%</span>
                  </div>
                </div>
              </div>
            </Card>
          );
        })}
      </div>

      {/* Start Button */}
      <div className="flex justify-center pt-4">
        <Button
          size="lg"
          disabled={!canStart}
          onClick={() => onStartReview(selectedPackIds)}
          className="min-w-[200px]"
        >
          開始{modeLabels[mode]}
          <ChevronRight className="h-5 w-5 ml-1" />
        </Button>
      </div>

      {!canStart && selectedPackIds.length === 0 && (
        <p className="text-center text-sm text-muted-foreground">
          請至少選擇一個單字包
        </p>
      )}
    </div>
  );
}
