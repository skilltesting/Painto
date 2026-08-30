'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import {
  Droplet,
  Eraser,
  Eye,
  EyeOff,
  Hand,
  Lock,
  Paintbrush,
  PaintBucket,
  Plus,
  Redo2,
  Trash2,
  Undo2,
} from 'lucide-react';
import { Canvas, type CanvasHandle } from '@/components/Canvas';
import { SignOutButton } from '@/components/AuthButton';
import { useAutosave } from '@/hooks/useAutosave';
import type { BlendMode, BrushSettings, HistorySnapshot, LayerState, ToolType } from '@/lib/types';

const DOC_WIDTH = 1748;
const DOC_HEIGHT = 2480;

const BLEND_MODES: BlendMode[] = [
  'normal',
  'multiply',
  'screen',
  'overlay',
  'darken',
  'lighten',
  'color-dodge',
  'color-burn',
  'hard-light',
  'soft-light',
  'difference',
  'exclusion',
];

const TOOLS: { tool: ToolType; label: string; Icon: typeof Paintbrush }[] = [
  { tool: 'brush', label: 'Brush', Icon: Paintbrush },
  { tool: 'eraser', label: 'Eraser', Icon: Eraser },
  { tool: 'blur', label: 'Blur', Icon: Droplet },
  { tool: 'fill', label: 'Fill', Icon: PaintBucket },
  { tool: 'hand', label: 'Pan', Icon: Hand },
];

let layerCounter = 0;
function createLayer(name: string): LayerState {
  layerCounter += 1;
  const canvas = document.createElement('canvas');
  canvas.width = DOC_WIDTH;
  canvas.height = DOC_HEIGHT;
  return {
    id: `layer-${Date.now()}-${layerCounter}`,
    name,
    canvas,
    visible: true,
    opacity: 1,
    blendMode: 'normal',
    locked: false,
  };
}

function snapshotOf(layers: LayerState[]): HistorySnapshot {
  return { layers: layers.map((l) => ({ id: l.id, dataUrl: l.canvas.toDataURL('image/png') })) };
}

function restoreSnapshot(layers: LayerState[], snapshot: HistorySnapshot, onDone: () => void) {
  const targets = snapshot.layers
    .map((snap) => ({ snap, layer: layers.find((l) => l.id === snap.id) }))
    .filter((entry): entry is { snap: (typeof snapshot.layers)[number]; layer: LayerState } => !!entry.layer);

  let remaining = targets.length;
  if (remaining === 0) {
    onDone();
    return;
  }

  targets.forEach(({ snap, layer }) => {
    const img = new Image();
    img.onload = () => {
      const ctx = layer.canvas.getContext('2d');
      if (ctx) {
        ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
        ctx.drawImage(img, 0, 0);
      }
      remaining -= 1;
      if (remaining === 0) onDone();
    };
    img.src = snap.dataUrl;
  });
}

