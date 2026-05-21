import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ProgressBar";
import {
  PenLine,
  ArrowLeft,
  Trophy,
  CheckCircle2,
  XCircle,
  Loader2,
} from "lucide-react";
import { useState } from "react";
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

interface FillBlankQuestion {
  id: string;
  sentence: string;
  blankSentence: string;
  correctWord: string;
  translation: string;
  options: string[];
  correctIndex: number;
  wordData: VocabularyWord;
}

const generateFillBlankQuestions = (words: VocabularyWord[], count: number, allWords: VocabularyWord[]): FillBlankQuestion[] => {
  const withExamples = words.filter(w => w.example && w.example.toLowerCase().includes(w.word.toLowerCase()));
  const shuffled = [...withExamples].sort(() => Math.random() - 0.5).slice(0, count);

  return shuffled.map(word => {
    const regex = new RegExp(`\\b${word.word}\\b`, 'gi');
    const blankSentence = word.example.replace(regex, '______');

    const wrongWords = allWords
      .filter(w => w.id !== word.id && w.partOfSpeech === word.partOfSpeech && w.word !== word.word)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map(w => w.word);

    while (wrongWords.length < 3) {
      const filler = allWords.filter(w => w.id !== word.id && !wrongWords.includes(w.word)).sort(() => Math.random() - 0.5)[0];
      if (filler) wrongWords.push(filler.word); else break;
    }

    const correctIndex = Math.floor(Math.random() * 4);
    const options = [...wrongWords.slice(0, 3)];
    options.splice(correctIndex, 0, word.word);

    return {
      id: word.id,
      sentence: word.example,
      blankSentence,
      correctWord: word.word,
      translation: word.translation,
      options: options.slice(0, 4),
      correctIndex,
      wordData: word,
    };
  });
};

const FillBlank = () => {
  const navigate = useNavigate();
  const { celebrate } = useConfetti();
  const { getAllWords: storeGetAllWords, getWordsForQuiz, updateWordProgress, getFilteredWordCount } = useVocabularyStore();

  const [selectedSource, setSelectedSource] = useState<VocabularySource>('local');
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const { items: packItems, loading: packLoading, error: packError } = usePackItems(selectedPackId);

  const [phase, setPhase] = useState<'selection' | 'playing' | 'finished'>('selection');
  const [questions, setQuestions] = useState<FillBlankQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [answers, setAnswers] = useState<boolean[]>([]);
  const [questionCount, setQuestionCount] = useState(10);

  const currentQuestion = questions[currentIndex];

  const startPractice = () => {
    let wordList: VocabularyWord[] = [];
    let pool: VocabularyWord[] | undefined = undefined;
    if (selectedSource === 'pack') {
      if (!selectedPackId || packLoading || packError) return;
      if (packItems.length < 4) { toast.error("單字不足", { description: "至少需要 4 個有例句的單字" }); return; }
      wordList = packItems.map(convertPackItemToVocabularyWord);
      pool = wordList;
    } else {
      if (getFilteredWordCount() < 4) { toast.error("單字不足"); return; }
      wordList = getWordsForQuiz(questionCount * 3);
    }
    const generated = generateFillBlankQuestions(wordList, questionCount, pool || storeGetAllWords());
    if (generated.length < 2) { toast.error("有例句的單字不足", { description: "需要更多含有例句的單字" }); return; }
    setQuestions(generated);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setScore(0);
    setAnswers([]);
    setPhase('playing');
  };

  const handleSelect = (index: number) => {
    if (showResult) return;
    setSelectedAnswer(index);
    setShowResult(true);
    const correct = index === currentQuestion.correctIndex;
    setAnswers(prev => [...prev, correct]);
    if (correct) setScore(prev => prev + 1);

    if (selectedSource === 'pack' && selectedPackId) {
      updateWordProgress(currentQuestion.id, correct, undefined, 'pack', selectedPackId);
    } else {
      updateWordProgress(currentQuestion.id, correct, undefined, 'level');
    }
  };

  const handleNext = () => {
    if (currentIndex < questions.length - 1) {
      setCurrentIndex(prev => prev + 1);
      setSelectedAnswer(null);
      setShowResult(false);
    } else {
      if (score / questions.length >= 0.8) celebrate();
      setPhase('finished');
    }
  };

  if (phase === 'selection') {
    return (
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <Button variant="ghost" onClick={() => navigate("/practice/vocabulary")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> 返回
        </Button>
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><PenLine className="h-6 w-6" /> 填空練習</h1>
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
            {packLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} 開始填空
          </Button>
        )}
      </div>
    );
  }

  if (phase === 'finished') {
    const accuracy = questions.length > 0 ? Math.round((score / questions.length) * 100) : 0;
    return (
      <div className="container mx-auto px-4 py-12 max-w-md text-center">
        <Trophy className="h-16 w-16 mx-auto mb-4 text-primary" />
        <h2 className="text-2xl font-bold mb-2">填空完成！</h2>
        <p className="text-4xl font-bold text-primary mb-2">{accuracy}%</p>
        <p className="text-muted-foreground mb-6">答對 {score} / {questions.length}</p>
        <div className="space-y-3">
          <Button onClick={() => setPhase('selection')} className="w-full">再玩一次</Button>
          <Button variant="outline" onClick={() => navigate("/practice/vocabulary")} className="w-full">返回</Button>
        </div>
      </div>
    );
  }

  return (
    <div className="container mx-auto px-4 py-6 max-w-xl">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={() => setPhase('selection')}><ArrowLeft className="h-4 w-4 mr-2" /> 返回</Button>
        <Badge variant="secondary">{currentIndex + 1} / {questions.length}</Badge>
      </div>
      <ProgressBar current={currentIndex + 1} max={questions.length} showValues={false} />

      <Card className="p-6 mt-4">
        <p className="text-sm text-muted-foreground mb-2">選出正確的單字填入空格</p>
        <p className="text-lg font-medium mb-1 leading-relaxed">{currentQuestion.blankSentence}</p>
        <p className="text-sm text-muted-foreground mb-6">（{currentQuestion.translation}）</p>

        <div className="grid grid-cols-2 gap-3">
          {currentQuestion.options.map((option, i) => {
            let variant: 'outline' | 'default' | 'destructive' = 'outline';
            let extraClass = '';
            if (showResult) {
              if (i === currentQuestion.correctIndex) { variant = 'default'; extraClass = 'bg-green-600 hover:bg-green-600 border-green-600'; }
              else if (i === selectedAnswer) { variant = 'destructive'; }
            }
            return (
              <Button key={i} variant={variant} className={`h-auto py-3 text-base ${extraClass}`} onClick={() => handleSelect(i)} disabled={showResult}>
                {option}
              </Button>
            );
          })}
        </div>

        {showResult && (
          <div className="mt-4">
            {selectedAnswer === currentQuestion.correctIndex ? (
              <p className="text-green-600 flex items-center gap-1 text-sm"><CheckCircle2 className="h-4 w-4" /> 正確！</p>
            ) : (
              <p className="text-destructive flex items-center gap-1 text-sm"><XCircle className="h-4 w-4" /> 正確答案：<strong>{currentQuestion.correctWord}</strong></p>
            )}
            <p className="text-sm text-muted-foreground mt-2">{currentQuestion.sentence}</p>
            <Button onClick={handleNext} className="w-full mt-4">{currentIndex < questions.length - 1 ? '下一題' : '查看結果'}</Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default FillBlank;
