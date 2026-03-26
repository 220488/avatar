"use client";

import { useRef, useState, useCallback, useEffect } from "react";
import { useAsciiArt } from "@/hooks/useAsciiArt";
import AsciiTitle from "@/components/AsciiTitle";

type Stage = "idle" | "preview" | "captured";

export default function AvatarGenerator() {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const animFrameRef = useRef<number | null>(null);
  // Direct DOM ref for live preview — avoids React re-renders that cause shaking
  const previewRef = useRef<HTMLPreElement>(null);

  const [stage, setStage] = useState<Stage>("idle");
  const [ascii, setAscii] = useState<string>("");
  const [error, setError] = useState<string>("");
  const [cols, setCols] = useState<number>(120);
  const [saveMessage, setSaveMessage] = useState<string>("");

  const { frameToAscii } = useAsciiArt();

  // Live preview loop — writes directly to DOM, never touches React state
  const startLivePreview = useCallback(
    (video: HTMLVideoElement, canvas: HTMLCanvasElement, colCount: number) => {
      const loop = () => {
        const frame = frameToAscii(video, canvas, colCount);
        if (frame && previewRef.current) {
          previewRef.current.textContent = frame;
        }
        animFrameRef.current = requestAnimationFrame(loop);
      };
      animFrameRef.current = requestAnimationFrame(loop);
    },
    [frameToAscii],
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
        video: {
          facingMode: "user",
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
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
          : "Could not access camera. Make sure no other app is using it.",
      );
    }
  }, []);

  // Start live preview once video is ready
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

  // Restart loop when cols changes during preview
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
    const snapshot = frameToAscii(video, canvas, cols);
    setAscii(snapshot);
    setStage("captured");

    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
  }, [stopLivePreview, frameToAscii, cols]);

  const reset = useCallback(() => {
    stopLivePreview();
    streamRef.current?.getTracks().forEach((t) => t.stop());
    streamRef.current = null;
    setAscii("");
    setSaveMessage("");
    setStage("idle");
  }, [stopLivePreview]);

  const downloadImage = useCallback(
    async (format: "png" | "jpg") => {
      const lines = ascii.split("\n");
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
      ctx.fillStyle = "#2945D1";
      ctx.font = `${fontSize}px "Courier New", monospace`;
      ctx.textBaseline = "top";
      lines.forEach((line, i) => ctx.fillText(line, 0, i * lineHeight));

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
        else
          setSaveMessage("Browser download succeeded, but local save failed.");
      } catch {
        setSaveMessage("Browser download succeeded, but local save failed.");
      }
    },
    [ascii],
  );

  return (
    <div className="min-h-screen flex flex-col items-center justify-center px-4 py-12 gap-8">
      {/* Header */}
      <div className="text-center space-y-1">
        <AsciiTitle
          text="Get A New Avatar"
          font="Small"
          className="text-[#2945D1] text-[11px] leading-tight"
        />
        <AsciiTitle
          text="in ASCII art"
          font="Mini"
          className="text-slate-400 text-[9px] leading-tight"
        />
      </div>

      {/* Error */}
      {error && (
        <div className="bg-red-900/40 border border-red-500 text-red-300 rounded-lg px-4 py-3 max-w-md text-sm text-center">
          {error}
        </div>
      )}

      {/* Stage: Idle */}
      {stage === "idle" && (
        <button
          onClick={startCamera}
          className="group flex flex-col items-center gap-3 cursor-pointer"
          aria-label="Enable camera"
        >
          <div
            className="w-24 h-24 rounded-full border-2 border-[#2945D1] flex items-center justify-center
                          transition-all duration-300 group-hover:bg-[#2945D1]/20 group-hover:scale-110"
          >
            <CameraIcon className="w-10 h-10 text-[#2945D1]" />
          </div>
          <span className="text-slate-500 text-sm group-hover:text-slate-900 transition-colors">
            Click to enable camera
          </span>
        </button>
      )}

      {/* Hidden video + canvas used for processing */}
      <video ref={videoRef} className="hidden" muted playsInline />
      <canvas ref={canvasRef} className="hidden" />

      {/* ASCII frame — always mounted during preview so previewRef is available */}
      {(stage === "preview" || stage === "captured") && (
        <div className="flex flex-col items-center gap-4 w-full">
          {/* ASCII art frame */}
          <div
            className="rounded-xl overflow-hidden border border-[#2945D1]/30 bg-[#F6F8FF] p-2 shadow-sm"
            style={{ maxWidth: "min(90vw, 900px)", width: "100%" }}
          >
            {/* Live preview: updated via ref (no re-renders) */}
            {stage === "preview" && (
              <pre ref={previewRef} className="ascii-output" />
            )}
            {/* Captured snapshot: static React state */}
            {stage === "captured" && (
              <pre className="ascii-output">{ascii}</pre>
            )}
          </div>

          {/* Detail slider */}
          <div className="flex items-center gap-3 text-slate-500 text-xs">
            <span>Less detail</span>
            <input
              type="range"
              min={40}
              max={180}
              step={10}
              value={cols}
              onChange={(e) => setCols(Number(e.target.value))}
              className="accent-[#2945D1] w-40 cursor-pointer"
            />
            <span>More detail</span>
          </div>

          {/* Save confirmation */}
          {saveMessage && (
            <p className="text-xs text-[#2945D1] font-medium">{saveMessage}</p>
          )}

          {/* Action buttons */}
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
    <svg
      xmlns="http://www.w3.org/2000/svg"
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.5}
      strokeLinecap="round"
      strokeLinejoin="round"
      className={className}
    >
      <path d="M23 19a2 2 0 0 1-2 2H3a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h4l2-3h6l2 3h4a2 2 0 0 1 2 2z" />
      <circle cx="12" cy="13" r="4" />
    </svg>
  );
}
