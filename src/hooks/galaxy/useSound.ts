import { useCallback, useRef, useEffect } from 'react';

/**
 * Sound Management Hook
 * 
 * 提供音效播放、停止、音量控制功能
 * 包含音效快取以提升性能
 */

interface SoundOptions {
  volume?: number;
  loop?: boolean;
  playbackRate?: number;
}

interface UseSoundReturn {
  play: (soundPath: string, options?: SoundOptions) => void;
  stop: (soundPath: string) => void;
  stopAll: () => void;
  setGlobalVolume: (volume: number) => void;
  setEnabled: (enabled: boolean) => void;
}

export const useSound = (): UseSoundReturn => {
  const audioCache = useRef<Map<string, HTMLAudioElement>>(new Map());
  const globalVolume = useRef<number>(0.5);
  const enabled = useRef<boolean>(true);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      audioCache.current.forEach(audio => {
        audio.pause();
        audio.src = '';
      });
      audioCache.current.clear();
    };
  }, []);

  const play = useCallback((soundPath: string, options: SoundOptions = {}) => {
    if (!enabled.current) return;

    const {
      volume = 1.0,
      loop = false,
      playbackRate = 1.0,
    } = options;

    try {
      // Get or create audio element
      let audio = audioCache.current.get(soundPath);
      
      if (!audio) {
        audio = new Audio(soundPath);
        audioCache.current.set(soundPath, audio);
        
        // Handle audio loading errors
        audio.addEventListener('error', (e) => {
          console.warn(`Failed to load audio: ${soundPath}`, e);
        });
      }

      // Configure audio
      audio.volume = Math.min(1, Math.max(0, volume * globalVolume.current));
      audio.loop = loop;
      audio.playbackRate = playbackRate;
      audio.currentTime = 0;

      // Play audio
      const playPromise = audio.play();
      
      if (playPromise !== undefined) {
        playPromise.catch(err => {
          // Auto-play was prevented or other error
          console.warn('Audio play failed:', err);
        });
      }
    } catch (error) {
      console.warn('Error playing audio:', error);
    }
  }, []);

  const stop = useCallback((soundPath: string) => {
    const audio = audioCache.current.get(soundPath);
    if (audio) {
      audio.pause();
      audio.currentTime = 0;
    }
  }, []);

  const stopAll = useCallback(() => {
    audioCache.current.forEach(audio => {
      audio.pause();
      audio.currentTime = 0;
    });
  }, []);

  const setGlobalVolume = useCallback((volume: number) => {
    globalVolume.current = Math.min(1, Math.max(0, volume));
  }, []);

  const setEnabled = useCallback((isEnabled: boolean) => {
    enabled.current = isEnabled;
    if (!isEnabled) {
      stopAll();
    }
  }, [stopAll]);

  return {
    play,
    stop,
    stopAll,
    setGlobalVolume,
    setEnabled,
  };
};

/**
 * Preset Sound Effects
 * 定義常用音效路徑
 */
