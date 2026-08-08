import { motion } from 'framer-motion';
import { useRef, useState } from 'react';

interface Track {
  id: string;
  title: string;
  audioUrl: string;
}

interface MusicListProps {
  tracks: Track[];
}

export default function MusicList({ tracks }: MusicListProps) {
  // Один общий <audio> на весь список — значит одновременно играет только один трек
  const audioRef = useRef<HTMLAudioElement>(null);
  const [currentId, setCurrentId] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [failedId, setFailedId] = useState<string | null>(null);

  const toggle = (track: Track) => {
    const audio = audioRef.current;
    if (!audio) return;

    setFailedId(null);

    // Тот же трек — просто пауза/продолжить с текущего места
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
    audio.src = track.audioUrl;
    audio.currentTime = 0;
    audio.play().catch(() => setFailedId(track.id));
  };

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
            className="border-b border-zinc-800/50"
          >
            <button
              onClick={() => toggle(track)}
              aria-label={isActive ? `Pause ${track.title}` : `Play ${track.title}`}
              className="group w-full flex items-center gap-4 py-5 text-left"
            >
              <span
                className={`flex-1 min-w-0 truncate text-lg transition-colors duration-200 ${
                  isCurrent ? 'text-white' : 'text-zinc-400 group-hover:text-white'
                }`}
              >
                {track.title}
              </span>

              {failedId === track.id && (
                <span className="text-xs font-mono text-zinc-600 shrink-0">unavailable</span>
              )}

              <span
                className={`shrink-0 flex items-center justify-center w-10 h-10 rounded-full border transition-colors duration-200 ${
                  isActive
                    ? 'border-white bg-white text-black'
                    : 'border-zinc-700 text-zinc-300 group-hover:border-zinc-500 group-hover:text-white'
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
              </span>
            </button>
          </motion.div>
        );
      })}

      <audio
        ref={audioRef}
        preload="none"
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onEnded={() => {
          setIsPlaying(false);
          setCurrentId(null);
        }}
        onError={() => {
          setIsPlaying(false);
          setFailedId(currentId);
        }}
      />
    </div>
  );
}
