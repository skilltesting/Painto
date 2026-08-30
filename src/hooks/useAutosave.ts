'use client';

import { useEffect, useRef } from 'react';
import { createBrowserSupabaseClient } from '@/lib/supabase';
import type { LayerState, ProjectMetadata } from '@/lib/types';

export function useAutosave(
  projectId: string | null,
  layers: LayerState[],
  title: string,
  canvasWidth: number,
  canvasHeight: number,
  delayMs = 2000,
) {
  const timeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    if (!projectId) return;

    if (timeoutRef.current) clearTimeout(timeoutRef.current);

    timeoutRef.current = setTimeout(async () => {
      const supabase = createBrowserSupabaseClient();
      const { data: userData } = await supabase.auth.getUser();
      if (!userData.user) return;

      const userId = userData.user.id;

      // 1. Upload layer canvas images to Supabase Storage
      const layerMetaProms = layers.map(async (layer, index) => {
        const dataUrl = layer.canvas.toDataURL('image/png');
        const blob = await (await fetch(dataUrl)).blob();
        const filePath = `${userId}/${projectId}/layer_${layer.id}.png`;

        await supabase.storage.from('project-files').upload(filePath, blob, {
          upsert: true,
          contentType: 'image/png',
        });

        return {
          id: layer.id,
          name: layer.name,
          order: index,
          opacity: layer.opacity,
          blendMode: layer.blendMode,
          visible: layer.visible,
          locked: layer.locked,
          storagePath: filePath,
        };
      });

      const layerMeta = await Promise.all(layerMetaProms);

      // 2. Generate and upload standard flattened thumbnail
      const thumbCanvas = document.createElement('canvas');
      thumbCanvas.width = 320;
      thumbCanvas.height = Math.round((320 / canvasWidth) * canvasHeight);
      const tctx = thumbCanvas.getContext('2d');

      if (tctx) {
        tctx.fillStyle = '#ffffff';
        tctx.fillRect(0, 0, thumbCanvas.width, thumbCanvas.height);
        layers.forEach((layer) => {
          if (layer.visible) {
            tctx.globalAlpha = layer.opacity;
            tctx.drawImage(layer.canvas, 0, 0, thumbCanvas.width, thumbCanvas.height);
          }
        });
      }

      const thumbBlob = await (await fetch(thumbCanvas.toDataURL('image/png'))).blob();
      const thumbPath = `${userId}/${projectId}/thumbnail.png`;

      await supabase.storage.from('project-files').upload(thumbPath, thumbBlob, {
        upsert: true,
        contentType: 'image/png',
      });

      // 3. Update project row metadata in Postgres
      const updatePayload: Partial<ProjectMetadata> = {
        title,
        canvas_width: canvasWidth,
        canvas_height: canvasHeight,
        layers: layerMeta,
        thumbnail_path: thumbPath,
      };

      await supabase.from('projects').update(updatePayload).eq('id', projectId);
    }, delayMs);

    return () => {
      if (timeoutRef.current) clearTimeout(timeoutRef.current);
    };
  }, [projectId, layers, title, canvasWidth, canvasHeight, delayMs]);
}

