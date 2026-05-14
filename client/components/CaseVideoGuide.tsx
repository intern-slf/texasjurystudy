"use client";

import { useEffect, useState } from "react";
import { Play, X, ChevronDown, ChevronUp } from "lucide-react";
import {
  FOCUS_GROUP_VIDEOS,
  videosForFocusGroupType,
  focusGroupBlurb,
} from "@/lib/focus-group-videos";

function LoomPlayer({ url }: { url: string }) {
  if (!url) {
    return (
      <div className="aspect-video bg-slate-900 rounded-xl flex flex-col items-center justify-center">
        <div className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mb-3">
          <Play className="w-6 h-6 text-white/60 ml-0.5" />
        </div>
        <span className="text-xs text-white/40 font-medium">Video Pending</span>
      </div>
    );
  }
  const loomMatch = url.match(/loom\.com\/(?:share|embed)\/([a-zA-Z0-9]+)/);
  if (loomMatch) {
    return (
      <div className="aspect-video bg-slate-900 rounded-xl w-full overflow-hidden">
        <iframe
          src={`https://www.loom.com/embed/${loomMatch[1]}`}
          allow="fullscreen"
          allowFullScreen
          className="w-full h-full"
        />
      </div>
    );
  }
  return (
    <video
      src={url}
      controls
      controlsList="nodownload"
      className="aspect-video bg-slate-900 rounded-xl w-full object-cover"
    />
  );
}

export default function CaseVideoGuide({
  focusGroupType,
}: {
  focusGroupType: string | null | undefined;
}) {
  const [open, setOpen] = useState(false);
  const [openFaq, setOpenFaq] = useState<number | null>(null);

  useEffect(() => {
    if (!open) return;
    const prev = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") setOpen(false);
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = prev;
      window.removeEventListener("keydown", onKey);
    };
  }, [open]);

  if (!focusGroupType) return null;

  const faqVideos = videosForFocusGroupType(focusGroupType);

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className="group inline-flex items-center gap-2 rounded-full border border-slate-200 bg-white pl-1 pr-3.5 py-1 text-xs font-semibold text-slate-800 shadow-sm hover:border-slate-300 hover:bg-slate-50 hover:shadow-md transition-all duration-200"
      >
        <span className="relative flex items-center justify-center w-6 h-6 rounded-full bg-gradient-to-br from-slate-800 to-slate-900 text-white shadow-inner group-hover:scale-105 transition-transform">
          <Play className="h-3 w-3 fill-white ml-0.5" />
          <span className="absolute inset-0 rounded-full ring-2 ring-slate-900/0 group-hover:ring-slate-900/10 transition-all" />
        </span>
        <span className="tracking-wide">Video Guide</span>
      </button>

      {open && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 p-4"
          onClick={() => setOpen(false)}
        >
          <div
            className="bg-white rounded-2xl shadow-2xl w-full max-w-2xl max-h-[90vh] overflow-hidden flex flex-col"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="bg-slate-900 px-5 py-4 flex items-start justify-between gap-4">
              <div>
                <h3 className="text-base font-semibold text-white">
                  {focusGroupType} — Video Guide
                </h3>
                <p className="text-xs text-slate-400 mt-1">
                  Watch the overview
                  {faqVideos.length > 0 ? " and explore common questions below" : ""}
                </p>
              </div>
              <button
                type="button"
                onClick={() => setOpen(false)}
                className="text-slate-300 hover:text-white shrink-0 rounded-full p-1 hover:bg-white/10 transition-colors"
                aria-label="Close video guide"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <div className="overflow-y-auto">
              <div className="p-5 space-y-3">
                <LoomPlayer url={FOCUS_GROUP_VIDEOS.general.url} />
                <h4 className="text-sm font-semibold text-foreground leading-snug">
                  {FOCUS_GROUP_VIDEOS.general.title}
                </h4>
                <p className="text-xs text-muted-foreground leading-relaxed">
                  {focusGroupBlurb(focusGroupType)}
                </p>
              </div>

              {faqVideos.length > 0 && (
                <div className="border-t border-slate-200">
                  <div className="px-5 pt-4 pb-2">
                    <h4 className="text-[11px] font-bold uppercase tracking-widest text-muted-foreground">
                      Frequently Asked Questions
                    </h4>
                  </div>
                  <div className="px-5 pb-5 space-y-2">
                    {faqVideos.map((faq, idx) => {
                      const isOpen = openFaq === idx;
                      return (
                        <div
                          key={idx}
                          className="border border-slate-200 rounded-xl bg-white overflow-hidden shadow-sm"
                        >
                          <button
                            type="button"
                            onClick={() => setOpenFaq(isOpen ? null : idx)}
                            className="w-full flex items-start gap-3 px-4 py-3 text-left hover:bg-slate-50 transition-colors"
                          >
                            <span className="shrink-0 mt-0.5 w-5 h-5 rounded-full bg-slate-800 text-white text-[10px] font-bold flex items-center justify-center">
                              {idx + 1}
                            </span>
                            <span className="flex-1 text-sm font-medium text-slate-800 leading-snug">
                              {faq.question}
                            </span>
                            {isOpen ? (
                              <ChevronUp className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                            ) : (
                              <ChevronDown className="h-4 w-4 text-slate-400 shrink-0 mt-0.5" />
                            )}
                          </button>
                          {isOpen && (
                            <div className="px-4 pb-4 pt-1 border-t border-slate-100">
                              <LoomPlayer url={faq.url} />
                            </div>
                          )}
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </>
  );
}
