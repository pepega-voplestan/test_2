import { plural } from './plural';

/** Relative Russian timestamp matching site feed cards. */
export function formatCommentFeedTime(timestamp: string): string {
  try {
    const d = new Date(timestamp);
    if (Number.isNaN(d.getTime())) return '';
    const diffSec = Math.max(0, Math.floor((Date.now() - d.getTime()) / 1000));
    if (diffSec < 45) return 'только что';
    const mins = Math.floor(diffSec / 60);
    if (mins < 60) {
      return `${mins} ${plural(mins, { one: 'минуту', few: 'минуты', many: 'минут' })} назад`;
    }
    const hours = Math.floor(mins / 60);
    if (hours < 24) {
      return `${hours} ${plural(hours, { one: 'час', few: 'часа', many: 'часов' })} назад`;
    }
    const days = Math.floor(hours / 24);
    if (days < 7) {
      return `${days} ${plural(days, { one: 'день', few: 'дня', many: 'дней' })} назад`;
    }
    return d.toLocaleString('ru-RU', {
      day: 'numeric',
      month: 'short',
      hour: '2-digit',
      minute: '2-digit',
    });
  } catch {
    return '';
  }
}
