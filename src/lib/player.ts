/**
 * Общий проигрыватель на весь сайт.
 *
 * Звук держит объект Audio, созданный в памяти, а не элемент в разметке:
 * при переходе между страницами Astro подменяет содержимое body, и любой
 * элемент оттуда исчез бы вместе с музыкой. Объект в модуле переживает
 * переходы, потому что страница не перезагружается.
 *
 * Подписчики — островки React на разных страницах: список на /media и
 * нижняя панель в общем шаблоне. Оба читают одно и то же состояние.
 */

export interface PlayerTrack {
  id: string;
  title: string;
  audioUrl: string;
}

export interface PlayerState {
  track: PlayerTrack | null;
  playing: boolean;
  duration: number;
  time: number;
  failedId: string | null;
  /** Продолжать список дальше, когда трек кончился */
  autoCue: boolean;
}

const INITIAL: PlayerState = {
  track: null,
  playing: false,
  duration: 0,
  time: 0,
  failedId: null,
  autoCue: false,
};

let state: PlayerState = INITIAL;
let audio: HTMLAudioElement | null = null;
/** Порядок треков со страницы — по нему auto cue ищет следующий */
let queue: PlayerTrack[] = [];
const listeners = new Set<() => void>();

function setState(patch: Partial<PlayerState>) {
  state = { ...state, ...patch };
  listeners.forEach((notify) => notify());
}

function ensureAudio(): HTMLAudioElement {
  if (audio) return audio;

  // Создаём лениво: на сервере никакого Audio нет
  audio = new Audio();
  audio.preload = 'none';

  audio.addEventListener('play', () => setState({ playing: true }));
  audio.addEventListener('pause', () => setState({ playing: false }));
  audio.addEventListener('timeupdate', () => setState({ time: audio!.currentTime }));

  const readDuration = () => setState({ duration: Number.isFinite(audio!.duration) ? audio!.duration : 0 });
  audio.addEventListener('loadedmetadata', readDuration);
  audio.addEventListener('durationchange', readDuration);

  audio.addEventListener('ended', () => {
    const next = state.autoCue ? nextAfter(state.track) : null;
    if (next) {
      start(next);
      return;
    }
    setState({ playing: false, track: null, time: 0, duration: 0 });
  });
  audio.addEventListener('error', () =>
    setState({ playing: false, failedId: state.track?.id ?? null, track: null, time: 0, duration: 0 })
  );

  return audio;
}

/** Следующий трек по списку; на последнем — ничего, список не зациклен */
function nextAfter(track: PlayerTrack | null): PlayerTrack | null {
  if (!track) return null;
  const index = queue.findIndex((t) => t.id === track.id);
  return index >= 0 ? queue[index + 1] ?? null : null;
}

function start(track: PlayerTrack) {
  const el = ensureAudio();
  setState({ track, duration: 0, time: 0, failedId: null });
  el.src = track.audioUrl;
  el.currentTime = 0;
  el.play().catch(() => setState({ failedId: track.id, track: null }));
}

export const player = {
  subscribe(notify: () => void) {
    listeners.add(notify);
    return () => {
      listeners.delete(notify);
    };
  },

  getSnapshot(): PlayerState {
    return state;
  },

  /** На сервере состояние всегда пустое — панель просто не рисуется */
  getServerSnapshot(): PlayerState {
    return INITIAL;
  },

  /** Тот же трек — пауза или продолжение, другой — переключение с начала */
  toggle(track: PlayerTrack) {
    const el = ensureAudio();
    setState({ failedId: null });

    if (state.track?.id === track.id) {
      if (state.playing) {
        el.pause();
      } else {
        el.play().catch(() => setState({ failedId: track.id, track: null }));
      }
      return;
    }

    start(track);
  },

  /** Список со страницы: нужен, только чтобы знать, что играть следующим */
  setQueue(tracks: PlayerTrack[]) {
    queue = tracks;
  },

  setAutoCue(on: boolean) {
    setState({ autoCue: on });
    try {
      localStorage.setItem('player:auto-cue', on ? '1' : '0');
    } catch {
      // приватный режим — просто не запоминаем
    }
  },

  /** Читается с задержкой, из эффекта: на сервере localStorage нет, а
      расхождение разметки при гидрации React ругался бы */
  restoreAutoCue() {
    try {
      if (localStorage.getItem('player:auto-cue') === '1') setState({ autoCue: true });
    } catch {
      // ничего не поделать
    }
  },

  seek(seconds: number) {
    const el = audio;
    if (!el || !state.duration) return;

    const clamped = Math.min(state.duration, Math.max(0, seconds));
    el.currentTime = clamped;
    setState({ time: clamped });
  },
};
