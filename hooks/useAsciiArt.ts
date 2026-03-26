"use client";

import { useCallback } from "react";

// Character palette ordered darkest → brightest, per the specified grayscale bands:
// Darkest  : # @ B M % 8
// Dark     : $ & W Q K A 5
// Mid-tone : d p b o u v n r t
// Light    : s c y j | i ( { [
// Brightest: } < > ? - + _ =
const ASCII_CHARS = "#@BM%8$&WQKA5dpbouv nrtscyj|i({[}<>?-+_= ";

// Sigmoid S-curve: pushes darks darker and lights lighter, maximising face contrast.
// factor controls steepness — 6 gives strong pop without posterising.
function sCurve(v: number, factor = 6): number {
  const s = 1 / (1 + Math.exp(-factor * (v - 0.5)));
  // Normalise so the output spans [0, 1] rather than [sigmoid(−f/2), sigmoid(f/2)]
  const lo = 1 / (1 + Math.exp(factor * 0.5));
  const hi = 1 / (1 + Math.exp(-factor * 0.5));
  return (s - lo) / (hi - lo);
}

export function useAsciiArt() {
  const frameToAscii = useCallback(
    (
      video: HTMLVideoElement,
      canvas: HTMLCanvasElement,
      cols: number = 120
    ): string => {
      const ctx = canvas.getContext("2d", { willReadFrequently: true });
      if (!ctx) return "";

      const videoW = video.videoWidth;
      const videoH = video.videoHeight;
      if (!videoW || !videoH) return "";

      // Preserve original camera aspect ratio.
      // Monospace chars are ~1.15/0.6 ≈ 1.92× taller than wide — compensate so
      // the rendered output matches the video's natural proportions.
      const CHAR_ASPECT = 0.6 / 1.15; // ≈ 0.522
      const rows = Math.round((cols * videoH) / videoW * CHAR_ASPECT);

      const cellW = videoW / cols;
      const cellH = videoH / rows;

      canvas.width = videoW;
      canvas.height = videoH;

      // Mirror horizontally (selfie feel)
      ctx.save();
      ctx.translate(videoW, 0);
      ctx.scale(-1, 1);
      ctx.drawImage(video, 0, 0, videoW, videoH);
      ctx.restore();

      const imageData = ctx.getImageData(0, 0, videoW, videoH);
      const pixels = imageData.data;

      // --- Pass 1: average brightness per cell + collect global min/max ---
      const brightness = new Float32Array(rows * cols);
      let globalMin = 255;
      let globalMax = 0;

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          const x0 = Math.floor(col * cellW);
          const y0 = Math.floor(row * cellH);
          const x1 = Math.min(Math.ceil((col + 1) * cellW), videoW - 1);
          const y1 = Math.min(Math.ceil((row + 1) * cellH), videoH - 1);

          let sum = 0;
          let count = 0;
          for (let y = y0; y <= y1; y++) {
            for (let x = x0; x <= x1; x++) {
              const idx = (y * videoW + x) * 4;
              // Perceived luminance — Rec. 601
              sum +=
                0.299 * pixels[idx] +
                0.587 * pixels[idx + 1] +
                0.114 * pixels[idx + 2];
              count++;
            }
          }

          const avg = count > 0 ? sum / count : 0;
          brightness[row * cols + col] = avg;
          if (avg < globalMin) globalMin = avg;
          if (avg > globalMax) globalMax = avg;
        }
      }

      // --- Pass 2: histogram stretch → S-curve → map to char palette ---
      const range = globalMax - globalMin || 1;
      const lastIdx = ASCII_CHARS.length - 1;
      let ascii = "";

      for (let row = 0; row < rows; row++) {
        for (let col = 0; col < cols; col++) {
          // 1. Stretch to full [0, 1] range
          const stretched = (brightness[row * cols + col] - globalMin) / range;
          // 2. S-curve for facial contrast (darken shadows, brighten highlights)
          const curved = sCurve(stretched, 6);
          // 3. Map to char — bright pixels → sparse chars (end of array)
          const charIndex = Math.min(Math.floor(curved * lastIdx), lastIdx);
          ascii += ASCII_CHARS[charIndex];
        }
        ascii += "\n";
      }

      return ascii;
    },
    []
  );

  return { frameToAscii };
}
