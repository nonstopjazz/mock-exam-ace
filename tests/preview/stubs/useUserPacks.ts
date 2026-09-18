import type { PackItemRow } from '@/lib/lexical/types';
export type PackItem = PackItemRow;

const PACK = '11111111-1111-1111-1111-111111111111';
export const PACK_ID = PACK;
const ITEMS: PackItemRow[] = [
  { id: 'aaaa0001-0000-0000-0000-000000000001', pack_id: PACK, word: 'persist',  definition: '堅持',   part_of_speech: 'v.', example_sentence: 'You must persist here.',  phonetic: '/p/', sort_order: 1, audio_url: null, example_audio_url: null },
  { id: 'aaaa0002-0000-0000-0000-000000000002', pack_id: PACK, word: 'insist',   definition: '堅決主張', part_of_speech: 'v.', example_sentence: 'They insist on it.',      phonetic: '/i/', sort_order: 2, audio_url: null, example_audio_url: null },
  { id: 'aaaa0003-0000-0000-0000-000000000003', pack_id: PACK, word: 'consist',  definition: '組成',   part_of_speech: 'v.', example_sentence: 'It will consist of two.',  phonetic: '/c/', sort_order: 3, audio_url: null, example_audio_url: null },
  { id: 'aaaa0004-0000-0000-0000-000000000004', pack_id: PACK, word: 'resist',   definition: '抵抗',   part_of_speech: 'v.', example_sentence: 'Do not resist change.',   phonetic: '/r/', sort_order: 4, audio_url: null, example_audio_url: null },
  { id: 'aaaa0005-0000-0000-0000-000000000005', pack_id: PACK, word: 'assist',   definition: '協助',   part_of_speech: 'v.', example_sentence: 'I can assist you now.',   phonetic: '/a/', sort_order: 5, audio_url: null, example_audio_url: null },
  { id: 'aaaa0006-0000-0000-0000-000000000006', pack_id: PACK, word: 'exist',    definition: '存在',   part_of_speech: 'v.', example_sentence: 'Such things exist today.', phonetic: '/e/', sort_order: 6, audio_url: null, example_audio_url: null },
];

export const usePackItems      = (packId: string | null) => ({ items: packId ? ITEMS : [], loading: false, error: null });
export const useMultiPackItems = (ids: string[])          => ({ items: ids.length ? ITEMS : [], loading: false, error: null });
export const useUserPacks      = () => ({ packs: [], loading: false, error: null, refetch: () => {}, removePack: async () => ({ error: null }), updateProgress: async () => ({ error: null }) });
export const usePackWithItems  = () => ({ pack: null, loading: false, error: null });
