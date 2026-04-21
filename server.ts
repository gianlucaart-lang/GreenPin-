import express from "express";
import { createServer as createViteServer } from "vite";
import { WebSocketServer, WebSocket } from "ws";
import { createServer as createHttpServer } from "http";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { GoogleGenAI, Type } from "@google/genai";
import { createClient } from "@supabase/supabase-js";

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

process.on('uncaughtException', (err) => {
  console.error('Uncaught Exception:', err);
});

process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});

console.log("Starting PIN Server...");
console.log("NODE_ENV:", process.env.NODE_ENV);

const PORT = 3000;

// Configurazione Supabase
const supabaseUrl = process.env.SUPABASE_URL || '';
const supabaseKey = process.env.SUPABASE_SERVICE_ROLE_KEY || ''; // Usa Service Role per CRUD illimitato sul server
const supabase = (supabaseUrl && supabaseKey) ? createClient(supabaseUrl, supabaseKey) : null;

if (!supabase) {
  console.warn("⚠️ [SUPABASE] Credenziali mancanti. I dati non saranno persistenti su database.");
}

// Carica i pin iniziali
let pins: any[] = [];

async function loadPinsFromSupabase() {
  if (!supabase) return;
  try {
    const { data, error } = await supabase.from('pins').select('*');
    if (error) throw error;
    if (data) {
      pins = data.map(p => ({
        ...p,
        reactions: p.reactions || { like: 0, heart: 0, comment: 0 },
        tags: p.tags || []
      }));
      console.log(`✅ [SUPABASE] Caricati ${pins.length} pin dal database.`);
    }
  } catch (err) {
    console.error("❌ [SUPABASE] Errore caricamento pin:", err);
  }
}

