import { useEffect } from 'react';
export type VocabularySource = 'local' | 'pack';
const PACK = '11111111-1111-1111-1111-111111111111';

/** 依 ?source=pack 自動把來源切成 pack，讓測試不必模擬點擊。 */
export const CollectionPackSelector = (props: {
  selectedSource: VocabularySource;
  onSourceChange: (s: VocabularySource) => void;
  multiSelect?: boolean;
  onPackSelect?: (id: string | null) => void;
  onPacksSelect?: (ids: string[]) => void;
}) => {
  const wantPack = new URLSearchParams(location.search).get('source') === 'pack';
  useEffect(() => {
    if (!wantPack) return;
    props.onSourceChange('pack');
    if (props.multiSelect) props.onPacksSelect?.([PACK]);
    else props.onPackSelect?.(PACK);
  }, [wantPack]);
  return <div data-testid="source">{props.selectedSource}</div>;
};
