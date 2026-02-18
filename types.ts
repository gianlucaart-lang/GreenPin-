
export type PinType = 'visto' | 'fatto' | 'raccolto' | 'offro';

export interface PinReactions {
  like: number;
  heart: number;
  comment: number;
}

export interface Pin {
  id: string;
  type: PinType;
  emoji: string;
  text: string;
  user: string;
  time: string;
  sentiment: 'positivo' | 'neutro' | 'urgente' | 'ispirante';
  reactions: PinReactions;
  tags: string[];
  lat: number; // Latitudine reale
  lng: number; // Longitudine reale
  x?: number; // Added for compatibility with coordinate-based positioning
  y?: number; // Added for compatibility with coordinate-based positioning
  rotation?: number;
}

export interface AreaAnalysis {
  zona: string;
  periodo: string;
  ratio_visto_fatto: string;
  utenti_catalizzatore: string[];
  picchi_orari: string[];
  temi_ricorrenti: string[];
  insight_principale: string;
  azione_consigliata: string;
  confronto_benchmark: string;
}

export interface ConnectionSuggestion {
  pin_A: string;
  pin_B: string;
  connessione: string;
  azione_suggerita: string;
  valore_generato: string;
}

export interface ChatMessage {
  role: 'user' | 'bot';
  content: string;
  isGenerating?: boolean;
}
