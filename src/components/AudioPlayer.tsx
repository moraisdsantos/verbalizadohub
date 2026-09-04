import { CSSProperties, useEffect, useMemo, useRef, useState } from "react";
import { audioSourceUrls, googleDriveViewUrl } from "../lib/drive";
import type { AudioWork } from "../types";

function formatTime(value: number) {
  if (!Number.isFinite(value)) return "0:00";
  const minutes = Math.floor(value / 60);
  const seconds = Math.floor(value % 60)
    .toString()
    .padStart(2, "0");
  return `${minutes}:${seconds}`;
}

export default function AudioPlayer({
  work,
  autoPlay = false,
}: {
  work: AudioWork;
  autoPlay?: boolean;
}) {
  const audioRef = useRef<HTMLAudioElement>(null);
  const autoplayAttemptedRef = useRef(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [speed, setSpeed] = useState(1);
  const [message, setMessage] = useState("");
  const [sourceIndex, setSourceIndex] = useState(0);
  const [streamUnavailable, setStreamUnavailable] = useState(false);
  const sourceUrls = useMemo(
    () => audioSourceUrls(work.drive_file_id),
    [work.drive_file_id],
  );
  const sourceUrl = streamUnavailable ? undefined : sourceUrls[sourceIndex];
  const progress = duration ? (currentTime / duration) * 100 : 0;
  const contactUrl = import.meta.env.VITE_CONTACT_URL?.trim() ?? "";

  useEffect(() => {
    if (audioRef.current) audioRef.current.playbackRate = speed;
  }, [speed]);

  useEffect(() => {
    autoplayAttemptedRef.current = false;
    setIsPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setMessage("");
    setSourceIndex(0);
    setStreamUnavailable(false);
  }, [work.drive_file_id, work.id]);

  function handleCanPlay() {
    if (sourceIndex > 0) {
      setMessage(
        "Reprodução em modo de contingência pelo link direto do Google Drive.",
      );
    }
    void attemptAutoplay();
  }

  function handleAudioError() {
    setIsPlaying(false);
    if (sourceIndex + 1 < sourceUrls.length) {
      autoplayAttemptedRef.current = false;
      setCurrentTime(0);
      setDuration(0);
      setSourceIndex((current) => current + 1);
      setMessage(
        "O servidor principal está indisponível. Tentando o áudio diretamente pelo Google Drive…",
      );
      return;
    }

    setStreamUnavailable(true);
    setMessage(
      "Não foi possível reproduzir no player. Abra o arquivo diretamente no Google Drive.",
    );
  }

  async function attemptAutoplay() {
    const audio = audioRef.current;
    if (!autoPlay || !audio || autoplayAttemptedRef.current) return;
    autoplayAttemptedRef.current = true;

    try {
      await audio.play();
      setMessage("");
    } catch {
      setMessage(
        "O navegador bloqueou a reprodução automática. Toque em reproduzir para ouvir a audiodescrição.",
      );
    }
  }

  async function togglePlayback() {
    const audio = audioRef.current;
    if (!audio) return;

    try {
      if (audio.paused) await audio.play();
      else audio.pause();
      setMessage("");
    } catch {
      handleAudioError();
    }
  }

  function changeSpeed(nextSpeed: number) {
    setSpeed(nextSpeed);
    if (audioRef.current) audioRef.current.playbackRate = nextSpeed;
  }

  return (
    <section className="player-card" aria-labelledby={`work-title-${work.id}`}>
      <audio
        ref={audioRef}
        src={sourceUrl}
        autoPlay={autoPlay}
        preload={autoPlay ? "auto" : "metadata"}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onCanPlay={handleCanPlay}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={handleAudioError}
      />

      <header className="player-header">
        <h1 id={`work-title-${work.id}`}>{work.title}</h1>
      </header>

      <div
        className="media-options"
        aria-label="Recurso de acessibilidade disponível"
      >
        <span className="media-pill active">
          <span className="ad-mark" aria-hidden="true">
            AD
          </span>
          Audiodescrição
        </span>
      </div>

      <div className="control-row">
        <button
          className={`play-button ${isPlaying ? "playing" : ""}`}
          type="button"
          onClick={togglePlayback}
          disabled={streamUnavailable}
          aria-label={
            streamUnavailable
              ? "Áudio indisponível no player"
              : isPlaying
                ? "Pausar audiodescrição"
                : "Reproduzir audiodescrição"
          }
        >
          <span className="play-icon" aria-hidden="true" />
        </button>

        <fieldset className="speed-control">
          <legend>
            <span aria-hidden="true" className="speed-icon">
              »
            </span>
            Velocidade do áudio
          </legend>
          <div className="speed-buttons">
            {[1, 1.5, 2].map((option) => (
              <button
                key={option}
                type="button"
                className={speed === option ? "selected" : ""}
                aria-pressed={speed === option}
                onClick={() => changeSpeed(option)}
              >
                {option}x
              </button>
            ))}
          </div>
        </fieldset>
      </div>

      <div className="timeline">
        <input
          className="progress-slider"
          type="range"
          min="0"
          max={duration || 0}
          step="0.1"
          value={currentTime}
          aria-label="Posição do áudio"
          aria-valuetext={`${formatTime(currentTime)} de ${formatTime(duration)}`}
          disabled={!duration}
          style={{ "--progress": `${progress}%` } as CSSProperties}
          onChange={(event) => {
            const nextTime = Number(event.target.value);
            setCurrentTime(nextTime);
            if (audioRef.current) audioRef.current.currentTime = nextTime;
          }}
        />
        <div className="time-labels" aria-hidden="true">
          <span>{formatTime(currentTime)}</span>
          <span>{formatTime(duration)}</span>
        </div>
      </div>

      <div className="player-footer">
        {contactUrl ? (
          <a className="contact-link" href={contactUrl}>
            <span aria-hidden="true">＋</span>
            Fale com a ver.balizado
          </a>
        ) : (
          <button
            className="contact-link"
            type="button"
            onClick={() => setMessage("O canal de contato será configurado em breve.")}
          >
            <span aria-hidden="true">＋</span>
            Fale com a ver.balizado
          </button>
        )}

        {streamUnavailable ? (
          <a
            className="drive-fallback-link"
            href={googleDriveViewUrl(work.drive_file_id)}
            target="_blank"
            rel="noreferrer"
          >
            Abrir áudio no Google Drive ↗
          </a>
        ) : null}

      </div>

      <p className="status-message" role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
