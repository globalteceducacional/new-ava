'use client';

import { useCallback, useEffect, useRef, useState, type KeyboardEvent } from 'react';
import Hls from 'hls.js';
import { getApiBaseUrl } from '@/lib/auth/session';

type Props = {
  /** Path relativo da API, ex.: /media/:id/hls/index.m3u8?token=... */
  playlistUrl: string;
  onProgress?: (currentTime: number, duration: number) => void;
  onEnded?: () => void;
};

const RATES = [0.75, 1, 1.25, 1.5, 2] as const;

function formatClock(seconds: number): string {
  if (!Number.isFinite(seconds) || seconds < 0) return '0:00';
  const s = Math.floor(seconds);
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const mm = h > 0 ? String(m).padStart(2, '0') : String(m);
  const ss = String(sec).padStart(2, '0');
  return h > 0 ? `${h}:${mm}:${ss}` : `${mm}:${ss}`;
}

/** Player HLS com barra no visual AVA (play, seek, volume, velocidade, tela cheia). */
export function VideoPlayer({ playlistUrl, onProgress, onEnded }: Props) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const rootRef = useRef<HTMLDivElement>(null);
  const hideTimer = useRef<number | null>(null);
  const onEndedRef = useRef(onEnded);
  const onProgressRef = useRef(onProgress);
  onEndedRef.current = onEnded;
  onProgressRef.current = onProgress;

  const [playing, setPlaying] = useState(false);
  const [current, setCurrent] = useState(0);
  const [duration, setDuration] = useState(0);
  const [buffered, setBuffered] = useState(0);
  const [volume, setVolume] = useState(1);
  const [muted, setMuted] = useState(false);
  const [rate, setRate] = useState(1);
  const [controlsOn, setControlsOn] = useState(true);
  const [fs, setFs] = useState(false);

  const pokeControls = useCallback(() => {
    setControlsOn(true);
    if (hideTimer.current) window.clearTimeout(hideTimer.current);
    hideTimer.current = window.setTimeout(() => {
      const v = videoRef.current;
      if (v && !v.paused) setControlsOn(false);
    }, 2500);
  }, []);

  useEffect(() => {
    const video = videoRef.current;
    if (!video || !playlistUrl) return;

    const src = playlistUrl.startsWith('http')
      ? playlistUrl
      : `${getApiBaseUrl()}${playlistUrl}`;

    let hls: Hls | null = null;

    if (video.canPlayType('application/vnd.apple.mpegurl')) {
      video.src = src;
    } else if (Hls.isSupported()) {
      hls = new Hls({
        enableWorker: true,
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

    const syncTime = () => {
      setCurrent(video.currentTime);
      const d = video.duration;
      if (Number.isFinite(d) && d > 0) {
        setDuration(d);
        onProgressRef.current?.(video.currentTime, d);
      }
      if (video.buffered.length > 0) {
        setBuffered(video.buffered.end(video.buffered.length - 1));
      }
    };
    const handleEnded = () => {
      setPlaying(false);
      setControlsOn(true);
      syncTime();
      onEndedRef.current?.();
    };

    video.addEventListener('timeupdate', syncTime);
    video.addEventListener('seeked', syncTime);
    video.addEventListener('progress', syncTime);
    video.addEventListener('durationchange', syncTime);
    video.addEventListener('play', () => setPlaying(true));
    video.addEventListener('pause', () => {
      setPlaying(false);
      setControlsOn(true);
    });
    video.addEventListener('ended', handleEnded);
    video.addEventListener('volumechange', () => {
      setVolume(video.volume);
      setMuted(video.muted);
    });

    return () => {
      video.removeEventListener('timeupdate', syncTime);
      video.removeEventListener('seeked', syncTime);
      video.removeEventListener('progress', syncTime);
      video.removeEventListener('durationchange', syncTime);
      video.removeEventListener('ended', handleEnded);
      hls?.destroy();
      video.removeAttribute('src');
      video.load();
    };
  }, [playlistUrl]);

  useEffect(() => {
    const onFs = () => setFs(Boolean(document.fullscreenElement));
    document.addEventListener('fullscreenchange', onFs);
    return () => document.removeEventListener('fullscreenchange', onFs);
  }, []);

  function togglePlay() {
    const video = videoRef.current;
    if (!video) return;
    if (video.paused) void video.play();
    else video.pause();
    pokeControls();
  }

  function seekTo(value: number) {
    const video = videoRef.current;
    if (!video || !Number.isFinite(value)) return;
    video.currentTime = Math.min(Math.max(0, value), duration || value);
  }

  function changeVolume(value: number) {
    const video = videoRef.current;
    if (!video) return;
    video.muted = value <= 0;
    video.volume = Math.min(1, Math.max(0, value));
  }

  function toggleMute() {
    const video = videoRef.current;
    if (!video) return;
    video.muted = !video.muted;
  }

  function changeRate(next: number) {
    const video = videoRef.current;
    if (!video) return;
    video.playbackRate = next;
    setRate(next);
  }

  async function toggleFullscreen() {
    const root = rootRef.current;
    if (!root) return;
    if (document.fullscreenElement) await document.exitFullscreen();
    else await root.requestFullscreen();
  }

  function onKey(e: KeyboardEvent<HTMLDivElement>) {
    const video = videoRef.current;
    if (!video) return;
    if (e.key === ' ' || e.key === 'k') {
      e.preventDefault();
      togglePlay();
    } else if (e.key === 'ArrowLeft') {
      e.preventDefault();
      seekTo(video.currentTime - 5);
    } else if (e.key === 'ArrowRight') {
      e.preventDefault();
      seekTo(video.currentTime + 5);
    } else if (e.key === 'm') {
      toggleMute();
    } else if (e.key === 'f') {
      void toggleFullscreen();
    }
  }

  const progressPct = duration > 0 ? (current / duration) * 100 : 0;
  const bufferPct = duration > 0 ? (buffered / duration) * 100 : 0;

  return (
    <div
      ref={rootRef}
      className={`ava-player${controlsOn || !playing ? ' is-controls' : ''}${fs ? ' is-fs' : ''}`}
      tabIndex={0}
      onMouseMove={pokeControls}
      onMouseLeave={() => {
        if (videoRef.current && !videoRef.current.paused) setControlsOn(false);
      }}
      onKeyDown={onKey}
      aria-label="Player de vídeo"
    >
      <video
        ref={videoRef}
        playsInline
        crossOrigin="use-credentials"
        className="ava-player-video"
        onClick={togglePlay}
        onDoubleClick={() => void toggleFullscreen()}
      />

      {!playing ? (
        <button
          type="button"
          className="ava-player-bigplay"
          onClick={togglePlay}
          aria-label="Reproduzir"
        >
          ▶
        </button>
      ) : null}

      <div className="ava-player-bar">
        <button
          type="button"
          className="ava-player-btn"
          onClick={togglePlay}
          aria-label={playing ? 'Pausar' : 'Reproduzir'}
        >
          {playing ? '❚❚' : '▶'}
        </button>

        <span className="ava-player-time">
          {formatClock(current)} / {formatClock(duration)}
        </span>

        <div className="ava-player-scrub">
          <div className="ava-player-buffer" style={{ width: `${bufferPct}%` }} />
          <div className="ava-player-played" style={{ width: `${progressPct}%` }} />
          <input
            type="range"
            min={0}
            max={duration || 0}
            step={0.1}
            value={current}
            aria-label="Posição do vídeo"
            onChange={(e) => seekTo(Number(e.target.value))}
          />
        </div>

        <button
          type="button"
          className="ava-player-btn"
          onClick={toggleMute}
          aria-label={muted || volume === 0 ? 'Ativar som' : 'Silenciar'}
        >
          {muted || volume === 0 ? '🔇' : '🔊'}
        </button>
        <input
          className="ava-player-vol"
          type="range"
          min={0}
          max={1}
          step={0.05}
          value={muted ? 0 : volume}
          aria-label="Volume"
          onChange={(e) => changeVolume(Number(e.target.value))}
        />

        <label className="ava-player-rate">
          <span className="sr-only">Velocidade</span>
          <select
            value={rate}
            aria-label="Velocidade de reprodução"
            onChange={(e) => changeRate(Number(e.target.value))}
          >
            {RATES.map((r) => (
              <option key={r} value={r}>
                {r === 1 ? '1×' : `${r}×`}
              </option>
            ))}
          </select>
        </label>

        <button
          type="button"
          className="ava-player-btn"
          onClick={() => void toggleFullscreen()}
          aria-label={fs ? 'Sair da tela cheia' : 'Tela cheia'}
        >
          {fs ? '✕' : '⛶'}
        </button>
      </div>
    </div>
  );
}
