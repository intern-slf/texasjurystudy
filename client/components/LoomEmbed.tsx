"use client";

import { useState } from "react";
import { Play } from "lucide-react";

/**
 * Click-to-load Loom player.
 *
 * The iframe is not rendered until the viewer presses play, so opening a page
 * sends nothing to loom.com: no IP address, no Loom cookies, no thumbnail
 * request (which is why there is no preview image here either). This is the
 * promise made in Privacy §7 and §8, so do not swap it back to an eager iframe
 * or add a Loom-hosted poster image.
 */
export default function LoomEmbed({
  videoId,
  className = "rounded-xl",
}: {
  videoId: string;
  className?: string;
}) {
  const [loaded, setLoaded] = useState(false);

  if (loaded) {
    return (
      <div className={`aspect-video bg-slate-900 w-full overflow-hidden ${className}`}>
        {/* autoplay=1 so the click that loads the player also starts it;
            browsers that block autoplay just show Loom's own play button. */}
        <iframe
          src={`https://www.loom.com/embed/${videoId}?autoplay=1`}
          title="Loom video"
          allow="autoplay; fullscreen"
          allowFullScreen
          className="w-full h-full"
        />
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setLoaded(true)}
      className={`group aspect-video bg-slate-900 w-full flex flex-col items-center justify-center px-6 text-center ${className}`}
    >
      <span className="w-14 h-14 rounded-full bg-white/10 flex items-center justify-center mb-3 group-hover:bg-white/20 transition-colors">
        <Play className="w-6 h-6 fill-white text-white ml-0.5" />
      </span>
      <span className="text-sm font-semibold text-white">Play video</span>
      <span className="mt-1 max-w-xs text-[11px] leading-snug text-white/50">
        Plays from Loom. Pressing play connects your browser to loom.com.
      </span>
    </button>
  );
}
