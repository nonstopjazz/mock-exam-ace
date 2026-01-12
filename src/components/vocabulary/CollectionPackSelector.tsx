import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import {
  BookOpen,
  Package,
  ChevronRight,
  Check,
  Loader2,
  AlertCircle,
} from "lucide-react";
import { useUserPacks, UserPack } from "@/hooks/useUserPacks";
import { useAuth } from "@/contexts/AuthContext";

export type VocabularySource = 'local' | 'pack';

interface CollectionPackSelectorProps {
  selectedSource: VocabularySource;
  selectedPackId: string | null;
  onSourceChange: (source: VocabularySource) => void;
  onPackSelect: (packId: string | null) => void;
}

export const CollectionPackSelector = ({
  selectedSource,
  selectedPackId,
  onSourceChange,
  onPackSelect,
}: CollectionPackSelectorProps) => {
  const { user } = useAuth();
  const { packs, loading, error } = useUserPacks();

  const handleSourceSelect = (source: VocabularySource) => {
    onSourceChange(source);
    if (source === 'local') {
      onPackSelect(null);
    }
  };

  const handlePackSelect = (pack: UserPack) => {
    onSourceChange('pack');
    onPackSelect(pack.pack_id);
  };

  const selectedPack = packs.find(p => p.pack_id === selectedPackId);

  return (
    <Card className="p-4 mb-4">
      <div className="space-y-4">
        {/* Source Selection Header */}
        <div className="flex items-center gap-2 mb-2">
          <Package className="h-5 w-5 text-primary" />
          <span className="font-semibold text-foreground">單字來源</span>
        </div>

        {/* Source Options */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
          {/* Local Vocabulary Option */}
          <div
            className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all ${
              selectedSource === 'local'
                ? "border-primary bg-primary/5"
                : "border-muted hover:border-primary/50"
            }`}
            onClick={() => handleSourceSelect('local')}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${selectedSource === 'local' ? 'bg-primary/20' : 'bg-muted'}`}>
                <BookOpen className={`h-5 w-5 ${selectedSource === 'local' ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-foreground">本地單字庫</div>
                <div className="text-sm text-muted-foreground">學測 7000 單字</div>
              </div>
              {selectedSource === 'local' && (
                <Check className="h-5 w-5 text-primary" />
              )}
            </div>
          </div>

          {/* Collection Packs Option */}
          <div
            className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all ${
              selectedSource === 'pack'
                ? "border-primary bg-primary/5"
                : "border-muted hover:border-primary/50"
            } ${!user ? 'opacity-50 cursor-not-allowed' : ''}`}
            onClick={() => user && handleSourceSelect('pack')}
          >
            <div className="flex items-center gap-3">
              <div className={`p-2 rounded-lg ${selectedSource === 'pack' ? 'bg-primary/20' : 'bg-muted'}`}>
                <Package className={`h-5 w-5 ${selectedSource === 'pack' ? 'text-primary' : 'text-muted-foreground'}`} />
              </div>
              <div className="flex-1">
                <div className="font-semibold text-foreground">我的收藏包</div>
                <div className="text-sm text-muted-foreground">
                  {!user ? '請先登入' : `${packs.length} 個收藏包`}
                </div>
              </div>
              {selectedSource === 'pack' && (
                <Check className="h-5 w-5 text-primary" />
              )}
            </div>
          </div>
        </div>

        {/* Pack Selection (shown when pack source is selected) */}
        {selectedSource === 'pack' && user && (
          <div className="mt-4 pt-4 border-t">
            <div className="text-sm font-medium text-muted-foreground mb-3">
              選擇收藏包
            </div>

            {loading ? (
              <div className="space-y-2">
                <Skeleton className="h-16 w-full" />
                <Skeleton className="h-16 w-full" />
              </div>
            ) : error ? (
              <div className="flex items-center gap-2 text-destructive p-4 bg-destructive/10 rounded-lg">
                <AlertCircle className="h-5 w-5" />
                <span>{error}</span>
              </div>
            ) : packs.length === 0 ? (
              <div className="text-center py-6 text-muted-foreground">
                <Package className="h-12 w-12 mx-auto mb-2 opacity-50" />
                <p>尚無收藏包</p>
                <p className="text-sm">使用邀請碼領取單字包</p>
              </div>
            ) : (
              <div className="space-y-2 max-h-64 overflow-y-auto">
                {packs.map((pack) => (
                  <div
                    key={pack.pack_id}
                    className={`p-3 rounded-lg border cursor-pointer transition-all ${
                      selectedPackId === pack.pack_id
                        ? "border-primary bg-primary/5"
                        : "border-muted hover:border-primary/30 hover:bg-muted/50"
                    }`}
                    onClick={() => handlePackSelect(pack)}
                  >
                    <div className="flex items-center justify-between">
                      <div className="flex-1">
                        <div className="font-medium text-foreground">{pack.title}</div>
                        <div className="flex items-center gap-2 mt-1">
                          <Badge variant="secondary" className="text-xs">
                            {pack.word_count} 單字
                          </Badge>
                          {pack.theme && (
                            <Badge variant="outline" className="text-xs">
                              {pack.theme}
                            </Badge>
                          )}
                          {pack.difficulty && (
                            <Badge variant="outline" className="text-xs">
                              {pack.difficulty}
                            </Badge>
                          )}
                        </div>
                      </div>
                      {selectedPackId === pack.pack_id ? (
                        <Check className="h-5 w-5 text-primary" />
                      ) : (
                        <ChevronRight className="h-5 w-5 text-muted-foreground" />
                      )}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Selected Pack Summary */}
        {selectedSource === 'pack' && selectedPack && (
          <div className="mt-2 p-3 rounded-lg bg-primary/10 border border-primary/20">
            <div className="flex items-center gap-2">
              <Package className="h-4 w-4 text-primary" />
              <span className="font-medium text-foreground">
                已選擇: {selectedPack.title}
              </span>
              <Badge variant="secondary" className="ml-auto">
                {selectedPack.word_count} 單字
              </Badge>
            </div>
          </div>
        )}
      </div>
    </Card>
  );
};

export default CollectionPackSelector;
