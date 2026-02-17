import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UserProfile, Shout } from '../types';
import { useAuth } from '../context/AuthContext';
import ShoutCard from './ShoutCard';
import AvatarUpload from './AvatarUpload';

interface ProfilePageProps {
  userId: string;
}

const PAGE_SIZE = 10;

const ProfilePage: React.FC<ProfilePageProps> = ({ userId }) => {
  const { refresh } = useAuth();

  const [profile, setProfile] = useState<UserProfile | null>(null);
  const [isLoadingProfile, setIsLoadingProfile] = useState(true);
  const [profileError, setProfileError] = useState<string | null>(null);

  const [shouts, setShouts] = useState<Shout[]>([]);
  const [isLoadingShouts, setIsLoadingShouts] = useState(true);
  const [isLoadingMore, setIsLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(true);
  const offsetRef = useRef(0);

  const [isEditing, setIsEditing] = useState(false);
  const [editForm, setEditForm] = useState({
    username: '',
    email: '',
    avatar: '',
    currentPassword: '',
    newPassword: '',
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Fetch profile
  useEffect(() => {
    setIsLoadingProfile(true);
    setProfileError(null);
    setProfile(null);
    setShouts([]);
    setHasMore(true);
    offsetRef.current = 0;

    console.log(`[ProfilePage] Loading profile for user ${userId}`);

    fetch(`/api/users/${userId}`, { credentials: 'include' })
      .then(async (res) => {
        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || `HTTP ${res.status}`);
        }
        return res.json();
      })
      .then((data) => {
        console.log(`[ProfilePage] Profile loaded:`, data.profile.name);
        setProfile(data.profile);
        setEditForm({
          username: data.profile.name,
          email: data.profile.email || '',
          avatar: data.profile.avatar,
          currentPassword: '',
          newPassword: '',
        });
      })
      .catch((err) => {
        console.error('[ProfilePage] Profile load error:', err);
        setProfileError(err.message);
      })
      .finally(() => setIsLoadingProfile(false));
  }, [userId]);

  // Fetch user shouts
  const fetchShouts = useCallback(async (reset = false) => {
    const currentOffset = reset ? 0 : offsetRef.current;

    if (reset) {
      setIsLoadingShouts(true);
    } else {
      setIsLoadingMore(true);
    }

    console.log(`[ProfilePage] Fetching shouts: userId=${userId}, offset=${currentOffset}`);

    try {
      const res = await fetch(
        `/api/users/${userId}/shouts?limit=${PAGE_SIZE}&offset=${currentOffset}`,
        { credentials: 'include' }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();

      console.log(`[ProfilePage] Received ${data.shouts.length} shouts, hasMore=${data.hasMore}`);

      setShouts(prev => reset ? data.shouts : [...prev, ...data.shouts]);
      setHasMore(data.hasMore);
      offsetRef.current = currentOffset + data.shouts.length;
    } catch (err) {
      console.error('[ProfilePage] Shout fetch error:', err);
    } finally {
      setIsLoadingShouts(false);
      setIsLoadingMore(false);
    }
  }, [userId]);

  // Load shouts after profile is loaded
  useEffect(() => {
    if (profile) {
      fetchShouts(true);
    }
  }, [profile, fetchShouts]);

  // Reply callback
  const addReplyToShout = useCallback((shoutId: string, reply: Shout) => {
    setShouts(prev =>
      prev.map(s =>
        s.id === shoutId
          ? { ...s, replies: [...(s.replies || []), reply] }
          : s
      )
    );
  }, []);

  // Handle profile save
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    setEditSuccess(null);
    setIsSaving(true);

    console.log('[ProfilePage] Saving profile changes');

    try {
      const body: Record<string, string> = {};
      if (editForm.username !== profile?.name) body.username = editForm.username;
      if (editForm.email !== (profile?.email || '')) body.email = editForm.email;
      if (editForm.avatar !== profile?.avatar) body.avatar = editForm.avatar;
      if (editForm.newPassword) {
        body.currentPassword = editForm.currentPassword;
        body.newPassword = editForm.newPassword;
      }

      if (Object.keys(body).length === 0) {
        setEditError('Нет изменений');
        setIsSaving(false);
        return;
      }

      const res = await fetch(`/api/users/${userId}`, {
        method: 'PUT',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        throw new Error(data.error || 'Update failed');
      }

      const data = await res.json();
      console.log('[ProfilePage] Profile updated successfully');

      setProfile(prev => prev ? { ...prev, ...data.profile } : prev);
      setEditForm(prev => ({ ...prev, currentPassword: '', newPassword: '' }));
      setEditSuccess('Профиль обновлён');
      setIsEditing(false);

      // Refresh auth context so header reflects new name/avatar
      await refresh();
    } catch (err: unknown) {
      const message = err instanceof Error ? err.message : 'Ошибка сохранения';
      console.error('[ProfilePage] Save error:', message);
      setEditError(message);
    } finally {
      setIsSaving(false);
    }
  };

  // Loading state
  if (isLoadingProfile) {
    return (
      <div className="flex justify-center py-16">
        <div className="w-8 h-8 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
      </div>
    );
  }

  // Error state
  if (profileError || !profile) {
    return (
      <div className="text-center py-16">
        <div className="text-zinc-500 text-lg mb-2">Пользователь не найден</div>
        <a href="#/" className="text-sky-500 hover:underline text-sm">Вернуться к ленте</a>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Back button */}
      <a href="#/" className="inline-flex items-center gap-1 text-zinc-500 hover:text-white text-sm mb-6 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        Назад к ленте
      </a>

      {/* Profile Header */}
      <div className="bg-[#1e1e1e] rounded-lg p-6 border border-zinc-800/50 mb-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full overflow-hidden bg-zinc-800 shrink-0">
            {profile.avatar ? (
              <img src={profile.avatar} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-zinc-400 text-2xl font-bold">
                {profile.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className={`text-xl font-bold ${profile.isBanned ? 'text-zinc-500 line-through' : 'text-white'}`}>
                {profile.name}
              </h1>
              {profile.isBanned && (
                <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">Забанен</span>
              )}
            </div>

            <div className="text-zinc-500 text-sm mb-3">
              {profile.shoutCount} {getDeclension(profile.shoutCount ?? 0, 'вопль', 'вопля', 'воплей')}
              <span className="mx-2">·</span>
              На сайте с {formatDate(profile.createdAt)}
            </div>

            {/* Owner actions */}
            {profile.isOwner && !isEditing && (
              <button
                onClick={() => { setIsEditing(true); setEditError(null); setEditSuccess(null); }}
                className="text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 px-4 py-1.5 rounded-lg transition-colors"
              >
                Редактировать профиль
              </button>
            )}
          </div>
        </div>

        {/* Success message */}
        {editSuccess && (
          <div className="mt-4 text-sm text-green-400 bg-green-500/10 border border-green-500/20 rounded-lg px-3 py-2">
            {editSuccess}
          </div>
        )}

        {/* Edit Form */}
        {profile.isOwner && isEditing && (
          <form onSubmit={handleSave} className="mt-6 border-t border-zinc-800 pt-5 space-y-4">
            {editError && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {editError}
              </div>
            )}

            <label className="block">
              <div className="text-xs text-zinc-400 mb-1">Имя пользователя</div>
              <input
                value={editForm.username}
                onChange={(e) => setEditForm(f => ({ ...f, username: e.target.value }))}
                className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/20"
                disabled={isSaving}
              />
            </label>

            <label className="block">
              <div className="text-xs text-zinc-400 mb-1">Email</div>
              <input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
                placeholder="user@example.com"
                className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 placeholder:text-zinc-600 focus:ring-2 focus:ring-white/20"
                disabled={isSaving}
              />
            </label>

            <AvatarUpload
              currentAvatar={editForm.avatar}
              disabled={isSaving}
              onUploaded={(url) => {
                setEditForm(f => ({ ...f, avatar: url }));
                setProfile(prev => prev ? { ...prev, avatar: url } : prev);
                refresh();
              }}
            />

            <div className="border-t border-zinc-800 pt-4">
              <div className="text-xs text-zinc-400 mb-3">Смена пароля (оставьте пустым, чтобы не менять)</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-xs text-zinc-500 mb-1">Текущий пароль</div>
                  <input
                    type="password"
                    value={editForm.currentPassword}
                    onChange={(e) => setEditForm(f => ({ ...f, currentPassword: e.target.value }))}
                    className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/20"
                    disabled={isSaving}
                    autoComplete="current-password"
                  />
                </label>
                <label className="block">
                  <div className="text-xs text-zinc-500 mb-1">Новый пароль</div>
                  <input
                    type="password"
                    value={editForm.newPassword}
                    onChange={(e) => setEditForm(f => ({ ...f, newPassword: e.target.value }))}
                    className="w-full bg-white/5 rounded-lg px-3 py-2 text-sm text-white outline-none ring-1 ring-white/10 focus:ring-2 focus:ring-white/20"
                    disabled={isSaving}
                    autoComplete="new-password"
                  />
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 bg-white text-zinc-900 text-sm font-semibold rounded-lg hover:bg-zinc-200 disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
              >
                {isSaving ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setEditError(null);
                  setEditForm({
                    username: profile.name,
                    email: profile.email || '',
                    avatar: profile.avatar,
                    currentPassword: '',
                    newPassword: '',
                  });
                }}
                disabled={isSaving}
                className="px-5 py-2 text-sm text-zinc-400 hover:text-white border border-zinc-700 hover:border-zinc-500 rounded-lg transition-colors"
              >
                Отмена
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Section title */}
      <h2 className="text-lg font-bold text-white mb-4">
        {profile.isOwner ? 'Мои вопли' : `Вопли ${profile.name}`}
      </h2>

      {/* Shouts loading */}
      {isLoadingShouts && shouts.length === 0 && (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-zinc-700 border-t-zinc-400 rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!isLoadingShouts && shouts.length === 0 && (
        <div className="text-center text-zinc-500 text-sm py-8">
          {profile.isOwner ? 'Вы ещё ничего не написали' : 'Пользователь ещё ничего не написал'}
        </div>
      )}

      {/* Shouts list */}
      <div className="flex flex-col gap-6">
        {shouts.map((shout) => (
          <ShoutCard
            key={shout.id}
            shout={shout}
            showMedia={true}
            onReplyAdded={addReplyToShout}
          />
        ))}
      </div>

      {/* Load more */}
      {hasMore && !isLoadingShouts && (
        <div className="flex justify-center py-8">
          <button
            onClick={() => fetchShouts(false)}
            disabled={isLoadingMore}
            className="px-6 py-2 rounded-full border border-zinc-700 text-zinc-400 hover:text-white hover:border-zinc-500 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingMore ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-zinc-600 border-t-zinc-300 rounded-full animate-spin" />
                Загрузка...
              </span>
            ) : (
              'Загрузить ещё'
            )}
          </button>
        </div>
      )}
    </div>
  );
};

function formatDate(iso: string): string {
  try {
    const d = new Date(iso);
    if (isNaN(d.getTime())) return iso;
    const months = ['января', 'февраля', 'марта', 'апреля', 'мая', 'июня', 'июля', 'августа', 'сентября', 'октября', 'ноября', 'декабря'];
    return `${d.getDate()} ${months[d.getMonth()]} ${d.getFullYear()}`;
  } catch {
    return iso;
  }
}

function getDeclension(count: number, one: string, few: string, many: string): string {
  const lastDigit = count % 10;
  const lastTwoDigits = count % 100;
  if (lastTwoDigits >= 11 && lastTwoDigits <= 19) return many;
  if (lastDigit === 1) return one;
  if (lastDigit >= 2 && lastDigit <= 4) return few;
  return many;
}

export default ProfilePage;
