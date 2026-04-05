import React, { useState } from 'react';
import { SocialDto, SocialType } from '../types';

/* ───────────────────────── Platform config ───────────────────────── */

const PLATFORM_ORDER: SocialType[] = [
  'steam', 'telegram', 'x', 'discord', 'battlenet', 'playstation',
  'xbox', 'epicgames', 'youtube', 'spotify',
];

const PLATFORM_LABELS: Record<SocialType, string> = {
  steam: 'Steam',
  telegram: 'Telegram',
  x: 'X',
  discord: 'Discord',
  battlenet: 'Battle.net',
  playstation: 'PlayStation',
  xbox: 'Xbox',
  epicgames: 'Epic Games',
  youtube: 'YouTube',
  spotify: 'Spotify',
};

/* ───────────────────────── SVG Icons ───────────────────────── */
/* Inline SVGs with official brand colors */

const SteamIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z"/>
  </svg>
);

const TelegramIcon = () => (
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <circle cx="12" cy="12" r="10" fill="#26A5E4"/>
    <path fill="#fff" d="M16.64 8.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69a.2.2 0 0 0-.05-.18c-.06-.05-.14-.03-.21-.02-.09.02-1.49.95-4.22 2.79-.4.27-.76.41-1.08.4-.36-.01-1.04-.2-1.55-.37-.63-.2-1.12-.31-1.08-.66.02-.18.27-.36.74-.55 2.92-1.27 4.86-2.11 5.83-2.51 2.78-1.16 3.35-1.36 3.73-1.36.08 0 .27.02.39.12.1.08.13.19.14.27-.01.06.01.24 0 .38z"/>
  </svg>
);

const XIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const DiscordIcon = () => (
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <path fill="#5865F2" d="M19.27 5.33C17.94 4.71 16.5 4.26 15 4a.09.09 0 0 0-.07.03c-.18.33-.39.76-.53 1.09a16.09 16.09 0 0 0-4.8 0c-.14-.34-.36-.76-.54-1.09-.01-.02-.04-.03-.07-.03-1.5.26-2.93.71-4.27 1.33-.01 0-.02.01-.03.02-2.72 4.07-3.47 8.03-3.1 11.95 0 .02.01.04.03.05 1.8 1.32 3.53 2.12 5.24 2.65.03.01.06 0 .07-.02.4-.55.76-1.13 1.07-1.74.02-.04 0-.08-.04-.09-.57-.22-1.11-.48-1.64-.78-.04-.02-.04-.08-.01-.11.11-.08.22-.17.33-.25.02-.02.05-.02.07-.01 3.44 1.57 7.15 1.57 10.55 0 .02-.01.05-.01.07.01.11.09.22.17.33.26.04.03.04.09-.01.11-.52.31-1.07.56-1.64.78-.04.01-.05.06-.04.09.32.61.68 1.19 1.07 1.74.03.01.06.02.09.01 1.72-.53 3.45-1.33 5.25-2.65.02-.01.03-.03.03-.05.44-4.53-.73-8.46-3.1-11.95-.01-.01-.02-.02-.04-.02zM8.52 14.91c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.84 2.12-1.89 2.12zm6.97 0c-1.03 0-1.89-.95-1.89-2.12s.84-2.12 1.89-2.12c1.06 0 1.9.96 1.89 2.12 0 1.17-.83 2.12-1.89 2.12z"/>
  </svg>
);

const BattlenetIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M18.94 8.296C15.9 6.892 11.534 6 7.426 6.332c.206-1.36.714-2.308 1.548-2.508 1.148-.275 2.4.48 3.594 1.854.782.102 1.71.28 2.355.429C12.747 2.013 9.828-.282 7.607.565c-1.688.644-2.553 2.97-2.448 6.094-2.2.468-3.915 1.3-5.013 2.495-.056.065-.181.227-.137.305.034.058.146-.008.194-.04 1.274-.89 2.904-1.373 5.027-1.676.303 3.333 1.713 7.56 4.055 10.952-1.28.502-2.356.536-2.946-.087-.812-.856-.784-2.318-.19-4.04a26.764 26.764 0 0 1-.807-2.254c-2.459 3.934-2.986 7.61-1.143 9.11 1.402 1.14 3.847.725 6.502-.926 1.505 1.672 3.083 2.74 4.667 3.094.084.015.287.043.332-.034.034-.06-.08-.124-.131-.149-1.408-.657-2.64-1.828-3.964-3.515 2.735-1.929 5.691-5.263 7.457-8.988 1.076.86 1.64 1.773 1.398 2.595-.336 1.131-1.615 1.84-3.403 2.185a27.697 27.697 0 0 1-1.548 1.826c4.634.16 8.08-1.22 8.458-3.565.286-1.786-1.295-3.696-4.053-5.17.696-2.139.832-4.04.346-5.588-.029-.08-.106-.27-.196-.27-.068 0-.067.13-.063.187.135 1.547-.263 3.2-1.062 5.19zm-8.533 9.869c-1.96-3.145-3.09-6.849-3.082-10.594 3.702-.124 7.474.748 10.714 2.627-1.743 3.269-4.385 6.1-7.633 7.966h.001z"/>
  </svg>
);

