import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ProgressBar";
import {
  BookOpen,
  Brain,
  Zap,
  FlipVertical2,
  TrendingUp,
  Target,
  Clock,
  Award,
  Sparkles,
  ChevronRight,
  Layers,
  GraduationCap,
  Package,
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { useVocabularyStore, WordProgress } from "@/store/vocabularyStore";
import { VOCABULARY_LEVELS, TOTAL_WORDS } from "@/data/vocabulary";
import { isFeatureEnabled } from "@/config/features";
import { usePhase } from "@/contexts/PhaseContext";
import { useUserPacks } from "@/hooks/useUserPacks";
import { useUserStats } from "@/hooks/useUserStats";
import { useUserProfile } from "@/hooks/useUserProfile";
import { useAuth } from "@/contexts/AuthContext";
import { GradeSelectionModal } from "@/components/profile/GradeSelectionModal";

// Calculate error statistics from word progress
const calculateErrorStats = (wordProgress: Record<string, WordProgress>) => {
  const progressValues = Object.values(wordProgress);

  if (progressValues.length === 0) {
    return {
      errorRate: 0,
      weakWordsCount: 0,
      totalCorrect: 0,
      totalReviews: 0,
    };
  }

  let totalReviews = 0;
  let totalCorrect = 0;
  let weakWordsCount = 0;

  progressValues.forEach(progress => {
    totalReviews += progress.reviewCount;
    totalCorrect += progress.correctCount;

    // Count weak words (mastery level < 3 and has been reviewed)
    if (progress.reviewCount > 0 && progress.masteryLevel < 3) {
      weakWordsCount++;
    }
  });

  const errorRate = totalReviews > 0
    ? Math.round(((totalReviews - totalCorrect) / totalReviews) * 100)
    : 0;

  return {
    errorRate,
    weakWordsCount,
    totalCorrect,
    totalReviews,
  };
};

const VocabularyHub = () => {
  const navigate = useNavigate();
  const currentPhase = usePhase();
  const {
    getOverallProgress,
    getLevelProgress,
    totalWordsLearned,
    totalReviewCount,
    streakDays,
    setSelectedLevels,
    wordProgress,
  } = useVocabularyStore();

  // Get user's collection packs
  const { packs: userPacks } = useUserPacks();
  const totalPackWords = userPacks.reduce((sum, pack) => sum + pack.word_count, 0);

  // Get synced user stats (for logged-in users)
  const { stats: userStats, isLoggedIn } = useUserStats();

  // Get user profile for grade selection
  const { user } = useAuth();
  const { hasProfile, loading: profileLoading } = useUserProfile();
  const [showGradeModal, setShowGradeModal] = useState(false);
  const [pendingNavigation, setPendingNavigation] = useState<string | null>(null);

  // Navigate with profile check - only prompt logged-in users
  const navigateWithProfileCheck = useCallback((path: string) => {
    if (user && !hasProfile && !profileLoading) {
      setPendingNavigation(path);
      setShowGradeModal(true);
    } else {
      navigate(path);
    }
  }, [user, hasProfile, profileLoading, navigate]);

  // Handle grade selection completion
  const handleGradeComplete = () => {
    setShowGradeModal(false);
    if (pendingNavigation) {
      navigate(pendingNavigation);
      setPendingNavigation(null);
    }
  };

  // Handle skip
  const handleGradeSkip = () => {
    setShowGradeModal(false);
    if (pendingNavigation) {
      navigate(pendingNavigation);
      setPendingNavigation(null);
    }
  };

  // Use synced stats for logged-in users, localStorage stats for others
  const displayStreakDays = isLoggedIn ? userStats.streakDays : streakDays;
  const displayReviewCount = isLoggedIn ? userStats.totalReviewCount : totalReviewCount;

  const [stats, setStats] = useState({
    reviewDue: 0,
    learned: 0,
    mastered: 0,
    total: TOTAL_WORDS,
  });

  const [errorStats, setErrorStats] = useState({
    errorRate: 0,
    weakWordsCount: 0,
    totalCorrect: 0,
    totalReviews: 0,
  });

  useEffect(() => {
    const progress = getOverallProgress();
    setStats({
      reviewDue: progress.reviewDue || 0,
      learned: progress.learned,
      mastered: progress.mastered,
      total: progress.total || TOTAL_WORDS,
    });

    // Calculate error statistics
    setErrorStats(calculateErrorStats(wordProgress));
  }, [getOverallProgress, wordProgress]);

  const masteryPercentage = stats.total > 0 ? Math.round((stats.learned / stats.total) * 100) : 0;

  // Calculate suggested new words to learn (if no review due)
  const suggestedNewWords = Math.min(20, stats.total - stats.learned);
  const hasReviewDue = stats.reviewDue > 0;

  const modes = [
    {
      id: "srs",
      title: "SRS 智慧複習",
      description: "根據記憶曲線自動排程，最高效的複習方式",
      icon: Brain,
      color: "from-primary/20 to-accent/20",
      iconColor: "text-primary",
      badge: "推薦",
      badgeVariant: "default" as const,
      count: hasReviewDue ? stats.reviewDue : suggestedNewWords,
      countLabel: hasReviewDue ? "待複習" : "建議學習",
      path: "/practice/vocabulary/srs"
    },
    {
      id: "flashcards",
      title: "翻轉卡片",
      description: "快速瀏覽與記憶，支援手勢操作",
      icon: FlipVertical2,
      color: "from-secondary/20 to-explorer/20",
      iconColor: "text-secondary",
      badge: "熱門",
      badgeVariant: "secondary" as const,
      count: TOTAL_WORDS,
      countLabel: "單字總數",
      path: "/practice/vocabulary/flashcards"
    },
    {
      id: "quick-quiz",
      title: "快速測驗",
      description: "限時選擇題，測試即時反應能力",
      icon: Zap,
      color: "from-accent/20 to-treasure/20",
      iconColor: "text-accent",
      badge: "新",
      badgeVariant: "outline" as const,
      count: 10,
      countLabel: "題 / 回合",
      path: "/practice/vocabulary/quiz"
    }
  ];

  // Recommended theme packs (original 3 packs)
  const recommendedPacks = [
    {
      id: "1",
      title: "TOEIC 商務核心 500",
      level: "中級",
      words: 500,
      price: 200,
      theme: "商務英語"
    },
    {
      id: "2",
      title: "高中必考字根家族",
      level: "初級",
      words: 300,
      price: 150,
      theme: "字根字首"
    },
    {
      id: "3",
      title: "學測高頻動詞片語",
      level: "中高級",
      words: 250,
      price: 180,
      theme: "片語搭配"
    }
  ];

  // Level colors for visual distinction
  const levelColors = [
    "from-emerald-500/20 to-emerald-600/20 border-emerald-500/30",
    "from-blue-500/20 to-blue-600/20 border-blue-500/30",
    "from-violet-500/20 to-violet-600/20 border-violet-500/30",
    "from-amber-500/20 to-amber-600/20 border-amber-500/30",
    "from-rose-500/20 to-rose-600/20 border-rose-500/30",
  ];

  const handleStartLevel = (level: number) => {
    setSelectedLevels([level]);
    navigateWithProfileCheck("/practice/vocabulary/srs");
  };

  return (
    <div className="min-h-screen bg-background">
      <div className="container mx-auto px-4 py-8">
        {/* Header */}
        <div className="mb-8">
          <div className="flex items-center justify-between gap-2">
            <div className="flex items-center gap-3 min-w-0">
              <div className="p-2 md:p-3 rounded-lg bg-primary/10 shrink-0">
                <BookOpen className="h-6 w-6 md:h-8 md:w-8 text-primary" />
              </div>
              <div className="min-w-0">
                <h1 className="text-2xl md:text-4xl font-bold text-foreground truncate">單字複習中心</h1>
                <p className="text-sm md:text-base text-muted-foreground hidden sm:block">選擇你的複習模式，開始今天的學習</p>
              </div>
            </div>
            <Button
              variant="ghost"
              size="sm"
              className="gap-1 md:gap-2 text-muted-foreground hover:text-foreground shrink-0"
              onClick={() => navigate("/practice/vocabulary/collections")}
            >
              <Package className="h-5 w-5" />
              <span className="hidden md:inline">單字收藏包</span>
              <Badge variant="secondary" className="text-xs ml-1">
                {userPacks.length}
              </Badge>
              <ChevronRight className="h-4 w-4 hidden md:block" />
            </Button>
          </div>
        </div>

        {/* Today's Stats */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4 mb-8">
          <Card className="p-6 bg-gradient-to-br from-primary/10 to-accent/10 border-primary/20">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Target className="h-5 w-5 text-primary" />
                <h3 className="font-semibold text-foreground">
                  {hasReviewDue ? "待複習單字" : "建議學習"}
                </h3>
              </div>
              <Badge variant={hasReviewDue ? "default" : "secondary"}>
                {hasReviewDue ? "待複習" : "新單字"}
              </Badge>
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-foreground">
                  {hasReviewDue ? stats.reviewDue : suggestedNewWords}
                </span>
                <span className="text-muted-foreground">
                  {hasReviewDue ? "個單字待複習" : "個新單字"}
                </span>
              </div>
              <ProgressBar current={stats.learned} max={stats.total} showValues={false} />
              <p className="text-sm text-muted-foreground">已學習 {stats.learned} / {stats.total.toLocaleString()}</p>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-secondary/10 to-explorer/10 border-secondary/20">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <Award className="h-5 w-5 text-secondary" />
                <h3 className="font-semibold text-foreground">整體熟練度</h3>
              </div>
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-foreground">{masteryPercentage}%</span>
                <span className="text-sm text-muted-foreground">熟練</span>
              </div>
              <ProgressBar current={masteryPercentage} max={100} showValues={false} />
              <p className="text-sm text-muted-foreground">累計掌握 {stats.learned.toLocaleString()} 個單字</p>
            </div>
          </Card>

          <Card className="p-6 bg-gradient-to-br from-accent/10 to-treasure/10 border-accent/20">
            <div className="flex items-center justify-between mb-4">
              <div className="flex items-center gap-2">
                <TrendingUp className="h-5 w-5 text-accent" />
                <h3 className="font-semibold text-foreground">學習統計</h3>
              </div>
              {!isLoggedIn && (
                <Badge variant="outline" className="text-xs">本裝置</Badge>
              )}
            </div>
            <div className="space-y-2">
              <div className="flex items-baseline gap-2">
                <span className="text-4xl font-bold text-foreground">{displayReviewCount}</span>
                <span className="text-sm text-muted-foreground">次複習</span>
              </div>
              <div className="flex items-center gap-2 mt-2">
                <span className="text-sm text-muted-foreground">連續學習</span>
                <span className="text-success font-medium">{displayStreakDays} 天 {displayStreakDays > 0 ? '🔥' : ''}</span>
              </div>
              <p className="text-sm text-muted-foreground">精通單字 {stats.mastered} 個</p>
            </div>
          </Card>
        </div>

        {/* Mode Selection */}
        <div className="mb-8">
          <h2 className="text-2xl font-bold text-foreground mb-4 flex items-center gap-2">
            <Sparkles className="h-6 w-6 text-primary" />
            選擇複習模式
          </h2>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            {modes.map((mode) => {
              const Icon = mode.icon;
              return (
                <Card
                  key={mode.id}
                  className="relative overflow-hidden transition-all duration-300 hover:shadow-2xl hover:-translate-y-2 cursor-pointer group"
                >
                  <div className={`absolute inset-0 bg-gradient-to-br ${mode.color} opacity-50`} />

                  <div className="relative p-6">
                    {mode.badge && (
                      <div className="absolute top-4 right-4">
                        <Badge variant={mode.badgeVariant}>{mode.badge}</Badge>
                      </div>
                    )}

                    <div className="mb-4">
                      <div className={`w-16 h-16 rounded-xl bg-gradient-to-br ${mode.color} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform`}>
                        <Icon className={`h-8 w-8 ${mode.iconColor}`} />
                      </div>
                      <h3 className="text-xl font-bold text-foreground mb-2">{mode.title}</h3>
                      <p className="text-sm text-muted-foreground mb-4">{mode.description}</p>
                    </div>

                    <div className="flex items-center justify-between p-3 rounded-lg bg-background/50 mb-4">
                      <div>
                        <div className="text-2xl font-bold text-foreground">{mode.count}</div>
                        <div className="text-xs text-muted-foreground">{mode.countLabel}</div>
                      </div>
                      <ChevronRight className="h-5 w-5 text-muted-foreground group-hover:translate-x-1 transition-transform" />
                    </div>

                    <Button
                      className="w-full"
                      variant="default"
                      onClick={() => navigateWithProfileCheck(mode.path)}
                    >
                      開始複習
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Stats Row */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6 mb-8">
          {/* Error Stats */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Target className="h-5 w-5 text-destructive" />
                錯題統計
              </h3>
              <Button variant="ghost" size="sm" onClick={() => navigate("/practice/vocabulary/weak-words")}>
                查看弱點
              </Button>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm text-foreground">整體錯誤率</span>
                <span className={`text-lg font-bold ${errorStats.errorRate > 30 ? 'text-destructive' : errorStats.errorRate > 15 ? 'text-warning' : 'text-success'}`}>
                  {errorStats.errorRate}%
                </span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">總複習次數</span>
                  <span className="text-foreground font-medium">{errorStats.totalReviews.toLocaleString()} 次</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">需加強單字</span>
                  <span className="text-foreground font-medium">{errorStats.weakWordsCount} 個</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">正確率</span>
                  <span className="text-success font-medium">{100 - errorStats.errorRate}%</span>
                </div>
              </div>
            </div>
          </Card>

          {/* Learning Progress Detail */}
          <Card className="p-6">
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-lg font-bold text-foreground flex items-center gap-2">
                <Clock className="h-5 w-5 text-primary" />
                學習進度
              </h3>
            </div>

            <div className="space-y-4">
              <div className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                <span className="text-sm text-foreground">累計複習次數</span>
                <span className="text-lg font-bold text-primary">{displayReviewCount.toLocaleString()} 次</span>
              </div>

              <div className="space-y-2">
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">已學習單字</span>
                  <span className="text-foreground font-medium">{totalWordsLearned.toLocaleString()} 個</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">已精通單字</span>
                  <span className="text-foreground font-medium">{stats.mastered.toLocaleString()} 個</span>
                </div>
                <div className="flex justify-between text-sm">
                  <span className="text-muted-foreground">連續學習天數</span>
                  <span className="text-success font-medium">{displayStreakDays} 天 {displayStreakDays > 0 ? '🔥' : ''}</span>
                </div>
              </div>
            </div>
          </Card>
        </div>

        {/* Level Vocabulary Packs */}
        <div>
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
              <Layers className="h-6 w-6 text-primary" />
              Level 單字包
            </h2>
            <Badge variant="secondary" className="text-sm">
              共 {TOTAL_WORDS.toLocaleString()} 個單字
            </Badge>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-4">
            {VOCABULARY_LEVELS.filter(level => level.wordCount > 0).map((level, index) => {
              const progress = getLevelProgress(level.level);
              const progressPercent = progress.total > 0
                ? Math.round((progress.learned / progress.total) * 100)
                : 0;

              return (
                <Card
                  key={level.level}
                  className={`overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer bg-gradient-to-br ${levelColors[index % levelColors.length]}`}
                  onClick={() => handleStartLevel(level.level)}
                >
                  <div className="p-5">
                    <div className="flex items-center justify-between mb-3">
                      <div className="flex items-center gap-2">
                        <GraduationCap className="h-5 w-5 text-primary" />
                        <span className="font-bold text-lg text-foreground">Level {level.level}</span>
                      </div>
                      <Badge variant="outline" className="text-xs">{level.difficulty}</Badge>
                    </div>

                    <p className="text-sm text-muted-foreground mb-3">{level.description}</p>

                    <div className="flex items-center gap-2 mb-3">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm font-medium text-foreground">{level.wordCount.toLocaleString()} 個單字</span>
                    </div>

                    {/* Progress */}
                    <div className="space-y-2">
                      <div className="flex justify-between text-xs">
                        <span className="text-muted-foreground">學習進度</span>
                        <span className="font-medium text-foreground">{progressPercent}%</span>
                      </div>
                      <div className="h-2 rounded-full bg-background/50 overflow-hidden">
                        <div
                          className="h-full bg-primary transition-all duration-300"
                          style={{ width: `${progressPercent}%` }}
                        />
                      </div>
                      <div className="flex justify-between text-xs text-muted-foreground">
                        <span>已學 {progress.learned}</span>
                        <span>精通 {progress.mastered}</span>
                      </div>
                    </div>

                    <Button
                      size="sm"
                      variant="default"
                      className="w-full mt-4"
                      onClick={(e) => {
                        e.stopPropagation();
                        handleStartLevel(level.level);
                      }}
                    >
                      開始學習
                    </Button>
                  </div>
                </Card>
              );
            })}
          </div>
        </div>

        {/* Recommended Packs - hidden until feature is enabled */}
        {isFeatureEnabled('recommended_packs', currentPhase) && (
          <div className="mt-8">
            <div className="flex items-center justify-between mb-4">
              <h2 className="text-2xl font-bold text-foreground flex items-center gap-2">
                <Sparkles className="h-6 w-6 text-treasure" />
                推薦單字包
              </h2>
              <Button variant="ghost" className="gap-2" onClick={() => navigate("/practice/shop")}>
                前往商店 <ChevronRight className="h-4 w-4" />
              </Button>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
              {recommendedPacks.map((pack) => (
                <Card
                  key={pack.id}
                  className="overflow-hidden transition-all duration-300 hover:shadow-xl hover:-translate-y-1 cursor-pointer"
                >
                  <div className="p-6">
                    <div className="flex items-start justify-between mb-3">
                      <Badge variant="outline" className="text-xs">{pack.theme}</Badge>
                      <Badge variant="secondary">{pack.level}</Badge>
                    </div>

                    <h3 className="text-lg font-bold text-foreground mb-2">{pack.title}</h3>

                    <div className="flex items-center gap-2 mb-4">
                      <BookOpen className="h-4 w-4 text-muted-foreground" />
                      <span className="text-sm text-muted-foreground">{pack.words} 個單字</span>
                    </div>

                    <div className="flex items-center justify-between pt-4 border-t">
                      <div className="flex items-center gap-1">
                        <Sparkles className="h-5 w-5 text-treasure" />
                        <span className="text-xl font-bold text-foreground">{pack.price}</span>
                      </div>
                      <Button size="sm" variant="default">
                        立即購買
                      </Button>
                    </div>
                  </div>
                </Card>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* Grade Selection Modal for first-time users */}
      <GradeSelectionModal
        open={showGradeModal}
        onComplete={handleGradeComplete}
        allowSkip={false}
      />
    </div>
  );
};

export default VocabularyHub;
