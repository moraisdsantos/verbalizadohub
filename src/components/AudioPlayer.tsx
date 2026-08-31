import { CSSProperties, useEffect, useRef, useState } from "react";
import { audioStreamUrl } from "../lib/drive";
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
  }, [work.id]);

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
      setMessage(
        "Não foi possível carregar o áudio. Confira se a função audio-stream foi publicada no Supabase.",
      );
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
        src={audioStreamUrl(work.drive_file_id)}
        autoPlay={autoPlay}
        crossOrigin="anonymous"
        preload={autoPlay ? "auto" : "metadata"}
        onLoadedMetadata={(event) => setDuration(event.currentTarget.duration)}
        onDurationChange={(event) => setDuration(event.currentTarget.duration)}
        onCanPlay={() => void attemptAutoplay()}
        onTimeUpdate={(event) => setCurrentTime(event.currentTarget.currentTime)}
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => setIsPlaying(false)}
        onError={() =>
          setMessage(
            "Não foi possível carregar o áudio. Confira se a função audio-stream foi publicada no Supabase.",
          )
        }
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
          aria-label={
            isPlaying ? "Pausar audiodescrição" : "Reproduzir audiodescrição"
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

      </div>

      <p className="status-message" role="status" aria-live="polite">
        {message}
      </p>
    </section>
  );
}
