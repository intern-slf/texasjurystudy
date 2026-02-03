// components/SignaturePad.tsx
"use client";

import { useRef } from "react";

export default function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  let drawing = false;

  function start() {
    drawing = true;
  }

  function stop() {
    drawing = false;
    const canvas = canvasRef.current;
    if (canvas) {
      const ctx = canvas.getContext("2d");
      if (ctx) ctx.beginPath();
      onChange(canvas.toDataURL("image/png"));
    }
  }

  function draw(e: React.MouseEvent) {
    if (!drawing) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const rect = canvas.getBoundingClientRect();
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";

    ctx.lineTo(e.clientX - rect.left, e.clientY - rect.top);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(e.clientX - rect.left, e.clientY - rect.top);
  }

  function clear() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    ctx.beginPath();
    onChange("");
  }

  return (
    <div>
      <canvas
        ref={canvasRef}
        width={300}
        height={180}
        className="border border-dashed"
        onMouseDown={start}
        onMouseUp={stop}
        onMouseMove={draw}
        onMouseLeave={stop}
      />
      <button
        type="button"
        onClick={clear}
        className="mt-2 text-sm underline"
      >
        Clear signature
      </button>
    </div>
  );
}
