
export type PinType = 'visto' | 'fatto' | 'raccolto' | 'offro' | 'news';

export interface PinReactions {
  like: number;
  heart: number;
  comment: number;
}

export interface Pin {
  id: string;
  authorId: string;
  authorName: string;   // Pseudo-anonymous name
  authorAvatar: string; // Avatar URL or identifier
  type: PinType;
  emoji: string;
  text: string;
  address: string;
  user: string;
  time: string;
  expiresAt: string;    // ISO string for expiration
  isPremium?: boolean;  // If true, can last longer
  sentiment: 'positivo' | 'neutro' | 'urgente' | 'ispirante';
  reactions: PinReactions;
  tags: string[];
  lat: number;
  lng: number;
  rotation?: number;
  sourceUrl?: string; // URL della notizia reale
  isLive?: boolean;   // Flag per news in tempo reale
  x?: number;
  y?: number;
}

export interface ChatMessage {
  role: 'user' | 'bot';
  content: string;
  isGenerating?: boolean;
}