const PlayStationIcon = () => (
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <path fill="#003791" d="M8.985 2.596v17.548l3.915 1.261V6.688c0-.69.304-1.151.794-.991.636.18.76.814.76 1.505v5.876c2.441 1.193 4.362-.002 4.362-3.153 0-3.208-1.402-4.9-4.876-5.952a14.77 14.77 0 0 0-4.955-.367zm10.114 14.874c-1.123.655-3.473 1.135-3.473 1.135V20.8s2.4-.77 4.322-1.71c2.003-.98 1.542-2.192.568-2.66-1.003-.482-4.904-1.756-4.904-1.756v2.502s2.8.987 3.487 1.298c.686.31.34.667 0 .996zm-13.08.76c-2.03-.53-2.393-1.63-1.462-2.217.856-.542 2.312-1.037 2.312-1.037v-2.63s-3.024 1.154-4.34 1.797c-1.634.776-2.458 1.974-.992 3.157 1.372 1.106 4.482 1.935 4.482 1.935v-1.006z"/>
  </svg>
);

const XboxIcon = () => (
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <path fill="#107C10" d="M6.43 5.23a9.94 9.94 0 0 1 3.96-2.55A3.03 3.03 0 0 0 8.6 4.44c-.4.5-.76 1.07-1.1 1.62-.43-.36-.79-.6-1.07-.83zM4.73 7.25C3.03 9.2 2.14 11.5 2.14 12c0 2.5 1.17 4.76 3 6.3.36-.57 1.1-1.64 2.2-3.2 1.1-1.56 2.5-3.4 3.47-5.02-.97-1.14-2.23-2.33-3.5-3.18-.77-.52-1.8-1-2.58-.65zM12 4.07a10.18 10.18 0 0 0-1.6.2c.6.53 1.18 1.15 1.6 1.72.42-.57 1-1.19 1.6-1.72a10.18 10.18 0 0 0-1.6-.2zm5.57 1.16c-.28.22-.64.47-1.07.83-.34-.55-.7-1.12-1.1-1.62a3.03 3.03 0 0 0-1.79-1.76 9.94 9.94 0 0 1 3.96 2.55zm1.7 2.02c-.78-.35-1.81.13-2.58.65-1.27.85-2.53 2.04-3.5 3.18.97 1.62 2.37 3.46 3.47 5.02 1.1 1.56 1.84 2.63 2.2 3.2a9.97 9.97 0 0 0 3-6.3c0-.5-.89-2.8-2.59-5.75zM12 11.08c-.97 1.62-2.25 3.54-3.1 4.82-1.16 1.72-1.94 2.9-2.4 3.65a9.95 9.95 0 0 0 11 0c-.46-.75-1.24-1.93-2.4-3.65-.85-1.28-2.13-3.2-3.1-4.82z"/>
  </svg>
);

const EpicGamesIcon = () => (
  <svg viewBox="0 0 24 24" fill="currentColor" className="w-full h-full">
    <path d="M3.537 0C2.165 0 1.66.506 1.66 1.879V18.12c0 .05.005.1.006.15-.005.06-.006.117-.006.18 0 1.468 1.05 3.55 3.952 3.55h.01c.493 0 16.755 0 16.755 0V18h-13c-.58 0-1-.42-1-1V3c0-.58.42-1 1-1h13V0H3.537zM7.66 4v16h11V14h-5v-4h5V4h-11z"/>
  </svg>
);

const YouTubeIcon = () => (
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <path fill="#FF0000" d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814z"/>
    <path fill="#fff" d="M9.545 15.568V8.432L15.818 12z"/>
  </svg>
);

const SpotifyIcon = () => (
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <path fill="#1DB954" d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);

const PLATFORM_ICONS: Record<SocialType, React.FC> = {
  steam: SteamIcon,
  telegram: TelegramIcon,
  x: XIcon,
  discord: DiscordIcon,
  battlenet: BattlenetIcon,
  playstation: PlayStationIcon,
  xbox: XboxIcon,
  epicgames: EpicGamesIcon,
  youtube: YouTubeIcon,
  spotify: SpotifyIcon,
};

/* ───────────────────────── Public display ───────────────────────── */

interface ProfileSocialsDisplayProps {
  socials: SocialDto[];
}

