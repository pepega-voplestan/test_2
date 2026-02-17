export interface User {
  id: string;
  name: string;
  avatar: string;
  isBanned?: boolean;
}

export interface Shout {
  id: string;
  user: User;
  content: string;
  timestamp: string;
  likes: number;
  likedBy?: string[];
  image?: string;
  embed?: {
    type: 'youtube';
    src: string;
  };
  replies?: Shout[];
}