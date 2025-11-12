// Particle system for celebration effects

export interface Particle {
  x: number;
  y: number;
  vx: number;
  vy: number;
  rotation: number;
  rotationSpeed: number;
  size: number;
  color: string;
  alpha: number;
  gravity: number;
  friction: number;
  shape: 'confetti' | 'circle' | 'star' | 'gem' | 'heart';
}

export type ParticleEffect = 'confetti' | 'stars' | 'gems' | 'hearts' | 'sparkles' | 'explosion';

const colors = {
  confetti: ['#f59e0b', '#ea580c', '#0d9488', '#10b981', '#3b82f6', '#8b5cf6', '#ec4899'],
  treasure: ['#f59e0b', '#fbbf24', '#fcd34d', '#fde68a'],
  legendary: ['#f59e0b', '#ea580c', '#ef4444', '#ec4899', '#a855f7'],
  success: ['#10b981', '#34d399', '#6ee7b7'],
  love: ['#ec4899', '#f472b6', '#f9a8d4', '#fbcfe8']
};

export class ParticleSystem {
  private canvas: HTMLCanvasElement;
  private ctx: CanvasRenderingContext2D;
  private particles: Particle[] = [];
  private animationFrame: number | null = null;

  constructor(canvas: HTMLCanvasElement) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d')!;
    this.resize();
    window.addEventListener('resize', () => this.resize());
  }

  private resize() {
    this.canvas.width = window.innerWidth;
    this.canvas.height = window.innerHeight;
  }

  public createEffect(effect: ParticleEffect, x?: number, y?: number) {
    const centerX = x ?? this.canvas.width / 2;
    const centerY = y ?? this.canvas.height / 2;

    switch (effect) {
      case 'confetti':
        this.createConfetti(centerX, centerY);
        break;
      case 'stars':
        this.createStars(centerX, centerY);
        break;
      case 'gems':
        this.createGems(centerX, centerY);
        break;
      case 'hearts':
        this.createHearts(centerX, centerY);
        break;
      case 'sparkles':
        this.createSparkles(centerX, centerY);
        break;
      case 'explosion':
        this.createExplosion(centerX, centerY);
        break;
    }

    if (!this.animationFrame) {
      this.animate();
    }
  }

  private createConfetti(x: number, y: number) {
    const count = 150;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const velocity = 3 + Math.random() * 8;
      
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 5,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 20,
        size: 8 + Math.random() * 8,
        color: colors.confetti[Math.floor(Math.random() * colors.confetti.length)],
        alpha: 1,
        gravity: 0.3 + Math.random() * 0.2,
        friction: 0.99,
        shape: 'confetti'
      });
    }
  }

  private createStars(x: number, y: number) {
    const count = 50;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const velocity = 2 + Math.random() * 5;
      
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        rotation: 0,
        rotationSpeed: (Math.random() - 0.5) * 10,
        size: 12 + Math.random() * 12,
        color: colors.treasure[Math.floor(Math.random() * colors.treasure.length)],
        alpha: 1,
        gravity: 0.1,
        friction: 0.98,
        shape: 'star'
      });
    }
  }

  private createGems(x: number, y: number) {
    const count = 40;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const velocity = 3 + Math.random() * 6;
      
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 3,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 15,
        size: 10 + Math.random() * 10,
        color: colors.legendary[Math.floor(Math.random() * colors.legendary.length)],
        alpha: 1,
        gravity: 0.4,
        friction: 0.97,
        shape: 'gem'
      });
    }
  }

  private createHearts(x: number, y: number) {
    const count = 30;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const velocity = 1 + Math.random() * 4;
      
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity - 4,
        rotation: 0,
        rotationSpeed: 0,
        size: 15 + Math.random() * 10,
        color: colors.love[Math.floor(Math.random() * colors.love.length)],
        alpha: 1,
        gravity: 0.05,
        friction: 0.99,
        shape: 'heart'
      });
    }
  }

  private createSparkles(x: number, y: number) {
    const count = 80;
    for (let i = 0; i < count; i++) {
      const angle = Math.random() * Math.PI * 2;
      const velocity = 1 + Math.random() * 6;
      
      this.particles.push({
        x: x + (Math.random() - 0.5) * 100,
        y: y + (Math.random() - 0.5) * 100,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        rotation: 0,
        rotationSpeed: 0,
        size: 3 + Math.random() * 5,
        color: colors.treasure[Math.floor(Math.random() * colors.treasure.length)],
        alpha: 1,
        gravity: 0.05,
        friction: 0.95,
        shape: 'circle'
      });
    }
  }

  private createExplosion(x: number, y: number) {
    const count = 100;
    for (let i = 0; i < count; i++) {
      const angle = (Math.PI * 2 * i) / count;
      const velocity = 5 + Math.random() * 10;
      
      this.particles.push({
        x,
        y,
        vx: Math.cos(angle) * velocity,
        vy: Math.sin(angle) * velocity,
        rotation: Math.random() * 360,
        rotationSpeed: (Math.random() - 0.5) * 30,
        size: 5 + Math.random() * 10,
        color: colors.legendary[Math.floor(Math.random() * colors.legendary.length)],
        alpha: 1,
        gravity: 0.2,
        friction: 0.96,
        shape: Math.random() > 0.5 ? 'circle' : 'confetti'
      });
    }
  }

  private animate() {
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];

      // Update physics
      p.vy += p.gravity;
      p.vx *= p.friction;
      p.vy *= p.friction;
      p.x += p.vx;
      p.y += p.vy;
      p.rotation += p.rotationSpeed;
      p.alpha -= 0.01;

      // Remove dead particles
      if (p.alpha <= 0 || p.y > this.canvas.height + 50) {
        this.particles.splice(i, 1);
        continue;
      }

      // Draw particle
      this.ctx.save();
      this.ctx.translate(p.x, p.y);
      this.ctx.rotate((p.rotation * Math.PI) / 180);
      this.ctx.globalAlpha = p.alpha;

      this.drawShape(p);

      this.ctx.restore();
    }

    if (this.particles.length > 0) {
      this.animationFrame = requestAnimationFrame(() => this.animate());
    } else {
      this.animationFrame = null;
    }
  }

  private drawShape(p: Particle) {
    this.ctx.fillStyle = p.color;

    switch (p.shape) {
      case 'confetti':
        this.ctx.fillRect(-p.size / 2, -p.size / 4, p.size, p.size / 2);
        break;

      case 'circle':
        this.ctx.beginPath();
        this.ctx.arc(0, 0, p.size / 2, 0, Math.PI * 2);
        this.ctx.fill();
        break;

      case 'star':
        this.drawStar(p.size);
        break;

      case 'gem':
        this.drawGem(p.size);
        break;

      case 'heart':
        this.drawHeart(p.size);
        break;
    }
  }

  private drawStar(size: number) {
    const spikes = 5;
    const outerRadius = size / 2;
    const innerRadius = size / 4;

    this.ctx.beginPath();
    for (let i = 0; i < spikes * 2; i++) {
      const radius = i % 2 === 0 ? outerRadius : innerRadius;
      const angle = (Math.PI * i) / spikes;
      const x = Math.cos(angle) * radius;
      const y = Math.sin(angle) * radius;
      
      if (i === 0) {
        this.ctx.moveTo(x, y);
      } else {
        this.ctx.lineTo(x, y);
      }
    }
    this.ctx.closePath();
    this.ctx.fill();
  }

  private drawGem(size: number) {
    const halfSize = size / 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, -halfSize);
    this.ctx.lineTo(halfSize, 0);
    this.ctx.lineTo(0, halfSize);
    this.ctx.lineTo(-halfSize, 0);
    this.ctx.closePath();
    this.ctx.fill();
  }

  private drawHeart(size: number) {
    const halfSize = size / 2;
    this.ctx.beginPath();
    this.ctx.moveTo(0, halfSize / 2);
    this.ctx.bezierCurveTo(-halfSize, -halfSize / 2, -halfSize, -halfSize, 0, 0);
    this.ctx.bezierCurveTo(halfSize, -halfSize, halfSize, -halfSize / 2, 0, halfSize / 2);
    this.ctx.closePath();
    this.ctx.fill();
  }

  public clear() {
    this.particles = [];
    if (this.animationFrame) {
      cancelAnimationFrame(this.animationFrame);
      this.animationFrame = null;
    }
    this.ctx.clearRect(0, 0, this.canvas.width, this.canvas.height);
  }

  public destroy() {
    this.clear();
    window.removeEventListener('resize', () => this.resize());
  }
}
