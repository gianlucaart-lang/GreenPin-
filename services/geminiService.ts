
import { GoogleGenAI, Type } from "@google/genai";
import { SYSTEM_PROMPT } from "../constants";
import { Pin } from "../types";

export const fetchRealTimeCitySignals = async (): Promise<Partial<Pin>[]> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    // Utilizziamo Gemini 3 Pro per il supporto a Google Search
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview",
      contents: "Trova le ultime notizie, eventi o segnalazioni di degrado/lavori stradali/iniziative civiche a Foggia (Italia) pubblicate nelle ultime 48 ore. Trasformale in 5 post-it per GreenPin.",
      config: {
        systemInstruction: SYSTEM_PROMPT + "\nUsa Google Search per trovare dati REALI. Restituisci JSON con lat e lng precise per le zone di Foggia menzionate.",
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              emoji: { type: Type.STRING },
              text: { type: Type.STRING },
              address: { type: Type.STRING },
              user: { type: Type.STRING },
              time: { type: Type.STRING },
              lat: { type: Type.NUMBER },
              lng: { type: Type.NUMBER },
              sentiment: { type: Type.STRING }
            },
            required: ["type", "text", "address", "lat", "lng"]
          }
        }
      }
    });

    // Estraiamo i link se presenti per referenziare la fonte (Grounding)
    console.log("Sources:", response.candidates?.[0]?.groundingMetadata?.groundingChunks);
    
    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Gemini Search Error:", error);
    return [];
  }
};

export const chatWithAI = async (message: string, history: { role: 'user' | 'bot'; content: string }[]): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const chatHistory = history.map(h => ({
      role: h.role === 'bot' ? 'model' : 'user',
      parts: [{ text: h.content }]
    }));

    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: SYSTEM_PROMPT + "\nTi trovi ad operare sulla mappa di Foggia. Sei connesso ai segnali live della città.",
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
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Genera 5 post-it simulati a FOGGIA. Scenario: ${scenario}`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              emoji: { type: Type.STRING },
              text: { type: Type.STRING },
              address: { type: Type.STRING },
              user: { type: Type.STRING },
              time: { type: Type.STRING },
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
