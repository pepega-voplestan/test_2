export interface User {
  id: string;
  name: string;
  avatar: string;
  email?: string;
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

export interface NewsItem {
  id: string;
  title: string;
  date?: string;
  ageLimit?: string;
  link: string;
}