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
  createdAt: string;
  shoutCount?: number;
  isOwner: boolean;
}

export type ShoutMedia =
  | { type: 'image'; url: string; thumb: string; full: string; width: number; height: number }
  | { type: 'youtube'; videoId: string; embedUrl: string; title?: string | null; channel?: string | null };

export interface Shout {
  id: string;
  user: User;
  content: string;
  timestamp: string;
  likes: number;
  likedBy?: string[];
  media?: ShoutMedia;
  replies?: Shout[];
}