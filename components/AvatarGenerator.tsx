"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useAsciiArt, type AsciiFrame } from "@/hooks/useAsciiArt";
import { useSegmentation } from "@/hooks/useSegmentation";
import AsciiTitle, { TITLE_ART, SUBTITLE_ART } from "@/components/AsciiTitle";

type Stage = "idle" | "preview" | "captured";

const FG_COLOR = "#2945D1";
const BG_COLOR = "#a8bde0"; // lighter blue for background texture

export default function AvatarGenerator() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const previewRef = useRef<HTMLPreElement>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [ascii, setAscii] = useState<AsciiFrame | null>(null);
  const [error, setError] = useState<string>("");
  const [cols, setCols] = useState<number>(120);
  const [saveMessage, setSaveMessage] = useState<string>("");

  const { frameToAscii } = useAsciiArt();
  const segmentation = useSegmentation();
  const segmentationRef = useRef(segmentation);
  useEffect(() => {
    segmentationRef.current = segmentation;
  });

  // Live preview — writes HTML directly to DOM, no React re-renders
  const startLivePreview = useCallback(
    (video: HTMLVideoElement, canvas: HTMLCanvasElement, colCount: number) => {
      const loop = () => {
        segmentationRef.current.sendFrame(video);
        const frame = frameToAscii(video, canvas, colCount, segmentationRef.current);
        if (frame && previewRef.current) {
          previewRef.current.innerHTML = frame.html;
        }
        animFrameRef.current = requestAnimationFrame(loop);
      };
      animFrameRef.current = requestAnimationFrame(loop);
    },
    [frameToAscii]
  );

  const stopLivePreview = useCallback(() => {
    if (animFrameRef.current !== null) {
      cancelAnimationFrame(animFrameRef.current);
      animFrameRef.current = null;
    }
  }, []);

  const startCamera = useCallback(async () => {
    setError("");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "user", width: { ideal: 1280 }, height: { ideal: 720 } },
      });
      streamRef.current = stream;
      const video = videoRef.current!;
      video.srcObject = stream;
      await video.play();
      setStage("preview");
    } catch (err) {
      setError(
        err instanceof DOMException && err.name === "NotAllowedError"
          ? "Camera permission denied. Please allow camera access and try again."
          : "Could not access camera. Make sure no other app is using it."
      );
    }
  }, []);

  useEffect(() => {
    if (stage !== "preview") return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;

    const onReady = () => startLivePreview(video, canvas, cols);
    if (video.readyState >= 3) {
      onReady();
    } else {
      video.addEventListener("canplay", onReady, { once: true });
    }
    return () => {
      stopLivePreview();
      video.removeEventListener("canplay", onReady);
    };
  }, [stage, startLivePreview, stopLivePreview, cols]);

  useEffect(() => {
    if (stage !== "preview") return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    stopLivePreview();
    startLivePreview(video, canvas, cols);
  }, [cols]); // eslint-disable-line react-hooks/exhaustive-deps

  const capture = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    if (!video || !canvas) return;
    stopLivePreview();
    const snapshot = frameToAscii(video, canvas, cols, segmentationRef.current);
    if (snapshot) setAscii(snapshot);
    setStage("captured");
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [stopLivePreview, frameToAscii, cols]);

  const reset = useCallback(() => {
    stopLivePreview();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setAscii(null);
    setSaveMessage("");
    setStage("idle");
  }, [stopLivePreview]);

  const downloadImage = useCallback(
    async (format: "png" | "jpg") => {
      if (!ascii) return;
      const lines = ascii.text.split("\n");
      const fontSize = 7;
      const lineHeight = fontSize * 1.15;
      const charWidth = fontSize * 0.6;

      const canvasWidth = Math.max(...lines.map((l) => l.length)) * charWidth;
      const canvasHeight = lines.length * lineHeight + fontSize;

      const offscreen = document.createElement("canvas");
      offscreen.width = Math.ceil(canvasWidth);
      offscreen.height = Math.ceil(canvasHeight);

      const ctx = offscreen.getContext("2d")!;
      ctx.fillStyle = "#F6F8FF";
      ctx.fillRect(0, 0, offscreen.width, offscreen.height);
      ctx.font = `${fontSize}px "Courier New", monospace`;
      ctx.textBaseline = "top";

      // Render each character with its fg or bg color
      lines.forEach((line, rowIdx) => {
        let col = 0;
        while (col < line.length) {
          const isFg = ascii.fgMap[rowIdx * ascii.cols + col] === 1;
          ctx.fillStyle = isFg ? FG_COLOR : BG_COLOR;
          let run = "";
          const runStart = col;
          while (col < line.length && (ascii.fgMap[rowIdx * ascii.cols + col] === 1) === isFg) {
            run += line[col];
            col++;
          }
          ctx.fillText(run, runStart * charWidth, rowIdx * lineHeight);
        }
      });

      const mimeType = format === "png" ? "image/png" : "image/jpeg";
      const dataUrl = offscreen.toDataURL(mimeType, 0.95);

      const a = document.createElement("a");
      a.href = dataUrl;
      a.download = `ascii-avatar.${format}`;
      a.click();

      try {
        const res = await fetch("/api/save-avatar", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ dataUrl, format }),
        });
        const data = await res.json();
        if (data.ok) setSaveMessage(`Saved to ${data.path}`);
        else setSaveMessage("Browser download succeeded, but local save failed.");
      } catch {
        setSaveMessage("Browser download succeeded, but local save failed.");
      }
    },
    [ascii]
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 gap-8">
      <div className="text-center space-y-1">
        <AsciiTitle art={TITLE_ART} className="text-[#2945D1] text-[11px] leading-tight" />
        <AsciiTitle art={SUBTITLE_ART} className="text-slate-400 text-[9px] leading-tight" />
      </div>

      {error && (
        <div className="bg-red-900/40 border border-red-500 text-red-300 rounded-lg px-4 py-3 max-w-md text-sm text-center">
          {error}
        </div>
      )}

      {stage === "idle" && (
        <button
          onClick={startCamera}
          className="group flex flex-col items-center gap-3 cursor-pointer"
          aria-label="Enable camera"
        >
          <div className="w-24 h-24 rounded-full border-2 border-[#2945D1] flex items-center justify-center
                          transition-all duration-300 group-hover:bg-[#2945D1]/20 group-hover:scale-110">
            <CameraIcon className="w-10 h-10 text-[#2945D1]" />
          </div>
          <span className="text-slate-500 text-sm group-hover:text-slate-900 transition-colors">
            Click to enable camera
          </span>
        </button>
      )}

      <video ref={videoRef} className="hidden" muted playsInline />
      <canvas ref={canvasRef} className="hidden" />

      {(stage === "preview" || stage === "captured") && (
        <div className="flex flex-col items-center gap-4 w-full">
          <div
            className="rounded-xl overflow-hidden border border-[#2945D1]/30 bg-[#F6F8FF] p-2 shadow-sm"
            style={{ maxWidth: "min(90vw, 900px)", width: "100%" }}
          >
            {stage === "preview" && (
              <pre ref={previewRef} className="ascii-output" />
            )}
            {stage === "captured" && ascii && (
              <pre
                className="ascii-output"
                dangerouslySetInnerHTML={{ __html: ascii.html }}
              />
            )}
          </div>

          {/* Mode slider */}
          {(() => {
            const isRetro = cols <= 110;
            const pct = Math.round(((cols - 40) / (180 - 40)) * 100);
            return (
              <div className="flex flex-col items-center gap-2 w-full max-w-sm">
                {/* Active mode badge */}
                <div className="flex items-center gap-2">
                  <span
                    className="px-2 py-0.5 rounded-full text-[10px] font-semibold tracking-wide uppercase transition-colors duration-300"
                    style={isRetro
                      ? { background: "#2945D1", color: "#fff" }
                      : { background: "#e8ecff", color: "#2945D1" }}
                  >
                    {isRetro ? "Retro & Iconic" : "Sharp & Textured"}
                  </span>
                  <span className="text-[10px] text-slate-400">{pct}%</span>
                </div>

                {/* Slider row */}
                <div className="flex items-center gap-3 w-full">
                  <span className="text-[10px] text-slate-400 w-16 text-right leading-tight">
                    8-bit<br />Minimalist
                  </span>
                  <input
                    type="range" min={40} max={180} step={10} value={cols}
                    onChange={(e) => setCols(Number(e.target.value))}
                    className="accent-[#2945D1] flex-1 cursor-pointer"
                  />
                  <span className="text-[10px] text-slate-400 w-16 leading-tight">
                    Pencil<br />Sketch
                  </span>
                </div>

                {/* Mode description */}
                <p className="text-[10px] text-slate-400 text-center leading-relaxed transition-all duration-300">
                  {isRetro
                    ? "Bold blocks · High-contrast silhouette · Perfect for avatars"
                    : "Hair texture · Eye reflections · 3D depth with mist-like background"}
                </p>
              </div>
            );
          })()}

          {saveMessage && (
            <p className="text-xs text-[#2945D1] font-medium">{saveMessage}</p>
          )}

          <div className="flex gap-3 flex-wrap justify-center">
            {stage === "preview" && (
              <button
                onClick={capture}
                className="px-6 py-2.5 rounded-lg bg-[#2945D1] text-white font-semibold text-sm
                           hover:bg-[#1e36b8] active:scale-95 transition-all"
              >
                Capture
              </button>
            )}
            {stage === "captured" && (
              <>
                <button
                  onClick={() => downloadImage("png")}
                  className="px-6 py-2.5 rounded-lg bg-[#2945D1] text-white font-semibold text-sm
                             hover:bg-[#1e36b8] active:scale-95 transition-all"
                >
                  Download PNG
                </button>
                <button
                  onClick={() => downloadImage("jpg")}
                  className="px-6 py-2.5 rounded-lg bg-[#2945D1] text-white font-semibold text-sm
                             hover:bg-[#1e36b8] active:scale-95 transition-all"
                >
                  Download JPG
                </button>
              </>
            )}
            <button
              onClick={reset}
              className="px-6 py-2.5 rounded-lg border border-slate-300 text-slate-600 text-sm font-semibold
                         hover:border-slate-400 hover:text-slate-900 active:scale-95 transition-all"
            >
              {stage === "preview" ? "Cancel" : "Retake"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function CameraIcon({ className }: { className?: string }) {
  return (
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none"
      stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round"
      className={className}>
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
