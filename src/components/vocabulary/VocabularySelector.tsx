import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from "@/components/ui/collapsible";
import {
  BookOpen,
  ChevronDown,
  ChevronUp,
  Layers,
  Tag,
  Play,
  Filter,
} from "lucide-react";
import { useVocabularyStore } from "@/store/vocabularyStore";
import { VOCABULARY_LEVELS, VOCABULARY_TAGS } from "@/data/vocabulary";

interface VocabularySelectorProps {
  mode: 'srs' | 'flashcards' | 'quiz';
  onStart: () => void;
  title: string;
  description: string;
}

// Common tag categories
const TAG_CATEGORIES = {
  exam: ['GSAT', 'TOEIC', 'TOEFL', 'IELTS'],
  topic: ['Travel', 'Travel & Transportation', 'Sports', 'Entertainment', 'Health', 'Education', 'Technology', 'Science', 'Business', 'Finance', 'Environment', 'Food', 'Art', 'Social Issues', 'Culture'],
};

export const VocabularySelector = ({
  mode,
  onStart,
  title,
  description,
}: VocabularySelectorProps) => {
  const {
    selectedLevels,
    selectedTags,
    setSelectedLevels,
    setSelectedTags,
    getLevelProgress,
    getOverallProgress,
  } = useVocabularyStore();

  const [isTagsOpen, setIsTagsOpen] = useState(false);
  const [wordCount, setWordCount] = useState(0);

  // Calculate word count based on selection
  useEffect(() => {
    const progress = getOverallProgress();
    // This is a simplified calculation - actual implementation would filter
    let count = 0;
    VOCABULARY_LEVELS.forEach(level => {
      if (selectedLevels.includes(level.level)) {
        count += level.wordCount;
      }
    });
    setWordCount(count);
  }, [selectedLevels, selectedTags]);

  const toggleLevel = (level: number) => {
    if (selectedLevels.includes(level)) {
      setSelectedLevels(selectedLevels.filter(l => l !== level));
    } else {
      setSelectedLevels([...selectedLevels, level]);
    }
  };

  const toggleTag = (tag: string) => {
    if (selectedTags.includes(tag)) {
      setSelectedTags(selectedTags.filter(t => t !== tag));
    } else {
      setSelectedTags([...selectedTags, tag]);
    }
  };

  const selectAllLevels = () => {
    setSelectedLevels(VOCABULARY_LEVELS.map(l => l.level));
  };

  const clearLevels = () => {
    setSelectedLevels([]);
  };

  const clearTags = () => {
    setSelectedTags([]);
  };

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-primary/10">
            <Filter className="h-6 w-6 text-primary" />
          </div>
          <div>
            <h2 className="text-xl font-bold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">{description}</p>
          </div>
        </div>

        {/* Level Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">Level</span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAllLevels}>
                All
              </Button>
              <Button variant="ghost" size="sm" onClick={clearLevels}>
                Clear
              </Button>
            </div>
          </div>

          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-5 gap-3">
            {VOCABULARY_LEVELS.filter(level => level.wordCount > 0).map((level) => {
              const progress = getLevelProgress(level.level);
              const isSelected = selectedLevels.includes(level.level);

              return (
                <div
                  key={level.level}
                  className={`relative p-4 rounded-lg border-2 cursor-pointer transition-all ${
                    isSelected
                      ? "border-primary bg-primary/5"
                      : "border-muted hover:border-primary/50"
                  }`}
                  onClick={() => toggleLevel(level.level)}
                >
                  <div className="flex items-center gap-2 mb-2">
                    <Checkbox
                      checked={isSelected}
                      onCheckedChange={() => toggleLevel(level.level)}
                    />
                    <span className="font-bold text-foreground">Level {level.level}</span>
                  </div>
                  <div className="text-sm text-muted-foreground">
                    {level.wordCount} words
                  </div>
                  {/* Progress bar */}
                  <div className="mt-2 h-1.5 rounded-full bg-muted overflow-hidden">
                    <div
                      className="h-full bg-primary transition-all"
                      style={{
                        width: `${progress.total > 0 ? (progress.learned / progress.total) * 100 : 0}%`,
                      }}
                    />
                  </div>
                  <div className="mt-1 text-xs text-muted-foreground">
                    Progress: {progress.learned}/{progress.total}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Tag Selection (Collapsible) */}
        <Collapsible open={isTagsOpen} onOpenChange={setIsTagsOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <div className="flex items-center gap-2">
                <Tag className="h-4 w-4" />
                <span>Topic Filter</span>
                {selectedTags.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {selectedTags.length} selected
                  </Badge>
                )}
              </div>
              {isTagsOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4 space-y-4">
            {/* Clear Tags Button */}
            {selectedTags.length > 0 && (
              <Button variant="ghost" size="sm" onClick={clearTags}>
                Clear Tags
              </Button>
            )}

            {/* Popular Tags */}
            <div className="flex flex-wrap gap-2">
              {VOCABULARY_TAGS.slice(0, 30).map((tag) => {
                const isSelected = selectedTags.includes(tag);
                return (
                  <Badge
                    key={tag}
                    variant={isSelected ? "default" : "outline"}
                    className="cursor-pointer transition-all hover:scale-105"
                    onClick={() => toggleTag(tag)}
                  >
                    {tag}
                  </Badge>
                );
              })}
            </div>
          </CollapsibleContent>
        </Collapsible>

        {/* Summary & Start Button */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4 border-t">
          <div className="flex items-center gap-4">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <span className="text-lg font-semibold text-foreground">
                {wordCount.toLocaleString()} words
              </span>
            </div>
            {selectedLevels.length > 0 && (
              <Badge variant="secondary">
                {selectedLevels.length} Levels
              </Badge>
            )}
            {selectedTags.length > 0 && (
              <Badge variant="outline">
                {selectedTags.length} Tags
              </Badge>
            )}
          </div>

          <Button
            size="lg"
            className="w-full md:w-auto gap-2"
            disabled={selectedLevels.length === 0}
            onClick={onStart}
          >
            <Play className="h-5 w-5" />
            Start
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default VocabularySelector;