async function startServer() {
  console.log("startServer() called...");
  await loadPinsFromSupabase();
  const app = express();
  app.use((req, res, next) => {
    console.log(`${req.method} ${req.url}`);
    next();
  });
  const server = createHttpServer(app);
  const wss = new WebSocketServer({ server });

  app.use(express.json());

  // Logging di tutte le richieste per debug
  app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url} - IP: ${req.ip}`);
    next();
  });

  app.get("/api/status", (req, res) => {
    res.json({ 
      status: "online", 
      uptime: process.uptime(),
      pins: pins.length,
      clients: wss.clients.size,
      env: process.env.NODE_ENV || 'development'
    });
  });

  // API per ottenere i pin iniziali
  app.get("/api/pins", (req, res) => {
    res.json(pins);
  });

  app.get("/api/health", (req, res) => {
    res.json({ status: "ok", pins: pins.length, env: process.env.NODE_ENV });
  });

  // News Collector
  const collectNews = async (retryCount = 0) => {
    console.log(`📡 Avvio raccolta news iper-locali (Foggia)... (Tentativo ${retryCount + 1})`);
    if (!process.env.GEMINI_API_KEY) {
      console.warn("⚠️ GEMINI_API_KEY mancante, raccolta news annullata.");
      return;
    }

    try {
      const ai = new GoogleGenAI({ apiKey: process.env.GEMINI_API_KEY });
      const response = await ai.models.generateContent({
        model: "gemini-flash-latest",
        contents: `Trova le ultime notizie REALI, eventi di cronaca, allerte meteo o lavori stradali a Foggia (Puglia) pubblicate nelle ultime 24 ore. 
        Consulta ESCLUSIVAMENTE fonti attendibili come: FoggiaToday, L'Immediato, Stato Quotidiano, Foggia Città Aperta. 
        Per ogni notizia DEVI fornire:
        1. Un testo breve (max 120 caratteri).
        2. L'indirizzo esatto o la zona citata.
        3. Le coordinate lat/lng precise.
        4. L'URL diretto alla notizia originale.
        Se non trovi notizie REALI e RECENTI, restituisci un array vuoto []. NON INVENTARE NULLA.`,
        config: {
          systemInstruction: "Sei un analista iper-locale per la città di Foggia. Il tuo compito è estrarre dati reali e geolocalizzarli. Restituisci solo JSON puro. Usa type='news', emoji='📢', authorName='Foggia Live'.",
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
                authorName: { type: Type.STRING },
                expiresAt: { type: Type.STRING },
                lat: { type: Type.NUMBER },
                lng: { type: Type.NUMBER },
                sourceUrl: { type: Type.STRING }
              },
              required: ["text", "address", "lat", "lng", "sourceUrl"]
            }
          }
        }
      });

      const newNews = JSON.parse(response.text || '[]');
      console.log(`✅ Raccolti ${newNews.length} impulsi news.`);
      
      const addedPins: any[] = [];
      for (const news of newNews) {
        // Validazione coordinate: Foggia è circa 41.46, 15.54
        // Accettiamo un raggio di circa 10-15km dal centro
        const isNearFoggia = news.lat > 41.35 && news.lat < 41.55 && news.lng > 15.40 && news.lng < 15.65;
        
        if (!isNearFoggia) {
          console.warn(`⚠️ News scartata (coordinate errate): ${news.text} @ ${news.lat}, ${news.lng}`);
          continue;
        }

        // Evitiamo duplicati basati sul testo
        if (pins.find(p => p.text === news.text)) continue;

        const pin = {
          ...news,
          id: `news_${Date.now()}_${Math.random().toString(36).substr(2, 5)}`,
          authorId: "system_news",
          authorAvatar: "https://api.dicebear.com/7.x/bottts/svg?seed=news",
          time: new Date().toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' }),
          expiresAt: news.expiresAt || new Date(Date.now() + 8 * 60 * 60 * 1000).toISOString(), // News durano 8h di default
          reactions: { like: 0, heart: 0, comment: 0 },
          tags: ['news', 'foggia', 'live'],
          isLive: true,
          rotation: Math.random() * 4 - 2
        };
        pins.push(pin);
        addedPins.push(pin);
      }

        if (pins.length > 150) pins = pins.slice(-150);
        
        // Salvataggio su Supabase
        if (supabase && addedPins.length > 0) {
          try {
            const { error } = await supabase.from('pins').insert(addedPins);
            if (error) throw error;
            console.log(`💾 [SUPABASE] ${addedPins.length} news salvate.`);
          } catch (err) {
            console.error("❌ [SUPABASE] Errore salvataggio news:", err);
          }
        }
        
        // Notifica tutti i client dei nuovi pin
      addedPins.forEach(p => broadcast({ type: "INSERT", payload: p }));
      
    } catch (error: any) {
      const errorStr = JSON.stringify(error).toLowerCase();
      
      if (errorStr.includes("api_key_invalid") || errorStr.includes("api key not valid")) {
        console.error("❌ ERRORE CRITICO NEWS COLLECTOR: La chiave GEMINI_API_KEY non è valida. L'integrazione AI è sospesa.");
        return; // Don't retry if key is invalid
      }

      if ((errorStr.includes("429") || errorStr.includes("quota") || errorStr.includes("resource_exhausted")) && retryCount < 3) {
        const delay = Math.pow(2, retryCount) * 10000; // 10s, 20s, 40s - More aggressive backoff for background
        console.warn(`⚠️ News Collector: Quota esaurita. Riprovo tra ${delay/1000}s... (Tentativo ${retryCount + 1})`);
        setTimeout(() => collectNews(retryCount + 1), delay);
      } else {
        console.error("❌ Errore News Collector:", error);
      }
    }
  };

  app.post("/api/collect-news", async (req, res) => {
    // Si può ancora triggerare manualmente dal server se necessario
    await collectNews();
    res.json({ status: "News collection triggered manually on server" });
  });

  // Avvio periodico news collector (Server-side)
  setInterval(collectNews, 30 * 60 * 1000);
  setTimeout(collectNews, 3000);

  // WebSocket per aggiornamenti in tempo reale
  wss.on("connection", (ws, req) => {
    const clientIp = req.socket.remoteAddress;
    console.log(`[WS] New client connected from ${clientIp}. Total clients: ${wss.clients.size}`);
    
    // Send initial status
    ws.send(JSON.stringify({ type: "STATUS", payload: { online: true, clients: wss.clients.size } }));

    ws.on("message", (message) => {
      try {
        const data = JSON.parse(message.toString());
        console.log(`📩 [WS] Messaggio ricevuto: ${data.type}`);
        
        if (data.type === "INSERT") {
          const newPin = data.payload;
          pins.push(newPin);
          console.log(`📍 [NUOVO PIN] Aggiunto da ${newPin.authorName}: ${newPin.text}`);
          
          if (supabase) {
            supabase.from('pins').insert([newPin]).then(({ error }) => {
              if (error) console.error("❌ [SUPABASE] Errore INSERT:", error);
            });
          }

          broadcast({ type: "INSERT", payload: newPin });
        } else if (data.type === "UPDATE") {
          const updatedPin = data.payload;
          pins = pins.map(p => p.id === updatedPin.id ? updatedPin : p);
          
          if (supabase) {
            supabase.from('pins').update(updatedPin).eq('id', updatedPin.id).then(({ error }) => {
              if (error) console.error("❌ [SUPABASE] Errore UPDATE:", error);
            });
          }

          broadcast({ type: "UPDATE", payload: updatedPin });
        } else if (data.type === "DELETE") {
          const id = data.payload.id;
          pins = pins.filter(p => p.id !== id);
          
          if (supabase) {
            supabase.from('pins').delete().eq('id', id).then(({ error }) => {
              if (error) console.error("❌ [SUPABASE] Errore DELETE:", error);
            });
          }

          broadcast({ type: "DELETE", payload: { id } });
        }
      } catch (e) {
        console.error("WS Error:", e);
      }
    });
  });

  function broadcast(msg: any) {
    const data = JSON.stringify(msg);
    wss.clients.forEach((client) => {
      if (client.readyState === WebSocket.OPEN) {
        client.send(data);
      }
    });
  }

  // Funzione di pulizia pin scaduti
  const pruneExpiredPins = () => {
    const now = new Date().getTime();
    const initialCount = pins.length;
    
    const expired = pins.filter(p => p.expiresAt && new Date(p.expiresAt).getTime() < now);
    
    if (expired.length > 0) {
      console.log(`🧹 Pulizia: rimossi ${expired.length} pin scaduti.`);
      const expiredIds = expired.map(p => p.id);
      pins = pins.filter(p => !expiredIds.includes(p.id));
      
      if (supabase) {
        supabase.from('pins').delete().in('id', expiredIds).then(({ error }) => {
          if (error) console.error("❌ [SUPABASE] Errore pulizia:", error);
        });
      }
      
      // Notifica i client della rimozione
      expired.forEach(p => broadcast({ type: "DELETE", payload: { id: p.id } }));
    }
  };

  // Esegui pulizia ogni minuto
  setInterval(pruneExpiredPins, 60 * 1000);

  // Validazione coordinate via Nominatim (Opzionale ma utile per precisione)
  const validateLocation = async (lat: number, lng: number) => {
    try {
      const res = await fetch(`https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`, {
        headers: { 'User-Agent': 'LivePinApp/1.0' }
      });
      const data: any = await res.json();
      return data.address?.city === "Foggia" || data.address?.town === "Foggia" || data.address?.county === "Foggia";
    } catch (e) {
      return true; // Fallback se l'API fallisce
    }
  };

  // Vite middleware per lo sviluppo
  if (process.env.NODE_ENV !== "production") {
    try {
      console.log("🚀 Avvio Vite in modalità Middleware...");
      const vite = await createViteServer({
        server: { middlewareMode: true },
        appType: "spa",
      });
      app.use(vite.middlewares);
      
      // Fallback per SPA in sviluppo
      app.get("*", async (req, res, next) => {
        const url = req.originalUrl;
        if (url.startsWith('/api') || url.startsWith('/ws')) return next();
        try {
          const indexPath = path.join(__dirname, "index.html");
          if (!fs.existsSync(indexPath)) {
            console.error("❌ index.html non trovato in:", indexPath);
            return res.status(500).send("index.html missing");
          }
          let template = fs.readFileSync(indexPath, "utf-8");
          template = await vite.transformIndexHtml(url, template);
          res.status(200).set({ "Content-Type": "text/html" }).end(template);
        } catch (e) {
          vite.ssrFixStacktrace(e as Error);
          next(e);
        }
      });
    } catch (e) {
      console.error("❌ Errore avvio Vite:", e);
    }
  } else {
    const distPath = path.join(__dirname, "dist");
    console.log("📦 Servizio file statici da:", distPath);
    
    if (fs.existsSync(distPath)) {
      app.use(express.static(distPath));
      app.get("*", (req, res) => {
        if (req.url.startsWith('/api')) return res.status(404).json({ error: "API non trovata" });
        const indexPath = path.join(distPath, "index.html");
        if (fs.existsSync(indexPath)) {
          res.sendFile(indexPath);
        } else {
          res.status(404).send("Build non completata (index.html mancante)");
        }
      });
    } else {
      console.warn("⚠️ Cartella 'dist' non trovata. Fallback su file root.");
      app.use(express.static(__dirname));
      app.get("*", (req, res) => {
        res.sendFile(path.join(__dirname, "index.html"));
      });
    }
  }

  server.listen(PORT, "0.0.0.0", () => {
    console.log(`PIN Server running on http://localhost:${PORT}`);
  });
}

startServer();
