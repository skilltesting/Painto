import { type BrushSettings } from './types';

export interface StrokePoint {
  x: number;
  y: number;
  pressure: number;
}

export class StrokeStabilizer {
  private smoothing: number;
  private current: StrokePoint | null = null;

  constructor(smoothing: number) {
    this.smoothing = Math.max(0, Math.min(1, smoothing));
  }

  reset(start: StrokePoint): StrokePoint {
    this.current = { ...start };
    return this.current;
  }

  next(target: StrokePoint): StrokePoint {
    if (!this.current) {
      this.current = { ...target };
      return this.current;
    }
    const factor = 1 - this.smoothing * 0.85;
    this.current = {
      x: this.current.x + (target.x - this.current.x) * factor,
      y: this.current.y + (target.y - this.current.y) * factor,
      pressure: this.current.pressure + (target.pressure - this.current.pressure) * factor,
    };
    return this.current;
  }
}

export function radiusForPressure(brush: BrushSettings, baseRadius: number, pressure: number): number {
  return Math.max(0.5, baseRadius * (0.3 + 0.7 * pressure));
}

export function createStrokeBuffer(width: number, height: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  return canvas;
}

export function paintStrokeDot(
  ctx: CanvasRenderingContext2D,
  point: StrokePoint,
  brush: BrushSettings,
  baseRadius: number,
) {
  const r = radiusForPressure(brush, baseRadius, point.pressure);
  ctx.save();
  ctx.fillStyle = brush.color;
  ctx.beginPath();
  ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
  ctx.fill();
  ctx.restore();
}

export function paintStrokeSegment(
  ctx: CanvasRenderingContext2D,
  from: StrokePoint,
  to: StrokePoint,
  brush: BrushSettings,
  baseRadius: number,
) {
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const rTo = radiusForPressure(brush, baseRadius, to.pressure);
  const spacing = Math.max(rTo * 0.25, 1);
  const steps = Math.max(1, Math.ceil(dist / spacing));

  ctx.save();
  ctx.fillStyle = brush.color;
  for (let i = 1; i <= steps; i++) {
    const t = i / steps;
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    const p = from.pressure + (to.pressure - from.pressure) * t;
    const r = radiusForPressure(brush, baseRadius, p);

    ctx.beginPath();
    ctx.arc(x, y, r, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}

export function applyBlurDab(
  canvas: HTMLCanvasElement,
  x: number,
  y: number,
  radius: number,
  strength: number,
) {
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  const diameter = Math.ceil(radius * 2);
  const startX = Math.max(0, Math.floor(x - radius));
  const startY = Math.max(0, Math.floor(y - radius));
  const endX = Math.min(canvas.width, Math.ceil(x + radius));
  const endY = Math.min(canvas.height, Math.ceil(y + radius));
  const width = endX - startX;
  const height = endY - startY;

  if (width <= 0 || height <= 0) return;

  const imageData = ctx.getImageData(startX, startY, width, height);
  const data = imageData.data;
  const temp = new Uint8ClampedArray(data);

  const blurRadius = Math.max(1, Math.floor(radius * 0.4 * strength));

  // Simple box blur pass over the local dab region
  for (let px = 0; px < width; px++) {
    for (let py = 0; py < height; py++) {
      const dx = startX + px - x;
      const dy = startY + py - y;
      if (dx * dx + dy * dy > radius * radius) continue;

      let r = 0, g = 0, b = 0, a = 0, count = 0;
      for (let kx = -blurRadius; kx <= blurRadius; kx++) {
        const nx = px + kx;
        if (nx >= 0 && nx < width) {
          const idx = (py * width + nx) * 4;
          r += temp[idx]!;
          g += temp[idx + 1]!;
          b += temp[idx + 2]!;
          a += temp[idx + 3]!;
          count++;
        }
      }

      const outIdx = (py * width + px) * 4;
      data[outIdx] = r / count;
      data[outIdx + 1] = g / count;
      data[outIdx + 2] = b / count;
      data[outIdx + 3] = a / count;
    }
  }

  ctx.putImageData(imageData, startX, startY);
}

export function commitStrokeToLayer(
  targetCtx: CanvasRenderingContext2D,
  bufferCanvas: HTMLCanvasElement,
  brush: BrushSettings,
) {
  targetCtx.save();
  targetCtx.globalAlpha = brush.opacity;
  targetCtx.drawImage(bufferCanvas, 0, 0);
  targetCtx.restore();
}

