"use client";

import React, { useRef, useState, useEffect } from "react";
import { motion, AnimatePresence, Variants } from "framer-motion";
import { Button } from "@/components/ui/button";
import { Eraser, ShieldCheck, PenTool } from "lucide-react";
import { cn } from "@/lib/utils";

interface SignaturePadProps {
  onSave?: (signatureDataUrl: string) => void;
  className?: string;
}

const hapticVariants: Variants = {
  hidden: { opacity: 0, scale: 0.8 },
  visible: { 
    opacity: 1, 
    scale: 1,
    transition: { ease: [0.16, 1, 0.3, 1] as const, duration: 0.4 }
  }
};

export function SignaturePad({ onSave, className }: SignaturePadProps) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [isDrawing, setIsDrawing] = useState(false);
  const [isEmpty, setIsEmpty] = useState(true);
  const [isSaved, setIsSaved] = useState(false);
  const [lastPoint, setLastPoint] = useState<{ x: number; y: number; time: number } | null>(null);

  const GOLD_INK = "#b49555";
  const MIN_WIDTH = 0.5;
  const MAX_WIDTH = 2.5;

  // Initialize and handle DPI scaling
  const setupCanvas = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    const dpr = window.devicePixelRatio || 1;
    const rect = canvas.getBoundingClientRect();
    
    // Set internal resolution
    canvas.width = rect.width * dpr;
    canvas.height = rect.height * dpr;
    
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.scale(dpr, dpr);
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = GOLD_INK;
    }
  };

  useEffect(() => {
    setupCanvas();
    window.addEventListener('resize', setupCanvas);
    return () => window.removeEventListener('resize', setupCanvas);
  }, []);

  const getCoordinates = (e: React.MouseEvent | React.TouchEvent) => {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    
    const clientX = 'touches' in e ? e.touches[0].clientX : e.clientX;
    const clientY = 'touches' in e ? e.touches[0].clientY : e.clientY;

    return {
      x: clientX - rect.left,
      y: clientY - rect.top,
    };
  };

  const startDrawing = (e: React.MouseEvent | React.TouchEvent) => {
    setIsDrawing(true);
    const { x, y } = getCoordinates(e);
    setLastPoint({ x, y, time: Date.now() });
    setIsEmpty(false);
  };

  const draw = (e: React.MouseEvent | React.TouchEvent) => {
    if (!isDrawing || !lastPoint) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!ctx) return;

    const { x, y } = getCoordinates(e);
    const now = Date.now();
    
    // Calculate velocity for variable width
    const dist = Math.sqrt(Math.pow(x - lastPoint.x, 2) + Math.pow(y - lastPoint.y, 2));
    const time = now - lastPoint.time;
    const velocity = dist / (time || 1);
    const targetWidth = Math.max(MIN_WIDTH, MAX_WIDTH - velocity * 0.5);
    
    ctx.lineWidth = targetWidth;
    ctx.beginPath();
    ctx.moveTo(lastPoint.x, lastPoint.y);
    ctx.lineTo(x, y);
    ctx.stroke();

    setLastPoint({ x, y, time: now });
  };

  const stopDrawing = () => {
    setIsDrawing(false);
    setLastPoint(null);
  };

  const clear = () => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (ctx && canvas) {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      setIsEmpty(true);
      setIsSaved(false);
    }
  };

  const save = () => {
    const canvas = canvasRef.current;
    if (canvas) {
      const dataUrl = canvas.toDataURL("image/png");
      setIsSaved(true);
      if (onSave) onSave(dataUrl);
    }
  };

  return (
    <div className={cn("space-y-4 w-full max-w-2xl mx-auto", className)}>
      <div className="flex items-center justify-between px-1">
        <div className="flex items-center gap-2">
          <PenTool className="h-3.5 w-3.5 text-accent" />
          <span className="heading-elegant text-[10px] text-accent tracking-widest uppercase">
            Signature Verification
          </span>
        </div>
        <AnimatePresence>
          {isSaved && (
            <motion.div 
              variants={hapticVariants} 
              initial="hidden" 
              animate="visible" 
              className="flex items-center gap-1.5 text-emerald-500"
            >
              <ShieldCheck className="h-3.5 w-3.5" />
              <span className="text-[9px] font-bold uppercase tracking-tighter">Authenticated</span>
            </motion.div>
          )}
        </AnimatePresence>
      </div>

      <div className="relative glass-card rounded-2xl border-accent/20 overflow-hidden bg-white/50 backdrop-blur-xl h-48 ring-1 ring-black/5 shadow-inner">
        <canvas
          ref={canvasRef}
          onMouseDown={startDrawing}
          onMouseMove={draw}
          onMouseUp={stopDrawing}
          onMouseLeave={stopDrawing}
          onTouchStart={startDrawing}
          onTouchMove={draw}
          onTouchEnd={stopDrawing}
          className="w-full h-full cursor-crosshair touch-none"
        />
        {isEmpty && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none opacity-20">
            <p className="heading-display text-xl italic font-light">Draw your consent</p>
          </div>
        )}
      </div>

      <div className="flex gap-3">
        <Button 
          variant="outline" 
          size="sm" 
          onClick={clear} 
          className="rounded-full flex-1 heading-elegant text-[10px] border-accent/10 hover:bg-accent/5 transition-colors"
        >
          <Eraser className="mr-2 h-3 w-3" /> Clear
        </Button>
        <Button 
          disabled={isEmpty || isSaved} 
          onClick={save} 
          size="sm" 
          className="rounded-full flex-[2] heading-elegant text-[10px] bg-primary shadow-lg hover:shadow-primary/20 transition-all hover:-translate-y-0.5 active:translate-y-0"
        >
          {isSaved ? "Verified" : "Submit Signature"}
        </Button>
      </div>
    </div>
  );
}