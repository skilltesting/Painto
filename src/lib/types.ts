export type ToolType = 'brush' | 'eraser' | 'blur' | 'fill' | 'hand';

export type BlendMode =
  | 'normal'
  | 'multiply'
  | 'screen'
  | 'overlay'
  | 'darken'
  | 'lighten'
  | 'color-dodge'
  | 'color-burn'
  | 'hard-light'
  | 'soft-light'
  | 'difference'
  | 'exclusion';

export const BLEND_MODE_TO_COMPOSITE: Record<BlendMode, GlobalCompositeOperation> = {
  normal: 'source-over',
  multiply: 'multiply',
  screen: 'screen',
  overlay: 'overlay',
  darken: 'darken',
  lighten: 'lighten',
  'color-dodge': 'color-dodge',
  'color-burn': 'color-burn',
  'hard-light': 'hard-light',
  'soft-light': 'soft-light',
  difference: 'difference',
  exclusion: 'exclusion',
};

export interface BrushSettings {
  tool: ToolType;
  color: string;
  size: number;
  opacity: number;
  hardness: number;
  smoothing: number;
}

export interface LayerState {
  id: string;
  name: string;
  canvas: HTMLCanvasElement;
  visible: boolean;
  opacity: number;
  blendMode: BlendMode;
  locked: boolean;
}

export interface LayerSnapshot {
  id: string;
  dataUrl: string;
}

export interface HistorySnapshot {
  layers: LayerSnapshot[];
}

export interface ProjectMetadata {
  id: string;
  user_id: string;
  title: string;
  canvas_width: number;
  canvas_height: number;
  layers: {
    id: string;
    name: string;
    order: number;
    opacity: number;
    blendMode: BlendMode;
    visible: boolean;
    locked: boolean;
    storagePath?: string;
  }[];
  thumbnail_path?: string;
  created_at: string;
  updated_at: string;
}

