
export type PinType = 'visto' | 'fatto' | 'raccolto' | 'offro';

export interface PinReactions {
  like: number;
  heart: number;
  comment: number;
}

export interface Pin {
  id: string;
  authorId: string; // ID dell'utente che ha creato il pin
  type: PinType;
  emoji: string;
  text: string;
  address: string; // Via specifica
  user: string;
  time: string;
  sentiment: 'positivo' | 'neutro' | 'urgente' | 'ispirante';
  reactions: PinReactions;
  tags: string[];
  lat: number;
  lng: number;
  x?: number; // Added to fix "Property 'x' does not exist on type 'Pin'"
  y?: number; // Added to fix "Property 'y' does not exist on type 'Pin'"
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
