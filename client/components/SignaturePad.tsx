// components/SignaturePad.tsx
"use client";

import { useRef } from "react";

export default function SignaturePad({
  onChange,
}: {
  onChange: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  function pos(e: React.PointerEvent) {
    const canvas = canvasRef.current!;
    const rect = canvas.getBoundingClientRect();
    // canvas backing store may differ from CSS size — scale to internal coords
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    return {
      x: (e.clientX - rect.left) * scaleX,
      y: (e.clientY - rect.top) * scaleY,
    };
  }

  function start(e: React.PointerEvent) {
    drawing.current = true;
    // keep receiving move/up events even if the finger slides off the canvas
    canvasRef.current?.setPointerCapture(e.pointerId);
    const ctx = canvasRef.current?.getContext("2d");
    if (ctx) {
      const { x, y } = pos(e);
      ctx.beginPath();
      ctx.moveTo(x, y);
    }
  }

  function stop() {
    if (!drawing.current) return;
    drawing.current = false;
    const canvas = canvasRef.current;
    if (canvas) {
      canvas.getContext("2d")?.beginPath();
      onChange(canvas.toDataURL("image/png"));
    }
  }

  function draw(e: React.PointerEvent) {
    if (!drawing.current) return;
    const canvas = canvasRef.current;
    if (!canvas) return;

    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const { x, y } = pos(e);
    ctx.lineWidth = 2;
    ctx.lineCap = "round";
    ctx.strokeStyle = "#000";

    ctx.lineTo(x, y);
    ctx.stroke();
    ctx.beginPath();
    ctx.moveTo(x, y);
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
        style={{ touchAction: "none", maxWidth: "100%" }}
        onPointerDown={start}
        onPointerUp={stop}
        onPointerMove={draw}
        onPointerCancel={stop}
        onPointerLeave={stop}
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
