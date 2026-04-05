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
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <defs>
      <linearGradient id="steam-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#111d2e"/>
        <stop offset="50%" stopColor="#0e3a5f"/>
        <stop offset="100%" stopColor="#1387b8"/>
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="12" fill="url(#steam-bg)"/>
    <g transform="translate(2.4 2.4) scale(0.8)">
      <path fill="#fff" d="M11.979 0C5.678 0 .511 4.86.022 11.037l6.432 2.658c.545-.371 1.203-.59 1.912-.59.063 0 .125.004.188.006l2.861-4.142V8.91c0-2.495 2.028-4.524 4.524-4.524 2.494 0 4.524 2.031 4.524 4.527s-2.03 4.525-4.524 4.525h-.105l-4.076 2.911c0 .052.004.105.004.159 0 1.875-1.515 3.396-3.39 3.396-1.635 0-3.016-1.173-3.331-2.727L.436 15.27C1.862 20.307 6.486 24 11.979 24c6.627 0 11.999-5.373 11.999-12S18.605 0 11.979 0zM7.54 18.21l-1.473-.61c.262.543.714.999 1.314 1.25 1.297.539 2.793-.076 3.332-1.375.263-.63.264-1.319.005-1.949s-.75-1.121-1.377-1.383c-.624-.26-1.29-.249-1.878-.03l1.523.63c.956.4 1.409 1.5 1.009 2.455-.397.957-1.497 1.41-2.454 1.012H7.54zm11.415-9.303c0-1.662-1.353-3.015-3.015-3.015-1.665 0-3.015 1.353-3.015 3.015 0 1.665 1.35 3.015 3.015 3.015 1.663 0 3.015-1.35 3.015-3.015zm-5.273-.005c0-1.252 1.013-2.266 2.265-2.266 1.249 0 2.266 1.014 2.266 2.266 0 1.251-1.017 2.265-2.266 2.265-1.253 0-2.265-1.014-2.265-2.265z"/>
    </g>
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
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <defs>
      <linearGradient id="bnet-bg" x1="0" y1="0" x2="1" y2="1">
        <stop offset="0%" stopColor="#00599C"/>
        <stop offset="100%" stopColor="#00AEFF"/>
      </linearGradient>
    </defs>
    <circle cx="12" cy="12" r="12" fill="url(#bnet-bg)"/>
    <g transform="translate(2.4 2.4) scale(0.8)">
      <path fill="#fff" d="M18.94 8.296C15.9 6.892 11.534 6 7.426 6.332c.206-1.36.714-2.308 1.548-2.508 1.148-.275 2.4.48 3.594 1.854.782.102 1.71.28 2.355.429C12.747 2.013 9.828-.282 7.607.565c-1.688.644-2.553 2.97-2.448 6.094-2.2.468-3.915 1.3-5.013 2.495-.056.065-.181.227-.137.305.034.058.146-.008.194-.04 1.274-.89 2.904-1.373 5.027-1.676.303 3.333 1.713 7.56 4.055 10.952-1.28.502-2.356.536-2.946-.087-.812-.856-.784-2.318-.19-4.04a26.764 26.764 0 0 1-.807-2.254c-2.459 3.934-2.986 7.61-1.143 9.11 1.402 1.14 3.847.725 6.502-.926 1.505 1.672 3.083 2.74 4.667 3.094.084.015.287.043.332-.034.034-.06-.08-.124-.131-.149-1.408-.657-2.64-1.828-3.964-3.515 2.735-1.929 5.691-5.263 7.457-8.988 1.076.86 1.64 1.773 1.398 2.595-.336 1.131-1.615 1.84-3.403 2.185a27.697 27.697 0 0 1-1.548 1.826c4.634.16 8.08-1.22 8.458-3.565.286-1.786-1.295-3.696-4.053-5.17.696-2.139.832-4.04.346-5.588-.029-.08-.106-.27-.196-.27-.068 0-.067.13-.063.187.135 1.547-.263 3.2-1.062 5.19zm-8.533 9.869c-1.96-3.145-3.09-6.849-3.082-10.594 3.702-.124 7.474.748 10.714 2.627-1.743 3.269-4.385 6.1-7.633 7.966h.001z"/>
    </g>
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
  <svg viewBox="0 0 24 24" className="w-full h-full">
    <circle cx="12" cy="12" r="12" fill="#2f2f2f"/>
    <g transform="translate(2.4 2.4) scale(0.8)">
      <path fill="#fff" d="M3.537 0C2.165 0 1.66.506 1.66 1.879V18.44a4.262 4.262 0 00.02.433c.031.3.037.59.316.92.027.033.311.245.311.245.153.075.258.13.43.2l8.335 3.491c.433.199.614.276.928.27h.002c.314.006.495-.071.928-.27l8.335-3.492c.172-.07.277-.124.43-.2 0 0 .284-.211.311-.243.28-.33.285-.621.316-.92a4.261 4.261 0 00.02-.434V1.879c0-1.373-.506-1.88-1.878-1.88zm13.366 3.11h.68c1.138 0 1.688.553 1.688 1.696v1.88h-1.374v-1.8c0-.369-.17-.54-.523-.54h-.235c-.367 0-.537.17-.537.539v5.81c0 .369.17.54.537.54h.262c.353 0 .523-.171.523-.54V8.619h1.373v2.143c0 1.144-.562 1.71-1.7 1.71h-.694c-1.138 0-1.7-.566-1.7-1.71V4.82c0-1.144.562-1.709 1.7-1.709zm-12.186.08h3.114v1.274H6.117v2.603h1.648v1.275H6.117v2.774h1.74v1.275h-3.14zm3.816 0h2.198c1.138 0 1.7.564 1.7 1.708v2.445c0 1.144-.562 1.71-1.7 1.71h-.799v3.338h-1.4zm4.53 0h1.4v9.201h-1.4zm-3.13 1.235v3.392h.575c.354 0 .523-.171.523-.54V4.965c0-.368-.17-.54-.523-.54zm-3.74 10.147a1.708 1.708 0 01.591.108c.19.075.35.178.49.299l-.452.546a1.247 1.247 0 00-.308-.195.91.91 0 00-.363-.068.658.658 0 00-.28.06.703.703 0 00-.224.163.783.783 0 00-.151.243.799.799 0 00-.056.299v.008c0 .108.019.213.056.31a.7.7 0 00.157.245.736.736 0 00.238.16.774.774 0 00.303.058.79.79 0 00.445-.116v-.339h-.548v-.565H7.37v1.255a2.019 2.019 0 01-.524.307 1.789 1.789 0 01-.683.123 1.642 1.642 0 01-.602-.107 1.46 1.46 0 01-.478-.3 1.371 1.371 0 01-.318-.455 1.438 1.438 0 01-.115-.58v-.008c0-.202.038-.394.113-.57a1.449 1.449 0 01.786-.769 1.58 1.58 0 01.643-.111zm11.963.008a2.006 2.006 0 01.612.094c.19.06.358.154.507.277l-.386.546a1.562 1.562 0 00-.39-.205 1.178 1.178 0 00-.388-.07.347.347 0 00-.208.052.154.154 0 00-.07.127v.008a.158.158 0 00.022.084.198.198 0 00.076.066c.036.021.085.041.147.06.062.02.14.04.236.061.162.038.308.079.43.122a1.292 1.292 0 01.535.41.739.739 0 01.071.337v.008a.865.865 0 01-.081.382.82.82 0 01-.229.285 1.032 1.032 0 01-.353.18 1.606 1.606 0 01-.46.061 2.16 2.16 0 01-.71-.116 1.718 1.718 0 01-.593-.346l.43-.514c.277.223.578.335.9.335a.457.457 0 00.236-.05.157.157 0 00.082-.142v-.008a.15.15 0 00-.02-.077.204.204 0 00-.073-.066.753.753 0 00-.143-.062 2.45 2.45 0 00-.233-.062 5.036 5.036 0 01-.413-.113 1.26 1.26 0 01-.331-.16.72.72 0 01-.222-.243.73.73 0 01-.082-.36v-.008c0-.132.025-.25.074-.359a.794.794 0 01.214-.283 1.007 1.007 0 01.34-.185 1.423 1.423 0 01.473-.066zm-9.358.025h.742l1.183 2.81h-.825l-.203-.499H8.623l-.198.498h-.81zm2.197.02h.814l.663 1.08.663-1.08h.814v2.79h-.766v-1.602l-.711 1.091h-.016l-.707-1.083v1.593h-.754zm3.469 0h2.235v.658h-1.473v.422h1.334v.61h-1.334v.442h1.493v.658h-2.255zm-5.3.897l-.315.793h.624zm-1.145 5.19h8.014l-4.09 1.348z"/>
    </g>
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
