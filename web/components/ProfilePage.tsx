import React, { useState, useEffect, useCallback, useRef } from 'react';
import { UserProfile, Shout, Comment, User, SocialDto } from '../types';
import { useAuth } from '../context/AuthContext';
import { useContentPreferences } from '../context/ContentPreferencesContext';
import { useIgnoredUsers } from '../context/IgnoredUsersContext';
import ShoutCard from './ShoutCard';
import AvatarUpload from './AvatarUpload';
import { ProfileSocialsDisplay, ProfileSocialsEditor } from './ProfileSocials';

interface ProfilePageProps {
  userId: string;
}

const PAGE_SIZE = 10;
const USERNAME_RE = /^[A-Za-zА-Яа-яЁё0-9\-_ ]+$/;

const ProfilePage: React.FC<ProfilePageProps> = ({ userId }) => {
  const { user, refresh } = useAuth();
  const { prefs } = useContentPreferences();
  const { isIgnored, addIgnoredUser, removeIgnoredUser, ignoredUserIds } = useIgnoredUsers();

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
    showNsfw: false,
    showPolitics: false,
  });
  const [editError, setEditError] = useState<string | null>(null);
  const [editSuccess, setEditSuccess] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);

  // Pending avatar file for preview-only upload
  const [pendingAvatarFile, setPendingAvatarFile] = useState<File | null>(null);
  const [pendingAvatarPreview, setPendingAvatarPreview] = useState<string | null>(null);
  const [avatarUploadError, setAvatarUploadError] = useState<string | null>(null);

  // Password visibility toggles
  const [showCurrentPassword, setShowCurrentPassword] = useState(false);
  const [showNewPassword, setShowNewPassword] = useState(false);

  // Ignore user state
  const [ignoreLoading, setIgnoreLoading] = useState(false);
  const [ignoreError, setIgnoreError] = useState<string | null>(null);
  const [confirmIgnore, setConfirmIgnore] = useState(false);
  const [confirmUnignore, setConfirmUnignore] = useState(false);
  const [showIgnoreList, setShowIgnoreList] = useState(false);
  const [ignoreListUsers, setIgnoreListUsers] = useState<User[]>([]);
  const [ignoreListLoading, setIgnoreListLoading] = useState(false);

  // Socials
  const [socials, setSocials] = useState<SocialDto[]>([]);

  // Email change verification flow
  const [emailStep, setEmailStep] = useState<'idle' | 'sending' | 'code'>('idle');
  const [emailCode, setEmailCode] = useState('');
  const [emailError, setEmailError] = useState<string | null>(null);
  const [emailSending, setEmailSending] = useState(false);

  // Socials
  const [socials, setSocials] = useState<SocialDto[]>([]);

  // Fetch profile
  useEffect(() => {
    setIsLoadingProfile(true);
    setProfileError(null);
    setProfile(null);
    setShouts([]);
    setSocials([]);
    setHasMore(true);
    offsetRef.current = 0;

    console.log(`[ProfilePage] Loading profile for user ${userId}`);

    fetch(`/api/v1/users/${userId}`, { credentials: 'include' })
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
          showNsfw: !!data.profile.showNsfw,
          showPolitics: !!data.profile.showPolitics,
        });
        // Fetch socials
        fetch(`/api/v1/users/${userId}/socials`, { credentials: 'include' })
          .then(r => r.ok ? r.json() : { socials: [] })
          .then(d => setSocials(d.socials || []))
          .catch(() => setSocials([]));
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
        `/api/v1/users/${userId}/shouts?limit=${PAGE_SIZE}&offset=${currentOffset}`,
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

  // Comment callback
  const addCommentToShout = useCallback((shoutId: string, comment: Comment) => {
    setShouts(prev =>
      prev.map(s =>
        s.id === shoutId
          ? { ...s, comments: [...(s.comments || []), comment] }
          : s
      )
    );
  }, []);

  // Shout delete callback (mark as deleted, keep in list for comments)
  const removeShout = useCallback((shoutId: string) => {
    setShouts(prev => prev.map(s =>
      s.id === shoutId ? { ...s, isDeleted: true, content: '', media: undefined, user: null } : s
    ));
  }, []);

  // Comment delete callback (remove from parent without reload)
  const removeComment = useCallback((shoutId: string, commentId: string) => {
    setShouts(prev =>
      prev.map(s =>
        s.id === shoutId
          ? { ...s, comments: (s.comments || []).filter(c => c.id !== commentId) }
          : s
      )
    );
  }, []);

  // Accordion: only one thread open at a time
  const [openThreadId, setOpenThreadId] = useState<string | null>(null);

  const handleThreadToggle = useCallback((shoutId: string) => {
    setOpenThreadId(prev => prev === shoutId ? null : shoutId);
  }, []);

  // Ignore/unignore handlers
  const handleIgnore = async () => {
    setIgnoreLoading(true);
    setIgnoreError(null);
    try {
      await addIgnoredUser(userId);
      setConfirmIgnore(false);
    } catch (err: unknown) {
      setIgnoreError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setIgnoreLoading(false);
    }
  };

  const handleUnignore = async () => {
    setIgnoreLoading(true);
    setIgnoreError(null);
    try {
      await removeIgnoredUser(userId);
      setConfirmUnignore(false);
    } catch (err: unknown) {
      setIgnoreError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setIgnoreLoading(false);
    }
  };

  const handleRemoveFromIgnoreList = async (targetUserId: string) => {
    try {
      await removeIgnoredUser(targetUserId);
      setIgnoreListUsers(prev => prev.filter(u => u.id !== targetUserId));
    } catch {
      // silently fail
    }
  };

  const openIgnoreList = async () => {
    setShowIgnoreList(true);
    setIgnoreListLoading(true);
    try {
      const users: User[] = [];
      for (const uid of ignoredUserIds) {
        const res = await fetch(`/api/v1/users/${uid}`, { credentials: 'include' });
        if (res.ok) {
          const data = await res.json();
          users.push({ id: data.profile.id, name: data.profile.name, avatar: data.profile.avatar });
        }
      }
      setIgnoreListUsers(users);
    } catch {
      // silently fail
    } finally {
      setIgnoreListLoading(false);
    }
  };

  // Handle email change: send verification code
  const handleEmailSendCode = async () => {
    const newEmail = editForm.email.trim();
    if (!newEmail || newEmail === (profile?.email || '')) return;

    setEmailError(null);
    setEmailSending(true);
    try {
      const res = await fetch(`/api/v1/users/${userId}/email/send-code`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ошибка отправки кода');
      setEmailStep('code');
      setEmailCode('');
    } catch (err: unknown) {
      setEmailError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setEmailSending(false);
    }
  };

  // Handle email change: verify code
  const handleEmailVerify = async () => {
    const newEmail = editForm.email.trim();
    setEmailError(null);
    setEmailSending(true);
    try {
      const res = await fetch(`/api/v1/users/${userId}/email/verify`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: newEmail, code: emailCode }),
      });
      const data = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(data.error || 'Ошибка подтверждения');
      // Success — update profile state
      setProfile(prev => prev ? { ...prev, email: data.email } : prev);
      setEmailStep('idle');
      setEmailCode('');
      setEditSuccess('Email обновлён');
    } catch (err: unknown) {
      setEmailError(err instanceof Error ? err.message : 'Ошибка');
    } finally {
      setEmailSending(false);
    }
  };

  // Handle profile save (username, avatar, password + trigger email verification if changed)
  const handleSave = async (e: React.FormEvent) => {
    e.preventDefault();
    setEditError(null);
    setEditSuccess(null);
    setIsSaving(true);

    const emailChanged = editForm.email.trim() !== (profile?.email || '') && editForm.email.trim() !== '';

    console.log('[ProfilePage] Saving profile changes');

    try {
      setAvatarUploadError(null);

      // Step 1: Upload pending avatar if any
      let newAvatarUrl: string | undefined;
      if (pendingAvatarFile) {
        console.log('[ProfilePage] Uploading pending avatar...');
        const form = new FormData();
        form.append('avatar', pendingAvatarFile);

        let uploadRes: Response;
        try {
          uploadRes = await fetch('/api/v1/upload/avatar', {
            method: 'POST',
            credentials: 'include',
            body: form,
          });
        } catch {
          const msg = 'Не удалось загрузить аватар. Проверьте соединение с интернетом';
          setAvatarUploadError(msg);
          throw new Error(msg);
        }

        if (!uploadRes.ok) {
          const data = await uploadRes.json().catch(() => ({}));
          const msg = data.error || 'Ошибка загрузки аватара';
          setAvatarUploadError(msg);
          throw new Error(msg);
        }

        const uploadData = await uploadRes.json();
        newAvatarUrl = uploadData.avatar;
        console.log('[ProfilePage] Avatar uploaded:', newAvatarUrl);
      }

      // Validate username client-side before sending
      if (editForm.username !== profile?.name) {
        const u = editForm.username.trim();
        if (u.length < 3 || u.length > 32) throw new Error("Имя пользователя: от 3 до 32 символов");
        if (!USERNAME_RE.test(u)) throw new Error("Имя может содержать только буквы, цифры, дефис, подчёркивание и пробел");
      }

      // Step 2: Build profile update body (no email — that goes through verification)
      const body: Record<string, string | boolean> = {};
      if (editForm.username !== profile?.name) body.username = editForm.username;
      if (newAvatarUrl) body.avatar = newAvatarUrl;
      if (editForm.newPassword) {
        body.currentPassword = editForm.currentPassword;
        body.newPassword = editForm.newPassword;
      }
      if (editForm.showNsfw !== !!profile?.showNsfw) body.showNsfw = editForm.showNsfw;
      if (editForm.showPolitics !== !!profile?.showPolitics) body.showPolitics = editForm.showPolitics;

      const hasProfileChanges = Object.keys(body).length > 0 || pendingAvatarFile;

      // Nothing changed at all
      if (!hasProfileChanges && !emailChanged) {
        setEditError('Нет изменений');
        setIsSaving(false);
        return;
      }

      // Save non-email profile changes
      if (Object.keys(body).length > 0) {
        const res = await fetch(`/api/v1/users/${userId}`, {
          method: 'PUT',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });

        if (!res.ok) {
          const data = await res.json().catch(() => ({}));
          throw new Error(data.error || 'Ошибка сохранения');
        }

        const data = await res.json();
        console.log('[ProfilePage] Profile updated successfully');
        setProfile(prev => prev ? { ...prev, ...data.profile } : prev);
      } else if (newAvatarUrl) {
        // Avatar was uploaded via /upload/avatar which already updates the DB
        setProfile(prev => prev ? { ...prev, avatar: newAvatarUrl! } : prev);
      }

      setEditForm(prev => ({ ...prev, currentPassword: '', newPassword: '' }));
      setPendingAvatarFile(null);
      setPendingAvatarPreview(null);

      // If email changed, trigger verification flow instead of closing editor
      if (emailChanged) {
        if (hasProfileChanges) {
          setEditSuccess('Профиль обновлён. Подтвердите новый email — код отправлен на почту');
        }
        // Auto-trigger email send code
        await handleEmailSendCode();
        // Don't close editing — user still needs to enter the code
        await refresh();
      } else {
        setEditSuccess('Профиль обновлён');
        setIsEditing(false);
        await refresh();
      }
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
        <div className="w-8 h-8 border-2 border-th-border border-t-th-text-3 rounded-full animate-spin" />
      </div>
    );
  }

  // Error state
  if (profileError || !profile) {
    return (
      <div className="text-center py-16">
        <div className="text-th-text-4 text-lg mb-2">Пользователь не найден</div>
        <a href="/" className="text-sky-500 hover:underline text-sm">Вернуться к ленте</a>
      </div>
    );
  }

  return (
    <div className="w-full">
      {/* Back button */}
      <a href="/" className="inline-flex items-center gap-1 text-th-text-4 hover:text-th-text text-sm mb-6 transition-colors">
        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" fill="currentColor" viewBox="0 0 20 20">
          <path fillRule="evenodd" d="M12.707 5.293a1 1 0 010 1.414L9.414 10l3.293 3.293a1 1 0 01-1.414 1.414l-4-4a1 1 0 010-1.414l4-4a1 1 0 011.414 0z" clipRule="evenodd" />
        </svg>
        Назад к ленте
      </a>

      {/* Profile Header */}
      <div className="bg-th-feed rounded-xl p-6 mb-6">
        <div className="flex items-start gap-5">
          {/* Avatar */}
          <div className="w-20 h-20 rounded-full overflow-hidden bg-th-input shrink-0">
            {profile.avatar ? (
              <img src={profile.avatar} alt={profile.name} className="w-full h-full object-cover" />
            ) : (
              <div className="w-full h-full flex items-center justify-center text-th-text-3 text-2xl font-bold">
                {profile.name.charAt(0).toUpperCase()}
              </div>
            )}
          </div>

          {/* Info */}
          <div className="flex-1 min-w-0">
            <div className="flex items-center gap-3 mb-1">
              <h1 className={`text-xl font-bold ${profile.isBanned ? 'text-th-text-4 line-through' : 'text-th-text'}`}>
                {profile.name}
              </h1>
              {profile.isBanned && (
                <span className="text-xs bg-red-500/20 text-red-400 px-2 py-0.5 rounded">Забанен</span>
              )}
            </div>

            {/* Owner actions */}
            {profile.isOwner && !isEditing && (
              <div className="flex items-center gap-2">
                <button
                  onClick={() => { setIsEditing(true); setEditError(null); setEditSuccess(null); setPendingAvatarFile(null); setPendingAvatarPreview(null); setAvatarUploadError(null); setEmailStep('idle'); setEmailCode(''); setEmailError(null); }}
                  className="text-sm text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 border border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500 bg-neutral-50 dark:bg-neutral-800 px-4 py-1.5 rounded-lg transition-colors"
                >
                  Редактировать профиль
                </button>
                <button
                  onClick={openIgnoreList}
                  className="text-sm text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 border border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500 bg-neutral-50 dark:bg-neutral-800 px-4 py-1.5 rounded-lg transition-colors"
                >
                  Список игнора
                </button>
              </div>
            )}
            {/* Ignore button for non-owner */}
            {!profile.isOwner && user && (
              <div className="flex items-center gap-2">
                {isIgnored(userId) ? (
                  <button
                    onClick={() => setConfirmUnignore(true)}
                    disabled={ignoreLoading}
                    className="text-sm text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border border-red-400/50 dark:border-red-500/40 hover:border-red-500 dark:hover:border-red-400/60 bg-red-50 dark:bg-red-500/10 px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Убрать из игнора
                  </button>
                ) : (
                  <button
                    onClick={() => setConfirmIgnore(true)}
                    disabled={ignoreLoading}
                    className="text-sm text-neutral-600 dark:text-neutral-300 hover:text-neutral-900 dark:hover:text-neutral-100 border border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500 bg-neutral-50 dark:bg-neutral-800 px-4 py-1.5 rounded-lg transition-colors disabled:opacity-50"
                  >
                    Добавить в игнор
                  </button>
                )}
                {ignoreError && (
                  <span className="text-xs text-red-400">{ignoreError}</span>
                )}
              </div>
            )}

            {/* Public socials display — between ignore/edit buttons and stats */}
            {!isEditing && <ProfileSocialsDisplay socials={socials} />}

            <div className="text-th-text-4 text-sm mt-3">
              {profile.shoutCount} {getDeclension(profile.shoutCount ?? 0, 'вопль', 'вопля', 'воплей')}
              <span className="mx-2">·</span>
              На сайте с {formatDate(profile.createdAt)}
            </div>
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
          <form onSubmit={handleSave} className="mt-6 border-t border-th-border-2 pt-5 space-y-4">
            {editError && (
              <div className="text-sm text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">
                {editError}
              </div>
            )}

            <label className="block">
              <div className="text-xs text-th-text-3 mb-1">Имя пользователя</div>
              <input
                value={editForm.username}
                onChange={(e) => setEditForm(f => ({ ...f, username: e.target.value }))}
                className="w-full bg-th-ring/5 rounded-lg px-3 py-2 text-sm text-th-text outline-none ring-1 ring-th-ring/10 focus:ring-2 focus:ring-th-ring/20"
                disabled={isSaving}
              />
            </label>

            <div className="block">
              <div className="text-xs text-th-text-3 mb-1">Email</div>
              {emailStep === 'idle' ? (
                <div className="flex gap-2">
                  <input
                    type="email"
                    value={editForm.email}
                    onChange={(e) => setEditForm(f => ({ ...f, email: e.target.value }))}
                    placeholder="user@example.com"
                    className="flex-1 bg-th-ring/5 rounded-lg px-3 py-2 text-sm text-th-text outline-none ring-1 ring-th-ring/10 placeholder:text-th-text-4 focus:ring-2 focus:ring-th-ring/20"
                    disabled={isSaving || emailSending}
                  />
                  {editForm.email.trim() !== (profile?.email || '') && editForm.email.trim() !== '' && (
                    <button
                      type="button"
                      onClick={handleEmailSendCode}
                      disabled={emailSending}
                      className="px-4 py-2 text-sm font-medium text-th-text bg-th-ring/10 hover:bg-th-ring/20 rounded-lg transition-colors disabled:opacity-50 whitespace-nowrap"
                    >
                      {emailSending ? 'Отправка...' : 'Подтвердить'}
                    </button>
                  )}
                </div>
              ) : (
                <div className="space-y-2">
                  <div className="text-xs text-th-text-4">
                    Код отправлен на <span className="text-th-text-3">{editForm.email.trim()}</span>
                  </div>
                  <div className="flex gap-2">
                    <input
                      type="text"
                      inputMode="numeric"
                      maxLength={6}
                      value={emailCode}
                      onChange={(e) => setEmailCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      placeholder="000000"
                      className="w-32 bg-th-ring/5 rounded-lg px-3 py-2 text-sm text-th-text outline-none ring-1 ring-th-ring/10 placeholder:text-th-text-4 focus:ring-2 focus:ring-th-ring/20 text-center tracking-widest font-mono"
                      disabled={emailSending}
                      autoFocus
                    />
                    <button
                      type="button"
                      onClick={handleEmailVerify}
                      disabled={emailSending || emailCode.length !== 6}
                      className="px-4 py-2 text-sm font-medium text-th-page bg-th-text hover:opacity-90 rounded-lg transition-opacity disabled:opacity-50"
                    >
                      {emailSending ? 'Проверка...' : 'Подтвердить'}
                    </button>
                    <button
                      type="button"
                      onClick={() => { setEmailStep('idle'); setEmailCode(''); setEmailError(null); }}
                      disabled={emailSending}
                      className="px-3 py-2 text-sm text-th-text-4 hover:text-th-text transition-colors"
                    >
                      Отмена
                    </button>
                  </div>
                </div>
              )}
              {emailError && (
                <div className="mt-1 text-xs text-red-400">{emailError}</div>
              )}
            </div>

            <AvatarUpload
              currentAvatar={editForm.avatar}
              disabled={isSaving}
              pendingPreview={pendingAvatarPreview}
              externalError={avatarUploadError}
              onFileSelected={(file, previewUrl) => {
                setPendingAvatarFile(file);
                setPendingAvatarPreview(previewUrl);
                setAvatarUploadError(null);
              }}
              onFileCleared={() => {
                setPendingAvatarFile(null);
                setPendingAvatarPreview(null);
                setAvatarUploadError(null);
              }}
            />

            <div className="border-t border-th-border-2 pt-4">
              <div className="text-xs text-th-text-3 mb-3">Отображение контента</div>
              <div className="space-y-2">
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.showNsfw}
                    onChange={(e) => setEditForm(f => ({ ...f, showNsfw: e.target.checked }))}
                    className="w-3.5 h-3.5 rounded border-th-border accent-[#0087ff]"
                    disabled={isSaving}
                  />
                  <span className="text-sm text-th-text-2">Показывать NSFW контент</span>
                </label>
                <label className="flex items-center gap-3 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={editForm.showPolitics}
                    onChange={(e) => setEditForm(f => ({ ...f, showPolitics: e.target.checked }))}
                    className="w-3.5 h-3.5 rounded border-th-border accent-[#0087ff]"
                    disabled={isSaving}
                  />
                  <span className="text-sm text-th-text-2">Показывать политический контент</span>
                </label>
              </div>
            </div>

            <ProfileSocialsEditor
              userId={userId}
              socials={socials}
              onSocialsChange={setSocials}
              disabled={isSaving}
            />

            <div className="border-t border-th-border-2 pt-4">
              <div className="text-xs text-th-text-3 mb-3">Смена пароля (оставьте пустым, чтобы не менять)</div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <label className="block">
                  <div className="text-xs text-th-text-4 mb-1">Текущий пароль</div>
                  <div className="relative">
                    <input
                      type={showCurrentPassword ? "text" : "password"}
                      value={editForm.currentPassword}
                      onChange={(e) => setEditForm(f => ({ ...f, currentPassword: e.target.value }))}
                      className="w-full bg-th-ring/5 rounded-lg px-3 py-2 pr-10 text-sm text-th-text outline-none ring-1 ring-th-ring/10 focus:ring-2 focus:ring-th-ring/20"
                      disabled={isSaving}
                      autoComplete="current-password"
                    />
                    <button type="button" onClick={() => setShowCurrentPassword(!showCurrentPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-th-text-4 hover:text-th-text-2 transition-colors" aria-label={showCurrentPassword ? "Скрыть пароль" : "Показать пароль"}>
                      {showCurrentPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>
                </label>
                <label className="block">
                  <div className="text-xs text-th-text-4 mb-1">Новый пароль</div>
                  <div className="relative">
                    <input
                      type={showNewPassword ? "text" : "password"}
                      value={editForm.newPassword}
                      onChange={(e) => setEditForm(f => ({ ...f, newPassword: e.target.value }))}
                      className="w-full bg-th-ring/5 rounded-lg px-3 py-2 pr-10 text-sm text-th-text outline-none ring-1 ring-th-ring/10 focus:ring-2 focus:ring-th-ring/20"
                      disabled={isSaving}
                      autoComplete="new-password"
                    />
                    <button type="button" onClick={() => setShowNewPassword(!showNewPassword)} className="absolute right-2 top-1/2 -translate-y-1/2 p-1 text-th-text-4 hover:text-th-text-2 transition-colors" aria-label={showNewPassword ? "Скрыть пароль" : "Показать пароль"}>
                      {showNewPassword ? (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M17.94 17.94A10.07 10.07 0 0 1 12 20c-7 0-11-8-11-8a18.45 18.45 0 0 1 5.06-5.94"/><path d="M9.9 4.24A9.12 9.12 0 0 1 12 4c7 0 11 8 11 8a18.5 18.5 0 0 1-2.16 3.19"/><line x1="1" y1="1" x2="23" y2="23"/><path d="M14.12 14.12a3 3 0 1 1-4.24-4.24"/></svg>
                      ) : (
                        <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z"/><circle cx="12" cy="12" r="3"/></svg>
                      )}
                    </button>
                  </div>
                </label>
              </div>
            </div>

            <div className="flex gap-3 pt-2">
              <button
                type="submit"
                disabled={isSaving}
                className="px-5 py-2 bg-th-text text-th-page text-sm font-semibold rounded-lg hover:opacity-90 disabled:opacity-50 disabled:cursor-not-allowed transition-opacity"
              >
                {isSaving ? 'Сохранение...' : 'Сохранить'}
              </button>
              <button
                type="button"
                onClick={() => {
                  setIsEditing(false);
                  setEditError(null);
                  setPendingAvatarFile(null);
                  setPendingAvatarPreview(null);
                  setAvatarUploadError(null);
                  setEmailStep('idle');
                  setEmailCode('');
                  setEmailError(null);
                  setEditForm({
                    username: profile.name,
                    email: profile.email || '',
                    avatar: profile.avatar,
                    currentPassword: '',
                    newPassword: '',
                    showNsfw: !!profile.showNsfw,
                    showPolitics: !!profile.showPolitics,
                  });
                }}
                disabled={isSaving}
                className="px-5 py-2 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 border border-neutral-300 dark:border-neutral-600 hover:border-neutral-400 dark:hover:border-neutral-500 rounded-lg transition-colors"
              >
                Отмена
              </button>
            </div>
          </form>
        )}
      </div>

      {/* Section title */}
      <h2 className="text-lg font-bold text-th-text mb-4">
        {profile.isOwner ? 'Мои вопли' : `Вопли ${profile.name}`}
      </h2>

      {/* Shouts loading */}
      {isLoadingShouts && shouts.length === 0 && (
        <div className="flex justify-center py-8">
          <div className="w-6 h-6 border-2 border-th-border border-t-th-text-3 rounded-full animate-spin" />
        </div>
      )}

      {/* Empty state */}
      {!isLoadingShouts && shouts.length === 0 && (
        <div className="text-center text-th-text-4 text-sm py-8">
          {profile.isOwner ? 'Вы ещё ничего не написали' : 'Пользователь ещё ничего не написал'}
        </div>
      )}

      {/* Shouts list */}
      <div className="flex flex-col gap-3">
        {shouts.map((shout) => (
          <div key={shout.id} className="bg-th-feed rounded-xl px-5 py-4">
            <ShoutCard
              shout={shout}
              showMedia={prefs.showMedia}
              onCommentAdded={addCommentToShout}
              onDelete={removeShout}
              onCommentDeleted={removeComment}
              isThreadOpen={openThreadId === shout.id}
              onThreadToggle={handleThreadToggle}
            />
          </div>
        ))}
      </div>

      {/* Load more */}
      {hasMore && !isLoadingShouts && (
        <div className="flex justify-center py-8">
          <button
            onClick={() => fetchShouts(false)}
            disabled={isLoadingMore}
            className="px-6 py-2 rounded-full border border-th-border text-th-text-3 hover:text-th-text hover:border-th-text-3 transition-colors text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoadingMore ? (
              <span className="flex items-center gap-2">
                <span className="w-4 h-4 border-2 border-th-border border-t-th-text-2 rounded-full animate-spin" />
                Загрузка...
              </span>
            ) : (
              'Загрузить ещё'
            )}
          </button>
        </div>
      )}

      {/* Confirm ignore modal */}
      {confirmIgnore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !ignoreLoading && setConfirmIgnore(false)}>
          <div className="bg-th-card border border-th-border rounded-xl p-5 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-th-text font-medium mb-2">Добавить в игнор?</div>
            <div className="text-th-text-3 text-sm mb-4">Контент пользователя <span className="font-medium text-th-text-2">{profile.name}</span> будет скрыт в ленте и комментариях.</div>
            {ignoreError && <div className="text-xs text-red-400 mb-3">{ignoreError}</div>}
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setConfirmIgnore(false); setIgnoreError(null); }} disabled={ignoreLoading} className="px-4 py-1.5 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors rounded">Отмена</button>
              <button onClick={handleIgnore} disabled={ignoreLoading} className="px-4 py-1.5 text-sm bg-neutral-800 dark:bg-neutral-200 text-white dark:text-neutral-900 rounded font-medium disabled:opacity-50 transition-colors hover:opacity-90">
                {ignoreLoading ? 'Добавление...' : 'Добавить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Confirm unignore modal */}
      {confirmUnignore && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => !ignoreLoading && setConfirmUnignore(false)}>
          <div className="bg-th-card border border-th-border rounded-xl p-5 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-th-text font-medium mb-2">Убрать из игнора?</div>
            <div className="text-th-text-3 text-sm mb-4">Контент пользователя <span className="font-medium text-th-text-2">{profile.name}</span> снова будет отображаться.</div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => { setConfirmUnignore(false); setIgnoreError(null); }} disabled={ignoreLoading} className="px-4 py-1.5 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors rounded">Отмена</button>
              <button onClick={handleUnignore} disabled={ignoreLoading} className="px-4 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white rounded font-medium disabled:opacity-50 transition-colors">
                {ignoreLoading ? 'Убираем...' : 'Убрать'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Ignore list modal */}
      {showIgnoreList && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" onClick={() => setShowIgnoreList(false)}>
          <div className="bg-th-card border border-th-border rounded-xl p-5 max-w-md w-full mx-4 shadow-2xl max-h-[80vh] flex flex-col" onClick={(e) => e.stopPropagation()}>
            <div className="flex items-center justify-between mb-4">
              <h3 className="text-th-text font-bold text-lg">Список игнора</h3>
              <button onClick={() => setShowIgnoreList(false)} className="text-th-text-4 hover:text-th-text transition-colors p-1">
                <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <line x1="18" y1="6" x2="6" y2="18"/><line x1="6" y1="6" x2="18" y2="18"/>
                </svg>
              </button>
            </div>
            {ignoreListLoading ? (
              <div className="flex justify-center py-8">
                <div className="w-6 h-6 border-2 border-th-border border-t-th-text-3 rounded-full animate-spin" />
              </div>
            ) : ignoreListUsers.length === 0 ? (
              <div className="text-center text-th-text-4 text-sm py-8">
                Вы никого не игнорируете
              </div>
            ) : (
              <div className="overflow-y-auto flex flex-col gap-2">
                {ignoreListUsers.map(u => (
                  <div key={u.id} className="flex items-center gap-3 p-2 rounded-lg hover:bg-th-ring/5">
                    <a href={`/profile/${u.id}`} className="shrink-0" onClick={() => setShowIgnoreList(false)}>
                      <div className="w-8 h-8 rounded-full overflow-hidden bg-th-input">
                        {u.avatar ? (
                          <img src={u.avatar} alt={u.name} className="w-full h-full object-cover" />
                        ) : (
                          <div className="w-full h-full flex items-center justify-center text-th-text-4 text-xs font-bold">
                            {u.name.charAt(0).toUpperCase()}
                          </div>
                        )}
                      </div>
                    </a>
                    <a href={`/profile/${u.id}`} className="text-sm text-th-text-2 font-medium hover:underline flex-1 min-w-0 truncate" onClick={() => setShowIgnoreList(false)}>
                      {u.name}
                    </a>
                    <button
                      onClick={() => handleRemoveFromIgnoreList(u.id)}
                      className="text-xs text-red-600 dark:text-red-400 hover:text-red-700 dark:hover:text-red-300 border border-red-400/50 dark:border-red-500/40 hover:border-red-500 dark:hover:border-red-400/60 bg-red-50 dark:bg-red-500/10 px-3 py-1 rounded-lg transition-colors shrink-0"
                    >
                      Убрать
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>
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
