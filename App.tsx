
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents, useMap } from 'react-leaflet';
import L from 'leaflet';
import { Pin, PinType } from './types';
import { PIN_CONFIG } from './constants';
import AIPanel from './components/AIPanel';
import { fetchRealTimeCitySignals, generateSimulatedPins } from './services/geminiService';

const FOGGIA_COORDS: [number, number] = [41.4622, 15.5447];
const USER_ID_KEY = 'flp_author_token';
const USER_NAME_KEY = 'flp_author_name';
const USER_AVATAR_KEY = 'flp_author_avatar';

const ADJECTIVES = ['Veloce', 'Silenzioso', 'Attivo', 'Curioso', 'Ribelle', 'Saggio', 'Fiero', 'Libero'];
const NOUNS = ['Foggiano', 'Cittadino', 'Esploratore', 'Osservatore', 'Guardiano', 'Viaggiatore'];

const getAuthorIdentity = () => {
  let token = localStorage.getItem(USER_ID_KEY);
  let name = localStorage.getItem(USER_NAME_KEY);
  let avatar = localStorage.getItem(USER_AVATAR_KEY);

  if (!token) {
    token = 'user_' + Math.random().toString(36).substr(2, 9);
    name = ADJECTIVES[Math.floor(Math.random() * ADJECTIVES.length)] + ' ' + NOUNS[Math.floor(Math.random() * NOUNS.length)];
    avatar = `https://api.dicebear.com/7.x/bottts/svg?seed=${token}`;
    localStorage.setItem(USER_ID_KEY, token);
    localStorage.setItem(USER_NAME_KEY, name);
    localStorage.setItem(USER_AVATAR_KEY, avatar);
  }
  return { token, name: name!, avatar: avatar! };
};

const deconflictPins = (pins: Pin[]): Pin[] => {
  const coordinateMap: Record<string, number> = {};
  return pins.map(pin => {
    const key = `${pin.lat.toFixed(5)},${pin.lng.toFixed(5)}`;
    const count = coordinateMap[key] || 0;
    coordinateMap[key] = count + 1;
    if (count === 0) return pin;
    const angle = count * 0.5;
    const offset = 0.00015 * count;
    return {
      ...pin,
      lat: pin.lat + Math.cos(angle) * offset,
      lng: pin.lng + Math.sin(angle) * offset,
      rotation: (pin.rotation || 0) + (count * 3)
    };
  });
};

