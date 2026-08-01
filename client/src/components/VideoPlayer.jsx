import React from 'react';
import { VideoOff } from 'lucide-react';

/**
 * Universal Video Player Component for Vite
 * Handles:
 * 1. YouTube (watch, embed, short, shorts, and timestamped URLs)
 * 2. Vimeo (standard and player URLs)
 * 3. Google Drive video preview links
 * 4. Direct video files (.mp4, .webm, .ogg, .mov)
 * 5. General embed / iframe fallbacks
 */

// Parse YouTube URLs to extract 11-char Video ID and optional start timestamp
const parseYouTubeUrl = (url) => {
  if (!url) return null;
  const regExp = /^.*(youtu.be\/|v\/|u\/\w\/|embed\/|shorts\/|watch\?v=|\&v=)([^#\&\?]*).*/;
  const match = url.match(regExp);
  const videoId = (match && match[2].length === 11) ? match[2] : null;

  if (!videoId) return null;

  let startTime = 0;
  const startMatch = url.match(/[?&](?:start|t)=(\d+)/);
  if (startMatch) {
    startTime = parseInt(startMatch[1], 10);
  }

  return `https://www.youtube-nocookie.com/embed/${videoId}?autoplay=0&rel=0&modestbranding=1${startTime ? `&start=${startTime}` : ''}`;
};

// Parse Vimeo URLs
const parseVimeoUrl = (url) => {
  if (!url) return null;
  const match = url.match(/(?:vimeo\.com\/|player\.vimeo\.com\/video\/)(\d+)/);
  if (match) {
    return `https://player.vimeo.com/video/${match[1]}?title=0&byline=0&portrait=0`;
  }
  return null;
};

// Parse Google Drive Video Preview links
const parseGoogleDriveUrl = (url) => {
  if (!url) return null;
  const match = url.match(/drive\.google\.com\/file\/d\/([a-zA-Z0-9_-]+)/);
  if (match) {
    return `https://drive.google.com/file/d/${match[1]}/preview`;
  }
  return null;
};

// Check if URL is a direct video file
const isDirectVideoFile = (url) => {
  if (!url) return false;
  return /\.(mp4|webm|ogg|mov|m4v)(\?.*)?$/i.test(url);
};

const VideoPlayer = ({ url, title }) => {
  if (!url) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-gray-900 text-gray-400 p-6 text-center">
        <VideoOff className="h-10 w-10 text-gray-600 mb-2" />
        <p className="text-sm font-medium">No video content URL available for this module.</p>
      </div>
    );
  }

  // 1. YouTube Embed
  const youtubeEmbed = parseYouTubeUrl(url);
  if (youtubeEmbed) {
    return (
      <iframe
        src={youtubeEmbed}
        title={title || "YouTube Video Player"}
        className="w-full h-full border-0"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture; web-share"
        allowFullScreen
      />
    );
  }

  // 2. Vimeo Embed
  const vimeoEmbed = parseVimeoUrl(url);
  if (vimeoEmbed) {
    return (
      <iframe
        src={vimeoEmbed}
        title={title || "Vimeo Video Player"}
        className="w-full h-full border-0"
        allow="autoplay; fullscreen; picture-in-picture"
        allowFullScreen
      />
    );
  }

  // 3. Google Drive Embed
  const driveEmbed = parseGoogleDriveUrl(url);
  if (driveEmbed) {
    return (
      <iframe
        src={driveEmbed}
        title={title || "Google Drive Video Player"}
        className="w-full h-full border-0"
        allow="autoplay"
        allowFullScreen
      />
    );
  }

  // 4. Direct Video File (.mp4, .webm, etc.)
  if (isDirectVideoFile(url)) {
    return (
      <video
        src={url}
        controls
        controlsList="nodownload"
        className="w-full h-full object-contain bg-black"
      >
        Your browser does not support playing this video file.
      </video>
    );
  }

  // 5. Fallback iframe for any other web or embed player link
  return (
    <iframe
      src={url}
      title={title || "Course Module Video"}
      className="w-full h-full border-0"
      allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
      allowFullScreen
    />
  );
};

export default VideoPlayer;
