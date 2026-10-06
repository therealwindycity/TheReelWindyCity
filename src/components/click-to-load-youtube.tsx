"use client";

import { useState } from "react";
import { Play } from "lucide-react";

type ClickToLoadYouTubeProps = {
  videoId: string;
  title: string;
  startSeconds?: number;
};

/** A YouTube player that makes no third-party request until the visitor clicks. */
export default function ClickToLoadYouTube({ videoId, title, startSeconds = 0 }: ClickToLoadYouTubeProps) {
  const [loaded, setLoaded] = useState(false);
  if (!/^[A-Za-z0-9_-]{11}$/.test(videoId)) return null;

  if (!loaded) {
    return (
      <button
        type="button"
        className="video-load-button"
        aria-label={`Load video from YouTube: ${title}`}
        onClick={() => setLoaded(true)}
      >
        <span className="video-load-icon"><Play size={24} fill="currentColor" aria-hidden="true"/></span>
        <strong>Load video from YouTube</strong>
        <small>The external player loads only after you choose it.</small>
      </button>
    );
  }

  const start = Number.isFinite(startSeconds) && startSeconds > 0 ? `?start=${Math.floor(startSeconds)}` : "";
  return (
    <iframe
      src={`https://www.youtube-nocookie.com/embed/${encodeURIComponent(videoId)}${start}`}
      title={title}
      loading="lazy"
      referrerPolicy="strict-origin-when-cross-origin"
      allow="accelerometer; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
      allowFullScreen
    />
  );
}
