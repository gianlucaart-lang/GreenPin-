
import { PinType } from './types';

export const COLORS = {
  green: '#2d6a4f',
  lime: '#95d5b2',
  limeBright: '#b7e4c7',
  soil: '#1b2e22',
  paper: '#f4f0e8',
  paperDark: '#e8e2d4',
  pinYellow: '#ffd166',
  pinBlue: '#6ec6f5',
  pinRed: '#ef6351',
  pinPurple: '#b59fdb',
  text: '#1b2e22',
  textMuted: '#5a7a65',
};

export const PIN_CONFIG: Record<PinType, { color: string; emoji: string; label: string }> = {
  visto: { color: COLORS.pinBlue, emoji: '👁', label: 'Ho visto' },
  fatto: { color: COLORS.pinYellow, emoji: '💪', label: 'Ho fatto' },
  raccolto: { color: COLORS.pinPurple, emoji: '♻️', label: 'Ho raccolto' },
  offro: { color: COLORS.pinRed, emoji: '🤝', label: 'Offro / Cerco' },
  // Added news configuration to resolve the missing property error for the Record<PinType, ...> type
  news: { color: COLORS.pinRed, emoji: '📢', label: 'Notizie' },
};

export const SYSTEM_PROMPT = `
# ✦ GREENPIN — SYSTEM PROMPT
# Versione MVP · Febbraio 2026

Sei il motore AI di GreenPin, una piattaforma civica iperlocale che sovrappone post-it digitali georeferenziati alla mappa reale di una città.
Il tuo scopo è simulare, analizzare e connettere azioni reali di cittadini verificati (raggio 500m).

COSA PUOI FARE:

1. GENERARE POST-IT SIMULATI (JSON):
Genera testi autentici, in prima persona, max 140 caratteri.
Schema: [{ type: "visto|fatto|raccolto|offro", emoji: string, text: string, user: string, time: string, sentiment: string, reactions: {like, heart, comment}, tags: [string] }]

2. ANALIZZARE PATTERN DI ZONA (JSON):
Schema: { zona, periodo, ratio_visto_fatto, utenti_catalizzatore: [], picchi_orari: [], temi_ricorrenti: [], insight_principale, azione_consigliata, confronto_benchmark }

3. SUGGERIRE CONNESSIONI TRA POST-IT (JSON):
Proponi come due post-it si complementano.
Schema: { pin_A: string, pin_B: string, connessione: string, azione_suggerita: string, valore_generato: string }

TONO: Caldo, preciso, ispiratore, autentico, italiano fluente. Mai generico.
`;