
import { GoogleGenAI, Type } from "@google/genai";
import { SYSTEM_PROMPT } from "../constants";
import { Pin, AreaAnalysis, ConnectionSuggestion } from "../types";

// Note: GoogleGenAI is initialized inside functions to ensure the most up-to-date API key is used.

export const generateSimulatedPins = async (scenario: string): Promise<Partial<Pin>[]> => {
  try {
    // Initializing right before call to use the latest API_KEY from environment/dialog
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: `Genera 5 post-it simulati ambientati a FOGGIA (Italia). Per ogni post-it includi coordinate geografiche realistiche entro un raggio di 2km dal centro (41.4622, 15.5447). Scenario: ${scenario}`,
      config: {
        systemInstruction: SYSTEM_PROMPT + "\nIMPORTANTE: Restituisci sempre 'lat' e 'lng' numerici validi per la città di Foggia.",
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              type: { type: Type.STRING },
              emoji: { type: Type.STRING },
              text: { type: Type.STRING },
              user: { type: Type.STRING },
              time: { type: Type.STRING },
              sentiment: { type: Type.STRING },
              lat: { type: Type.NUMBER },
              lng: { type: Type.NUMBER },
              reactions: {
                type: Type.OBJECT,
                properties: {
                  like: { type: Type.NUMBER },
                  heart: { type: Type.NUMBER },
                  comment: { type: Type.NUMBER }
                }
              },
              tags: {
                type: Type.ARRAY,
                items: { type: Type.STRING }
              }
            },
            required: ["type", "text", "user", "time", "lat", "lng"]
          }
        }
      }
    });

    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Gemini Error:", error);
    return [];
  }
};

export const analyzeArea = async (pins: Pin[]): Promise<AreaAnalysis | null> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const pinsSummary = pins.map(p => `ID:${p.id} [${p.user} a Foggia]: ${p.text}`).join('\n');
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview", // Complex analysis task: using pro
      contents: `Analizza questi post-it della città di Foggia e restituisci un'analisi di zona dettagliata:\n${pinsSummary}`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.OBJECT,
          properties: {
            zona: { type: Type.STRING },
            periodo: { type: Type.STRING },
            ratio_visto_fatto: { type: Type.STRING },
            utenti_catalizzatore: { type: Type.ARRAY, items: { type: Type.STRING } },
            picchi_orari: { type: Type.ARRAY, items: { type: Type.STRING } },
            temi_ricorrenti: { type: Type.ARRAY, items: { type: Type.STRING } },
            insight_principale: { type: Type.STRING },
            azione_consigliata: { type: Type.STRING },
            confronto_benchmark: { type: Type.STRING }
          }
        }
      }
    });

    return JSON.parse(response.text || '{}');
  } catch (error) {
    console.error("Gemini Analysis Error:", error);
    return null;
  }
};

export const suggestConnections = async (pins: Pin[]): Promise<ConnectionSuggestion[]> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    const pinsSummary = pins.map(p => `ID:${p.id} [${p.user}]: ${p.text}`).join('\n');
    const response = await ai.models.generateContent({
      model: "gemini-3-pro-preview", // Complex reasoning task: using pro
      contents: `Trova 2-3 connessioni civiche a Foggia:\n${pinsSummary}`,
      config: {
        systemInstruction: SYSTEM_PROMPT,
        responseMimeType: "application/json",
        responseSchema: {
          type: Type.ARRAY,
          items: {
            type: Type.OBJECT,
            properties: {
              pin_A: { type: Type.STRING },
              pin_B: { type: Type.STRING },
              connessione: { type: Type.STRING },
              azione_suggerita: { type: Type.STRING },
              valore_generato: { type: Type.STRING }
            }
          }
        }
      }
    });

    return JSON.parse(response.text || '[]');
  } catch (error) {
    console.error("Gemini Connection Error:", error);
    return [];
  }
};

export const chatWithAI = async (message: string, history: { role: 'user' | 'bot'; content: string }[]): Promise<string> => {
  try {
    const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
    // Convert history format to chat format (user/model)
    const chatHistory = history.map(h => ({
      role: h.role === 'bot' ? 'model' : 'user',
      parts: [{ text: h.content }]
    }));

    const chat = ai.chats.create({
      model: 'gemini-3-flash-preview',
      config: {
        systemInstruction: SYSTEM_PROMPT + "\nTi trovi ad operare sulla mappa di Foggia.",
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
