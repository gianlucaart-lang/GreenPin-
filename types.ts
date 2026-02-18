
export type PinType = 'visto' | 'fatto' | 'raccolto' | 'offro' | 'news';

export interface PinReactions {
  like: number;
  heart: number;
  comment: number;
}

export interface Pin {
  id: string;
  authorId: string;
  type: PinType;
  emoji: string;
  text: string;
  address: string;
  user: string;
  time: string;
  sentiment: 'positivo' | 'neutro' | 'urgente' | 'ispirante';
  reactions: PinReactions;
  tags: string[];
  lat: number;
  lng: number;
  rotation?: number;
  sourceUrl?: string; // URL della notizia reale
  isLive?: boolean;   // Flag per news in tempo reale
  // Added optional x and y coordinates to support relative positioning on CSS maps
  x?: number;
  y?: number;
}

export interface ChatMessage {
  role: 'user' | 'bot';
  content: string;
  isGenerating?: boolean;
}