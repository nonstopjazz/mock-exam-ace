import type { VocabularyWord } from '@/data/vocabulary/types';

/** 三個官方題庫字，涵蓋有同反義詞、有例句含本字（fill-blank 需要）。 */
const W = (id: string, word: string, tr: string, pos: string, ex: string, syn: string[], ant: string[]): VocabularyWord => ({
  id, word, translation: tr, ipa: `/${word}/`, partOfSpeech: pos,
  example: ex, exampleTranslation: '中文' + word,
  synonyms: syn, antonyms: ant, level: 4, tags: ['學測'],
  difficulty: 'intermediate', category: '動詞', extraNotes: '',
  audioUrl: null, exampleAudioUrl: null,
});

export const FIXTURES: VocabularyWord[] = [
  W('2936', 'persist', '堅持', 'v.', 'She decided to persist despite it.', ['insist', 'endure'], ['quit']),
  W('4954', 'insist', '堅決主張', 'v.', 'She will insist on finishing it.', ['persist'], ['yield']),
  W('1339', 'consist', '由…組成', 'v.', 'A diet should consist of nutrients.', ['comprise'], ['lack']),
  W('0821', 'quit', '放棄', 'v.', 'He decided to quit the job.', ['abandon'], ['persist']),
  W('2255', 'resist', '抵抗', 'v.', 'Many people cannot resist chocolate.', ['oppose'], ['yield']),
  W('7001', 'assist', '協助', 'v.', 'She will assist you with homework.', ['help'], ['hinder']),
];

export async function fetchLevelWords(): Promise<VocabularyWord[]> { return FIXTURES; }
export async function fetchWordsByLevel(level: number) { return FIXTURES.filter(w => w.level === level); }
export function clearLevelWordsCache() {}
