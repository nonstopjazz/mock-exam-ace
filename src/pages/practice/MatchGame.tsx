import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import {
  Puzzle,
  ArrowLeft,
  Trophy,
  Timer,
  Loader2,
  RotateCcw,
} from "lucide-react";
import { useState, useEffect, useRef } from "react";
import { useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { useConfetti } from "@/hooks/galaxy/useConfetti";
import { useVocabularyStore } from "@/store/vocabularyStore";
import type { VocabularyWord } from "@/data/vocabulary/types";
import { VocabularySelector } from "@/components/vocabulary/VocabularySelector";
import { CollectionPackSelector, VocabularySource } from "@/components/vocabulary/CollectionPackSelector";
import { usePackItems } from "@/hooks/useUserPacks";
import { packItemToVocabularyWord } from "@/lib/lexical/mapper";
import { recordPracticeAttempt, recordEvidenceOnly, newSessionId } from "@/lib/lexical/attempts";

interface MatchTile {
  id: string;
  text: string;
  wordId: string;
  type: 'english' | 'chinese';
  matched: boolean;
}

const PAIR_COUNT = 6;

const MatchGame = () => {
  const navigate = useNavigate();
  const { celebrate } = useConfetti();
  const { getWordsForQuiz, getFilteredWordCount } = useVocabularyStore();

  const [selectedSource, setSelectedSource] = useState<VocabularySource>('local');
  const [selectedPackId, setSelectedPackId] = useState<string | null>(null);
  const { items: packItems, loading: packLoading, error: packError } = usePackItems(selectedPackId);

  const [phase, setPhase] = useState<'selection' | 'playing' | 'finished'>('selection');
  const [tiles, setTiles] = useState<MatchTile[]>([]);
  const [selected, setSelected] = useState<MatchTile | null>(null);
  const [wrongPair, setWrongPair] = useState<[string, string] | null>(null);
  const [matchedCount, setMatchedCount] = useState(0);
  const [attempts, setAttempts] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const [round, setRound] = useState(0);
  const [totalRounds, setTotalRounds] = useState(0);
  const [allWords, setAllWords] = useState<VocabularyWord[]>([]);
  const timerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  // Phase 6：這個 mode 本來就在算 attempts 與 elapsed，但兩個值都只活在
  // React state、連結算畫面都沒顯示。現在它們會落地。
  // wrongByWord 記每個字被配錯幾次（誤點的兩張牌各算一次）。
  const [sessionId] = useState(() => newSessionId());
  const selectedAtRef = useRef<number>(Date.now());
  const wrongByWord = useRef<Record<string, number>>({});

  useEffect(() => {
    if (phase === 'playing' && matchedCount < PAIR_COUNT) {
      timerRef.current = setInterval(() => setElapsed(prev => prev + 1), 1000);
      return () => { if (timerRef.current) clearInterval(timerRef.current); };
    }
    if (matchedCount === PAIR_COUNT && timerRef.current) clearInterval(timerRef.current);
  }, [phase, matchedCount]);

  const setupRound = (words: VocabularyWord[], roundIdx: number) => {
    const start = roundIdx * PAIR_COUNT;
    const roundWords = words.slice(start, start + PAIR_COUNT);
    const engTiles: MatchTile[] = roundWords.map(w => ({ id: `en-${w.id}`, text: w.word, wordId: w.id, type: 'english', matched: false }));
    const chTiles: MatchTile[] = roundWords.map(w => ({ id: `ch-${w.id}`, text: w.translation, wordId: w.id, type: 'chinese', matched: false }));
    const shuffledEng = [...engTiles].sort(() => Math.random() - 0.5);
    const shuffledCh = [...chTiles].sort(() => Math.random() - 0.5);
    setTiles([...shuffledEng, ...shuffledCh]);
    setSelected(null);
    setWrongPair(null);
    setMatchedCount(0);
    setAttempts(0);
    setElapsed(0);
    wrongByWord.current = {};
  };

  const startGame = () => {
    let wordList: VocabularyWord[] = [];
    if (selectedSource === 'pack') {
      if (!selectedPackId || packLoading || packError) return;
      if (packItems.length < PAIR_COUNT) { toast.error("單字不足", { description: `至少需要 ${PAIR_COUNT} 個單字` }); return; }
      wordList = packItems.map(packItemToVocabularyWord);
    } else {
      if (getFilteredWordCount() < PAIR_COUNT) { toast.error("單字不足"); return; }
      wordList = getWordsForQuiz(PAIR_COUNT * 5);
    }
    const shuffled = [...wordList].sort(() => Math.random() - 0.5);
    const rounds = Math.min(3, Math.floor(shuffled.length / PAIR_COUNT));
    setAllWords(shuffled);
    setTotalRounds(rounds);
    setRound(0);
    setupRound(shuffled, 0);
    setPhase('playing');
  };

  const handleTileClick = (tile: MatchTile) => {
    if (tile.matched || wrongPair) return;

    if (!selected) {
      setSelected(tile);
      selectedAtRef.current = Date.now();
      return;
    }

    if (selected.id === tile.id) { setSelected(null); return; }
    if (selected.type === tile.type) { setSelected(tile); selectedAtRef.current = Date.now(); return; }

    setAttempts(prev => prev + 1);

    const responseTimeMs = Date.now() - selectedAtRef.current;
    const source = selectedSource === 'pack' ? 'pack' as const : 'level' as const;

    if (selected.wordId === tile.wordId) {
      setTiles(prev => prev.map(t => t.wordId === tile.wordId ? { ...t, matched: true } : t));
      const newCount = matchedCount + 1;
      setMatchedCount(newCount);
      setSelected(null);

      recordPracticeAttempt({
        wordId: tile.wordId,
        source,
        packId: selectedPackId,
        exerciseType: 'match',
        skillDimension: 'meaning',
        correct: true,
        responseTimeMs,
        // 這個字在配對成功前被點錯幾次
        attemptCount: (wrongByWord.current[tile.wordId] ?? 0) + 1,
        sessionId,
      });

      if (newCount === PAIR_COUNT) {
        if (round < totalRounds - 1) {
          setTimeout(() => {
            const nextRound = round + 1;
            setRound(nextRound);
            setupRound(allWords, nextRound);
          }, 800);
        } else {
          celebrate();
          setTimeout(() => setPhase('finished'), 800);
        }
      }
    } else {
      // Phase 6：誤點【開始留紀錄】。改版前這裡完全不寫入任何東西。
      //
      // 🛑 但刻意【不動熟練度】——規格明講 attempt history 與 mastery update
      //    要分離。誤點一次就扣熟練度會讓配對遊戲變成懲罰性的，
      //    而且配錯的兩張牌到底是哪個字答錯了也說不清楚。
      //    所以兩邊的字各留一筆證據，熟練度不變。
      for (const wrongId of [selected.wordId, tile.wordId]) {
        wrongByWord.current[wrongId] = (wrongByWord.current[wrongId] ?? 0) + 1;
        recordEvidenceOnly({
          wordId: wrongId,
          source,
          packId: selectedPackId,
          exerciseType: 'match',
          skillDimension: 'meaning',
          correct: false,
          responseTimeMs,
          attemptCount: wrongByWord.current[wrongId],
          sessionId,
          metadata: {
            event: 'wrong_pair',
            picked_english: selected.type === 'english' ? selected.text : tile.text,
            picked_chinese: selected.type === 'chinese' ? selected.text : tile.text,
            elapsed_seconds: elapsed,
          },
        });
      }

      setWrongPair([selected.id, tile.id]);
      setTimeout(() => { setWrongPair(null); setSelected(null); }, 600);
    }
  };

  if (phase === 'selection') {
    return (
      <div className="container mx-auto px-4 py-6 max-w-2xl">
        <Button variant="ghost" onClick={() => navigate("/practice/vocabulary")} className="mb-4">
          <ArrowLeft className="h-4 w-4 mr-2" /> 返回
        </Button>
        <h1 className="text-2xl font-bold mb-6 flex items-center gap-2"><Puzzle className="h-6 w-6" /> 配對遊戲</h1>
        <CollectionPackSelector selectedSource={selectedSource} selectedPackId={selectedPackId} onSourceChange={setSelectedSource} onPackSelect={setSelectedPackId} />
        {selectedSource === 'local' ? (
          <VocabularySelector mode="quiz" title="選擇範圍" onStart={startGame} />
        ) : (
          <Button onClick={startGame} disabled={packLoading || !selectedPackId} className="w-full mt-4">
            {packLoading ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : null} 開始配對
          </Button>
        )}
      </div>
    );
  }

  if (phase === 'finished') {
    return (
      <div className="container mx-auto px-4 py-12 max-w-md text-center">
        <Trophy className="h-16 w-16 mx-auto mb-4 text-primary" />
        <h2 className="text-2xl font-bold mb-2">配對完成！</h2>
        <p className="text-muted-foreground mb-6">共 {totalRounds} 輪，{totalRounds * PAIR_COUNT} 組配對</p>
        <div className="space-y-3">
          <Button onClick={() => { setPhase('selection'); }} className="w-full"><RotateCcw className="h-4 w-4 mr-2" /> 再玩一次</Button>
          <Button variant="outline" onClick={() => navigate("/practice/vocabulary")} className="w-full">返回</Button>
        </div>
      </div>
    );
  }

  const engTiles = tiles.filter(t => t.type === 'english');
  const chTiles = tiles.filter(t => t.type === 'chinese');

  return (
    <div className="container mx-auto px-4 py-6 max-w-2xl">
      <div className="flex items-center justify-between mb-4">
        <Button variant="ghost" size="sm" onClick={() => setPhase('selection')}><ArrowLeft className="h-4 w-4 mr-2" /> 返回</Button>
        <div className="flex items-center gap-3">
          <Badge variant="outline" className="gap-1"><Timer className="h-3 w-3" /> {elapsed}s</Badge>
          <Badge variant="secondary">第 {round + 1} / {totalRounds} 輪</Badge>
          <Badge>{matchedCount} / {PAIR_COUNT}</Badge>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4">
        <div className="space-y-2">
          {engTiles.map(tile => (
            <button key={tile.id} onClick={() => handleTileClick(tile)} disabled={tile.matched}
              className={`w-full p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                tile.matched ? 'bg-green-100 border-green-300 text-green-700 opacity-60' :
                wrongPair?.includes(tile.id) ? 'bg-red-100 border-red-400 text-red-700 animate-shake' :
                selected?.id === tile.id ? 'bg-primary/10 border-primary text-primary' :
                'bg-card border-border hover:border-primary/50'
              }`}>{tile.text}</button>
          ))}
        </div>
        <div className="space-y-2">
          {chTiles.map(tile => (
            <button key={tile.id} onClick={() => handleTileClick(tile)} disabled={tile.matched}
              className={`w-full p-3 rounded-lg border-2 text-sm font-medium transition-all ${
                tile.matched ? 'bg-green-100 border-green-300 text-green-700 opacity-60' :
                wrongPair?.includes(tile.id) ? 'bg-red-100 border-red-400 text-red-700 animate-shake' :
                selected?.id === tile.id ? 'bg-primary/10 border-primary text-primary' :
                'bg-card border-border hover:border-primary/50'
              }`}>{tile.text}</button>
          ))}
        </div>
      </div>
    </div>
  );
};

export default MatchGame;
