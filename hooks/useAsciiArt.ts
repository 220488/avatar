"use client";

import { useCallback } from "react";
import type { SegmentationRefs } from "./useSegmentation";

// ── Dual character palettes ───────────────────────────────────────────────────
// Foreground (subject): dense chars — map brightness → visual weight of face
const FG_CHARS = "#@BM%8$&WQKA5dpbouvnrt";
// Background: sparse chars — subtle texture that defines the silhouette edge
const BG_CHARS = ":. ";

// ── S-curve for facial contrast ───────────────────────────────────────────────
function sCurve(v: number, factor = 6): number {
  const s = 1 / (1 + Math.exp(-factor * (v - 0.5)));
  const lo = 1 / (1 + Math.exp(factor * 0.5));
  const hi = 1 / (1 + Math.exp(-factor * 0.5));
  return (s - lo) / (hi - lo);
}

// ── Sharpening (3×3 Laplacian, kernel sums to 1) ─────────────────────────────
function applySharpening(src: Uint8ClampedArray, w: number, h: number): Uint8ClampedArray {
  const dst = new Uint8ClampedArray(src.length);
  const K = [0, -0.5, 0, -0.5, 3, -0.5, 0, -0.5, 0];
  for (let y = 0; y < h; y++) {
    for (let x = 0; x < w; x++) {
      const i = (y * w + x) * 4;
      for (let c = 0; c < 3; c++) {
        let acc = 0;
        for (let ky = -1; ky <= 1; ky++) {
          for (let kx = -1; kx <= 1; kx++) {
            const ny = Math.max(0, Math.min(h - 1, y + ky));
            const nx = Math.max(0, Math.min(w - 1, x + kx));
            acc += src[(ny * w + nx) * 4 + c] * K[(ky + 1) * 3 + (kx + 1)];
          }
        }
        dst[i + c] = Math.max(0, Math.min(255, acc));
      }
      dst[i + 3] = 255;
    }
  }
  return dst;
}

// HTML-escape chars that would break innerHTML (& < > in char palettes)
function esc(s: string): string {
  return s === "&" ? "&amp;" : s === "<" ? "&lt;" : s === ">" ? "&gt;" : s;
}

// ── Public return type ────────────────────────────────────────────────────────
export interface AsciiFrame {
  html: string;        // colored HTML for DOM preview (innerHTML)
  text: string;        // plain text for file download
  fgMap: Uint8Array;   // 1 = foreground cell, 0 = background, length = rows × cols
  cols: number;        // columns in this frame (needed to index fgMap)
}

export function useAsciiArt() {
  const frameToAscii = useCallback(
    (
      video: HTMLVideoElement,
      canvas: HTMLCanvasElement,
      cols: number = 120,
      segmentation?: Pick<SegmentationRefs, "maskDataRef" | "maskSizeRef">
    ): AsciiFrame | null => {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return null;

      const videoW = video.videoWidth;
      const videoH = video.videoHeight;
      if (!videoW || !videoH) return null;

      const CHAR_ASPECT = 0.6 / 1.15;
      const rows = Math.round((cols * videoH * CHAR_ASPECT) / videoW);
      const cellW = videoW / cols;
      const cellH = videoH / rows;

      canvas.width = videoW;
      canvas.height = videoH;

      // Contrast + brightness via canvas filter, then draw mirrored
      ctx.filter = "contrast(160%) brightness(110%)";
      ctx.save();
      ctx.translate(videoW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, videoW, videoH);
      ctx.restore();
      ctx.filter = "none";

      const raw = ctx.getImageData(0, 0, videoW, videoH).data;
      const pixels = applySharpening(raw as unknown as Uint8ClampedArray, videoW, videoH);

      // Segmentation data (may be null if not ready yet)
      const maskData = segmentation?.maskDataRef.current ?? null;
      const maskSize = segmentation?.maskSizeRef.current ?? null;
      const hasMask = !!(maskData && maskSize && maskSize.w > 0);

      // ── Pass 1: brightness + fg/bg per cell ──────────────────────────────────
      const brightness = new Float32Array(rows * cols);
      const fgMap = new Uint8Array(rows * cols);
      let globalMin = 255;
      let globalMax = 0;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x0 = Math.round(col * cellW);
          const y0 = Math.round(row * cellH);
          const x1 = Math.min(Math.round((col + 1) * cellW) - 1, videoW - 1);
          const y1 = Math.min(Math.round((row + 1) * cellH) - 1, videoH - 1);

          let lumSum = 0;
          let maskSum = 0;
          let count = 0;

          for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
              const idx = (y * videoW + x) * 4;
              lumSum +=
                0.299 * pixels[idx] +
                0.587 * pixels[idx + 1] +
                0.114 * pixels[idx + 2];

              if (hasMask) {
                // Canvas is mirrored → flip x to align with un-mirrored mask coordinates
                const mirX = videoW - 1 - x;
                const mx = Math.min(Math.floor((mirX / videoW) * maskSize!.w), maskSize!.w - 1);
                const my = Math.min(Math.floor((y / videoH) * maskSize!.h), maskSize!.h - 1);
                maskSum += maskData![(my * maskSize!.w + mx) * 4]; // R = person prob
              }
              count++;
            }
          }

          const avg = count > 0 ? lumSum / count : 0;
          brightness[row * cols + col] = avg;
          if (avg < globalMin) globalMin = avg;
          if (avg > globalMax) globalMax = avg;

          // Cell is foreground if avg person probability ≥ 128, or if no mask yet
          fgMap[row * cols + col] =
            !hasMask || maskSum / count >= 128 ? 1 : 0;
        }
      }

      // ── Pass 2: histogram stretch → S-curve → dual-ramp char + HTML ──────────
      const range = globalMax - globalMin || 1;
      let html = "";
      let text = "";

      for (let row = 0; row < rows; row++) {
        let runFg: 0 | 1 | null = null;
        let run = "";

        const flushRun = () => {
          if (!run) return;
          const cls = runFg === 1 ? "ascii-fg" : "ascii-bg";
          html += `<span class="${cls}">${run}</span>`;
          run = "";
        };

        for (let col = 0; col < cols; col++) {
          const stretched = (brightness[row * cols + col] - globalMin) / range;
          const curved = sCurve(stretched, 6);
          const isFg = fgMap[row * cols + col] as 0 | 1;
          const palette = isFg ? FG_CHARS : BG_CHARS;
          const charIndex = Math.min(Math.floor(curved * (palette.length - 1)), palette.length - 1);
          const char = palette[charIndex];

          text += char;
          if (isFg !== runFg) {
            flushRun();
            runFg = isFg;
          }
          run += esc(char);
        }
        flushRun();
        html += "\n";
        text += "\n";
      }

      return { html, text, fgMap, cols };
    },
    []
  );

  return { frameToAscii };
}