export default function DrawEditor() {
  const [projectId] = useState(() => (typeof crypto !== 'undefined' ? crypto.randomUUID() : `local-${Date.now()}`));
  const [title, setTitle] = useState('Untitled');
  const [layers, setLayers] = useState<LayerState[]>(() => [createLayer('Layer 1')]);
  const [activeLayerId, setActiveLayerId] = useState<string>(() => layers[0]!.id);
  const [brush, setBrush] = useState<BrushSettings>({
    tool: 'brush',
    color: '#1c1c1e',
    size: 28,
    opacity: 1,
    hardness: 0.85,
    smoothing: 0.35,
  });
  const [zoom, setZoom] = useState(100);
  const [undoStack, setUndoStack] = useState<HistorySnapshot[]>([]);
  const [redoStack, setRedoStack] = useState<HistorySnapshot[]>([]);

  const layersRef = useRef(layers);
  layersRef.current = layers;
  const canvasRef = useRef<CanvasHandle>(null);

  const activeLayer = useMemo(() => layers.find((l) => l.id === activeLayerId), [layers, activeLayerId]);

  useAutosave(projectId, layers, title, DOC_WIDTH, DOC_HEIGHT);

  const redrawStage = useCallback(() => {
    canvasRef.current?.getStage()?.batchDraw();
  }, []);

  const beginStroke = useCallback((): HistorySnapshot => snapshotOf(layersRef.current), []);

  const commitStroke = useCallback((before: HistorySnapshot) => {
    setUndoStack((stack) => [...stack, before]);
    setRedoStack([]);
  }, []);

  const undo = useCallback(() => {
    setUndoStack((stack) => {
      if (stack.length === 0) return stack;
      const previous = stack[stack.length - 1]!;
      const current = snapshotOf(layersRef.current);
      setRedoStack((r) => [...r, current]);
      restoreSnapshot(layersRef.current, previous, redrawStage);
      return stack.slice(0, -1);
    });
  }, [redrawStage]);

  const redo = useCallback(() => {
    setRedoStack((stack) => {
      if (stack.length === 0) return stack;
      const next = stack[stack.length - 1]!;
      const current = snapshotOf(layersRef.current);
      setUndoStack((u) => [...u, current]);
      restoreSnapshot(layersRef.current, next, redrawStage);
      return stack.slice(0, -1);
    });
  }, [redrawStage]);

  const addLayer = useCallback(() => {
    setLayers((prev) => {
      const layer = createLayer(`Layer ${prev.length + 1}`);
      setActiveLayerId(layer.id);
      return [...prev, layer];
    });
  }, []);

  const deleteLayer = useCallback(
    (id: string) => {
      setLayers((prev) => {
        if (prev.length <= 1) return prev;
        const next = prev.filter((l) => l.id !== id);
        if (activeLayerId === id) setActiveLayerId(next[next.length - 1]!.id);
        return next;
      });
    },
    [activeLayerId],
  );

  const updateLayer = useCallback((id: string, patch: Partial<LayerState>) => {
    setLayers((prev) => prev.map((l) => (l.id === id ? { ...l, ...patch } : l)));
  }, []);

  const moveLayer = useCallback((id: string, direction: -1 | 1) => {
    setLayers((prev) => {
      const index = prev.findIndex((l) => l.id === id);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= prev.length) return prev;
      const next = [...prev];
      [next[index], next[target]] = [next[target]!, next[index]!];
      return next;
    });
  }, []);

  return (
    <div className="flex h-screen flex-col bg-slate-950 text-slate-100">
      <header className="flex items-center gap-3 border-b border-slate-800 bg-slate-900 px-4 py-2">
        <input
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="rounded-md bg-slate-800 px-2 py-1 text-sm font-medium text-slate-100 outline-none focus:ring-1 focus:ring-emerald-500"
        />
        <div className="flex items-center gap-1">
          <button
            onClick={undo}
            disabled={undoStack.length === 0}
            className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30"
            title="Undo"
          >
            <Undo2 className="h-4 w-4" />
          </button>
          <button
            onClick={redo}
            disabled={redoStack.length === 0}
            className="rounded-md p-1.5 text-slate-300 hover:bg-slate-800 disabled:opacity-30"
            title="Redo"
          >
            <Redo2 className="h-4 w-4" />
          </button>
        </div>
        <span className="text-xs text-slate-500">{zoom}%</span>
        <div className="ml-auto">
          <SignOutButton />
        </div>
      </header>

      <div className="flex flex-1 overflow-hidden">
        <aside className="flex w-56 flex-col gap-4 overflow-y-auto border-r border-slate-800 bg-slate-900 p-3">
          <div className="grid grid-cols-5 gap-1">
            {TOOLS.map(({ tool, label, Icon }) => (
              <button
                key={tool}
                title={label}
                onClick={() => setBrush((b) => ({ ...b, tool }))}
                className={`flex items-center justify-center rounded-md p-2 transition ${
                  brush.tool === tool ? 'bg-emerald-500 text-slate-950' : 'text-slate-300 hover:bg-slate-800'
                }`}
              >
                <Icon className="h-4 w-4" />
              </button>
            ))}
          </div>

          <label className="flex items-center justify-between text-xs text-slate-400">
            Color
            <input
              type="color"
              value={brush.color}
              onChange={(e) => setBrush((b) => ({ ...b, color: e.target.value }))}
              className="h-7 w-12 cursor-pointer rounded border border-slate-700 bg-slate-800"
            />
          </label>

          <SliderField
            label="Size"
            value={brush.size}
            min={1}
            max={200}
            onChange={(v) => setBrush((b) => ({ ...b, size: v }))}
          />
          <SliderField
            label="Opacity"
            value={brush.opacity}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setBrush((b) => ({ ...b, opacity: v }))}
          />
          <SliderField
            label="Hardness"
            value={brush.hardness}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setBrush((b) => ({ ...b, hardness: v }))}
          />
          <SliderField
            label="Smoothing"
            value={brush.smoothing}
            min={0}
            max={1}
            step={0.01}
            onChange={(v) => setBrush((b) => ({ ...b, smoothing: v }))}
          />
        </aside>

        <main className="relative flex-1">
          <Canvas
            ref={canvasRef}
            documentWidth={DOC_WIDTH}
            documentHeight={DOC_HEIGHT}
            layers={layers}
            activeLayer={activeLayer}
            brush={brush}
            beginStroke={beginStroke}
            commitStroke={commitStroke}
            onZoomChange={setZoom}
          />
        </main>

        <aside className="flex w-64 flex-col gap-2 overflow-y-auto border-l border-slate-800 bg-slate-900 p-3">
          <div className="flex items-center justify-between">
            <span className="text-xs font-medium uppercase tracking-wide text-slate-500">Layers</span>
            <button onClick={addLayer} className="rounded-md p-1 text-slate-300 hover:bg-slate-800" title="Add layer">
              <Plus className="h-4 w-4" />
            </button>
          </div>

          <div className="flex flex-col gap-1">
            {[...layers].reverse().map((layer) => (
              <div
                key={layer.id}
                onClick={() => setActiveLayerId(layer.id)}
                className={`flex flex-col gap-1 rounded-md border p-2 text-xs transition cursor-pointer ${
                  layer.id === activeLayerId
                    ? 'border-emerald-500 bg-emerald-500/10'
                    : 'border-slate-800 bg-slate-800/40 hover:border-slate-700'
                }`}
              >
                <div className="flex items-center gap-2">
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateLayer(layer.id, { visible: !layer.visible });
                    }}
                    className="text-slate-400 hover:text-slate-200"
                  >
                    {layer.visible ? <Eye className="h-3.5 w-3.5" /> : <EyeOff className="h-3.5 w-3.5" />}
                  </button>
                  <span className="flex-1 truncate">{layer.name}</span>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      updateLayer(layer.id, { locked: !layer.locked });
                    }}
                    className={`hover:text-slate-200 ${layer.locked ? 'text-emerald-400' : 'text-slate-500'}`}
                  >
                    <Lock className="h-3.5 w-3.5" />
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      moveLayer(layer.id, 1);
                    }}
                    className="text-slate-500 hover:text-slate-200"
                  >
                    ↑
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      moveLayer(layer.id, -1);
                    }}
                    className="text-slate-500 hover:text-slate-200"
                  >
                    ↓
                  </button>
                  <button
                    onClick={(e) => {
                      e.stopPropagation();
                      deleteLayer(layer.id);
                    }}
                    disabled={layers.length <= 1}
                    className="text-slate-500 hover:text-red-400 disabled:opacity-30"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </div>

                <select
                  value={layer.blendMode}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateLayer(layer.id, { blendMode: e.target.value as BlendMode })}
                  className="rounded bg-slate-900 px-1 py-0.5 text-[11px] text-slate-300"
                >
                  {BLEND_MODES.map((mode) => (
                    <option key={mode} value={mode}>
                      {mode}
                    </option>
                  ))}
                </select>

                <input
                  type="range"
                  min={0}
                  max={1}
                  step={0.01}
                  value={layer.opacity}
                  onClick={(e) => e.stopPropagation()}
                  onChange={(e) => updateLayer(layer.id, { opacity: Number(e.target.value) })}
                  className="w-full"
                />
              </div>
            ))}
          </div>
        </aside>
      </div>
    </div>
  );
}

function SliderField({
  label,
  value,
  min,
  max,
  step = 1,
  onChange,
}: {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs text-slate-400">
      <span className="flex justify-between">
        <span>{label}</span>
        <span className="text-slate-500">{value}</span>
      </span>
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
      />
    </label>
  );
}
