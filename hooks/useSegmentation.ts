"use client";

import { useEffect, useRef, useCallback } from "react";

export interface SegmentationRefs {
  maskDataRef: React.MutableRefObject<Uint8ClampedArray | null>;
  maskSizeRef: React.MutableRefObject<{ w: number; h: number }>;
  sendFrame: (video: HTMLVideoElement) => void;
  ready: React.MutableRefObject<boolean>;
}

export function useSegmentation(): SegmentationRefs {
  const segRef = useRef<any>(null);
  const maskDataRef = useRef<Uint8ClampedArray | null>(null);
  const maskSizeRef = useRef<{ w: number; h: number }>({ w: 0, h: 0 });
  const tempCanvas = useRef<HTMLCanvasElement | null>(null);
  const ready = useRef(false);

  useEffect(() => {
    let instance: any = null;

    async function init() {
      try {
        // Dynamic import avoids SSR issues — MediaPipe uses browser APIs
        const { SelfieSegmentation } = await import("@mediapipe/selfie_segmentation");

        instance = new SelfieSegmentation({
          locateFile: (file: string) =>
            `https://cdn.jsdelivr.net/npm/@mediapipe/selfie_segmentation@0.1.1675465747/${file}`,
        });

        instance.setOptions({ modelSelection: 1, selfieMode: false });

        const canvas = document.createElement("canvas");
        tempCanvas.current = canvas;
        const ctx = canvas.getContext("2d", { willReadFrequently: true })!;

        instance.onResults((results: any) => {
          const mask = results.segmentationMask as HTMLCanvasElement | ImageBitmap;
          const w = (mask as HTMLCanvasElement).width ?? (mask as ImageBitmap).width;
          const h = (mask as HTMLCanvasElement).height ?? (mask as ImageBitmap).height;
          canvas.width = w;
          canvas.height = h;
          ctx.drawImage(mask as CanvasImageSource, 0, 0);
          maskDataRef.current = ctx.getImageData(0, 0, w, h).data as unknown as Uint8ClampedArray;
          maskSizeRef.current = { w, h };
        });

        await instance.initialize();
        segRef.current = instance;
        ready.current = true;
      } catch (err) {
        console.warn("[Segmentation] Unavailable:", err);
      }
    }

    init();

    return () => {
      instance?.close?.();
      segRef.current = null;
      ready.current = false;
    };
  }, []);

  const sendFrame = useCallback((video: HTMLVideoElement) => {
    if (!segRef.current || !ready.current) return;
    // Fire-and-forget — latest mask is always stored in maskDataRef
    segRef.current.send({ image: video }).catch(() => {});
  }, []);

  return { maskDataRef, maskSizeRef, sendFrame, ready };
}