export const ProfileSocialsDisplay: React.FC<ProfileSocialsDisplayProps> = ({ socials }) => {
  if (socials.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3 mb-1">
      {socials.map((s) => {
        const Icon = PLATFORM_ICONS[s.type];
        return (
          <a
            key={s.type}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-th-ring/5 hover:bg-th-ring/10 border border-th-border-2 transition-colors text-sm select-none"
            title={`${PLATFORM_LABELS[s.type]}: ${s.display}`}
          >
            <span className="w-5 h-5 shrink-0"><Icon /></span>
            <span className="truncate max-w-[140px] text-th-text-2 hover:text-th-text">{s.display}</span>
          </a>
        );
      })}
    </div>
  );
};

/* ───────────────────────── Edit mode ───────────────────────── */

interface ProfileSocialsEditorProps {
  userId: string;
  socials: SocialDto[];
  onSocialsChange: (socials: SocialDto[]) => void;
  disabled?: boolean;
}

export const ProfileSocialsEditor: React.FC<ProfileSocialsEditorProps> = ({
  userId,
  socials,
  onSocialsChange,
  disabled,
}) => {
  const [modal, setModal] = useState<{
    type: SocialType;
    mode: 'add' | 'manage' | 'edit';
    url: string;
    error: string | null;
    loading: boolean;
  } | null>(null);

  const [confirmDelete, setConfirmDelete] = useState<SocialType | null>(null);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const activeSocials = new Map(socials.map(s => [s.type, s]));

  const handleIconClick = (type: SocialType) => {
    if (disabled) return;
    const existing = activeSocials.get(type);
    if (existing) {
      setModal({ type, mode: 'manage', url: existing.url, error: null, loading: false });
    } else {
      setModal({ type, mode: 'add', url: '', error: null, loading: false });
    }
  };

  const handleSubmit = async () => {
    if (!modal) return;
    const isAdd = modal.mode === 'add';
    setModal(m => m ? { ...m, loading: true, error: null } : m);

    try {
      const res = await fetch(
        isAdd
          ? `/api/v1/users/${userId}/socials`
          : `/api/v1/users/${userId}/socials/${modal.type}`,
        {
          method: isAdd ? 'POST' : 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(isAdd
            ? { type: modal.type, url: modal.url.trim() }
            : { url: modal.url.trim() }
          ),
        },
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Ошибка');

      if (isAdd) {
        onSocialsChange([...socials, data.social]);
      } else {
        onSocialsChange(socials.map(s => s.type === modal.type ? data.social : s));
      }
      setModal(null);
    } catch (err: unknown) {
      setModal(m => m ? { ...m, loading: false, error: err instanceof Error ? err.message : 'Ошибка' } : m);
    }
  };

  const handleDelete = async (type: SocialType) => {
    setDeleteLoading(true);
    try {
      const res = await fetch(`/api/v1/users/${userId}/socials/${type}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Ошибка');
      }
      onSocialsChange(socials.filter(s => s.type !== type));
      setConfirmDelete(null);
      setModal(null);
    } catch {
      // item stays in place — user sees it is still there
    } finally {
      setDeleteLoading(false);
    }
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && modal && !modal.loading && modal.url.trim()) {
      e.preventDefault();
      handleSubmit();
    }
  };

  return (
    <div className="border-t border-th-border-2 pt-4">
      <div className="text-xs text-th-text-3 mb-3">Социальные сети</div>

      {/* Icon grid — 5 cols on mobile (44px+ touch targets), row of 9 on sm+ */}
      <div className="grid grid-cols-5 sm:grid-cols-10 gap-2">
        {PLATFORM_ORDER.map((type) => {
          const isActive = activeSocials.has(type);
          const Icon = PLATFORM_ICONS[type];
          return (
            <button
              key={type}
              type="button"
              onClick={() => handleIconClick(type)}
              disabled={disabled}
              /* 44×44px minimum tap target per Apple HIG / Material 3 guidelines */
              className={`
                flex items-center justify-center w-full aspect-square rounded-lg border transition-all
                ${isActive
                  ? 'bg-th-ring/10 border-th-border hover:bg-th-ring/15'
                  : 'bg-th-ring/[0.03] border-th-border-2 opacity-40 hover:opacity-70 hover:bg-th-ring/5 grayscale hover:grayscale-0'
                }
                disabled:pointer-events-none
              `}
              style={{ minWidth: 44, minHeight: 44 }}
              title={PLATFORM_LABELS[type]}
              aria-label={PLATFORM_LABELS[type]}
            >
              <span className="w-6 h-6"><Icon /></span>
            </button>
          );
        })}
      </div>

      {/* ── Add / Edit URL modal ── */}
      {modal && modal.mode !== 'manage' && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => !modal.loading && setModal(null)}
          /* Escape key support */
          onKeyDown={(e) => e.key === 'Escape' && !modal.loading && setModal(null)}
          role="dialog"
          aria-modal="true"
        >
          {/*
            Mobile: bottom-sheet (items-end + rounded-t-xl)
            Desktop: centered card (sm:rounded-xl)
            iOS safe area: env(safe-area-inset-bottom) padding
          */}
          <div
            className="bg-th-card border border-th-border rounded-t-xl sm:rounded-xl p-5 w-full sm:max-w-sm sm:mx-4 shadow-2xl"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-th-text font-medium mb-3">
              {modal.mode === 'add' ? PLATFORM_LABELS[modal.type] : `Изменить ${PLATFORM_LABELS[modal.type]}`}
            </div>

            <label className="block text-xs text-th-text-4 mb-1">Ссылка на профиль</label>
            <input
              type="url"
              inputMode="url"
              autoComplete="url"
              autoFocus
              value={modal.url}
              onChange={(e) => setModal(m => m ? { ...m, url: e.target.value, error: null } : m)}
              onKeyDown={handleKeyDown}
              placeholder="https://..."
              className="w-full bg-th-ring/5 rounded-lg px-3 py-2.5 text-sm text-th-text outline-none ring-1 ring-th-ring/10 placeholder:text-th-text-4 focus:ring-2 focus:ring-th-ring/20"
              disabled={modal.loading}
            />

            {modal.error && (
              <div className="mt-2 text-xs text-red-400">{modal.error}</div>
            )}

            <div className="flex gap-3 mt-4 justify-end">
              <button
                type="button"
                onClick={() => setModal(null)}
                disabled={modal.loading}
                className="px-4 py-2 text-sm text-th-text-4 hover:text-th-text transition-colors rounded"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={handleSubmit}
                disabled={modal.loading || !modal.url.trim()}
                className="px-4 py-2 text-sm bg-th-text text-th-page rounded-lg font-medium disabled:opacity-50 transition-opacity hover:opacity-90"
              >
                {modal.loading
                  ? 'Сохранение...'
                  : modal.mode === 'add' ? 'Добавить' : 'Сохранить'
                }
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── Manage modal (edit / delete choice) ── */}
      {modal && modal.mode === 'manage' && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => setModal(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-th-card border border-th-border rounded-t-xl sm:rounded-xl p-5 w-full sm:max-w-xs sm:mx-4 shadow-2xl"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-th-text font-medium mb-1">{PLATFORM_LABELS[modal.type]}</div>
            <div className="text-th-text-4 text-xs mb-4 truncate">{activeSocials.get(modal.type)?.display}</div>

            <div className="flex flex-col gap-2">
              <button
                type="button"
                onClick={() => setModal(m => m ? { ...m, mode: 'edit' } : m)}
                className="w-full px-4 py-2.5 text-sm text-th-text bg-th-ring/5 hover:bg-th-ring/10 border border-th-border-2 rounded-lg transition-colors text-left"
              >
                Поменять
              </button>
              <button
                type="button"
                onClick={() => { setConfirmDelete(modal.type); setModal(null); }}
                className="w-full px-4 py-2.5 text-sm text-red-500 bg-red-500/5 hover:bg-red-500/10 border border-red-500/20 rounded-lg transition-colors text-left"
              >
                Удалить
              </button>
            </div>

            <button
              type="button"
              onClick={() => setModal(null)}
              className="w-full mt-2 px-4 py-2 text-sm text-th-text-4 hover:text-th-text transition-colors text-center"
            >
              Отмена
            </button>
          </div>
        </div>
      )}

      {/* ── Confirm delete modal ── */}
      {confirmDelete && (
        <div
          className="fixed inset-0 z-50 flex items-end sm:items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => !deleteLoading && setConfirmDelete(null)}
          role="dialog"
          aria-modal="true"
        >
          <div
            className="bg-th-card border border-th-border rounded-t-xl sm:rounded-xl p-5 w-full sm:max-w-sm sm:mx-4 shadow-2xl"
            style={{ paddingBottom: 'max(1.25rem, env(safe-area-inset-bottom))' }}
            onClick={(e) => e.stopPropagation()}
          >
            <div className="text-th-text font-medium mb-2">Удалить ссылку?</div>
            <div className="text-th-text-3 text-sm mb-4">
              Вы уверены, что хотите удалить ссылку на {PLATFORM_LABELS[confirmDelete]}?
            </div>
            <div className="flex gap-3 justify-end">
              <button
                type="button"
                onClick={() => setConfirmDelete(null)}
                disabled={deleteLoading}
                className="px-4 py-1.5 text-sm text-th-text-4 hover:text-th-text transition-colors rounded"
              >
                Отмена
              </button>
              <button
                type="button"
                onClick={() => handleDelete(confirmDelete)}
                disabled={deleteLoading}
                className="px-4 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white rounded-lg font-medium disabled:opacity-50 transition-colors"
              >
                {deleteLoading ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
