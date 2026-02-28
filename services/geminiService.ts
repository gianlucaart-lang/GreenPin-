
import { GoogleGenAI, Type } from "@google/genai";
import { SYSTEM_PROMPT } from "../constants";
import { Pin } from "../types";

export const fetchRealTimeCitySignals = async (): Promise<Partial<Pin>[]> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    // Usiamo gemini-3-pro-preview per la ricerca complessa e il grounding
    const response = await ai.models.generateContent({
      model: "gemini-3.1-pro-preview",
      contents: "Cerca notizie REALI, eventi, lavori in corso o allerte meteo a Foggia (Puglia, Italia) pubblicate nelle ultime 24-48 ore. Trasformale in 5 oggetti JSON per la mappa. Includi per ogni notizia: testo breve, indirizzo approssimativo, coordinate lat/lng precise, authorName (es. 'News_Foggia'), expiresAt (ISO string, tra 6 e 24 ore da ora) e l'URL della fonte.",
      config: {
        systemInstruction: SYSTEM_PROMPT + "\nSEI UN AGGREGATORE DI NEWS REALI. Restituisci JSON puro.",
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

    // Logging dei grounding chunks come richiesto
    if (response.candidates?.[0]?.groundingMetadata?.groundingChunks) {
        console.log("Foggia News Sources:", response.candidates[0].groundingMetadata.groundingChunks);
    }
    
    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Gemini Search Error:", error);
    return [];
  }
};

export const chatWithAI = async (message: string, history: { role: 'user' | 'bot'; content: string }[]): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const chatHistory = history.map(h => ({
      role: h.role === 'bot' ? 'model' : 'user',
      parts: [{ text: h.content }]
    }));

    const chat = ai.chats.create({
      model: 'gemini-3.1-pro-preview',
      config: {
        systemInstruction: SYSTEM_PROMPT + "\nTi trovi ad operare sulla mappa di Foggia. Rispondi in modo iper-locale e rapido.",
      },
      history: chatHistory,
    });
    const response = await chat.sendMessage({ message });
    return response.text || "Errore di generazione.";
  } catch (error) {
    console.error("Gemini Chat Error:", error);
    return "Errore nella comunicazione.";
  }
};

export const generateSimulatedPins = async (scenario: string): Promise<Partial<Pin>[]> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3.1-flash-preview",
      contents: `Genera 5 impulsi simulati a FOGGIA basati su questo scenario: ${scenario}. Ogni impulso deve avere un expiresAt (ISO) tra 30 min e 6 ore da ora.`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
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
  } catch (error) {
    return [];
  }
};
