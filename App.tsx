
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Pin, PinType } from './types';
import { PIN_CONFIG } from './constants';
import AIPanel from './components/AIPanel';
import { fetchRealTimeCitySignals } from './services/geminiService';
import { supabase } from './services/supabaseClient';

const FOGGIA_COORDS: [number, number] = [41.4622, 15.5447];
const USER_ID_KEY = 'gp_author_token';

const getAuthorToken = () => {
  let token = localStorage.getItem(USER_ID_KEY);
  if (!token) {
    token = 'cit_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(USER_ID_KEY, token);
  }
  return token;
};

const deconflictPins = (pins: Pin[]): Pin[] => {
  const coordinateMap: Record<string, number> = {};
  return pins.map(pin => {
    const key = `${pin.lat.toFixed(5)},${pin.lng.toFixed(5)}`;
    const count = coordinateMap[key] || 0;
    coordinateMap[key] = count + 1;
    if (count === 0) return pin;
    const offset = 0.00006 * count;
    return {
      ...pin,
      lat: pin.lat - offset,
      lng: pin.lng + offset,
      rotation: (pin.rotation || 0) + (count * 2)
    };
  });
};

const PostItMarker: React.FC<{ 
  pin: Pin; 
  isOwner: boolean; 
  onEdit: (pin: Pin) => void;
}> = ({ pin, isOwner, onEdit }) => {
  const config = PIN_CONFIG[pin.type];
  const [isExpanded, setIsExpanded] = useState(false);

  const icon = L.divIcon({
    className: 'custom-div-icon',
    html: isExpanded ? `
      <div class="expanded-postit w-64 p-5 shadow-2xl rounded-sm relative border-t-[6px]" style="background-color: ${config.color}; border-color: rgba(0,0,0,0.1); transform: rotate(${pin.rotation || 0}deg);">
        <div class="absolute -top-4 left-1/2 -translate-x-1/2 w-6 h-6 rounded-full bg-black/10 shadow-inner flex items-center justify-center">
          <div class="w-2 h-2 bg-black/20 rounded-full"></div>
        </div>
        <div class="font-mono text-[9px] uppercase font-extrabold tracking-widest text-black/40 mb-2">${config.emoji} ${pin.type} • ${pin.address}</div>
        <div class="font-serif text-[15px] leading-snug text-black/90 mb-4 font-medium italic">"${pin.text}"</div>
        <div class="flex justify-between items-center border-t border-black/5 pt-3">
          <div class="flex flex-col">
            <span class="font-mono text-[9px] font-bold text-black/60">${pin.user}</span>
            <span class="font-mono text-[8px] text-black/30">${pin.time}</span>
          </div>
          ${isOwner ? `<button id="btn-edit-${pin.id}" class="bg-[#1b2e22] text-white text-[8px] px-3 py-1.5 rounded-full uppercase font-bold tracking-tighter hover:bg-black transition-all">Modifica</button>` : ''}
        </div>
        <div class="absolute -bottom-2 -right-2 bg-white rounded-full w-8 h-8 flex items-center justify-center text-[14px] shadow-xl border border-gray-100 cursor-pointer hover:scale-110 transition-transform">✕</div>
      </div>
    ` : `
      <div class="pin-3d shadow-lg" style="background: ${config.color}; border: 3px solid white;">
        <span class="absolute inset-0 flex items-center justify-center text-[12px] transform rotate(45deg)">${config.emoji}</span>
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
  const myToken = useMemo(() => getAuthorToken(), []);
  const [pins, setPins] = useState<Pin[]>([]);
  const [aiPins, setAiPins] = useState<Pin[]>([]);
  const [isPickerActive, setIsPickerActive] = useState(false);
  const [pickerPos, setPickerPos] = useState<[number, number]>(FOGGIA_COORDS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [isSyncing, setIsSyncing] = useState(false);
  const [syncError, setSyncError] = useState(false);
  
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formText, setFormText] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formType, setFormType] = useState<PinType>('visto');

  // 1. CARICAMENTO INIZIALE E REALTIME
  useEffect(() => {
    const fetchPins = async () => {
      setIsSyncing(true);
      try {
        const { data, error } = await supabase.from('pins').select('*');
        if (error) throw error;
        if (data) setPins(data as Pin[]);
        setSyncError(false);
      } catch (err) {
        console.error("Errore Supabase:", err);
        setSyncError(true);
      } finally {
        setIsSyncing(false);
      }
    };

    fetchPins();

    const channel = supabase
      .channel('public:pins')
      .on('postgres_changes', { event: '*', schema: 'public', table: 'pins' }, (payload) => {
        if (payload.eventType === 'INSERT') {
          setPins(current => [...current, payload.new as Pin]);
        } else if (payload.eventType === 'UPDATE') {
          setPins(current => current.map(p => p.id === payload.new.id ? (payload.new as Pin) : p));
        } else if (payload.eventType === 'DELETE') {
          setPins(current => current.filter(p => p.id !== payload.old.id));
        }
      })
      .subscribe();

    return () => { supabase.removeChannel(channel); };
  }, []);

  // 2. LIVE CITY FEED (AI)
  useEffect(() => {
    const loadAiSignals = async () => {
      const liveSignals = await fetchRealTimeCitySignals();
      const mapped = liveSignals.map((s, i) => ({
        ...s,
        id: `ai-${Date.now()}-${i}`,
        authorId: 'system-ai',
        sentiment: s.sentiment || 'neutro',
        reactions: { like: Math.floor(Math.random()*20), heart: 0, comment: 0 },
        tags: [],
        rotation: Math.random() * 6 - 3
      } as Pin));
      setAiPins(mapped);
    };
    loadAiSignals();
  }, []);

  const handleSave = async () => {
    if (!formText.trim() || !formAddress.trim()) return;

    const pinData = {
      id: editingId || `pin-${Date.now()}`,
      authorId: myToken,
      type: formType,
      emoji: PIN_CONFIG[formType].emoji,
      text: formText,
      address: formAddress,
      user: "Cittadino",
      time: "adesso",
      sentiment: 'neutro',
      reactions: { like: 0, heart: 0, comment: 0 },
      tags: [],
      lat: pickerPos[0],
      lng: pickerPos[1],
      rotation: Math.random() * 8 - 4
    };

    try {
      if (editingId) {
        await supabase.from('pins').update(pinData).eq('id', editingId);
      } else {
        await supabase.from('pins').insert([pinData]);
      }
      setIsModalOpen(false);
    } catch (err) {
      alert("Errore nel salvataggio. Verifica le chiavi Supabase.");
    }
  };

  const allVisiblePins = useMemo(() => deconflictPins([...pins, ...aiPins]), [pins, aiPins]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#f4f0e8] overflow-hidden">
      <header className="h-16 bg-white/90 backdrop-blur-md border-b border-gray-100 z-[1000] flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="logo-gp"><div className="logo-g">G</div><div className="logo-p">P</div></div>
          <div>
            <h1 className="font-serif-display text-xl tracking-tighter">Green Pin <span className="text-[#2d6a4f]">Foggia</span></h1>
            <div className="flex items-center gap-2">
              <div className={`w-1.5 h-1.5 rounded-full ${syncError ? 'bg-red-500' : (isSyncing ? 'bg-yellow-400 animate-pulse' : 'bg-green-500')}`}></div>
              <p className="text-[7px] uppercase tracking-widest font-bold text-gray-400">
                {syncError ? 'Errore Chiavi API' : (isSyncing ? 'Sincronizzando...' : 'Cloud Attivo')}
              </p>
            </div>
          </div>
        </div>
        <button onClick={() => setIsAIOpen(true)} className="bg-[#1b2e22] text-white px-5 py-2.5 rounded-full text-[9px] font-bold tracking-widest uppercase shadow-xl hover:bg-[#2d6a4f] transition-all">✦ AI Advisor</button>
      </header>

      <main className="flex-1 relative">
        <MapContainer center={FOGGIA_COORDS} zoom={15} zoomControl={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
          {isPickerActive && <MapPicker onPositionChange={setPickerPos} />}
          {allVisiblePins.map(pin => (
            <PostItMarker key={pin.id} pin={pin} isOwner={pin.authorId === myToken} onEdit={(p) => { setEditingId(p.id); setFormText(p.text); setFormAddress(p.address); setFormType(p.type); setIsModalOpen(true); }} />
          ))}
        </MapContainer>

        {isPickerActive && (
          <div className="absolute inset-0 pointer-events-none z-[1001] flex items-center justify-center">
             <div className="w-16 h-16 border-2 border-[#2d6a4f] rounded-full flex items-center justify-center animate-pulse"><div className="w-1 h-1 bg-[#2d6a4f] rounded-full"></div></div>
          </div>
        )}

        <div className="absolute bottom-8 left-1/2 -translate-x-1/2 z-[1000] w-[90%] max-w-sm">
          {!isPickerActive ? (
            <button onClick={() => { setIsPickerActive(true); setEditingId(null); setFormText(''); setFormAddress(''); }} className="w-full bg-[#1b2e22] text-white py-5 rounded-[2rem] font-bold text-xs tracking-[0.2em] uppercase shadow-2xl hover:bg-[#2d6a4f] transition-all border-b-4 border-black/20">+ Pubblica Segnale</button>
          ) : (
            <div className="flex gap-2 p-2 bg-white/90 backdrop-blur-xl rounded-[2.5rem] shadow-2xl">
              <button onClick={() => setIsPickerActive(false)} className="flex-1 py-4 text-gray-400 font-bold text-[10px] uppercase">Annulla</button>
              <button onClick={() => { setIsPickerActive(false); setIsModalOpen(true); }} className="flex-[2] py-4 bg-[#2d6a4f] text-white rounded-[2rem] font-bold text-[10px] uppercase tracking-widest shadow-lg">Conferma Indirizzo</button>
            </div>
          )}
        </div>
      </main>

      <AIPanel isOpen={isAIOpen} onClose={() => setIsAIOpen(false)} onSimulatePins={() => {}} />

      {isModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-[#1b2e22]/80 backdrop-blur-sm p-4">
          <div className="bg-[#f4f0e8] rounded-[3rem] p-10 w-full max-w-lg shadow-2xl animate-pop-in relative border border-white/20">
            <h3 className="font-serif-display text-4xl text-[#1b2e22] tracking-tighter mb-8">{editingId ? 'Modifica' : 'Nuovo Pin'}</h3>
            <div className="space-y-6">
              <div className="flex gap-2 overflow-x-auto pb-2 scrollbar-hide">
                {(Object.keys(PIN_CONFIG) as PinType[]).map(type => (
                  <button key={type} onClick={() => setFormType(type)} className={`flex-shrink-0 flex items-center gap-2 px-5 py-3 rounded-2xl border-2 transition-all text-[10px] font-bold ${formType === type ? 'border-[#2d6a4f] bg-[#2d6a4f] text-white shadow-lg' : 'border-gray-200 text-gray-400 bg-white'}`}>
                    <span>{PIN_CONFIG[type].emoji}</span> {PIN_CONFIG[type].label}
                  </button>
                ))}
              </div>
              <input className="w-full bg-white border-2 border-gray-100 rounded-2xl px-6 py-4 text-sm outline-none focus:border-[#2d6a4f] transition-all font-medium" placeholder="Via / Piazza esatta..." value={formAddress} onChange={(e) => setFormAddress(e.target.value)} />
              <textarea className="w-full h-32 bg-white border-2 border-gray-100 rounded-[2rem] p-6 text-sm outline-none focus:border-[#2d6a4f] resize-none transition-all" placeholder="Il tuo messaggio alla città..." maxLength={140} value={formText} onChange={(e) => setFormText(e.target.value)} />
              <div className="flex gap-3">
                <button onClick={() => setIsModalOpen(false)} className="flex-1 py-5 font-bold text-gray-400 text-[10px] uppercase">Chiudi</button>
                <button onClick={handleSave} className="flex-[3] py-5 bg-[#1b2e22] text-white font-bold rounded-[2rem] shadow-xl hover:bg-[#2d6a4f] transition-all active:scale-95 uppercase text-[10px] tracking-widest">Attacca sulla Mappa</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
