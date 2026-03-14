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
  | { type: 'image'; url: string; thumb: string; full: string; width: number; height: number; animated?: boolean; gif?: string }
  | { type: 'video'; url: string; thumb?: string; width?: number; height?: number }
  | { type: 'youtube'; videoId: string; embedUrl: string; title?: string | null; channel?: string | null };

export interface Comment {
  id: string;
  shoutId: string;
  user: User;
  content: string;
  timestamp: string;
  likes: number;
  likedBy?: string[];
  media?: ShoutMedia;
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

export interface Shout {
  id: string;
  user: User | null;
  content: string;
  timestamp: string;
  likes: number;
  likedBy?: string[];
  media?: ShoutMedia;
  comments?: Comment[];
  visibilityTag?: '' | 'spoiler' | 'nsfw' | 'politics';
  isDeleted?: boolean;
  isPinned?: boolean;
}