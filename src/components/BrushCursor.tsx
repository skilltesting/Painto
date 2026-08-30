'use client';

import { forwardRef } from 'react';
import { Circle, Group } from 'react-konva';
import type Konva from 'konva';

export interface BrushCursorProps {
  radius: number;
  hardness: number;
  color: string;
  inverseScale: number;
  visible: boolean;
}

export const BrushCursor = forwardRef<Konva.Group, BrushCursorProps>(
  ({ radius, hardness, color, inverseScale, visible }, ref) => {
    return (
      <Group ref={ref} visible={visible} listening={false}>
        <Circle radius={radius} stroke="rgba(255,255,255,0.9)" strokeWidth={1.5 * inverseScale} />
        <Circle radius={radius} stroke="rgba(0,0,0,0.55)" strokeWidth={0.75 * inverseScale} />
        <Circle radius={Math.max(1, radius * hardness * 0.85)} fill={color} opacity={0.35} />
      </Group>
    );
  },
);

BrushCursor.displayName = 'BrushCursor';

