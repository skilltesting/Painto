export interface FloodFillOptions {
  x: number;
  y: number;
  color: string;
  opacity: number;
  tolerance: number;
}

function hexToRgba(hex: string, opacity: number): [number, number, number, number] {
  let c = hex.replace('#', '');
  if (c.length === 3) {
    c = c.split('').map((char) => char + char).join('');
  }
  const num = parseInt(c, 16);
  return [(num >> 16) & 255, (num >> 8) & 255, num & 255, Math.round(opacity * 255)];
}

function colorMatch(
  data: Uint8ClampedArray,
  idx: number,
  targetColor: [number, number, number, number],
  tolerance: number,
): boolean {
  const dr = Math.abs(data[idx]! - targetColor[0]);
  const dg = Math.abs(data[idx + 1]! - targetColor[1]);
  const db = Math.abs(data[idx + 2]! - targetColor[2]);
  const da = Math.abs(data[idx + 3]! - targetColor[3]);

  return dr <= tolerance && dg <= tolerance && db <= tolerance && da <= tolerance;
}

export function floodFill(ctx: CanvasRenderingContext2D, options: FloodFillOptions) {
  const { x, y, color, opacity, tolerance } = options;
  const width = ctx.canvas.width;
  const height = ctx.canvas.height;

  if (x < 0 || x >= width || y < 0 || y >= height) return;

  const imageData = ctx.getImageData(0, 0, width, height);
  const data = imageData.data;

  const startIdx = (y * width + x) * 4;
  const targetColor: [number, number, number, number] = [
    data[startIdx]!,
    data[startIdx + 1]!,
    data[startIdx + 2]!,
    data[startIdx + 3]!,
  ];

  const fillColor = hexToRgba(color, opacity);

  if (
    targetColor[0] === fillColor[0] &&
    targetColor[1] === fillColor[1] &&
    targetColor[2] === fillColor[2] &&
    targetColor[3] === fillColor[3]
  ) {
    return;
  }

  const stack: [number, number][] = [[x, y]];
  const visited = new Uint8Array(width * height);

  while (stack.length > 0) {
    const [cx, cy] = stack.pop()!;
    let currentY = cy;

    while (currentY >= 0) {
      const idx = (currentY * width + cx) * 4;
      if (!colorMatch(data, idx, targetColor, tolerance) || visited[currentY * width + cx]) break;
      currentY--;
    }
    currentY++;

    let reachLeft = false;
    let reachRight = false;

    while (currentY < height) {
      const idx = (currentY * width + cx) * 4;
      if (!colorMatch(data, idx, targetColor, tolerance) || visited[currentY * width + cx]) break;

      visited[currentY * width + cx] = 1;
      data[idx] = fillColor[0];
      data[idx + 1] = fillColor[1];
      data[idx + 2] = fillColor[2];
      data[idx + 3] = fillColor[3];

      if (cx > 0) {
        const leftIdx = (currentY * width + (cx - 1)) * 4;
        if (colorMatch(data, leftIdx, targetColor, tolerance) && !visited[currentY * width + (cx - 1)]) {
          if (!reachLeft) {
            stack.push([cx - 1, currentY]);
            reachLeft = true;
          }
        } else {
          reachLeft = false;
        }
      }

      if (cx < width - 1) {
        const rightIdx = (currentY * width + (cx + 1)) * 4;
        if (colorMatch(data, rightIdx, targetColor, tolerance) && !visited[currentY * width + (cx + 1)]) {
          if (!reachRight) {
            stack.push([cx + 1, currentY]);
            reachRight = true;
          }
        } else {
          reachRight = false;
        }
      }

      currentY++;
    }
  }

  ctx.putImageData(imageData, 0, 0);
}

