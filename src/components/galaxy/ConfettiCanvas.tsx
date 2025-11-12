import { useEffect, useRef, forwardRef, useImperativeHandle } from 'react';
import { ParticleSystem, ParticleEffect } from '@/lib/particles';

export interface ConfettiCanvasHandle {
  celebrate: (effect: ParticleEffect, x?: number, y?: number) => void;
  clear: () => void;
}

export const ConfettiCanvas = forwardRef<ConfettiCanvasHandle>((_, ref) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const particleSystemRef = useRef<ParticleSystem | null>(null);

  useEffect(() => {
    if (!canvasRef.current) return;

    particleSystemRef.current = new ParticleSystem(canvasRef.current);

    return () => {
      if (particleSystemRef.current) {
        particleSystemRef.current.destroy();
      }
    };
  }, []);

  useImperativeHandle(ref, () => ({
    celebrate: (effect: ParticleEffect, x?: number, y?: number) => {
      if (particleSystemRef.current) {
        particleSystemRef.current.createEffect(effect, x, y);
      }
    },
    clear: () => {
      if (particleSystemRef.current) {
        particleSystemRef.current.clear();
      }
    }
  }));

  return (
    <canvas
      ref={canvasRef}
      className="fixed inset-0 pointer-events-none z-[100]"
      style={{ width: '100%', height: '100%' }}
    />
  );
});

ConfettiCanvas.displayName = 'ConfettiCanvas';
