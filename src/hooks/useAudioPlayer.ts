import { useState, useRef, useCallback } from 'react';

/**
 * Hook for playing audio from URLs (word pronunciation & example sentences)
 */
export function useAudioPlayer() {
  const [playing, setPlaying] = useState<string | null>(null);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const play = useCallback((url: string | null | undefined) => {
    if (!url) return;

    // Stop any currently playing audio
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }

    const audio = new Audio(url);
    audioRef.current = audio;
    setPlaying(url);

    audio.addEventListener('ended', () => {
      setPlaying(null);
      audioRef.current = null;
    });

    audio.addEventListener('error', () => {
      setPlaying(null);
      audioRef.current = null;
    });

    audio.play().catch(() => {
      setPlaying(null);
      audioRef.current = null;
    });
  }, []);

  const stop = useCallback(() => {
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    setPlaying(null);
  }, []);

  const isPlaying = useCallback((url: string | null | undefined) => {
    return !!url && playing === url;
  }, [playing]);

  return { play, stop, isPlaying };
}
