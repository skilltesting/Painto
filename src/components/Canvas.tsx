'use client';

import { forwardRef, useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Stage, Layer, Image as KonvaImage, Rect } from 'react-konva';
import type Konva from 'konva';
import type { KonvaEventObject } from 'konva/lib/Node';
import {
  StrokeStabilizer,
  applyBlurDab,
  commitStrokeToLayer,
  createStrokeBuffer,
  paintStrokeDot,
  paintStrokeSegment,
  radiusForPressure,
  type StrokePoint,
} from '@/lib/brush-engine';
import { floodFill } from '@/lib/flood-fill';
import { BLEND_MODE_TO_COMPOSITE, type BrushSettings, type HistorySnapshot, type LayerState } from '@/lib/types';
import { BrushCursor } from './BrushCursor';

const MIN_ZOOM = 0.05;
const MAX_ZOOM = 16;
const FILL_TOLERANCE = 32;

function clamp(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

function baseRadius(brush: BrushSettings): number {
  return Math.max(0.5, brush.size / 2);
}

function pressureFromEvent(evt: PointerEvent): number {
  if (evt.pointerType === 'pen') return evt.pressure > 0 ? evt.pressure : 0.5;
  if (evt.pointerType === 'touch') return 1;
  return 0.5;
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

function midpoint(a: { x: number; y: number }, b: { x: number; y: number }): { x: number; y: number } {
  return { x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 };
}

export interface CanvasProps {
  documentWidth: number;
  documentHeight: number;
  layers: LayerState[];
  activeLayer: LayerState | undefined;
  brush: BrushSettings;
  beginStroke: () => HistorySnapshot;
  commitStroke: (before: HistorySnapshot) => void;
  onZoomChange?: (percent: number) => void;
}

export interface CanvasHandle {
  zoomIn: () => void;
  zoomOut: () => void;
  fitToScreen: () => void;
  getStage: () => Konva.Stage | null;
}

export const Canvas = forwardRef<CanvasHandle, CanvasProps>(function Canvas(
  { documentWidth, documentHeight, layers, activeLayer, brush, beginStroke, commitStroke, onZoomChange },
  forwardedRef,
) {
  const containerRef = useRef<HTMLDivElement>(null);
  const stageRef = useRef<Konva.Stage>(null);
  const mainLayerRef = useRef<Konva.Layer>(null);
  const overlayLayerRef = useRef<Konva.Layer>(null);
  const cursorRef = useRef<Konva.Group>(null);

  const [stageSize, setStageSize] = useState({ width: 0, height: 0 });
  const [previewCanvas, setPreviewCanvas] = useState<HTMLCanvasElement | null>(null);
  const [cursorVisible, setCursorVisible] = useState(false);
  const [inverseScale, setInverseScale] = useState(1);

  const brushRef = useRef(brush);
  const activeLayerRef = useRef(activeLayer);
  useEffect(() => {
    brushRef.current = brush;
  }, [brush]);
  useEffect(() => {
    activeLayerRef.current = activeLayer;
  }, [activeLayer]);

  const isDrawingRef = useRef(false);
  const stabilizerRef = useRef<StrokeStabilizer | null>(null);
  const lastPointRef = useRef<StrokePoint | null>(null);
  const strokeBufferRef = useRef<HTMLCanvasElement | null>(null);
  const beforeSnapshotRef = useRef<HistorySnapshot | null>(null);
  const preStrokeDataUrlRef = useRef<string | null>(null);
  const rafPendingRef = useRef(false);

  const activePointersRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const pinchLastDistRef = useRef(0);
  const pinchLastCenterRef = useRef<{ x: number; y: number } | null>(null);
  const didInitialFitRef = useRef(false);

  const requestRedraw = useCallback(() => {
    if (rafPendingRef.current) return;
    rafPendingRef.current = true;
    requestAnimationFrame(() => {
      rafPendingRef.current = false;
      mainLayerRef.current?.batchDraw();
      overlayLayerRef.current?.batchDraw();
    });
  }, []);

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      setStageSize({ width: entry.contentRect.width, height: entry.contentRect.height });
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const fitToScreen = useCallback(() => {
    const stage = stageRef.current;
    if (!stage || stageSize.width < 10 || stageSize.height < 10) return;
    const padding = 48;
    const scale = clamp(
      Math.min(
        (stageSize.width - padding * 2) / documentWidth,
        (stageSize.height - padding * 2) / documentHeight,
        1,
      ),
      MIN_ZOOM,
      MAX_ZOOM,
    );
    stage.scale({ x: scale, y: scale });
    stage.position({
      x: (stageSize.width - documentWidth * scale) / 2,
      y: (stageSize.height - documentHeight * scale) / 2,
    });
    stage.batchDraw();
    setInverseScale(1 / scale);
    onZoomChange?.(Math.round(scale * 100));
  }, [stageSize, documentWidth, documentHeight, onZoomChange]);

  useEffect(() => {
    if (didInitialFitRef.current) return;
    if (stageSize.width < 10 || stageSize.height < 10) return;
    fitToScreen();
    didInitialFitRef.current = true;
  }, [stageSize, fitToScreen]);

  const setScaleAroundPoint = useCallback(
    (newScaleRaw: number, screenPoint: { x: number; y: number }) => {
      const stage = stageRef.current;
      if (!stage) return;
      const oldScale = stage.scaleX();
      const newScale = clamp(newScaleRaw, MIN_ZOOM, MAX_ZOOM);
      const pointTo = {
        x: (screenPoint.x - stage.x()) / oldScale,
        y: (screenPoint.y - stage.y()) / oldScale,
      };
      stage.scale({ x: newScale, y: newScale });
      stage.position({
        x: screenPoint.x - pointTo.x * newScale,
        y: screenPoint.y - pointTo.y * newScale,
      });
      stage.batchDraw();
      setInverseScale(1 / newScale);
      onZoomChange?.(Math.round(newScale * 100));
    },
    [onZoomChange],
  );

  useImperativeHandle(
    forwardedRef,
    () => ({
      zoomIn: () => {
        const stage = stageRef.current;
        if (!stage) return;
        setScaleAroundPoint(stage.scaleX() * 1.25, { x: stageSize.width / 2, y: stageSize.height / 2 });
      },
      zoomOut: () => {
        const stage = stageRef.current;
        if (!stage) return;
        setScaleAroundPoint(stage.scaleX() / 1.25, { x: stageSize.width / 2, y: stageSize.height / 2 });
      },
      fitToScreen,
      getStage: () => stageRef.current,
    }),
    [setScaleAroundPoint, stageSize, fitToScreen],
  );

  const handleWheel = useCallback(
    (e: KonvaEventObject<WheelEvent>) => {
      e.evt.preventDefault();
      const stage = stageRef.current;
      if (!stage) return;
      const pointer = stage.getPointerPosition();
      if (!pointer) return;
      const direction = e.evt.deltaY > 0 ? -1 : 1;
      const scaleBy = 1.08;
      const oldScale = stage.scaleX();
      setScaleAroundPoint(direction > 0 ? oldScale * scaleBy : oldScale / scaleBy, pointer);
    },
    [setScaleAroundPoint],
  );

  const showPreview = useCallback((buffer: HTMLCanvasElement) => {
    setPreviewCanvas(buffer);
  }, []);
  const hidePreview = useCallback(() => {
    setPreviewCanvas(null);
  }, []);

  const applyDirectDab = useCallback((layer: LayerState, point: StrokePoint, activeBrush: BrushSettings) => {
    if (activeBrush.tool === 'eraser') {
      const ctx = layer.canvas.getContext('2d');
      if (!ctx) return;
      const r = radiusForPressure(activeBrush, baseRadius(activeBrush), point.pressure);
      ctx.save();
      ctx.globalCompositeOperation = 'destination-out';
      ctx.globalAlpha = activeBrush.opacity;
      ctx.beginPath();
      ctx.arc(point.x, point.y, r, 0, Math.PI * 2);
      ctx.fill();
      ctx.restore();
    } else if (activeBrush.tool === 'blur') {
      applyBlurDab(layer.canvas, point.x, point.y, baseRadius(activeBrush), activeBrush.opacity);
    }
  }, []);

  const applyDirectSegment = useCallback(
    (layer: LayerState, from: StrokePoint, to: StrokePoint, activeBrush: BrushSettings) => {
      if (activeBrush.tool === 'eraser') {
        const ctx = layer.canvas.getContext('2d');
        if (!ctx) return;
        const r = radiusForPressure(activeBrush, baseRadius(activeBrush), to.pressure);
        ctx.save();
        ctx.globalCompositeOperation = 'destination-out';
        ctx.globalAlpha = activeBrush.opacity;
        ctx.lineCap = 'round';
        ctx.lineJoin = 'round';
        ctx.lineWidth = r * 2;
        ctx.beginPath();
        ctx.moveTo(from.x, from.y);
        ctx.lineTo(to.x, to.y);
        ctx.stroke();
        ctx.beginPath();
        ctx.arc(to.x, to.y, r, 0, Math.PI * 2);
        ctx.fill();
        ctx.restore();
      } else if (activeBrush.tool === 'blur') {
        const dist = Math.hypot(to.x - from.x, to.y - from.y);
        const r = baseRadius(activeBrush);
        const spacing = Math.max(r * 0.5, 2);
        const steps = Math.max(1, Math.ceil(dist / spacing));
        for (let i = 1; i <= steps; i++) {
          const t = i / steps;
          const x = from.x + (to.x - from.x) * t;
          const y = from.y + (to.y - from.y) * t;
          applyBlurDab(layer.canvas, x, y, r, activeBrush.opacity);
        }
      }
    },
    [],
  );

  const resetStrokeState = useCallback(() => {
    isDrawingRef.current = false;
    strokeBufferRef.current = null;
    beforeSnapshotRef.current = null;
    preStrokeDataUrlRef.current = null;
    lastPointRef.current = null;
    stabilizerRef.current = null;
  }, []);

  const cancelStroke = useCallback(() => {
    if (!isDrawingRef.current) return;
    const layer = activeLayerRef.current;
    const savedUrl = preStrokeDataUrlRef.current;
    if (layer && savedUrl) {
      const img = new Image();
      img.onload = () => {
        const ctx = layer.canvas.getContext('2d');
        if (ctx) {
          ctx.clearRect(0, 0, layer.canvas.width, layer.canvas.height);
          ctx.drawImage(img, 0, 0);
          requestRedraw();
        }
      };
      img.src = savedUrl;
    }
    hidePreview();
    resetStrokeState();
  }, [hidePreview, requestRedraw, resetStrokeState]);

  const startStroke = useCallback(
    (evt: PointerEvent, stage: Konva.Stage) => {
      const layer = activeLayerRef.current;
      if (!layer || layer.locked) return;
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;

      const activeBrush = brushRef.current;
      const point: StrokePoint = { x: pos.x, y: pos.y, pressure: pressureFromEvent(evt) };

      if (activeBrush.tool === 'fill') {
        const before = beginStroke();
        const ctx = layer.canvas.getContext('2d');
        if (ctx) {
          floodFill(ctx, {
            x: Math.round(point.x),
            y: Math.round(point.y),
            color: activeBrush.color,
            opacity: activeBrush.opacity,
            tolerance: FILL_TOLERANCE,
          });
          commitStroke(before);
          requestRedraw();
        }
        return;
      }

      isDrawingRef.current = true;
      beforeSnapshotRef.current = beginStroke();
      stabilizerRef.current = new StrokeStabilizer(activeBrush.smoothing);
      const smoothed = stabilizerRef.current.reset(point);
      lastPointRef.current = smoothed;

      if (activeBrush.tool === 'eraser' || activeBrush.tool === 'blur') {
        preStrokeDataUrlRef.current = layer.canvas.toDataURL('image/png');
        applyDirectDab(layer, smoothed, activeBrush);
        requestRedraw();
      } else {
        const buffer = createStrokeBuffer(layer.canvas.width, layer.canvas.height);
        strokeBufferRef.current = buffer;
        const bctx = buffer.getContext('2d');
        if (bctx) paintStrokeDot(bctx, smoothed, activeBrush, baseRadius(activeBrush));
        showPreview(buffer);
      }
    },
    [applyDirectDab, beginStroke, commitStroke, requestRedraw, showPreview],
  );

  const continueStroke = useCallback(
    (evt: PointerEvent, stage: Konva.Stage) => {
      if (!isDrawingRef.current) return;
      const layer = activeLayerRef.current;
      const stabilizer = stabilizerRef.current;
      const from = lastPointRef.current;
      if (!layer || !stabilizer || !from) return;
      const pos = stage.getRelativePointerPosition();
      if (!pos) return;

      const activeBrush = brushRef.current;
      const raw: StrokePoint = { x: pos.x, y: pos.y, pressure: pressureFromEvent(evt) };
      const smoothed = stabilizer.next(raw);

      if (activeBrush.tool === 'eraser' || activeBrush.tool === 'blur') {
        applyDirectSegment(layer, from, smoothed, activeBrush);
      } else if (strokeBufferRef.current) {
        const bctx = strokeBufferRef.current.getContext('2d');
        if (bctx) paintStrokeSegment(bctx, from, smoothed, activeBrush, baseRadius(activeBrush));
      }

      lastPointRef.current = smoothed;
      requestRedraw();
    },
    [applyDirectSegment, requestRedraw],
  );

  const endStroke = useCallback(() => {
    if (!isDrawingRef.current) return;
    const layer = activeLayerRef.current;
    const activeBrush = brushRef.current;
    const before = beforeSnapshotRef.current;

    if (activeBrush.tool === 'eraser' || activeBrush.tool === 'blur') {
      if (layer && before) commitStroke(before);
    } else if (strokeBufferRef.current && layer) {
      const ctx = layer.canvas.getContext('2d');
      if (ctx) commitStrokeToLayer(ctx, strokeBufferRef.current, activeBrush);
      hidePreview();
      if (before) commitStroke(before);
    }

    resetStrokeState();
    requestRedraw();
  }, [commitStroke, hidePreview, requestRedraw, resetStrokeState]);

  const handlePointerDown = useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      const stage = stageRef.current;
      if (!stage) return;
      const evt = e.evt;
      activePointersRef.current.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });

      if (activePointersRef.current.size === 2) {
        cancelStroke();
        const pts = Array.from(activePointersRef.current.values());
        pinchLastDistRef.current = distance(pts[0]!, pts[1]!);
        pinchLastCenterRef.current = midpoint(pts[0]!, pts[1]!);
        return;
      }
      if (activePointersRef.current.size > 2) return;

      if (brushRef.current.tool === 'hand') return;
      setCursorVisible(true);
      startStroke(evt, stage);
    },
    [cancelStroke, startStroke],
  );

  const handlePointerMove = useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      const stage = stageRef.current;
      if (!stage) return;
      const evt = e.evt;

      if (cursorRef.current && activePointersRef.current.size <= 1) {
        const pos = stage.getRelativePointerPosition();
        if (pos) cursorRef.current.position(pos);
      }

      if (!activePointersRef.current.has(evt.pointerId)) {
        if (activePointersRef.current.size === 0) requestRedraw();
        return;
      }
      activePointersRef.current.set(evt.pointerId, { x: evt.clientX, y: evt.clientY });

      if (activePointersRef.current.size >= 2) {
        const pts = Array.from(activePointersRef.current.values()).slice(0, 2);
        const newCenter = midpoint(pts[0]!, pts[1]!);
        const newDist = distance(pts[0]!, pts[1]!);
        const lastCenter = pinchLastCenterRef.current;
        const lastDist = pinchLastDistRef.current || newDist;

        const pointTo = {
          x: (newCenter.x - stage.x()) / stage.scaleX(),
          y: (newCenter.y - stage.y()) / stage.scaleX(),
        };
        const newScale = clamp(stage.scaleX() * (newDist / lastDist), MIN_ZOOM, MAX_ZOOM);
        stage.scale({ x: newScale, y: newScale });

        const dx = lastCenter ? newCenter.x - lastCenter.x : 0;
        const dy = lastCenter ? newCenter.y - lastCenter.y : 0;
        stage.position({
          x: newCenter.x - pointTo.x * newScale + dx,
          y: newCenter.y - pointTo.y * newScale + dy,
        });
        stage.batchDraw();
        setInverseScale(1 / newScale);
        onZoomChange?.(Math.round(newScale * 100));

        pinchLastDistRef.current = newDist;
        pinchLastCenterRef.current = newCenter;
        return;
      }

      continueStroke(evt, stage);
    },
    [continueStroke, onZoomChange, requestRedraw],
  );

  const endPointer = useCallback(
    (e: KonvaEventObject<PointerEvent>) => {
      const evt = e.evt;
      activePointersRef.current.delete(evt.pointerId);

      if (activePointersRef.current.size < 2) {
        pinchLastDistRef.current = 0;
        pinchLastCenterRef.current = null;
      }
      if (activePointersRef.current.size === 0) {
        endStroke();
        setCursorVisible(false);
      }
    },
    [endStroke],
  );

  const handlePointerLeave = useCallback(() => {
    setCursorVisible(false);
  }, []);

  return (
    <div
      ref={containerRef}
      className="drawing-surface relative h-full w-full overflow-hidden"
      style={{
        backgroundImage:
          'repeating-conic-gradient(#232429 0% 25%, #1a1b1f 0% 50%)',
        backgroundSize: '20px 20px',
      }}
    >
      {stageSize.width > 0 && (
        <Stage
          ref={stageRef}
          width={stageSize.width}
          height={stageSize.height}
          draggable={brush.tool === 'hand'}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={endPointer}
          onPointerCancel={endPointer}
          onPointerLeave={handlePointerLeave}
          onWheel={handleWheel}
        >
          <Layer ref={mainLayerRef} listening={false}>
            <Rect x={0} y={0} width={documentWidth} height={documentHeight} fill="#ffffff" shadowBlur={24} shadowColor="black" shadowOpacity={0.4} />
            {layers.map((layer) => (
              <KonvaImage
                key={layer.id}
                image={layer.canvas}
                visible={layer.visible}
                opacity={layer.opacity}
                globalCompositeOperation={BLEND_MODE_TO_COMPOSITE[layer.blendMode]}
                listening={false}
              />
            ))}
          </Layer>
          <Layer ref={overlayLayerRef} listening={false}>
            {previewCanvas && <KonvaImage image={previewCanvas} opacity={brush.opacity} listening={false} />}
            <BrushCursor
              ref={cursorRef}
              radius={baseRadius(brush)}
              hardness={brush.hardness}
              color={brush.color}
              inverseScale={inverseScale}
              visible={cursorVisible && brush.tool !== 'hand'}
            />
          </Layer>
        </Stage>
      )}
    </div>
  );
});

