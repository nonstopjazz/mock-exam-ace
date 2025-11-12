import { useRef, useCallback } from 'react';
import { ConfettiCanvasHandle } from '@/components/ConfettiCanvas';
import { ParticleEffect } from '@/lib/particles';

export const useConfetti = () => {
  const confettiRef = useRef<ConfettiCanvasHandle>(null);

  const celebrate = useCallback((effect: ParticleEffect, x?: number, y?: number) => {
    if (confettiRef.current) {
      confettiRef.current.celebrate(effect, x, y);
    }
  }, []);

  const clear = useCallback(() => {
    if (confettiRef.current) {
      confettiRef.current.clear();
    }
  }, []);

  // Preset celebrations
  const perfectScore = useCallback(() => {
    celebrate('confetti');
    setTimeout(() => celebrate('stars'), 200);
  }, [celebrate]);

  const chestOpening = useCallback((rarity: 'common' | 'rare' | 'legendary') => {
    if (rarity === 'legendary') {
      celebrate('explosion');
      setTimeout(() => celebrate('gems'), 300);
      setTimeout(() => celebrate('sparkles'), 600);
    } else if (rarity === 'rare') {
      celebrate('gems');
      setTimeout(() => celebrate('sparkles'), 200);
    } else {
      celebrate('sparkles');
    }
  }, [celebrate]);

  const levelUp = useCallback(() => {
    celebrate('stars');
    setTimeout(() => celebrate('confetti'), 150);
  }, [celebrate]);

  const badgeUnlock = useCallback((rarity: 'common' | 'rare' | 'epic' | 'legendary') => {
    if (rarity === 'legendary' || rarity === 'epic') {
      celebrate('explosion');
    } else if (rarity === 'rare') {
      celebrate('stars');
    } else {
      celebrate('sparkles');
    }
  }, [celebrate]);

  const comboAchievement = useCallback((combo: number) => {
    if (combo >= 7) {
      celebrate('explosion');
    } else if (combo >= 5) {
      celebrate('gems');
    } else if (combo >= 3) {
      celebrate('sparkles');
    }
  }, [celebrate]);

  return {
    confettiRef,
    celebrate,
    clear,
    // Preset celebrations
    perfectScore,
    chestOpening,
    levelUp,
    badgeUnlock,
    comboAchievement,
  };
};
