'use client';

import { useEffect, useRef } from 'react';
import Hls from 'hls.js';
import { getApiBaseUrl } from '@/lib/auth/session';

type Props = {
  /** Path relativo da API, ex.: /media/:id/hls/index.m3u8?token=... */
  playlistUrl: string;
  /** Disparado no timeupdate (para marcar assistido aos 90%). */
  onProgress?: (currentTime: number, duration: number) => void;
  /** Disparado quando o vídeo chega ao fim. */
  onEnded?: () => void;
};

/** Player HLS autenticado (token já embutido na URL). */
export function VideoPlayer({ playlistUrl, onProgress, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const onEndedRef = useRef(onEnded);
  const onProgressRef = useRef(onProgress);
  onEndedRef.current = onEnded;
  onProgressRef.current = onProgress;

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playlistUrl) return;

    const src = playlistUrl.startsWith('http') ? playlistUrl : `${getApiBaseUrl()}${playlistUrl}`;

    let hls: Hls | null = null;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
    } else if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
        // Cookies só na API; segmentos assinados no MinIO/CDN não usam credentials.
        xhrSetup(xhr, url) {
          try {
            const apiOrigin = new URL(getApiBaseUrl()).origin;
            const reqOrigin = new URL(url, window.location.href).origin;
            xhr.withCredentials = reqOrigin === apiOrigin;
          } catch {
            xhr.withCredentials = false;
          }
        },
      });
      hls.loadSource(src);
      hls.attachMedia(video);
    } else {
      video.src = src;
    }

    const reportProgress = () => {
      const duration = video.duration;
      if (!Number.isFinite(duration) || duration <= 0) return;
      onProgressRef.current?.(video.currentTime, duration);
    };
    const handleEnded = () => {
      reportProgress();
      onEndedRef.current?.();
    };
    video.addEventListener('timeupdate', reportProgress);
    video.addEventListener('seeked', reportProgress);
    video.addEventListener('ended', handleEnded);

    return () => {
      video.removeEventListener('timeupdate', reportProgress);
      video.removeEventListener('seeked', reportProgress);
      video.removeEventListener('ended', handleEnded);
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [playlistUrl]);

  return (
    <video
      ref={videoRef}
      controls
      playsInline
      style={{
        width: '100%',
        maxHeight: '70vh',
        background: '#0f172a',
        borderRadius: '0.5rem',
      }}
    />
  );
}
