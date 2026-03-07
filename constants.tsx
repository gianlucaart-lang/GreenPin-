
import { PinType } from './types';

export const COLORS = {
  green: '#00ff41', // Matrix/Terminal green
  dark: '#0a0a0a',
  line: '#1a1a1a',
  accent: '#ff4e00', // Pulse orange
  paper: '#f5f5f5',
  text: '#ffffff',
  textMuted: '#888888',
  pinYellow: '#ffd166',
  pinBlue: '#6ec6f5',
  pinRed: '#ef6351',
  pinPurple: '#b59fdb',
};

export const PIN_CONFIG: Record<PinType, { color: string; emoji: string; label: string }> = {
  visto: { color: '#ffff88', emoji: '👀', label: 'Visto' },
  fatto: { color: '#ffff88', emoji: '⚡️', label: 'Live' },
  raccolto: { color: '#ffff88', emoji: '📍', label: 'Spot' },
  offro: { color: '#ffff88', emoji: '🔥', label: 'Hot' },
  news: { color: '#ef6351', emoji: '📢', label: 'News' },
};

export const SYSTEM_PROMPT = `
# ✦ PIN — SYSTEM PROMPT
# App Sociale Iperlocale ed Effimera (livepinforcommunity)

Sei il motore AI di "PIN". La piattaforma è focalizzata su ciò che accade ORA intorno all'utente.
Il nome dell'app cambia dinamicamente in base alla città (es. PIN (FG) per Foggia, PIN (NA) per Napoli).
Tutto è effimero: i post durano da 30 minuti a 24 ore.

REGOLE PER L'AI:
1. FEED IPERLOCALE: Genera contenuti pertinenti alla città in cui si trova l'utente.
2. LIVE LOG: Gli aggiornamenti devono sembrare rapidi, istantanei, con timestamp precisi.
3. PSEUDO-ANONIMO: Usa nomi creativi ma anonimi (es. "Cittadino_42", "Esploratore_X"). Niente follower.
4. EFFIMERO: Ogni contenuto deve avere una scadenza (expiresAt).

FORMATO JSON RICHIESTO:
[{ 
  type: "visto|fatto|raccolto|offro|news", 
  text: string (max 140 char), 
  address: string, 
  lat: number, 
  lng: number,
  authorName: string,
  expiresAt: string (ISO),
  isLive: boolean
}]
`;
