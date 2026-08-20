export interface User {
  id: string;
  name: string;
  avatar: string;
  isBanned?: boolean;
}

export interface UserProfile {
  id: string;
  name: string;
  avatar: string;
  isBanned?: boolean;
  email?: string;
  showNsfw?: boolean;
  showPolitics?: boolean;
  createdAt: string;
  shoutCount?: number;
  isOwner: boolean;
}

export type ShoutMedia =
  // `thumb` is present only for animated images, `full` only for still ones —
  // the other variant is not generated (feature 008). `url` is always present.
  | { type: 'image'; url: string; thumb?: string; full?: string; width: number; height: number; animated?: boolean; gif?: string; orientation?: number }
  // `url` is optional because an expired video has no file to point at
  // (feature 011). Optional rather than absent-by-convention so every
  // `<video src=…>` call site is forced to be revisited by the type checker
  // instead of silently receiving undefined.
  | { type: 'video'; url?: string; thumb?: string; width?: number; height?: number; expired?: boolean }
  | { type: 'youtube'; videoId: string; embedUrl: string; title?: string | null; channel?: string | null }
  | { type: 'giphy'; giphyId: string; url: string; still: string; width: number; height: number };

/**
 * One item of a multi-media gallery (feature 006).
 *
 * Deliberately NOT named `ShoutMedia` — that name is already the Prisma
 * join-row model (shout_id/media_id/position) on the backend, and colliding
 * would make the two easy to confuse. A gallery item is the *wire* shape
 * produced by `buildMedia()`, identical to the single `media` field.
 *
 * Galleries only ever contain static images (invariant I4, revised 2026-07-31
 * — GIFs are permanently excluded from any 2+-item gallery), so this narrows
 * ShoutMedia to its image variant. The variant's own `animated`/`gif` fields
 * remain in the type (a single, non-gallery attachment can still be a GIF),
 * but a `GalleryItem[]` gallery array never has them set.
 */
export type GalleryItem = Extract<ShoutMedia, { type: 'image' }>;

export interface CommentQuote {
  text: string;
  deleted: boolean;
  mediaOnly?: boolean;
  author: { id: string; name: string } | null;
}

export interface Comment {
  id: string;
  shoutId: string;
  user: User;
  content: string;
  timestamp: string;
  likes: number;
  likedBy?: string[];
  media?: ShoutMedia;
  /** Ordered gallery; present only when 2+ items are attached (contract G3). */
  gallery?: GalleryItem[];
  replyToId?: string | null;
  quote?: CommentQuote | null;
}

export interface MentionUser {
  id: string;
  name: string;
  avatar: string;
}

export interface Notification {
  id: string;
  type: 'mention' | 'reply';
  actor: { id: string; name: string; avatar: string };
  shoutId: string | null;
  commentId: string | null;
  isRead: boolean;
  timestamp: string;
  snippet?: string;
}

export interface PollOption {
  id: string;
  text: string;
  votes: number;
}

export interface Poll {
  id: string;
  multi: boolean;
  options: PollOption[];
  userVotes: string[];
  totalVoters: number;
}

export type SocialType = 'steam' | 'playstation' | 'xbox' | 'battlenet' | 'epicgames' | 'retroachievements' | 'exophase' | 'backloggd' | 'youtube' | 'myshows' | 'telegram' | 'x' | 'discord' | 'boosty';

export interface SocialDto {
  type: SocialType;
  url: string;
  display_name: string;
}

export interface Shout {
  id: string;
  user: User | null;
  content: string;
  timestamp: string;
  likes: number;
  likedBy?: string[];
  media?: ShoutMedia;
  /** Ordered gallery; present only when 2+ items are attached (contract G3). */
  gallery?: GalleryItem[];
  comments?: Comment[];
  visibilityTag?: '' | 'spoiler' | 'nsfw' | 'politics';
  poll?: Poll;
  isDeleted?: boolean;
  isPinned?: boolean;
}