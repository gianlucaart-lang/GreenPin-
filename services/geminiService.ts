
import { GoogleGenAI, Type } from "@google/genai";
import { SYSTEM_PROMPT } from "../constants";
import { Pin } from "../types";

const sleep = (ms: number) => new Promise(resolve => setTimeout(resolve, ms));

async function withRetry<T>(fn: () => Promise<T>, maxRetries = 3): Promise<T> {
  let lastError: any;
  for (let i = 0; i < maxRetries; i++) {
    try {
      return await fn();
    } catch (error: any) {
      lastError = error;
      // Check if it's a rate limit error (429)
      const isRateLimit = error?.message?.includes('429') || error?.status === 429 || error?.code === 429;
      if (isRateLimit && i < maxRetries - 1) {
        const delay = Math.pow(2, i) * 1000 + Math.random() * 1000;
        console.warn(`Rate limit hit. Retrying in ${Math.round(delay)}ms... (Attempt ${i + 1}/${maxRetries})`);
        await sleep(delay);
        continue;
      }
      throw error;
    }
  }
  throw lastError;
}

export const fetchRealTimeCitySignals = async (lat: number, lng: number, cityCode: string): Promise<Partial<Pin>[]> => {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("GEMINI_API_KEY non configurata. Funzionalità AI disabilitate.");
    return [];
  }
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: `Cerca notizie REALI, eventi, lavori in corso o allerte meteo vicino a queste coordinate: ${lat}, ${lng} (Codice Città: ${cityCode}). Trasformale in 5 oggetti JSON per la mappa. Includi per ogni notizia: testo breve, indirizzo approssimativo, coordinate lat/lng precise, authorName (es. 'News_${cityCode}'), expiresAt (ISO string, tra 6 e 24 ore da ora) e l'URL della fonte.`,
      config: {
        systemInstruction: SYSTEM_PROMPT + `\nSEI UN AGGREGATORE DI NEWS REALI PER LA CITTÀ ${cityCode}. Restituisci JSON puro.`,
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              text: { type: Type.STRING },
              address: { type: Type.STRING },
              authorName: { type: Type.STRING },
              expiresAt: { type: Type.STRING },
              lat: { type: Type.NUMBER },
              lng: { type: Type.NUMBER },
              sourceUrl: { type: Type.STRING },
              isLive: { type: Type.BOOLEAN }
            },
            required: ["text", "address", "lat", "lng", "expiresAt"]
          }
        }
      }
    });

    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        console.log(`${cityCode} News Sources:`, response.candidates[0].groundingMetadata.groundingChunks);
    }
    
    return JSON.parse(response.text || '[]');
  }).catch(error => {
    console.error("Gemini Search Error after retries:", error);
    return [];
  });
};

export const chatWithAI = async (message: string, history: { role: 'user' | 'bot'; content: string }[], lat: number, lng: number, cityCode: string): Promise<string> => {
  if (!process.env.GEMINI_API_KEY) {
    return "L'assistente AI è disabilitato. Configura la chiave API per chattare.";
  }
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const chatHistory = history.map(h => ({
      role: h.role === 'bot' ? 'model' : 'user',
      parts: [{ text: h.content }]
    }));

    const chat = ai.chats.create({
      model: 'gemini-3.1-pro-preview',
      config: {
        systemInstruction: SYSTEM_PROMPT + `\nTi trovi ad operare sulla mappa di ${cityCode} (Coordinate: ${lat}, ${lng}). Rispondi in modo iper-locale e rapido.`,
      },
      history: chatHistory,
    });
    const response = await chat.sendMessage({ message });
    return response.text || "Errore di generazione.";
  }).catch(error => {
    console.error("Gemini Chat Error after retries:", error);
    return "Servizio temporaneamente sovraccarico. Riprova tra un istante.";
  });
};

export const generateSimulatedPins = async (scenario: string, lat: number, lng: number, cityCode: string): Promise<Partial<Pin>[]> => {
  if (!process.env.GEMINI_API_KEY) {
    console.warn("Simulazione AI disabilitata: chiave mancante.");
    return [];
  }
  return withRetry(async () => {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-preview",
      contents: `Genera 5 impulsi simulati vicino a ${lat}, ${lng} (Città: ${cityCode}) basati su questo scenario: ${scenario}. Ogni impulso deve avere un expiresAt (ISO) tra 30 min e 6 ore da ora.`,
      config: {
        systemInstruction: SYSTEM_PROMPT + `\nTi trovi ad operare sulla mappa di ${cityCode}.`,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              text: { type: Type.STRING },
              address: { type: Type.STRING },
              authorName: { type: Type.STRING },
              expiresAt: { type: Type.STRING },
              lat: { type: Type.NUMBER },
              lng: { type: Type.NUMBER }
            }
          }
        }
      }
    });
    return JSON.parse(response.text || '[]');
  }).catch(error => {
    console.error("Gemini Simulation Error after retries:", error);
    return [];
  });
};
