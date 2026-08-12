import { useEffect, useSyncExternalStore } from 'react';
import { player } from '../lib/player';

/**
 * Переключатель auto cue: когда включён, следующий трек стартует сразу
 * после конца предыдущего, без нажатий. На последнем треке список
 * останавливается — по кругу не идёт.
 */
export default function AutoCue() {
  const state = useSyncExternalStore(player.subscribe, player.getSnapshot, player.getServerSnapshot);

  // Читаем сохранённое положение после гидрации: на сервере localStorage нет,
  // а если отрисовать по-разному, React пожалуется на расхождение разметки
  useEffect(() => {
    player.restoreAutoCue();
  }, []);

  return (
    <button
      role="switch"
      aria-checked={state.autoCue}
      onClick={() => player.setAutoCue(!state.autoCue)}
      // mb — чтобы центр переключателя встал ровно на строку подзаголовка
      className="group flex items-center gap-2.5 shrink-0 mb-[2px]"
    >
      <span
        className={`font-mono text-xs tracking-wide transition-colors duration-200 ${
          state.autoCue ? 'text-white' : 'text-zinc-500 group-hover:text-zinc-300'
        }`}
      >
        auto cue
      </span>

      <span
        className={`relative w-9 h-5 rounded-full border transition-colors duration-200 ${
          state.autoCue ? 'bg-white border-white' : 'bg-transparent border-zinc-700 group-hover:border-zinc-500'
        }`}
      >
        <span
          className={`absolute top-1/2 -translate-y-1/2 w-3 h-3 rounded-full transition-all duration-200 ${
            state.autoCue ? 'left-[18px] bg-black' : 'left-1 bg-zinc-600 group-hover:bg-zinc-400'
          }`}
        />
      </span>
    </button>
  );
}
