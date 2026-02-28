
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Pin, PinType } from './types';
import { PIN_CONFIG } from './constants';
import AIPanel from './components/AIPanel';
import { fetchRealTimeCitySignals, generateSimulatedPins } from './services/geminiService';
import { supabase } from './services/supabaseClient';

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
}> = ({ pin, isOwner, onEdit }) => {
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
      <div class="expanded-postit w-64 p-5 shadow-2xl rounded-sm relative border-t-[6px] bg-black text-white" style="border-color: ${pin.isLive ? '#ff4e00' : '#00ff41'}; transform: rotate(${pin.rotation || 0}deg);">
        <div class="absolute -top-3 -right-3 bg-black border border-white/20 text-[8px] font-mono px-2 py-1 rounded shadow-lg flex items-center gap-1">
          <span class="w-1.5 h-1.5 rounded-full bg-red-500 animate-pulse"></span>
          ${timeLeft}
        </div>
        <div class="flex items-center gap-2 mb-3">
          <img src="${pin.authorAvatar}" class="w-6 h-6 rounded-full bg-white/10" />
          <div class="flex flex-col">
            <span class="font-mono text-[9px] font-bold text-white/80">${pin.authorName}</span>
            <span class="font-mono text-[7px] text-white/40">${pin.time} • ${pin.address}</span>
          </div>
        </div>
        <div class="font-serif text-[15px] leading-snug text-white mb-4 font-medium italic">"${pin.text}"</div>
        <div class="flex justify-between items-center border-t border-white/10 pt-3">
          <div class="flex gap-2">
            <span class="text-[10px]">🔥 ${pin.reactions.like}</span>
            <span class="text-[10px]">💬 ${pin.reactions.comment}</span>
          </div>
          ${isOwner ? `<button id="btn-edit-${pin.id}" class="bg-white/10 text-white text-[8px] px-3 py-1.5 rounded uppercase font-bold tracking-tighter hover:bg-white/20 transition-all">Edit</button>` : ''}
        </div>
        <div class="absolute -bottom-2 -right-2 bg-white text-black rounded-full w-8 h-8 flex items-center justify-center text-[14px] shadow-xl cursor-pointer hover:scale-110 transition-transform">✕</div>
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
    if (isExpanded && isOwner) {
      const btn = document.getElementById(`btn-edit-${pin.id}`);
      if (btn) btn.onclick = (e) => { e.stopPropagation(); onEdit(pin); };
    }
  }, [isExpanded, isOwner, pin.id]);

  return (
    <Marker position={[pin.lat, pin.lng]} icon={icon} eventHandlers={{ click: (e) => { L.DomEvent.stopPropagation(e); setIsExpanded(!isExpanded); } }} />
  );
};

const MapPicker = ({ onPositionChange }: { onPositionChange: (latlng: [number, number]) => void }) => {
  useMapEvents({ move: (e) => onPositionChange([e.target.getCenter().lat, e.target.getCenter().lng]) });
  return null;
};