const PostItMarker: React.FC<{ 
  pin: Pin; 
  isOwner: boolean; 
  onEdit: (pin: Pin) => void;
  onLike: (pin: Pin) => void;
}> = ({ pin, isOwner, onEdit, onLike }) => {
  const config = PIN_CONFIG[pin.type === 'news' ? 'visto' : pin.type];
  const [isExpanded, setIsExpanded] = useState(false);

  const timeLeft = useMemo(() => {
    const diff = new Date(pin.expiresAt).getTime() - Date.now();
    if (diff <= 0) return 'Scaduto';
    const mins = Math.floor(diff / 60000);
    if (mins < 60) return `${mins}m`;
    return `${Math.floor(mins / 60)}h`;
  }, [pin.expiresAt]);

  const icon = L.divIcon({
    className: 'custom-div-icon',
    html: isExpanded ? `
      <div class="expanded-postit w-64 p-6 shadow-2xl relative bg-[#ffff88] text-black" style="transform: rotate(${pin.rotation || 0}deg); box-shadow: 10px 10px 15px rgba(0,0,0,0.2);">
        <div class="absolute -top-2 left-1/2 -translate-x-1/2 w-12 h-4 bg-white/40 rotate-1 shadow-sm"></div>
        <div class="absolute top-2 right-2 text-[8px] font-mono opacity-50 flex items-center gap-2">
          ${pin.sourceUrl ? `<a href="${pin.sourceUrl}" target="_blank" rel="noopener noreferrer" class="bg-black/10 px-1 rounded hover:bg-black/20 transition-colors">FONTE ↗</a>` : ''}
          ${timeLeft}
        </div>
        <div class="flex items-center gap-2 mb-4">
          <img src="${pin.authorAvatar}" class="w-6 h-6 rounded-full bg-black/5" />
          <div class="flex flex-col">
            <span class="font-bold text-[10px] uppercase tracking-tight">${pin.authorName}</span>
            <span class="text-[8px] opacity-60">${pin.time} • ${pin.address}</span>
          </div>
        </div>
        <div class="font-serif text-[16px] leading-tight mb-6 min-h-[60px] flex items-center justify-center text-center px-2">
          "${pin.text}"
        </div>
        <div class="flex justify-between items-center border-t border-black/10 pt-4">
          <div class="flex gap-3">
            <button id="btn-like-${pin.id}" class="flex items-center gap-1 hover:scale-110 transition-transform">
              <span class="text-sm">🔥</span>
              <span class="text-[10px] font-bold">${pin.reactions.like}</span>
            </button>
            <div class="flex items-center gap-1 opacity-40">
              <span class="text-sm">💬</span>
              <span class="text-[10px] font-bold">${pin.reactions.comment}</span>
            </div>
          </div>
          <div class="flex gap-2">
            ${isOwner ? `<button id="btn-edit-${pin.id}" class="text-[9px] font-bold uppercase underline decoration-2 underline-offset-2">Edit</button>` : ''}
            <button id="btn-close-${pin.id}" class="text-[9px] font-bold uppercase underline decoration-2 underline-offset-2">Close</button>
          </div>
        </div>
      </div>
    ` : `
      <div class="flex flex-col items-center group">
        <div class="relative">
          <div class="pin-3d shadow-lg ${pin.isLive ? 'ring-2 ring-orange-500 animate-pulse' : 'ring-1 ring-white/20'}" 
               style="background: ${pin.isLive ? '#ff4e00' : '#111'}; border: 2px solid #333;">
            <span class="absolute inset-0 flex items-center justify-center text-[12px] transform rotate(45deg)">${pin.isLive ? '📢' : config.emoji}</span>
          </div>
          <div class="absolute -top-4 left-1/2 -translate-x-1/2 opacity-0 group-hover:opacity-100 transition-opacity bg-black text-[7px] text-white px-1 rounded font-mono whitespace-nowrap border border-white/10">
            ${timeLeft}
          </div>
        </div>
      </div>
    `,
    iconSize: isExpanded ? [260, 220] : [34, 34],
    iconAnchor: isExpanded ? [130, 180] : [17, 34]
  });

  useEffect(() => {
    if (isExpanded) {
      if (isOwner) {
        const editBtn = document.getElementById(`btn-edit-${pin.id}`);
        if (editBtn) editBtn.onclick = (e) => { e.stopPropagation(); onEdit(pin); };
      }
      const likeBtn = document.getElementById(`btn-like-${pin.id}`);
      if (likeBtn) likeBtn.onclick = (e) => { e.stopPropagation(); onLike(pin); };

      const closeBtn = document.getElementById(`btn-close-${pin.id}`);
      if (closeBtn) closeBtn.onclick = (e) => { e.stopPropagation(); setIsExpanded(false); };
    }
  }, [isExpanded, isOwner, pin.id, onEdit, onLike]);

  return (
    <Marker position={[pin.lat, pin.lng]} icon={icon} eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); setIsExpanded(!isExpanded); } }} />
  );
};

const MapPicker = ({ onPositionChange, onCityChange }: { onPositionChange: (latlng: [number, number]) => void, onCityChange: (lat: number, lng: number) => void }) => {
  useMapEvents({ 
    move: (e) => {
      const center = e.target.getCenter();
      onPositionChange([center.lat, center.lng]);
      onCityChange(center.lat, center.lng);
    } 
  });
  return null;
};

const HeaderCityController = ({ onCityChange, center }: { onCityChange: (lat: number, lng: number) => void, center?: [number, number] }) => {
  const map = useMap();
  
  useEffect(() => {
    if (center) {
      map.setView(center, map.getZoom());
    }
  }, [center, map]);

  useMapEvents({ 
    moveend: (e) => {
      const center = e.target.getCenter();
      onCityChange(center.lat, center.lng);
    } 
  });
  return null;
};

