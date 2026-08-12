/** Обратный отсчёт: 4:07, а для часовых миксов 1:02:15. */
export function formatTime(seconds: number): string {
  if (!isFinite(seconds) || seconds < 0) return '--:--';

  const total = Math.floor(seconds);
  const s = total % 60;
  const m = Math.floor(total / 60) % 60;
  const h = Math.floor(total / 3600);
  const pad = (n: number) => String(n).padStart(2, '0');

  return h > 0 ? `${h}:${pad(m)}:${pad(s)}` : `${m}:${pad(s)}`;
}
