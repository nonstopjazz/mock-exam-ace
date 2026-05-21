import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ProgressBar";
import {
  Keyboard,
  ArrowLeft,
  Trophy,
  CheckCircle2,
  XCircle,
  RotateCcw,
  Loader2,
  Lightbulb,
} from "lucide-react";
import { useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useConfetti } from "@/hooks/galaxy/useConfetti";
import { useVocabularyStore } from "@/store/vocabularyStore";
import type { VocabularyWord } from "@/data/vocabulary/types";
import { VocabularySelector } from "@/components/vocabulary/VocabularySelector";
import { CollectionPackSelector, VocabularySource } from "@/components/vocabulary/CollectionPackSelector";
import { usePackItems, PackItem } from "@/hooks/useUserPacks";

const convertPackItemToVocabularyWord = (item: PackItem): VocabularyWord => ({
  id: item.id, word: item.word, translation: item.definition || '', ipa: item.phonetic || '',
  partOfSpeech: item.part_of_speech || '', example: item.example_sentence || '',
  exampleTranslation: '', synonyms: [], antonyms: [], level: 1, tags: [],
  difficulty: 'medium', category: '', extraNotes: '',
});

const SpellingPractice = () => {
  const navigate = useNavigate();
  const { celebrate } = useConfetti();
  const { getAllWords: storeGetAllWords, getWordsForQuiz, updateWordProgress, getFilteredWordCount } = useVocabularyStore();

  const [selectedSource, setSelectedSource] = useState<VocabularySource>('local');
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const { items: packItems, loading: packLoading, error: packError } = usePackItems(selectedPackId);

  const [phase, setPhase] = useState<'selection' | 'playing' | 'finished'>('selection');
  const [words, setWords] = useState<VocabularyWord[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [shuffledLetters, setShuffledLetters] = useState<{ letter: string; id: number }[]>([]);
  const [selectedLetters, setSelectedLetters] = useState<{ letter: string; id: number }[]>([]);
  const [showResult, setShowResult] = useState(false);
  const [isCorrect, setIsCorrect] = useState(false);
  const [score, setScore] = useState(0);
  const [total, setTotal] = useState(0);
  const [questionCount, setQuestionCount] = useState(10);
  const [showHint, setShowHint] = useState(false);

  const currentWord = words[currentIndex];

  const shuffleWord = useCallback((word: string) => {
    const letters = word.split('').map((letter, i) => ({ letter, id: i }));
    for (let i = letters.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [letters[i], letters[j]] = [letters[j], letters[i]];
    }
    return letters;
  }, []);

  const startPractice = () => {
    let wordList: VocabularyWord[] = [];
    if (selectedSource === 'pack') {
      if (!selectedPackId || packLoading || packError) return;
      if (packItems.length < 2) { toast.error("單字不足", { description: "至少需要 2 個單字" }); return; }
      wordList = packItems.map(convertPackItemToVocabularyWord);
    } else {
      if (getFilteredWordCount() < 2) { toast.error("單字不足"); return; }
      wordList = getWordsForQuiz(questionCount * 2);
    }
    const selected = [...wordList].sort(() => Math.random() - 0.5).slice(0, questionCount);
    setWords(selected);
    setCurrentIndex(0);
    setScore(0);
    setTotal(0);
    setShowResult(false);
    setShowHint(false);
    setShuffledLetters(shuffleWord(selected[0].word));
    setSelectedLetters([]);
    setPhase('playing');
  };

  const handleLetterClick = (letter: { letter: string; id: number }) => {
    if (showResult) return;
    const newSelected = [...selectedLetters, letter];
    setSelectedLetters(newSelected);
    setShuffledLetters(prev => prev.filter(l => l.id !== letter.id));

    if (newSelected.length === currentWord.word.length) {
      const answer = newSelected.map(l => l.letter).join('');
      const correct = answer.toLowerCase() === currentWord.word.toLowerCase();
      setIsCorrect(correct);
      setShowResult(true);
      setTotal(prev => prev + 1);
      if (correct) setScore(prev => prev + 1);

      if (selectedSource === 'pack' && selectedPackId) {
        updateWordProgress(currentWord.id, correct, undefined, 'pack', selectedPackId);
      } else {
        updateWordProgress(currentWord.id, correct, undefined, 'level');
      }
    }
  };

  const handleRemoveLetter = (index: number) => {
    if (showResult) return;
    const removed = selectedLetters[index];
    setSelectedLetters(prev => prev.filter((_, i) => i !== index));
    setShuffledLetters(prev => [...prev, removed].sort(() => Math.random() - 0.5));
  };

  const handleNext = () => {
    if (currentIndex < words.length - 1) {
      const nextIndex = currentIndex + 1;
      setCurrentIndex(nextIndex);
      setShuffledLetters(shuffleWord(words[nextIndex].word));
      setSelectedLetters([]);
      setShowResult(false);
      setShowHint(false);
    } else {
      if (score / total >= 0.8) celebrate();
      setPhase('finished');
    }
  };

  const handleClear = () => {
    if (showResult) return;
    setShuffledLetters(shuffleWord(currentWord.word));
    setSelectedLetters([]);
  };

  if (phase === 'selection') {
    return (
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <Button variant="ghost" onClick={() => navigate("/practice/vocabulary")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> 返回
        </Button>
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><Keyboard className="h-6 w-6" /> 拼字練習</h1>
        <CollectionPackSelector selectedSource={selectedSource} selectedPackId={selectedPackId} onSourceChange={setSelectedSource} onPackSelect={setSelectedPackId} />
        <div className="mt-4 flex gap-2 mb-4">
          {[5, 10, 20].map(n => (
            <Button key={n} variant={questionCount === n ? 'default' : 'outline'} size="sm" onClick={() => setQuestionCount(n)}>{n} 題</Button>
          ))}
        </div>
        {selectedSource === 'local' ? (
          <VocabularySelector mode="quiz" title="選擇範圍" onStart={startPractice} />
        ) : (
          <Button onClick={startPractice} disabled={packLoading || !selectedPackId} className="w-full mt-4">
            {packLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} 開始拼字
          </Button>
        )}
      </div>
    );
  }

  if (phase === 'finished') {
    const accuracy = total > 0 ? Math.round((score / total) * 100) : 0;
    return (
      <div className="container mx-auto px-4 py-12 max-w-md text-center">
        <Trophy className="h-16 w-16 mx-auto mb-4 text-primary" />
        <h2 className="text-2xl font-bold mb-2">拼字完成！</h2>
        <p className="text-4xl font-bold text-primary mb-2">{accuracy}%</p>
        <p className="text-muted-foreground mb-6">答對 {score} / {total}</p>
        <div className="space-y-3">
          <Button onClick={() => { setPhase('selection'); }} className="w-full">再玩一次</Button>
          <Button variant="outline" onClick={() => navigate("/practice/vocabulary")} className="w-full">返回</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-xl">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={() => setPhase('selection')}><ArrowLeft className="h-4 w-4 mr-2" /> 返回</Button>
        <Badge variant="secondary">{currentIndex + 1} / {words.length}</Badge>
      </div>
      <ProgressBar current={currentIndex + 1} max={words.length} showValues={false} />

      <Card className="p-6 mt-4 text-center">
        <p className="text-lg text-muted-foreground mb-1">請拼出這個單字</p>
        <p className="text-2xl font-bold mb-1">{currentWord.translation}</p>
        <p className="text-sm text-muted-foreground mb-4">{currentWord.partOfSpeech}</p>

        {showHint && (
          <p className="text-sm text-amber-600 mb-4">提示：{currentWord.word.charAt(0)}...{currentWord.word.charAt(currentWord.word.length - 1)}（{currentWord.word.length} 個字母）</p>
        )}

        <div className="min-h-[52px] flex items-center justify-center gap-1 flex-wrap mb-4 p-3 border-2 border-dashed rounded-lg">
          {selectedLetters.length === 0 ? (
            <span className="text-muted-foreground text-sm">點擊下方字母拼出單字</span>
          ) : (
            selectedLetters.map((l, i) => (
              <button key={`sel-${l.id}`} onClick={() => handleRemoveLetter(i)}
                className={`w-10 h-10 rounded-lg font-bold text-lg border-2 transition-colors ${
                  showResult ? (isCorrect ? 'bg-green-100 border-green-500 text-green-700' : 'bg-red-100 border-red-500 text-red-700') : 'bg-primary/10 border-primary text-primary hover:bg-primary/20'
                }`}>{l.letter}</button>
            ))
          )}
        </div>

        {showResult && !isCorrect && (
          <p className="text-sm text-destructive mb-4">正確答案：<span className="font-bold">{currentWord.word}</span></p>
        )}
        {showResult && isCorrect && (
          <p className="text-sm text-green-600 mb-4 flex items-center justify-center gap-1"><CheckCircle2 className="h-4 w-4" /> 正確！</p>
        )}

        <div className="flex items-center justify-center gap-1 flex-wrap mb-4">
          {shuffledLetters.map((l) => (
            <button key={`shuf-${l.id}`} onClick={() => handleLetterClick(l)}
              className="w-10 h-10 rounded-lg font-bold text-lg bg-muted border-2 border-border hover:bg-accent hover:border-primary transition-colors">{l.letter}</button>
          ))}
        </div>

        <div className="flex justify-center gap-2">
          {!showResult && (
            <>
              <Button variant="outline" size="sm" onClick={handleClear}><RotateCcw className="h-4 w-4 mr-1" /> 清除</Button>
              <Button variant="outline" size="sm" onClick={() => setShowHint(true)} disabled={showHint}><Lightbulb className="h-4 w-4 mr-1" /> 提示</Button>
            </>
          )}
          {showResult && <Button onClick={handleNext}>{currentIndex < words.length - 1 ? '下一題' : '查看結果'}</Button>}
        </div>
      </Card>
    </div>
  );
};

export default SpellingPractice;