const App: React.FC = () => {
  const myIdentity = useMemo(() => getAuthorIdentity(), []);
  const [pins, setPins] = useState<Pin[]>([]);
  const [aiPins, setAiPins] = useState<Pin[]>([]);
  const [isPickerActive, setIsPickerActive] = useState(false);
  const [pickerPos, setPickerPos] = useState<[number, number]>(FOGGIA_COORDS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [isSearchingAI, setIsSearchingAI] = useState(false);
  const [syncError, setSyncError] = useState(false);
  const [showShareToast, setShowShareToast] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formText, setFormText] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formType, setFormType] = useState<PinType>('visto');
  const [formDuration, setFormDuration] = useState(60); // minutes

  useEffect(() => {
    const fetchPins = async () => {
      setIsSyncing(true);
      try {
        const { data, error } = await supabase.from('pins').select('*');
        if (error) throw error;
        if (data) setPins(data as Pin[]);
        setSyncError(false);
      } catch (err) {
        setSyncError(true);
      } finally {
        setIsSyncing(false);
      }
    };
    fetchPins();
    const channel = supabase.channel('public:pins').on('postgres_changes', { event: '*', schema: 'public', table: 'pins' }, (payload) => {
      if (payload.eventType === 'INSERT') setPins(curr => [...curr, payload.new as Pin]);
      else if (payload.eventType === 'UPDATE') setPins(curr => curr.map(p => p.id === payload.new.id ? (payload.new as Pin) : p));
      else if (payload.eventType === 'DELETE') setPins(curr => curr.filter(p => p.id !== payload.old.id));
    }).subscribe();
    return () => { supabase.removeChannel(channel); };
  }, []);

  const refreshLiveFeed = useCallback(async () => {
    setIsSearchingAI(true);
    try {
      const liveSignals = await fetchRealTimeCitySignals();
      const mapped = liveSignals.map((s, i) => ({
        ...s,
        id: `ai-news-${Date.now()}-${i}`,
        authorId: 'system-ai',
        type: (s.type as PinType) || 'visto',
        emoji: '📢',
        isLive: true,
        reactions: { like: Math.floor(Math.random()*50), heart: 10, comment: 5 },
        tags: ["#livenews", "#foggia"],
        rotation: Math.random() * 6 - 3
      } as Pin));
      setAiPins(mapped);
    } catch (e) {
      console.warn("Live Feed non disponibile");
    } finally {
      setIsSearchingAI(false);
    }
  }, []);

  useEffect(() => { refreshLiveFeed(); }, [refreshLiveFeed]);

  const handleSimulateFromChat = async (scenario: string) => {
    setIsSearchingAI(true);
    try {
      const simulated = await generateSimulatedPins(scenario);
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
    } catch (e) {
      console.error("Simulation error");
    } finally {
      setIsSearchingAI(false);
    }
  };

  const handleSave = async () => {
    if (!formText.trim() || !formAddress.trim()) return;
    
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
      if (editingId) await supabase.from('pins').update(pinData).eq('id', editingId);
      else await supabase.from('pins').insert([pinData]);
      setIsModalOpen(false);
    } catch (err) {
      alert("Errore salvataggio Supabase.");
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
      {showShareToast && (
        <div className="fixed top-20 right-6 z-[3000] bg-[#00ff41] text-black px-4 py-2 rounded shadow-2xl font-bold text-[10px] animate-bounce">
          LINK COPIATO! INVIALO AI TUOI AMICI 🚀
        </div>
      )}
      <header className="h-16 bg-black border-b border-white/10 z-[1000] flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="w-10 h-10 bg-[#00ff41] rounded flex items-center justify-center text-black font-black text-xl shadow-[0_0_15px_rgba(0,255,65,0.4)]">
            F
          </div>
          <div>
            <h1 className="font-black text-lg tracking-tighter uppercase italic">Foggia <span className="text-[#00ff41]">Live Pulse</span></h1>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${syncError ? 'bg-red-500' : (isSyncing ? 'bg-yellow-400 animate-pulse' : 'bg-[#00ff41]')}`}></div>
              <p className="text-[7px] uppercase tracking-widest font-bold text-white/40">
                {syncError ? 'Offline' : (isSyncing ? 'Syncing...' : 'Live Feed Active')}
              </p>
            </div>
          </div>
        </div>
        <div className="flex items-center gap-3">
          <button onClick={handleShare} className="hidden md:flex items-center gap-2 bg-white/5 hover:bg-white/10 border border-white/10 px-3 py-1.5 rounded transition-all">
            <span className="text-xs">🔗</span>
            <span className="text-[9px] font-bold uppercase tracking-widest">Share Pulse</span>
          </button>
          <div className="hidden md:flex items-center gap-2 bg-white/5 px-3 py-1.5 rounded border border-white/10">
            <img src={myIdentity.avatar} className="w-5 h-5 rounded-full" />
            <span className="text-[9px] font-bold text-white/60">{myIdentity.name}</span>
          </div>
          <button onClick={() => setIsAIOpen(true)} className="bg-[#00ff41] text-black px-4 py-2 rounded font-bold text-[9px] uppercase tracking-widest hover:brightness-110 transition-all">
            AI Pulse
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
          <MapContainer center={FOGGIA_COORDS} zoom={15} zoomControl={false} style={{ height: '100%', width: '100%', background: '#000' }}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
            {isPickerActive && <MapPicker onPositionChange={setPickerPos} />}
            {allVisiblePins.map(pin => (
              <PostItMarker key={pin.id} pin={pin} isOwner={pin.authorId === myIdentity.token} onEdit={(p) => { setEditingId(p.id); setFormText(p.text); setFormAddress(p.address); setFormType(p.type); setIsModalOpen(true); }} />
            ))}
          </MapContainer>

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

      <AIPanel isOpen={isAIOpen} onClose={() => setIsAIOpen(false)} onSimulatePins={handleSimulateFromChat} />

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
                <label className="text-[8px] uppercase tracking-widest text-white/40 font-bold">Duration (Ephemeral)</label>
                <div className="flex gap-2">
                  {[30, 60, 360, 1440].map(mins => (
                    <button key={mins} onClick={() => setFormDuration(mins)} className={`flex-1 py-2 text-[9px] font-bold border rounded transition-all ${formDuration === mins ? 'border-[#00ff41] text-[#00ff41] bg-[#00ff41]/10' : 'border-white/10 text-white/40'}`}>
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
    </div>
  );
};

export default App;
