import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { ProgressBar } from "@/components/ProgressBar";
import {
  ArrowLeftRight,
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

type QuestionType = 'synonym' | 'antonym';

interface SAQuestion {
  id: string;
  word: string;
  translation: string;
  type: QuestionType;
  options: string[];
  correctIndex: number;
  correctWord: string;
  wordData: VocabularyWord;
}

const generateSAQuestions = (words: VocabularyWord[], count: number, allWords: VocabularyWord[]): SAQuestion[] => {
  const candidates = words.filter(w => (w.synonyms && w.synonyms.length > 0) || (w.antonyms && w.antonyms.length > 0));
  const shuffled = [...candidates].sort(() => Math.random() - 0.5).slice(0, count);

  return shuffled.map(word => {
    const hasSynonyms = word.synonyms && word.synonyms.length > 0;
    const hasAntonyms = word.antonyms && word.antonyms.length > 0;
    const type: QuestionType = hasSynonyms && hasAntonyms
      ? (Math.random() > 0.5 ? 'synonym' : 'antonym')
      : hasSynonyms ? 'synonym' : 'antonym';

    const correctList = type === 'synonym' ? word.synonyms : word.antonyms;
    const correctWord = correctList[Math.floor(Math.random() * correctList.length)];

    const wrongWords = allWords
      .filter(w => w.id !== word.id && !correctList.includes(w.word) && w.word !== correctWord)
      .sort(() => Math.random() - 0.5)
      .slice(0, 3)
      .map(w => w.word);

    const correctIndex = Math.floor(Math.random() * 4);
    const options = [...wrongWords.slice(0, 3)];
    options.splice(correctIndex, 0, correctWord);

    return {
      id: word.id,
      word: word.word,
      translation: word.translation,
      type,
      options: options.slice(0, 4),
      correctIndex,
      correctWord,
      wordData: word,
    };
  });
};

const SynonymAntonym = () => {
  const navigate = useNavigate();
  const { celebrate } = useConfetti();
  const { getAllWords: storeGetAllWords, getWordsForQuiz, updateWordProgress, getFilteredWordCount } = useVocabularyStore();

  const [selectedSource, setSelectedSource] = useState<VocabularySource>('local');
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const { items: packItems, loading: packLoading, error: packError } = usePackItems(selectedPackId);

  const [phase, setPhase] = useState<'selection' | 'playing' | 'finished'>('selection');
  const [questions, setQuestions] = useState<SAQuestion[]>([]);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedAnswer, setSelectedAnswer] = useState<number | null>(null);
  const [showResult, setShowResult] = useState(false);
  const [score, setScore] = useState(0);
  const [questionCount, setQuestionCount] = useState(10);

  const currentQuestion = questions[currentIndex];

  const startPractice = () => {
    let wordList: VocabularyWord[] = [];
    let pool: VocabularyWord[] | undefined = undefined;
    if (selectedSource === 'pack') {
      if (!selectedPackId || packLoading || packError) return;
      wordList = packItems.map(convertPackItemToVocabularyWord);
      pool = wordList;
    } else {
      if (getFilteredWordCount() < 4) { toast.error("單字不足"); return; }
      wordList = getWordsForQuiz(questionCount * 3);
    }
    const generated = generateSAQuestions(wordList, questionCount, pool || storeGetAllWords());
    if (generated.length < 2) {
      toast.error("同義/反義詞資料不足", { description: "選擇的範圍中沒有足夠的同義詞或反義詞資料" });
      return;
    }
    setQuestions(generated);
    setCurrentIndex(0);
    setSelectedAnswer(null);
    setShowResult(false);
    setScore(0);
    setPhase('playing');
  };

  const handleSelect = (index: number) => {
    if (showResult) return;
    setSelectedAnswer(index);
    setShowResult(true);
    const correct = index === currentQuestion.correctIndex;
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
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><ArrowLeftRight className="h-6 w-6" /> 同義 / 反義詞</h1>
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
            {packLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} 開始練習
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
        <h2 className="text-2xl font-bold mb-2">練習完成！</h2>
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

      <Card className="p-6 mt-4 text-center">
        <Badge className={`mb-4 ${currentQuestion.type === 'synonym' ? 'bg-blue-500' : 'bg-orange-500'}`}>
          {currentQuestion.type === 'synonym' ? '同義詞' : '反義詞'}
        </Badge>
        <p className="text-sm text-muted-foreground mb-1">
          選出 <strong>{currentQuestion.word}</strong> 的{currentQuestion.type === 'synonym' ? '同義詞' : '反義詞'}
        </p>
        <p className="text-2xl font-bold mb-2">{currentQuestion.word}</p>
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
              <p className="text-green-600 flex items-center justify-center gap-1 text-sm"><CheckCircle2 className="h-4 w-4" /> 正確！</p>
            ) : (
              <p className="text-destructive flex items-center justify-center gap-1 text-sm"><XCircle className="h-4 w-4" /> 正確答案：<strong>{currentQuestion.correctWord}</strong></p>
            )}
            <Button onClick={handleNext} className="w-full mt-4">{currentIndex < questions.length - 1 ? '下一題' : '查看結果'}</Button>
          </div>
        )}
      </Card>
    </div>
  );
};

export default SynonymAntonym;
