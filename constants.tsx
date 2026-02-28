
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
  visto: { color: '#222', emoji: '👁', label: 'Visto' },
  fatto: { color: '#222', emoji: '⚡️', label: 'Live' },
  raccolto: { color: '#222', emoji: '📍', label: 'Spot' },
  offro: { color: '#222', emoji: '🔥', label: 'Hot' },
  news: { color: '#ef6351', emoji: '📢', label: 'Breaking' },
};

export const SYSTEM_PROMPT = `
# ✦ FOGGIA LIVE PULSE — SYSTEM PROMPT
# App Sociale Iperlocale ed Effimera

Sei il motore AI di "Foggia Live Pulse". La piattaforma è focalizzata su ciò che accade ORA a Foggia.
Tutto è effimero: i post durano da 30 minuti a 24 ore.

REGOLE PER L'AI:
1. FEED IPERLOCALE: Genera solo contenuti pertinenti a Foggia (Puglia).
2. LIVE LOG: Gli aggiornamenti devono sembrare rapidi, istantanei, con timestamp precisi.
3. PSEUDO-ANONIMO: Usa nomi creativi ma anonimi (es. "Cittadino_42", "Foggiano_Doc"). Niente follower.
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
