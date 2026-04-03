import React, { useState } from 'react';
import { SocialType, SocialDto } from '../types';

/* ─── Platform config ─── */

interface PlatformInfo {
  label: string;
  icon: React.FC<{ className?: string }>;
}

const PLATFORM_ORDER: SocialType[] = [
  'steam', 'telegram', 'x', 'battlenet', 'playstation',
  'xbox', 'epicgames', 'youtube', 'spotify',
];

/* ─── SVG Icons (inline, 24×24) ─── */

const SteamIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.48 2 2 6.48 2 12c0 4.84 3.44 8.87 8 9.8v-1.05c-1.3-.25-2.5-.83-3.46-1.66l2.4-1c.47.28 1.01.46 1.58.52l.02.01c.15.02.3.03.46.03 1.93 0 3.5-1.57 3.5-3.5 0-.16-.01-.31-.03-.46l-1-2.4A4.49 4.49 0 0 0 17 8.5 4.5 4.5 0 0 0 12.5 4c-.16 0-.31.01-.46.03L9.64 2.63A9.96 9.96 0 0 1 12 2zm0 4.5a2.5 2.5 0 1 1 0 5 2.5 2.5 0 0 1 0-5zm-4.5 5a2.5 2.5 0 0 1 2.12 1.18l-1.74.72a1 1 0 1 0 .74 1.86l1.74-.72c.02.16.04.32.04.46a2.5 2.5 0 1 1-2.9-3.5z"/>
  </svg>
);

const TelegramIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm4.64 6.8c-.15 1.58-.8 5.42-1.13 7.19-.14.75-.42 1-.68 1.03-.58.05-1.02-.38-1.58-.75-.88-.58-1.38-.94-2.23-1.5-.99-.65-.35-1.01.22-1.59.15-.15 2.71-2.48 2.76-2.69.01-.03.01-.14-.07-.2-.08-.06-.19-.04-.27-.02-.12.03-1.97 1.25-5.55 3.67-.53.36-1 .54-1.42.53-.47-.01-1.37-.26-2.03-.48-.82-.27-1.47-.41-1.41-.87.03-.24.37-.49 1.02-.74 3.98-1.73 6.64-2.87 7.97-3.44 3.8-1.58 4.59-1.86 5.1-1.87.11 0 .37.03.54.17.14.12.18.28.2.45-.01.06.01.24 0 .37z"/>
  </svg>
);

const XIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/>
  </svg>
);

const BattleNetIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.477 2 2 6.477 2 12s4.477 10 10 10 10-4.477 10-10S17.523 2 12 2zm0 1.5c4.687 0 8.5 3.813 8.5 8.5 0 1.55-.42 3-1.15 4.25l-3.1-1.5c.16-.4.25-.83.25-1.25 0-1.93-1.57-3.5-3.5-3.5S9.5 11.57 9.5 13.5c0 .42.09.85.25 1.25l-3.1 1.5A8.46 8.46 0 0 1 3.5 12c0-4.687 3.813-8.5 8.5-8.5z"/>
  </svg>
);

const PlayStationIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M9.5 2v16.54l-4.7-1.6c-.64-.22-.87-.65-.53-1.02.34-.37 1.05-.65 1.05-.65L9.5 13.8V11l-6.7 2.27s-1.64.58-2.38 1.42C-.26 15.54.04 16.64 1.35 17.2l8.15 3.1V2zm5 6.13v6.74l3.2-1.08s.64-.22.87-.65c.32-.6-.2-1.02-.2-1.02L15 10.35v-2.2l5.5 1.87c1.23.42 1.73 1.3 1.13 2.32-.6 1.02-2.2 1.76-2.2 1.76L9.5 18.53v2.34l9.55-3.64s2.6-.98 3.43-2.27c.82-1.3.6-2.72-.98-3.27L14.5 8.13z"/>
  </svg>
);

const XboxIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 2C6.48 2 2 6.48 2 12s4.48 10 10 10 10-4.48 10-10S17.52 2 12 2zm0 2c1.3 0 2.53.32 3.62.87-.5.35-1.05.82-1.62 1.42-.6-.24-1.28-.39-2-.39s-1.4.15-2 .39c-.57-.6-1.12-1.07-1.62-1.42A7.95 7.95 0 0 1 12 4zM5.85 6.15c.7.45 1.43 1.1 2.15 1.95C6.45 9.5 5.5 11.4 5.5 13.5c0 .7.1 1.37.27 2.02A7.96 7.96 0 0 1 4 12c0-2.2.9-4.2 2.35-5.65l-.5-.2zm12.3 0-.5.2A7.96 7.96 0 0 1 20 12a7.96 7.96 0 0 1-1.77 3.52c.17-.65.27-1.32.27-2.02 0-2.1-.95-4-2.5-5.4.72-.85 1.45-1.5 2.15-1.95zM12 7.5c1.4 0 2.65.6 3.55 1.55.9.95 1.45 2.3 1.45 3.95 0 2.5-1.5 5-5 7.5-3.5-2.5-5-5-5-7.5 0-1.65.55-3 1.45-3.95A4.85 4.85 0 0 1 12 7.5z"/>
  </svg>
);

const EpicGamesIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M3.537 0C2.165 0 1.66.506 1.66 1.879V18.12c0 .707.199 1.18.575 1.46.337.252.744.333 1.252.333h.087c.251-.02.478-.062.684-.126l8.462-2.896c.326-.12.5-.36.5-.7V6.803c0-.34-.174-.58-.5-.7L4.26 3.207a1.6 1.6 0 0 0-.55-.103c-.273 0-.51.09-.69.26-.192.182-.288.43-.288.744v8.894c0 .34.174.58.5.7l3.07 1.05c.327.12.5.36.5.7v1.6c0 .34-.173.58-.5.7l-1.16.396c-.326.12-.5-.012-.5-.352V7.1c0-.34.174-.58.5-.7l1.16-.396c.327-.12.5.012.5.352v7.043l4.22-1.442V4.62c0-.34-.174-.58-.5-.7L3.988.1A1.63 1.63 0 0 0 3.537 0zM17 6v12h2V6zm4 0v12h-1V6z"/>
  </svg>
);

const YouTubeIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M23.498 6.186a3.016 3.016 0 0 0-2.122-2.136C19.505 3.545 12 3.545 12 3.545s-7.505 0-9.377.505A3.017 3.017 0 0 0 .502 6.186C0 8.07 0 12 0 12s0 3.93.502 5.814a3.016 3.016 0 0 0 2.122 2.136c1.871.505 9.376.505 9.376.505s7.505 0 9.377-.505a3.015 3.015 0 0 0 2.122-2.136C24 15.93 24 12 24 12s0-3.93-.502-5.814zM9.545 15.568V8.432L15.818 12l-6.273 3.568z"/>
  </svg>
);

const SpotifyIcon: React.FC<{ className?: string }> = ({ className }) => (
  <svg className={className} viewBox="0 0 24 24" fill="currentColor" xmlns="http://www.w3.org/2000/svg">
    <path d="M12 0C5.4 0 0 5.4 0 12s5.4 12 12 12 12-5.4 12-12S18.66 0 12 0zm5.521 17.34c-.24.359-.66.48-1.021.24-2.82-1.74-6.36-2.101-10.561-1.141-.418.122-.779-.179-.899-.539-.12-.421.18-.78.54-.9 4.56-1.021 8.52-.6 11.64 1.32.42.18.479.659.301 1.02zm1.44-3.3c-.301.42-.841.6-1.262.3-3.239-1.98-8.159-2.58-11.939-1.38-.479.12-1.02-.12-1.14-.6-.12-.48.12-1.021.6-1.141C9.6 9.9 15 10.561 18.72 12.84c.361.181.54.78.241 1.2zm.12-3.36C15.24 8.4 8.82 8.16 5.16 9.301c-.6.179-1.2-.181-1.38-.721-.18-.601.18-1.2.72-1.381 4.26-1.26 11.28-1.02 15.721 1.621.539.3.719 1.02.419 1.56-.299.421-1.02.599-1.559.3z"/>
  </svg>
);

const PLATFORMS: Record<SocialType, PlatformInfo> = {
  steam: { label: 'Steam', icon: SteamIcon },
  telegram: { label: 'Telegram', icon: TelegramIcon },
  x: { label: 'X', icon: XIcon },
  battlenet: { label: 'Battle.net', icon: BattleNetIcon },
  playstation: { label: 'PlayStation', icon: PlayStationIcon },
  xbox: { label: 'Xbox', icon: XboxIcon },
  epicgames: { label: 'Epic Games', icon: EpicGamesIcon },
  youtube: { label: 'YouTube', icon: YouTubeIcon },
  spotify: { label: 'Spotify', icon: SpotifyIcon },
};

/* ─── Props ─── */

interface ProfileSocialsDisplayProps {
  userId: string;
  socials: SocialDto[];
}