export const SOUNDS = {
  // UI Interactions
  UI: {
    BUTTON_CLICK: '/sounds/ui/button_click.mp3',
    BUTTON_HOVER: '/sounds/ui/button_hover.mp3',
    TAB_SWITCH: '/sounds/ui/tab_switch.mp3',
    CARD_FLIP: '/sounds/ui/card_flip.mp3',
    DRAWER_OPEN: '/sounds/ui/drawer_open.mp3',
  },
  
  // Feedback
  FEEDBACK: {
    CORRECT: '/sounds/feedback/correct_answer.mp3',
    WRONG: '/sounds/feedback/wrong_answer.mp3',
    PERFECT: '/sounds/feedback/perfect_score.mp3',
    TIME_WARNING: '/sounds/feedback/time_warning.mp3',
  },
  
  // Combos
  COMBO: {
    COMBO_3: '/sounds/combo/combo_3.mp3',
    COMBO_5: '/sounds/combo/combo_5.mp3',
    COMBO_7: '/sounds/combo/combo_7.mp3',
    COMBO_10: '/sounds/combo/combo_10.mp3',
  },
  
  // Achievements
  ACHIEVEMENT: {
    COMMON: '/sounds/achievements/badge_common.mp3',
    RARE: '/sounds/achievements/badge_rare.mp3',
    EPIC: '/sounds/achievements/badge_epic.mp3',
    LEGENDARY: '/sounds/achievements/badge_legendary.mp3',
    LEVEL_UP: '/sounds/achievements/level_up.mp3',
  },
  
  // Treasure
  TREASURE: {
    CLICK: '/sounds/treasure/chest_click.mp3',
    OPEN_COMMON: '/sounds/treasure/chest_open_common.mp3',
    OPEN_RARE: '/sounds/treasure/chest_open_rare.mp3',
    OPEN_LEGENDARY: '/sounds/treasure/chest_open_legendary.mp3',
  },
  
  // Background Music
  BGM: {
    MENU: '/sounds/bgm/menu_theme.mp3',
    QUEST: '/sounds/bgm/quest_theme.mp3',
    CELEBRATION: '/sounds/bgm/celebration_theme.mp3',
  },
} as const;

/**
 * Game Sound Hook
 * 預設配置的遊戲音效 Hook
 */
export const useGameSound = () => {
  const sound = useSound();

  const playCorrect = useCallback(() => {
    sound.play(SOUNDS.FEEDBACK.CORRECT, { volume: 0.7 });
  }, [sound]);

  const playWrong = useCallback(() => {
    sound.play(SOUNDS.FEEDBACK.WRONG, { volume: 0.6 });
  }, [sound]);

  const playCombo = useCallback((comboCount: number) => {
    if (comboCount >= 10) {
      sound.play(SOUNDS.COMBO.COMBO_10, { volume: 0.8 });
    } else if (comboCount >= 7) {
      sound.play(SOUNDS.COMBO.COMBO_7, { volume: 0.7 });
    } else if (comboCount >= 5) {
      sound.play(SOUNDS.COMBO.COMBO_5, { volume: 0.6 });
    } else if (comboCount >= 3) {
      sound.play(SOUNDS.COMBO.COMBO_3, { volume: 0.5 });
    }
  }, [sound]);

  const playBadgeUnlock = useCallback((rarity: 'Common' | 'Rare' | 'Epic' | 'Legendary') => {
    const soundMap = {
      Common: SOUNDS.ACHIEVEMENT.COMMON,
      Rare: SOUNDS.ACHIEVEMENT.RARE,
      Epic: SOUNDS.ACHIEVEMENT.EPIC,
      Legendary: SOUNDS.ACHIEVEMENT.LEGENDARY,
    };
    sound.play(soundMap[rarity], { volume: 0.7 });
  }, [sound]);

  const playLevelUp = useCallback(() => {
    sound.play(SOUNDS.ACHIEVEMENT.LEVEL_UP, { volume: 0.8 });
  }, [sound]);

  const playChestOpen = useCallback((rarity: 'common' | 'rare' | 'legendary') => {
    const soundMap = {
      common: SOUNDS.TREASURE.OPEN_COMMON,
      rare: SOUNDS.TREASURE.OPEN_RARE,
      legendary: SOUNDS.TREASURE.OPEN_LEGENDARY,
    };
    sound.play(soundMap[rarity], { volume: 0.7 });
  }, [sound]);

  const playButtonClick = useCallback(() => {
    sound.play(SOUNDS.UI.BUTTON_CLICK, { volume: 0.4 });
  }, [sound]);

  return {
    ...sound,
    // Preset functions
    playCorrect,
    playWrong,
    playCombo,
    playBadgeUnlock,
    playLevelUp,
    playChestOpen,
    playButtonClick,
  };
};
