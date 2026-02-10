import { useState, useEffect } from "react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Checkbox } from "@/components/ui/checkbox";
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
  Play,
  Filter,
  Type,
  Hash,
  FolderOpen,
  GraduationCap,
  RotateCcw,
  Loader2,
} from "lucide-react";
import { useVocabularyStore, TOPIC_CATEGORIES, PARTS_OF_SPEECH, ALPHABET, LearningStatus } from "@/store/vocabularyStore";
import { VOCABULARY_LEVELS } from "@/data/vocabulary";

interface VocabularySelectorProps {
  mode: 'srs' | 'flashcards' | 'quiz';
  onStart: () => void;
  title: string;
  description: string;
}

// Learning status options
const LEARNING_STATUS_OPTIONS: { value: LearningStatus; label: string; color: string }[] = [
  { value: 'new', label: '未學過', color: 'bg-slate-500' },
  { value: 'learning', label: '學習中', color: 'bg-blue-500' },
  { value: 'reviewing', label: '待複習', color: 'bg-amber-500' },
  { value: 'mastered', label: '已精通', color: 'bg-emerald-500' },
];

export const VocabularySelector = ({
  mode,
  onStart,
  title,
  description,
}: VocabularySelectorProps) => {
  const {
    wordsLoaded,
    selectedLevels,
    selectedTags,
    selectedLetters,
    selectedPartsOfSpeech,
    selectedCategories,
    selectedLearningStatus,
    setSelectedLevels,
    setSelectedTags,
    setSelectedLetters,
    setSelectedPartsOfSpeech,
    setSelectedCategories,
    setSelectedLearningStatus,
    getLevelProgress,
    getFilteredWordCount,
    clearAllFilters,
  } = useVocabularyStore();

  const [isLettersOpen, setIsLettersOpen] = useState(false);
  const [isPosOpen, setIsPosOpen] = useState(false);
  const [isCategoriesOpen, setIsCategoriesOpen] = useState(false);
  const [isStatusOpen, setIsStatusOpen] = useState(false);
  const [wordCount, setWordCount] = useState(0);

  // Calculate word count based on selection (re-run when wordsLoaded changes)
  useEffect(() => {
    const count = getFilteredWordCount();
    setWordCount(count);
  }, [wordsLoaded, selectedLevels, selectedTags, selectedLetters, selectedPartsOfSpeech, selectedCategories, selectedLearningStatus, getFilteredWordCount]);

  const toggleLevel = (level: number) => {
    if (selectedLevels.includes(level)) {
      setSelectedLevels(selectedLevels.filter(l => l !== level));
    } else {
      setSelectedLevels([...selectedLevels, level]);
    }
  };

  const toggleLetter = (letter: string) => {
    if (selectedLetters.includes(letter)) {
      setSelectedLetters(selectedLetters.filter(l => l !== letter));
    } else {
      setSelectedLetters([...selectedLetters, letter]);
    }
  };

  const togglePos = (pos: string) => {
    if (selectedPartsOfSpeech.includes(pos)) {
      setSelectedPartsOfSpeech(selectedPartsOfSpeech.filter(p => p !== pos));
    } else {
      setSelectedPartsOfSpeech([...selectedPartsOfSpeech, pos]);
    }
  };

  const toggleCategory = (category: string) => {
    if (selectedCategories.includes(category)) {
      setSelectedCategories(selectedCategories.filter(c => c !== category));
    } else {
      setSelectedCategories([...selectedCategories, category]);
    }
  };

  const toggleStatus = (status: LearningStatus) => {
    if (selectedLearningStatus.includes(status)) {
      setSelectedLearningStatus(selectedLearningStatus.filter(s => s !== status));
    } else {
      setSelectedLearningStatus([...selectedLearningStatus, status]);
    }
  };

  const selectAllLevels = () => {
    setSelectedLevels(VOCABULARY_LEVELS.filter(l => l.wordCount > 0).map(l => l.level));
  };

  const clearLevels = () => {
    setSelectedLevels([]);
  };

  const hasActiveFilters = selectedLetters.length > 0 || selectedPartsOfSpeech.length > 0 ||
    selectedCategories.length > 0 || selectedLearningStatus.length > 0 || selectedTags.length > 0;

  return (
    <Card className="p-6">
      <div className="space-y-6">
        {/* Header */}
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="p-2 rounded-lg bg-primary/10">
              <Filter className="h-6 w-6 text-primary" />
            </div>
            <div>
              <h2 className="text-xl font-bold text-foreground">{title}</h2>
              <p className="text-sm text-muted-foreground">{description}</p>
            </div>
          </div>
          {hasActiveFilters && (
            <Button variant="ghost" size="sm" onClick={clearAllFilters} className="gap-1">
              <RotateCcw className="h-4 w-4" />
              重設篩選
            </Button>
          )}
        </div>

        {/* Level Selection */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <Layers className="h-5 w-5 text-primary" />
              <span className="font-semibold text-foreground">Level 等級</span>
            </div>
            <div className="flex gap-2">
              <Button variant="ghost" size="sm" onClick={selectAllLevels}>
                全選
              </Button>
              <Button variant="ghost" size="sm" onClick={clearLevels}>
                清除
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
                    {level.wordCount} 單字
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
                    進度: {progress.learned}/{progress.total}
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* Letter Selection (A-Z) */}
        <Collapsible open={isLettersOpen} onOpenChange={setIsLettersOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <div className="flex items-center gap-2">
                <Type className="h-4 w-4" />
                <span>字母開頭篩選 (A-Z)</span>
                {selectedLetters.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {selectedLetters.length} 個字母
                  </Badge>
                )}
              </div>
              {isLettersOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <div className="flex flex-wrap gap-2">
              {ALPHABET.map((letter) => {
                const isSelected = selectedLetters.includes(letter);
                return (
                  <Button
                    key={letter}
                    variant={isSelected ? "default" : "outline"}
                    size="sm"
                    className="w-10 h-10 p-0 font-bold"
                    onClick={() => toggleLetter(letter)}
                  >
                    {letter}
                  </Button>
                );
              })}
            </div>
            {selectedLetters.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedLetters([])}
                className="mt-2"
              >
                清除字母篩選
              </Button>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Part of Speech Selection */}
        <Collapsible open={isPosOpen} onOpenChange={setIsPosOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <div className="flex items-center gap-2">
                <Hash className="h-4 w-4" />
                <span>詞性篩選</span>
                {selectedPartsOfSpeech.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {selectedPartsOfSpeech.length} 種詞性
                  </Badge>
                )}
              </div>
              {isPosOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <div className="flex flex-wrap gap-2">
              {Object.entries(PARTS_OF_SPEECH).map(([key, { label }]) => {
                const isSelected = selectedPartsOfSpeech.includes(key);
                return (
                  <Badge
                    key={key}
                    variant={isSelected ? "default" : "outline"}
                    className="cursor-pointer transition-all hover:scale-105 px-3 py-1.5"
                    onClick={() => togglePos(key)}
                  >
                    {label}
                  </Badge>
                );
              })}
            </div>
            {selectedPartsOfSpeech.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedPartsOfSpeech([])}
                className="mt-2"
              >
                清除詞性篩選
              </Button>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Topic Categories Selection */}
        <Collapsible open={isCategoriesOpen} onOpenChange={setIsCategoriesOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <div className="flex items-center gap-2">
                <FolderOpen className="h-4 w-4" />
                <span>主題分類篩選</span>
                {selectedCategories.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {selectedCategories.length} 個分類
                  </Badge>
                )}
              </div>
              {isCategoriesOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-2">
              {Object.keys(TOPIC_CATEGORIES).map((category) => {
                const isSelected = selectedCategories.includes(category);
                return (
                  <div
                    key={category}
                    className={`p-3 rounded-lg border-2 cursor-pointer transition-all text-center ${
                      isSelected
                        ? "border-primary bg-primary/10 text-primary"
                        : "border-muted hover:border-primary/50"
                    }`}
                    onClick={() => toggleCategory(category)}
                  >
                    <span className="font-medium">{category}</span>
                  </div>
                );
              })}
            </div>
            {selectedCategories.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedCategories([])}
                className="mt-2"
              >
                清除分類篩選
              </Button>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Learning Status Selection */}
        <Collapsible open={isStatusOpen} onOpenChange={setIsStatusOpen}>
          <CollapsibleTrigger asChild>
            <Button variant="outline" className="w-full justify-between">
              <div className="flex items-center gap-2">
                <GraduationCap className="h-4 w-4" />
                <span>學習狀態篩選</span>
                {selectedLearningStatus.length > 0 && (
                  <Badge variant="secondary" className="ml-2">
                    {selectedLearningStatus.length} 種狀態
                  </Badge>
                )}
              </div>
              {isStatusOpen ? (
                <ChevronUp className="h-4 w-4" />
              ) : (
                <ChevronDown className="h-4 w-4" />
              )}
            </Button>
          </CollapsibleTrigger>
          <CollapsibleContent className="mt-4">
            <div className="flex flex-wrap gap-3">
              {LEARNING_STATUS_OPTIONS.map(({ value, label, color }) => {
                const isSelected = selectedLearningStatus.includes(value);
                return (
                  <div
                    key={value}
                    className={`flex items-center gap-2 px-4 py-2 rounded-lg border-2 cursor-pointer transition-all ${
                      isSelected
                        ? "border-primary bg-primary/10"
                        : "border-muted hover:border-primary/50"
                    }`}
                    onClick={() => toggleStatus(value)}
                  >
                    <div className={`w-3 h-3 rounded-full ${color}`} />
                    <span className="font-medium">{label}</span>
                  </div>
                );
              })}
            </div>
            {selectedLearningStatus.length > 0 && (
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedLearningStatus([])}
                className="mt-2"
              >
                清除狀態篩選
              </Button>
            )}
          </CollapsibleContent>
        </Collapsible>

        {/* Summary & Start Button */}
        <div className="flex flex-col md:flex-row items-center justify-between gap-4 pt-4 border-t">
          <div className="flex items-center gap-4 flex-wrap">
            <div className="flex items-center gap-2">
              <BookOpen className="h-5 w-5 text-primary" />
              <span className="text-lg font-semibold text-foreground">
                {wordCount.toLocaleString()} 個單字
              </span>
            </div>
            {selectedLevels.length > 0 && selectedLevels.length < 5 && (
              <Badge variant="secondary">
                {selectedLevels.length} 個 Level
              </Badge>
            )}
            {selectedLetters.length > 0 && (
              <Badge variant="outline">
                {selectedLetters.join(', ')}
              </Badge>
            )}
            {selectedPartsOfSpeech.length > 0 && (
              <Badge variant="outline">
                {selectedPartsOfSpeech.length} 種詞性
              </Badge>
            )}
            {selectedCategories.length > 0 && (
              <Badge variant="outline">
                {selectedCategories.length} 個分類
              </Badge>
            )}
            {selectedLearningStatus.length > 0 && (
              <Badge variant="outline">
                {selectedLearningStatus.length} 種狀態
              </Badge>
            )}
          </div>

          <Button
            size="lg"
            className="w-full md:w-auto gap-2"
            disabled={wordCount === 0 || !wordsLoaded}
            onClick={onStart}
          >
            {!wordsLoaded ? (
              <>
                <Loader2 className="h-5 w-5 animate-spin" />
                載入中...
              </>
            ) : (
              <>
                <Play className="h-5 w-5" />
                開始 ({wordCount})
              </>
            )}
          </Button>
        </div>
      </div>
    </Card>
  );
};

export default VocabularySelector;
