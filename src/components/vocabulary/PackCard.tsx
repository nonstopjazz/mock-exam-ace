import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { BookOpen, Tag } from "lucide-react";
import { skillTypeLabel, type PackCardData } from "./packMeta";

/**
 * 字卡包卡片 —— 全站唯一的 pack 視覺。
 *
 * 這份 markup 原本內嵌在 VocabularyCollections.tsx 裡，
 * 這一輪把它抽出來共用，讓 Student Dashboard 用的是同一張卡而不是另做一套。
 * 卡片的組成（封面 / 分類 tag / 名稱 / 字數 / 進度 / CTA）維持不變。
 */

export const PackCard = ({
  pack,
  variant = "full",
  onOpenDetail,
  onStartReview,
  /** compact 變體可以把「N 個單字」換成更貼近學生的熟悉度說法 */
  statLabel,
}: {
  pack: PackCardData;
  variant?: "full" | "compact";
  onOpenDetail: () => void;
  onStartReview: () => void;
  statLabel?: string;
}) => {
  const compact = variant === "compact";

  return (
    <Card className="transition-all duration-200 overflow-hidden hover:shadow-lg hover:-translate-y-0.5 flex flex-col">
      {/* Cover Image */}
      {pack.cover_image_url ? (
        <div className={`${compact ? "aspect-[16/7]" : "aspect-video xl:aspect-[4/3]"} bg-muted overflow-hidden`}>
          <img src={pack.cover_image_url} alt={pack.title} className="w-full h-full object-cover" />
        </div>
      ) : (
        <div
          className={`${compact ? "aspect-[16/7]" : "aspect-video xl:aspect-[4/3]"} bg-gradient-to-br from-primary/20 to-accent/20 flex items-center justify-center`}
        >
          <BookOpen className={compact ? "h-8 w-8 text-primary/40" : "h-12 w-12 xl:h-8 xl:w-8 text-primary/40"} />
        </div>
      )}

      <div className={`${compact ? "p-4 space-y-3" : "p-6 xl:p-4 space-y-4 xl:space-y-3"} flex flex-col flex-1`}>
        {/* Header */}
        <div>
          <div className="flex items-center gap-2 xl:gap-1 mb-2 flex-wrap">
            {pack.skill_type && <Badge className="text-xs">{skillTypeLabel(pack.skill_type)}</Badge>}
            {pack.theme && (
              <Badge variant="outline" className="text-xs">
                <Tag className="h-3 w-3 mr-1" />
                {pack.theme}
              </Badge>
            )}
            {pack.difficulty && (
              <Badge variant="secondary" className="text-xs">{pack.difficulty}</Badge>
            )}
          </div>
          <h3
            className={`${compact ? "text-base" : "text-xl xl:text-base"} font-bold text-foreground mb-1 cursor-pointer hover:text-primary transition-colors`}
            onClick={onOpenDetail}
          >
            {pack.title}
          </h3>
          {!compact && pack.description && (
            <p className="text-sm xl:text-xs text-muted-foreground line-clamp-2">{pack.description}</p>
          )}
        </div>

        {/* Stats */}
        <div className={`flex items-center justify-between rounded-lg bg-muted/50 ${compact ? "p-2" : "p-3 xl:p-2"}`}>
          <div className="flex items-center gap-2">
            <BookOpen className="h-4 w-4 text-primary shrink-0" />
            <span className={`${compact ? "text-xs" : "text-sm xl:text-xs"} font-medium text-foreground`}>
              {statLabel ?? `${pack.word_count} 個單字`}
            </span>
          </div>
        </div>

        {/* Progress */}
        <div className={compact ? "space-y-1" : "space-y-2 xl:space-y-1"}>
          <div className={`flex items-center justify-between ${compact ? "text-xs" : "text-sm xl:text-xs"}`}>
            <span className="text-muted-foreground">學習進度</span>
            <span className="font-medium text-foreground">{pack.progress}%</span>
          </div>
          <div className={`${compact ? "h-1.5" : "h-2 xl:h-1.5"} rounded-full bg-muted overflow-hidden`}>
            <div
              className="h-full bg-primary transition-all duration-300"
              style={{ width: `${pack.progress}%` }}
            />
          </div>
        </div>

        {/* Meta Info */}
        {!compact && pack.claimed_at && (
          <div className="text-xs text-muted-foreground">
            收藏時間：{new Date(pack.claimed_at).toLocaleDateString("zh-TW")}
          </div>
        )}

        {/* Actions */}
        <div className="flex gap-2 mt-auto">
          <Button
            variant="outline"
            size="sm"
            className={compact ? "flex-1 text-xs h-8" : "flex-1 xl:text-xs xl:h-8"}
            onClick={onOpenDetail}
          >
            查看詳情
          </Button>
          <Button
            size="sm"
            className={compact ? "flex-1 text-xs h-8" : "flex-1 xl:text-xs xl:h-8"}
            onClick={onStartReview}
          >
            開始複習
          </Button>
        </div>
      </div>
    </Card>
  );
};