interface ProfileSocialsEditProps {
  userId: string;
  socials: SocialDto[];
  onSocialsChange: (socials: SocialDto[]) => void;
}

/* ─── Public display (read-only) ─── */

export const ProfileSocialsDisplay: React.FC<ProfileSocialsDisplayProps> = ({ socials }) => {
  if (socials.length === 0) return null;

  return (
    <div className="flex flex-wrap gap-2 mt-3 mb-1">
      {socials.map((s) => {
        const platform = PLATFORMS[s.type];
        if (!platform) return null;
        const Icon = platform.icon;
        return (
          <a
            key={s.type}
            href={s.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-th-ring/5 hover:bg-th-ring/10 border border-th-ring/10 text-th-text-2 hover:text-th-text text-xs transition-colors"
            title={`${platform.label}: ${s.display}`}
          >
            <Icon className="w-3.5 h-3.5 shrink-0" />
            <span className="truncate max-w-[140px]">{s.display}</span>
          </a>
        );
      })}
    </div>
  );
};

/* ─── Edit mode ─── */

export const ProfileSocialsEdit: React.FC<ProfileSocialsEditProps> = ({ userId, socials, onSocialsChange }) => {
  const [modalType, setModalType] = useState<SocialType | null>(null);
  const [modalMode, setModalMode] = useState<'add' | 'manage' | 'edit'>('add');
  const [urlInput, setUrlInput] = useState('');
  const [modalError, setModalError] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);

  const activeSocials = new Map(socials.map(s => [s.type, s]));

  const openAdd = (type: SocialType) => {
    setModalType(type);
    setModalMode('add');
    setUrlInput('');
    setModalError(null);
    setConfirmDelete(false);
  };

  const openManage = (type: SocialType) => {
    setModalType(type);
    setModalMode('manage');
    setUrlInput('');
    setModalError(null);
    setConfirmDelete(false);
  };

  const openEdit = () => {
    const existing = activeSocials.get(modalType!);
    setModalMode('edit');
    setUrlInput(existing?.url || '');
    setModalError(null);
    setConfirmDelete(false);
  };

  const closeModal = () => {
    setModalType(null);
    setModalError(null);
    setConfirmDelete(false);
  };

  const handleAdd = async () => {
    if (!modalType || !urlInput.trim()) return;
    setModalLoading(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/v1/users/${userId}/socials`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: modalType, url: urlInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ошибка');
      onSocialsChange([...socials, data.social]);
      closeModal();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setModalLoading(false);
    }
  };

  const handleUpdate = async () => {
    if (!modalType || !urlInput.trim()) return;
    setModalLoading(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/v1/users/${userId}/socials/${modalType}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ url: urlInput.trim() }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ошибка');
      onSocialsChange(socials.map(s => s.type === modalType ? data.social : s));
      closeModal();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setModalLoading(false);
    }
  };

  const handleDelete = async () => {
    if (!modalType) return;
    setModalLoading(true);
    setModalError(null);
    try {
      const res = await fetch(`/api/v1/users/${userId}/socials/${modalType}`, {
        method: 'DELETE',
        credentials: 'include',
      });
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Ошибка');
      }
      onSocialsChange(socials.filter(s => s.type !== modalType));
      closeModal();
    } catch (err: unknown) {
      setModalError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setModalLoading(false);
    }
  };

  const modalPlatform = modalType ? PLATFORMS[modalType] : null;

  return (
    <div className="border-t border-th-border-2 pt-4">
      <div className="text-xs text-th-text-3 mb-3">Социальные сети</div>
      <div className="flex flex-wrap gap-2">
        {PLATFORM_ORDER.map((type) => {
          const platform = PLATFORMS[type];
          const isActive = activeSocials.has(type);
          const Icon = platform.icon;
          return (
            <button
              key={type}
              type="button"
              onClick={() => isActive ? openManage(type) : openAdd(type)}
              className={`flex items-center justify-center w-9 h-9 rounded-lg border transition-colors ${
                isActive
                  ? 'border-th-ring/30 bg-th-ring/10 text-th-text hover:bg-th-ring/20'
                  : 'border-th-ring/10 bg-th-ring/5 text-th-text-4 opacity-40 hover:opacity-70 hover:bg-th-ring/10'
              }`}
              title={platform.label}
            >
              <Icon className="w-4.5 h-4.5" />
            </button>
          );
        })}
      </div>

      {/* Modal */}
      {modalType && modalPlatform && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm"
          onClick={() => !modalLoading && closeModal()}
        >
          <div
            className="bg-th-card border border-th-border rounded-xl p-5 max-w-sm w-full mx-4 shadow-2xl"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center gap-2 mb-4">
              {React.createElement(modalPlatform.icon, { className: 'w-5 h-5 text-th-text' })}
              <h3 className="text-th-text font-medium">{modalPlatform.label}</h3>
            </div>

            {/* Manage mode: show change/delete options */}
            {modalMode === 'manage' && (
              <div className="space-y-2">
                <div className="text-sm text-th-text-3 mb-3">
                  {activeSocials.get(modalType)?.display}
                </div>
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={openEdit}
                    className="flex-1 px-4 py-2 text-sm font-medium text-th-text bg-th-ring/10 hover:bg-th-ring/20 rounded-lg transition-colors"
                  >
                    Поменять
                  </button>
                  <button
                    type="button"
                    onClick={() => setConfirmDelete(true)}
                    className="flex-1 px-4 py-2 text-sm font-medium text-red-600 dark:text-red-400 bg-red-50 dark:bg-red-500/10 hover:bg-red-100 dark:hover:bg-red-500/20 border border-red-400/30 rounded-lg transition-colors"
                  >
                    Удалить
                  </button>
                </div>
                {confirmDelete && (
                  <div className="mt-3 p-3 rounded-lg bg-red-50 dark:bg-red-500/10 border border-red-400/20">
                    <div className="text-sm text-th-text-3 mb-2">Вы уверены, что хотите удалить эту ссылку?</div>
                    {modalError && <div className="text-xs text-red-400 mb-2">{modalError}</div>}
                    <div className="flex gap-2 justify-end">
                      <button
                        type="button"
                        onClick={() => setConfirmDelete(false)}
                        disabled={modalLoading}
                        className="px-3 py-1.5 text-xs text-th-text-4 hover:text-th-text transition-colors"
                      >
                        Отмена
                      </button>
                      <button
                        type="button"
                        onClick={handleDelete}
                        disabled={modalLoading}
                        className="px-3 py-1.5 text-xs bg-red-600 hover:bg-red-500 text-white rounded font-medium disabled:opacity-50 transition-colors"
                      >
                        {modalLoading ? 'Удаление...' : 'Удалить'}
                      </button>
                    </div>
                  </div>
                )}
                {!confirmDelete && (
                  <button
                    type="button"
                    onClick={closeModal}
                    className="w-full mt-1 px-4 py-1.5 text-sm text-th-text-4 hover:text-th-text transition-colors text-center"
                  >
                    Отмена
                  </button>
                )}
              </div>
            )}

            {/* Add / Edit mode: URL input */}
            {(modalMode === 'add' || modalMode === 'edit') && (
              <div className="space-y-3">
                <label className="block">
                  <div className="text-xs text-th-text-4 mb-1">Ссылка на профиль</div>
                  <input
                    type="url"
                    value={urlInput}
                    onChange={(e) => { setUrlInput(e.target.value); setModalError(null); }}
                    placeholder="Введите ссылку на профиль"
                    className="w-full bg-th-ring/5 rounded-lg px-3 py-2 text-sm text-th-text outline-none ring-1 ring-th-ring/10 placeholder:text-th-text-4 focus:ring-2 focus:ring-th-ring/20"
                    disabled={modalLoading}
                    autoFocus
                    onKeyDown={(e) => {
                      if (e.key === 'Enter') {
                        e.preventDefault();
                        if (modalMode === 'add') { handleAdd(); } else { handleUpdate(); }
                      }
                    }}
                  />
                </label>
                {modalError && (
                  <div className="text-xs text-red-400">{modalError}</div>
                )}
                <div className="flex gap-2">
                  <button
                    type="button"
                    onClick={modalMode === 'add' ? handleAdd : handleUpdate}
                    disabled={modalLoading || !urlInput.trim()}
                    className="px-5 py-2 bg-th-text text-th-page text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
                  >
                    {modalLoading
                      ? 'Сохранение...'
                      : modalMode === 'add'
                        ? 'Добавить'
                        : 'Сохранить'
                    }
                  </button>
                  <button
                    type="button"
                    onClick={modalMode === 'edit' ? () => setModalMode('manage') : closeModal}
                    disabled={modalLoading}
                    className="px-4 py-2 text-sm text-th-text-4 hover:text-th-text transition-colors"
                  >
                    Отмена
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