const App: React.FC = () => {
  const myIdentity = useMemo(() => getAuthorIdentity(), []);
  const [pins, setPins] = useState<Pin[]>([]);
  const [aiPins, setAiPins] = useState<Pin[]>([]);
  const [isPickerActive, setIsPickerActive] = useState(false);
  const [pickerPos, setPickerPos] = useState<[number, number]>(FOGGIA_COORDS);
  const [mapCenter, setMapCenter] = useState<[number, number]>(FOGGIA_COORDS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSearchingAI, setIsSearchingAI] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  const [isPremiumUser, setIsPremiumUser] = useState(false);
  const [showAuthModal, setShowAuthModal] = useState(false);
  const [showApiKeyWarning, setShowApiKeyWarning] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formText, setFormText] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formType, setFormType] = useState<PinType>('visto');
  const [formDuration, setFormDuration] = useState(60); // minutes
  const [cityCode, setCityCode] = useState('...');
  const [ws, setWs] = useState<WebSocket | null>(null);
  const [wsStatus, setWsStatus] = useState<{ online: boolean, clients: number }>({ online: false, clients: 0 });
  const [errorToast, setErrorToast] = useState<string | null>(null);

  const updateCityCode = useCallback((lat: number, lng: number) => {
    const cities = [
      { code: 'FG', name: 'Foggia', coords: [41.4622, 15.5447] },
      { code: 'NA', name: 'Napoli', coords: [40.8518, 14.2681] },
      { code: 'RM', name: 'Roma', coords: [41.9028, 12.4964] },
      { code: 'MI', name: 'Milano', coords: [45.4642, 9.1899] },
      { code: 'BA', name: 'Bari', coords: [41.1171, 16.8719] },
      { code: 'TO', name: 'Torino', coords: [45.0703, 7.6869] },
      { code: 'FI', name: 'Firenze', coords: [43.7696, 11.2558] },
      { code: 'BO', name: 'Bologna', coords: [44.4949, 11.3426] },
      { code: 'PA', name: 'Palermo', coords: [38.1157, 13.3615] },
      { code: 'CT', name: 'Catania', coords: [37.5079, 15.0830] },
    ];

    let closest = cities[0];
    let minDist = Infinity;

    cities.forEach(c => {
      const d = Math.sqrt(Math.pow(lat - c.coords[0], 2) + Math.pow(lng - c.coords[1], 2));
      if (d < minDist) {
        minDist = d;
        closest = c;
      }
    });

    if (minDist < 0.3) {
      setCityCode(closest.code);
    } else {
      setCityCode('??');
    }
  }, []);

  useEffect(() => {
    if (errorToast) {
      const timer = setTimeout(() => setErrorToast(null), 5000);
      return () => clearTimeout(timer);
    }
  }, [errorToast]);

  const requestLocation = () => {
    if ("geolocation" in navigator) {
      navigator.geolocation.getCurrentPosition((position) => {
        const { latitude, longitude } = position.coords;
        setMapCenter([latitude, longitude]);
        setPickerPos([latitude, longitude]);
        updateCityCode(latitude, longitude);
      }, (err) => {
        alert("Impossibile ottenere la posizione. Controlla i permessi del browser.");
      });
    }
  };

  useEffect(() => {
    if (!process.env.GEMINI_API_KEY) {
      setShowApiKeyWarning(true);
    }
    requestLocation();
    const fetchPins = async () => {
      setIsSyncing(true);
      try {
        const res = await fetch('/api/pins');
        const data = await res.json();
        setPins(data as Pin[]);
        setSyncError(false);
      } catch (err) {
        setSyncError(true);
      } finally {
        setIsSyncing(false);
      }
    };
    fetchPins();

    // Setup WebSocket
    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const socket = new WebSocket(`${protocol}//${window.location.host}`);
    
    socket.onopen = () => {
      console.log('Connected to Pulse Stream');
      setSyncError(false);
    };

    socket.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'STATUS') {
          setWsStatus({ online: true, clients: data.payload.clients });
        } else if (data.type === 'INSERT') {
          setPins(curr => {
            if (curr.find(p => p.id === data.payload.id)) return curr;
            return [...curr, data.payload as Pin];
          });
        } else if (data.type === 'UPDATE') {
          setPins(curr => curr.map(p => p.id === data.payload.id ? (data.payload as Pin) : p));
        } else if (data.type === 'DELETE') {
          setPins(curr => curr.filter(p => p.id !== data.payload.id));
        }
      } catch (e) {
        console.error('WS Parse Error', e);
      }
    };

    socket.onclose = () => {
      console.log('Disconnected from Pulse Stream');
      setSyncError(true);
    };

    setWs(socket);
    return () => { socket.close(); };
  }, []);

  const lastFetchRef = React.useRef<{ pos: [number, number], time: number }>({ pos: [0, 0], time: 0 });

  const refreshLiveFeed = useCallback(async (force = false) => {
    const now = Date.now();
    const dist = Math.sqrt(Math.pow(mapCenter[0] - lastFetchRef.current.pos[0], 2) + Math.pow(mapCenter[1] - lastFetchRef.current.pos[1], 2));
    
    // Only auto-fetch if moved significantly (> 5km approx) and at least 2 minutes passed
    // Or if forced (manual button)
    if (!force && now - lastFetchRef.current.time < 120000 && dist < 0.05) {
      return;
    }

    setIsSearchingAI(true);
    try {
      const liveSignals = await fetchRealTimeCitySignals(mapCenter[0], mapCenter[1], cityCode);
      const mapped = liveSignals.map((s, i) => ({
        ...s,
        id: `ai-news-${Date.now()}-${i}`,
        authorId: 'system-ai',
        type: (s.type as PinType) || 'visto',
        emoji: '📢',
        isLive: true,
        reactions: { like: Math.floor(Math.random()*50), heart: 10, comment: 5 },
        tags: ["#livenews", `#${cityCode.toLowerCase()}`],
        rotation: Math.random() * 6 - 3
      } as Pin));
      setAiPins(mapped);
      lastFetchRef.current = { pos: mapCenter, time: now };
    } catch (e: any) {
      console.warn("Live Feed non disponibile");
      if (e?.message?.includes('429')) {
        setErrorToast("Quota AI esaurita. Riprova tra un po'.");
      }
    } finally {
      setIsSearchingAI(false);
    }
  }, [mapCenter, cityCode]);

  useEffect(() => { 
    // Initial fetch on mount or when city changes significantly
    refreshLiveFeed(); 
  }, [refreshLiveFeed]);

  const handleSimulateFromChat = async (scenario: string) => {
    setIsSearchingAI(true);
    try {
      const simulated = await generateSimulatedPins(scenario, mapCenter[0], mapCenter[1], cityCode);
      const mapped = simulated.map((s, i) => ({
        ...s,
        id: `sim-${Date.now()}-${i}`,
        authorId: 'system-ai',
        type: (s.type as PinType) || 'visto',
        emoji: PIN_CONFIG[(s.type as PinType) || 'visto'].emoji,
        reactions: { like: 0, heart: 0, comment: 0 },
        tags: ["#simulazione"],
        rotation: Math.random() * 10 - 5
      } as Pin));
      setAiPins(prev => [...prev, ...mapped]);
    } catch (e: any) {
      console.error("Simulation error", e);
      if (JSON.stringify(e).toLowerCase().includes('429') || JSON.stringify(e).toLowerCase().includes('quota')) {
        setErrorToast("Limite AI raggiunto. Attendi un minuto.");
      } else {
        setErrorToast("Errore durante la simulazione AI.");
      }
    } finally {
      setIsSearchingAI(false);
    }
  };

  const handleLike = (pin: Pin) => {
    if (ws && ws.readyState === WebSocket.OPEN) {
      const updatedPin = {
        ...pin,
        reactions: {
          ...pin.reactions,
          like: (pin.reactions.like || 0) + 1
        }
      };
      ws.send(JSON.stringify({ type: 'UPDATE', payload: updatedPin }));
    }
  };

  const handleSave = async () => {
    if (!formText.trim() || !formAddress.trim()) return;
    
    // Check if duration is premium (e.g. 24h)
    if (formDuration > 360 && !isPremiumUser) {
      setShowAuthModal(true);
      return;
    }

    const expiresAt = new Date(Date.now() + formDuration * 60000).toISOString();
    
    const pinData = {
      id: editingId || `pin-${Date.now()}`,
      authorId: myIdentity.token,
      authorName: myIdentity.name,
      authorAvatar: myIdentity.avatar,
      type: formType,
      emoji: PIN_CONFIG[formType].emoji,
      text: formText,
      address: formAddress,
      user: myIdentity.name,
      time: "adesso",
      expiresAt,
      sentiment: 'neutro',
      reactions: { like: 0, heart: 0, comment: 0 },
      tags: [],
      lat: pickerPos[0],
      lng: pickerPos[1],
      rotation: Math.random() * 8 - 4
    };
    try {
      if (ws && ws.readyState === WebSocket.OPEN) {
        if (editingId) {
          ws.send(JSON.stringify({ type: 'UPDATE', payload: pinData }));
        } else {
          ws.send(JSON.stringify({ type: 'INSERT', payload: pinData }));
        }
        setIsModalOpen(false);
      } else {
        alert("Errore: Connessione al server persa.");
      }
    } catch (err) {
      alert("Errore salvataggio Pulse.");
    }
  };

  const allVisiblePins = useMemo(() => {
    const now = Date.now();
    const filtered = [...pins, ...aiPins].filter(p => {
      if (!p.expiresAt) return true; // Keep old pins or system pins without expiry
      return new Date(p.expiresAt).getTime() > now;
    });
    return deconflictPins(filtered);
  }, [pins, aiPins]);

  const liveLog = useMemo(() => {
    return [...allVisiblePins].sort((a, b) => new Date(b.time === 'adesso' ? Date.now() : b.time).getTime() - new Date(a.time === 'adesso' ? Date.now() : a.time).getTime());
  }, [allVisiblePins]);

  const handleShare = () => {
    const url = "https://ais-pre-4jufblxpmtpaann6j5w35m-423537804131.europe-west2.run.app";
    navigator.clipboard.writeText(url);
    setShowShareToast(true);
    setTimeout(() => setShowShareToast(false), 3000);
  };

  return (
    <div className="h-screen w-screen flex flex-col bg-[#0a0a0a] text-white overflow-hidden font-mono">
      {showApiKeyWarning && (
        <div className="fixed bottom-24 right-6 z-[3000] bg-orange-500 text-white p-4 rounded-lg shadow-2xl max-w-xs border border-white/20">
          <div className="flex items-center gap-2 mb-2">
            <span className="text-lg">⚠️</span>
            <span className="font-bold text-[10px] uppercase tracking-widest">AI Offline</span>
          </div>
          <p className="text-[9px] leading-tight opacity-90">
            La chiave Gemini API non è configurata. Le funzioni di ricerca news e simulazione non funzioneranno.
          </p>
          <button onClick={() => setShowApiKeyWarning(false)} className="mt-3 w-full py-1 bg-white/20 hover:bg-white/30 rounded text-[8px] font-bold uppercase">Chiudi</button>
        </div>
      )}
      {showShareToast && (
        <div className="fixed top-20 right-6 z-[3000] bg-[#00ff41] text-black px-4 py-2 rounded shadow-2xl font-bold text-[10px] animate-bounce">
          LINK COPIATO! INVIALO AI TUOI AMICI 🚀
        </div>
      )}
      <header className="h-16 bg-[#151619] border-b border-white/5 z-[1000] flex items-center justify-between px-6 shadow-2xl">
        <div className="flex items-center gap-6">
          <div className="flex flex-col">
            <div className="flex items-center gap-2">
              <div className="w-2 h-2 rounded-full bg-[#00ff41] shadow-[0_0_8px_#00ff41]"></div>
              <h1 className="font-black text-xl tracking-tighter uppercase italic text-white">LIVE<span className="text-[#00ff41]">PIN</span></h1>
            </div>
            <span className="text-[7px] uppercase tracking-[0.3em] font-bold text-white/30">Hyper-Local Pulse Network</span>
          </div>
          
          <div className="h-8 w-px bg-white/10"></div>
          
          <div className="flex items-center gap-4">
            <div className="flex flex-col">
              <span className="text-[7px] uppercase font-bold text-white/40">Location</span>
              <span className="text-[10px] font-black text-[#00ff41]">{cityCode}</span>
            </div>
            <div className="flex flex-col">
              <span className="text-[7px] uppercase font-bold text-white/40">Status</span>
              <span className={`text-[10px] font-black ${wsStatus.online ? 'text-[#00ff41]' : 'text-red-500'}`}>
                {wsStatus.online ? 'CONNECTED' : 'OFFLINE'}
              </span>
            </div>
            <div className="flex flex-col">
              <span className="text-[7px] uppercase font-bold text-white/40">Nodes</span>
              <span className="text-[10px] font-black text-white/60">{wsStatus.clients}</span>
            </div>
          </div>
        </div>
        
        <div className="flex items-center gap-4">
          <div className="hidden md:flex items-center gap-3 bg-white/5 border border-white/10 px-4 py-2 rounded-lg">
            <img src={myIdentity.avatar} className="w-5 h-5 rounded-full ring-1 ring-[#00ff41]/30" />
            <div className="flex flex-col">
              <div className="flex items-center gap-1">
                <span className="text-[8px] font-bold text-white/80 leading-none">{myIdentity.name}</span>
                {isPremiumUser && <span className="text-[6px] bg-[#00ff41] text-black px-1 rounded font-black">PRO</span>}
              </div>
              <span className="text-[6px] font-bold text-white/30 uppercase tracking-widest">Operator</span>
            </div>
            {!isPremiumUser && (
              <button 
                onClick={() => setShowAuthModal(true)} 
                className="ml-2 text-[7px] font-bold text-[#00ff41] border border-[#00ff41]/30 px-2 py-1 rounded hover:bg-[#00ff41]/10 transition-all"
              >
                UPGRADE
              </button>
            )}
          </div>
          
          <button onClick={() => setIsAIOpen(true)} className="group relative px-6 py-2 bg-[#00ff41] text-black font-black text-[10px] uppercase tracking-widest rounded overflow-hidden transition-all hover:scale-105 active:scale-95">
            <div className="absolute inset-0 bg-white/20 translate-y-full group-hover:translate-y-0 transition-transform"></div>
            <span className="relative">AI Terminal</span>
          </button>
        </div>
      </header>

      <main className="flex-1 flex relative">
        {/* Live Log Sidebar */}
        <aside className="hidden lg:flex flex-col w-80 bg-black border-r border-white/10 overflow-hidden">
          <div className="p-4 border-b border-white/10 bg-white/5">
            <h2 className="text-[10px] font-black uppercase tracking-[0.2em] text-[#00ff41]">Live Log</h2>
          </div>
          <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-hide">
            {liveLog.map(pin => (
              <div key={pin.id} className="p-3 bg-white/5 border border-white/10 rounded hover:bg-white/10 transition-colors cursor-pointer group">
                <div className="flex justify-between items-start mb-2">
                  <span className="text-[8px] font-bold text-[#00ff41] uppercase">{pin.type}</span>
                  <span className="text-[8px] text-white/30 font-mono italic">{pin.time}</span>
                </div>
                <p className="text-[11px] leading-relaxed text-white/80 italic mb-2">"{pin.text}"</p>
                <div className="flex items-center justify-between">
                  <div className="flex items-center gap-1">
                    <img src={pin.authorAvatar} className="w-3 h-3 rounded-full" />
                    <span className="text-[8px] text-white/40">{pin.authorName}</span>
                  </div>
                  <span className="text-[8px] text-orange-500 font-bold">EXP: {new Date(pin.expiresAt).toLocaleTimeString([], {hour: '2-digit', minute:'2-digit'})}</span>
                </div>
              </div>
            ))}
          </div>
        </aside>

        <div className="flex-1 relative">
          <MapContainer center={mapCenter} zoom={15} zoomControl={false} style={{ height: '100%', width: '100%', background: '#000' }}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            <HeaderCityController onCityChange={updateCityCode} center={mapCenter} />
            {isPickerActive && <MapPicker onPositionChange={setPickerPos} onCityChange={updateCityCode} />}
            {allVisiblePins.map(pin => (
              <PostItMarker 
                key={pin.id} 
                pin={pin} 
                isOwner={pin.authorId === myIdentity.token} 
                onEdit={(p) => { setEditingId(p.id); setFormText(p.text); setFormAddress(p.address); setFormType(p.type); setIsModalOpen(true); }} 
                onLike={handleLike}
              />
            ))}

            {isPickerActive && (
              <div className="absolute inset-0 pointer-events-none z-[2000] flex items-center justify-center">
                <div className="relative">
                  <div className="w-8 h-8 border-2 border-[#00ff41] rounded-full animate-pulse"></div>
                  <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-1 h-1 bg-[#00ff41] rounded-full"></div>
                  <div className="absolute -bottom-10 left-1/2 -translate-x-1/2 bg-black/80 text-[#00ff41] text-[8px] font-bold px-2 py-1 rounded whitespace-nowrap border border-[#00ff41]/20">
                    SPOSTA LA MAPPA PER POSIZIONARE IL PIN
                  </div>
                </div>
              </div>
            )}
          </MapContainer>

          <div className="absolute top-4 right-4 z-[1000] flex flex-col gap-2">
            <button onClick={requestLocation} className="w-10 h-10 bg-black/80 border border-white/20 rounded-full flex items-center justify-center text-white shadow-xl hover:bg-black transition-all" title="La mia posizione">
              📍
            </button>
            <button 
              onClick={() => refreshLiveFeed(true)} 
              disabled={isSearchingAI}
              className={`w-10 h-10 bg-black/80 border border-white/20 rounded-full flex items-center justify-center text-white shadow-xl hover:bg-black transition-all ${isSearchingAI ? 'animate-spin opacity-50' : ''}`}
              title="Cerca News AI in questa zona"
            >
              {isSearchingAI ? '⌛' : '🔍'}
            </button>
          </div>

          {errorToast && (
            <div className="absolute top-20 left-1/2 -translate-x-1/2 z-[2000] bg-red-600 text-white px-4 py-2 rounded-full shadow-2xl font-bold text-xs animate-bounce">
              ⚠️ {errorToast}
            </div>
          )}

          <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000] w-[90%] max-w-sm">
            {!isPickerActive ? (
              <button onClick={() => { setIsPickerActive(true); setEditingId(null); setFormText(''); setFormAddress(''); }} className="w-full bg-[#00ff41] text-black py-4 rounded font-black text-xs tracking-[0.2em] uppercase shadow-[0_0_20px_rgba(0,255,65,0.3)] hover:scale-[1.02] transition-all active:scale-95">+ Broadcast Pulse</button>
            ) : (
              <div className="flex gap-2 p-2 bg-black border border-white/20 rounded shadow-2xl">
                <button onClick={() => setIsPickerActive(false)} className="flex-1 py-3 text-white/40 font-bold text-[10px] uppercase">Cancel</button>
                <button onClick={() => { setIsPickerActive(false); setIsModalOpen(true); }} className="flex-[2] py-3 bg-[#00ff41] text-black rounded font-bold text-[10px] uppercase tracking-widest">Set Location</button>
              </div>
            )}
          </div>
        </div>
      </main>

      <AIPanel 
        isOpen={isAIOpen} 
        onClose={() => setIsAIOpen(false)} 
        onSimulatePins={handleSimulateFromChat} 
        lat={mapCenter[0]}
        lng={mapCenter[1]}
        cityCode={cityCode}
      />

      {isModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-black/90 backdrop-blur-md p-4">
          <div className="bg-[#111] border border-white/10 p-8 w-full max-w-lg shadow-2xl relative">
            <h3 className="text-2xl font-black text-[#00ff41] tracking-tighter mb-8 uppercase italic">Broadcast Pulse</h3>
            <div className="space-y-6">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {(Object.keys(PIN_CONFIG) as PinType[]).map(type => (
                  <button key={type} onClick={() => setFormType(type)} className={`flex-shrink-0 flex items-center gap-2 px-4 py-2 rounded border transition-all text-[10px] font-bold ${formType === type ? 'border-[#00ff41] bg-[#00ff41] text-black' : 'border-white/10 text-white/40 bg-white/5'}`}>
                    <span>{PIN_CONFIG[type].emoji}</span> {PIN_CONFIG[type].label}
                  </button>
                ))}
              </div>
              
              <div className="space-y-2">
                <div className="flex justify-between items-center">
                  <label className="text-[8px] uppercase tracking-widest text-white/40 font-bold">Duration (Ephemeral)</label>
                  {isPremiumUser && <span className="text-[7px] bg-[#00ff41]/20 text-[#00ff41] px-1 rounded font-bold uppercase">Premium Active</span>}
                </div>
                <div className="flex gap-2">
                  {[30, 60, 360, 1440].map(mins => (
                    <button 
                      key={mins} 
                      onClick={() => setFormDuration(mins)} 
                      className={`flex-1 py-2 text-[9px] font-bold border rounded transition-all relative overflow-hidden ${formDuration === mins ? 'border-[#00ff41] text-[#00ff41] bg-[#00ff41]/10' : 'border-white/10 text-white/40'}`}
                    >
                      {mins === 1440 && !isPremiumUser && <span className="absolute top-0 right-0 bg-orange-500 text-white text-[5px] px-1 font-black">PRO</span>}
                      {mins < 60 ? `${mins}m` : `${mins/60}h`}
                    </button>
                  ))}
                </div>
              </div>

              <input className="w-full bg-white/5 border border-white/10 rounded px-4 py-3 text-sm outline-none focus:border-[#00ff41] transition-all text-white" placeholder="Location in Foggia..." value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
              <textarea className="w-full h-32 bg-white/5 border border-white/10 rounded p-4 text-sm outline-none focus:border-[#00ff41] resize-none transition-all text-white" placeholder="What's happening now? (max 140 char)..." maxLength={140} value={formText} onChange={(e) => setFormText(e.target.value)} />
              
              <div className="flex gap-3">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-4 font-bold text-white/40 text-[10px] uppercase">Discard</button>
                <button onClick={handleSave} className="flex-[3] py-4 bg-[#00ff41] text-black font-bold rounded shadow-xl hover:brightness-110 transition-all active:scale-95 uppercase text-[10px] tracking-widest">Transmit</button>
              </div>
            </div>
          </div>
        </div>
      )}
      {showAuthModal && (
        <div className="fixed inset-0 z-[3000] flex items-center justify-center bg-black/95 backdrop-blur-xl p-4">
          <div className="bg-[#111] border border-[#00ff41]/30 p-10 w-full max-w-md shadow-[0_0_50px_rgba(0,255,65,0.1)] text-center">
            <div className="w-16 h-16 bg-[#00ff41]/10 rounded-full flex items-center justify-center mx-auto mb-6 border border-[#00ff41]/20">
              <span className="text-2xl">💎</span>
            </div>
            <h3 className="text-xl font-black text-white uppercase tracking-tighter mb-2 italic">Premium Required</h3>
            <p className="text-white/60 text-xs mb-8 leading-relaxed">
              I pin che durano più di 6 ore sono riservati agli utenti verificati. 
              Accedi per sbloccare la durata di 24 ore e altre funzioni pro.
            </p>
            <div className="space-y-3">
              <button 
                onClick={() => { setIsPremiumUser(true); setShowAuthModal(false); handleSave(); }} 
                className="w-full py-4 bg-[#00ff41] text-black font-black uppercase text-[10px] tracking-[0.2em] rounded shadow-lg hover:scale-[1.02] transition-all"
              >
                Accedi / Diventa Pro
              </button>
              <button 
                onClick={() => setShowAuthModal(false)} 
                className="w-full py-4 text-white/40 font-bold uppercase text-[10px] tracking-widest"
              >
                Continua come ospite
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
