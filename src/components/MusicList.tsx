import { motion, AnimatePresence } from 'framer-motion';
import { useState, useSyncExternalStore } from 'react';
import { player, type PlayerTrack } from '../lib/player';
import { formatTime } from '../lib/formatTime';

interface MusicListProps {
  tracks: PlayerTrack[];
}

export default function MusicList({ tracks }: MusicListProps) {
  // Звук живёт в общем хранилище, поэтому переход на другую страницу
  // его не прерывает, а список просто отражает состояние
  const state = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getServerSnapshot);

  // Пока ползунок держат, трек продолжает играть с прежнего места, а шкала и
  // отсчёт показывают выбранную позицию. Перемотка происходит на отпускании.
  const [scrubTime, setScrubTime] = useState<number | null>(null);

  const commitScrub = () => {
    if (scrubTime !== null) player.seek(scrubTime);
    setScrubTime(null);
  };

  const scrubbing = scrubTime !== null;
  const displayTime = scrubTime ?? state.time;
  const progress = state.duration > 0 ? Math.min(1, displayTime / state.duration) : 0;

  return (
    <div className="border-t border-zinc-800/50">
      {tracks.map((track, index) => {
        const isActive = state.track?.id === track.id && state.playing;

        return (
          // Появляются сразу все: по скроллу последняя строка на телефоне
          // не дотягивала до порога видимости и её название ждало прокрутки
          <motion.div
            key={track.id}
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.4, ease: 'easeOut', delay: Math.min(index, 8) * 0.04 }}
            className="flex items-center gap-4 py-5 border-b border-zinc-800/50"
          >
            {/* Название уезжает вверх, шкала приходит снизу — высота фиксирована,
                поэтому строка при этом не дёргается */}
            <div className="relative flex-1 min-w-0 h-7 flex items-center">
              {/* Без mode="wait": название и шкала расходятся одновременно.
                  Последовательный обмен подвисал, если вкладка уходила в фон
                  посреди анимации, и шкала не появлялась вообще */}
              <AnimatePresence initial={false}>
                {isActive ? (
                  <motion.div
                    key="bar"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: 10 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    className="absolute inset-x-0"
                  >
                    {/* Рисуем шкалу сами, а тянет её невидимый нативный range:
                        он умеет и мышь, и палец, и клавиатуру без ручной возни
                        с pointer-событиями, на которой ломался тач */}
                    <div className="group/bar relative py-2.5 -my-2.5">
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

                      <input
                        type="range"
                        min={0}
                        max={state.duration || 0}
                        step="any"
                        value={displayTime}
                        disabled={!state.duration}
                        aria-label={`Seek ${track.title}`}
                        onPointerDown={() => setScrubTime(state.time)}
                        onTouchStart={() => setScrubTime(state.time)}
                        onChange={(e) => setScrubTime(Number(e.target.value))}
                        onPointerUp={commitScrub}
                        onTouchEnd={commitScrub}
                        onKeyUp={commitScrub}
                        onBlur={commitScrub}
                        className="absolute inset-0 w-full h-full opacity-0 cursor-pointer touch-none appearance-none bg-transparent"
                      />
                    </div>
                  </motion.div>
                ) : (
                  <motion.button
                    key="title"
                    initial={{ opacity: 0, y: 10 }}
                    animate={{ opacity: 1, y: 0 }}
                    exit={{ opacity: 0, y: -10 }}
                    transition={{ duration: 0.18, ease: 'easeOut' }}
                    onClick={() => player.toggle(track)}
                    className="absolute inset-x-0 text-left truncate text-lg text-zinc-400 hover:text-white transition-colors duration-200"
                  >
                    {track.title}
                  </motion.button>
                )}
              </AnimatePresence>
            </div>

            {state.failedId === track.id && (
              <span className="shrink-0 text-xs font-mono text-zinc-600">unavailable</span>
            )}

            <AnimatePresence initial={false}>
              {isActive && (
                <motion.time
                  initial={{ opacity: 0 }}
                  animate={{ opacity: 1 }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.18 }}
                  className="shrink-0 font-mono text-xs text-zinc-500 tabular-nums"
                >
                  −{formatTime(state.duration - displayTime)}
                </motion.time>
              )}
            </AnimatePresence>

            <button
              onClick={() => player.toggle(track)}
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
    </div>
  );
}
