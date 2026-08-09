import { motion, AnimatePresence } from 'framer-motion';
import { useRef, useState } from 'react';

interface Track {
  id: string;
  title: string;
  audioUrl: string;
}

interface MusicListProps {
  tracks: Track[];
}

/** Обратный отсчёт: 4:07, а для часовых миксов 1:02:15. */
function formatTime(seconds: number) {
  if (!isFinite(seconds) || seconds < 0) return '--:--';

  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');

  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}

export default function MusicList({ tracks }: MusicListProps) {
  // Один общий <audio> на весь список — значит одновременно играет только один трек
  const audioRef = useRef<HTMLAudioElement>(null);
  const barRef = useRef<HTMLDivElement>(null);

  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [failedId, setFailedId] = useState<string | null>(null);

  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  // Пока ползунок держат, трек продолжает играть с прежнего места, а шкала и
  // отсчёт показывают выбранную позицию. Перемотка происходит на отпускании.
  const [scrubTime, setScrubTime] = useState<number | null>(null);

  const play = (track: Track) => {
    const audio = audioRef.current;
    if (!audio) return;

    setFailedId(null);

    // Тот же трек — пауза/продолжить с текущего места
    if (currentId === track.id) {
      if (isPlaying) {
        audio.pause();
      } else {
        audio.play().catch(() => setFailedId(track.id));
      }
      return;
    }

    // Другой трек — переключаемся и играем с начала
    setCurrentId(track.id);
    setDuration(0);
    setCurrentTime(0);
    setScrubTime(null);
    audio.src = track.audioUrl;
    audio.currentTime = 0;
    audio.play().catch(() => {
      setFailedId(track.id);
      setCurrentId(null);
    });
  };

  /** Позиция под пальцем — только в состояние, звук не трогаем. */
  const trackPointer = (clientX: number) => {
    const el = barRef.current;
    if (!el || !duration) return;

    const rect = el.getBoundingClientRect();
    const ratio = Math.min(1, Math.max(0, (clientX - rect.left) / rect.width));
    setScrubTime(ratio * duration);
  };

  /** Отпустили — вот теперь перематываем. */
  const commitScrub = () => {
    const audio = audioRef.current;
    if (audio && scrubTime !== null) {
      audio.currentTime = scrubTime;
      setCurrentTime(scrubTime);
    }
    setScrubTime(null);
  };

  const scrubbing = scrubTime !== null;
  const displayTime = scrubTime ?? currentTime;
  const progress = duration > 0 ? Math.min(1, displayTime / duration) : 0;

  return (
    <div className="border-t border-zinc-800/50">
      {tracks.map((track, index) => {
        const isCurrent = currentId === track.id;
        const isActive = isCurrent && isPlaying;

        return (
          <motion.div
            key={track.id}
            initial={{ opacity: 0, y: 12 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, margin: '-60px' }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: Math.min(index, 8) * 0.04 }}
            className="flex items-center gap-4 py-5 border-b border-zinc-800/50"
          >
            {/* Название уезжает вверх, шкала приходит снизу — высота фиксирована,
                поэтому строка при этом не дёргается */}
            <div className="relative flex-1 min-w-0 h-7 flex items-center">
              <AnimatePresence initial={false} mode="wait">
                {isCurrent ? (
                  <motion.div
                    key="bar"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="absolute inset-x-0"
                  >
                    <div
                      ref={barRef}
                      role="slider"
                      tabIndex={0}
                      aria-label={`Seek ${track.title}`}
                      aria-valuemin={0}
                      aria-valuemax={Math.round(duration)}
                      aria-valuenow={Math.round(displayTime)}
                      onPointerDown={(e) => {
                        e.currentTarget.setPointerCapture(e.pointerId);
                        trackPointer(e.clientX);
                      }}
                      onPointerMove={(e) => scrubbing && trackPointer(e.clientX)}
                      onPointerUp={commitScrub}
                      onPointerCancel={() => setScrubTime(null)}
                      onKeyDown={(e) => {
                        const audio = audioRef.current;
                        if (!audio || !duration) return;
                        if (e.key === 'ArrowRight' || e.key === 'ArrowLeft') {
                          e.preventDefault();
                          const step = e.key === 'ArrowRight' ? 5 : -5;
                          audio.currentTime = Math.min(duration, Math.max(0, audio.currentTime + step));
                          setCurrentTime(audio.currentTime);
                        }
                      }}
                      className="group/bar py-2.5 -my-2.5 cursor-pointer touch-none select-none"
                    >
                      <div
                        className={`rounded-full bg-zinc-700 overflow-hidden transition-all duration-150 ${
                          scrubbing ? 'h-2' : 'h-1.5 group-hover/bar:h-2'
                        }`}
                      >
                        <div
                          className="h-full rounded-full bg-white"
                          style={{ width: `${progress * 100}%` }}
                        />
                      </div>
                    </div>
                  </motion.div>
                ) : (
                  <motion.button
                    key="title"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    onClick={() => play(track)}
                    className="absolute inset-x-0 text-left truncate text-lg text-zinc-400 hover:text-white transition-colors duration-200"
                  >
                    {track.title}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {failedId === track.id && (
              <span className="shrink-0 text-xs font-mono text-zinc-600">unavailable</span>
            )}

            <AnimatePresence initial={false}>
              {isCurrent && (
                <motion.time
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="shrink-0 font-mono text-xs text-zinc-500 tabular-nums"
                >
                  −{formatTime(duration - displayTime)}
                </motion.time>
              )}
            </AnimatePresence>

            <button
              onClick={() => play(track)}
              aria-label={isActive ? `Pause ${track.title}` : `Play ${track.title}`}
              className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-full border transition-colors duration-200 ${
                isActive
                  ? 'border-white bg-white text-black'
                  : 'border-zinc-700 text-zinc-300 hover:border-zinc-500 hover:text-white'
              }`}
            >
              {isActive ? (
                <svg className="w-4 h-4" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <rect x="6" y="5" width="4" height="14" rx="1" />
                  <rect x="14" y="5" width="4" height="14" rx="1" />
                </svg>
              ) : (
                <svg className="w-4 h-4 translate-x-[1px]" viewBox="0 0 24 24" fill="currentColor" aria-hidden="true">
                  <path d="M8 5.5v13a1 1 0 0 0 1.53.85l10-6.5a1 1 0 0 0 0-1.7l-10-6.5A1 1 0 0 0 8 5.5z" />
                </svg>
              )}
            </button>
          </motion.div>
        );
      })}

      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onLoadedMetadata={(e) => setDuration(e.currentTarget.duration || 0)}
        onDurationChange={(e) => setDuration(e.currentTarget.duration || 0)}
        onTimeUpdate={(e) => setCurrentTime(e.currentTarget.currentTime)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentId(null);
          setCurrentTime(0);
        }}
        onError={() => {
          // Шкала для трека, который не открылся, только мешает — возвращаем название
          setIsPlaying(false);
          setFailedId(currentId);
          setCurrentId(null);
        }}
      />
    </div>
  );
}
