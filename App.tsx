
import React, { useState, useMemo, useEffect, useCallback, useRef } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Pin, PinType, AreaAnalysis } from './types';
import { PIN_CONFIG } from './constants';
import AIPanel from './components/AIPanel';
import { generateSimulatedPins, analyzeArea } from './services/geminiService';

const FOGGIA_COORDS: [number, number] = [41.4622, 15.5447];
const STORAGE_KEY = 'green_pin_foggia_data';
const USER_ID_KEY = 'green_pin_user_id';

// Generatore di ID Utente semplice per persistenza locale
const getMyUserId = () => {
  let id = localStorage.getItem(USER_ID_KEY);
  if (!id) {
    id = 'user_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(USER_ID_KEY, id);
  }
  return id;
};

const PostItMarker: React.FC<{ 
  pin: Pin; 
  isMyPin: boolean; 
  onReact: (id: string, type: 'like' | 'heart' | 'comment') => void;
  onEdit: (pin: Pin) => void;
}> = ({ pin, isMyPin, onReact, onEdit }) => {
  const config = PIN_CONFIG[pin.type];
  const [isExpanded, setIsExpanded] = useState(false);

  const icon = L.divIcon({
    className: 'custom-div-icon',
    html: isExpanded ? `
      <div class="expanded-postit w-60 p-4 shadow-2xl rounded-sm relative" style="background-color: ${config.color}; transform: rotate(${pin.rotation || 0}deg);">
        <div class="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-black/20 shadow-inner"></div>
        <div class="font-mono text-[9px] uppercase tracking-widest opacity-60 mb-2">${config.emoji} ${pin.type} @ ${pin.address}</div>
        <div class="font-serif text-[15px] leading-snug text-black/90 mb-3">${pin.text}</div>
        
        <div class="flex justify-between border-t border-black/5 pt-2 font-mono text-[9px] text-black/40">
          <span>${pin.user}</span>
          <span>${pin.time}</span>
        </div>

        ${isMyPin ? `
          <button id="edit-${pin.id}" class="mt-3 w-full py-2 bg-black/10 hover:bg-black/20 rounded font-bold text-[10px] uppercase tracking-wider transition-all">Modifica il mio post-it</button>
        ` : ''}
        
        <div class="absolute -bottom-2 -right-2 bg-white rounded-full w-6 h-6 flex items-center justify-center text-[10px] shadow-md border border-gray-100 cursor-pointer hover:bg-gray-50">✖</div>
      </div>
    ` : `
      <div class="pin-3d" style="background: radial-gradient(circle at 30% 30%, ${config.color}, #444);"></div>
    `,
    iconSize: isExpanded ? [240, 200] : [30, 30],
    iconAnchor: isExpanded ? [120, 180] : [15, 30]
  });

  // Gestione click sul tasto modifica iniettato via HTML string (Leaflet limitation)
  useEffect(() => {
    if (isExpanded && isMyPin) {
      const btn = document.getElementById(`edit-${pin.id}`);
      if (btn) btn.onclick = (e) => { e.stopPropagation(); onEdit(pin); };
    }
  }, [isExpanded, isMyPin, pin.id]);

  return (
    <Marker 
      position={[pin.lat, pin.lng]} 
      icon={icon}
      eventHandlers={{
        click: (e) => { L.DomEvent.stopPropagation(e); setIsExpanded(!isExpanded); }
      }}
    />
  );
};

// Componente per catturare il movimento della mappa (Pin Picker)
const MapPickerHelper = ({ onMove }: { onMove: (coords: [number, number]) => void }) => {
  useMapEvents({
    move: (e) => {
      const center = e.target.getCenter();
      onMove([center.lat, center.lng]);
    }
  });
  return null;
};

const MapController = ({ target, userPos }: { target: [number, number] | null, userPos: [number, number] | null }) => {
  const map = useMap();
  useEffect(() => {
    const timer = setTimeout(() => map.invalidateSize(), 400);
    return () => clearTimeout(timer);
  }, [map]);
  useEffect(() => { if (target) map.flyTo(target, 17, { duration: 1.5 }); }, [target, map]);
  useEffect(() => { if (userPos) map.flyTo(userPos, 17, { duration: 2 }); }, [userPos, map]);
  return null;
};

const App: React.FC = () => {
  const myId = useMemo(() => getMyUserId(), []);
  const [pins, setPins] = useState<Pin[]>([]);
  const [filter, setFilter] = useState<PinType | 'all'>('all');
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [analysis, setAnalysis] = useState<AreaAnalysis | null>(null);
  const [isBusy, setIsBusy] = useState<'simulating' | 'analyzing' | 'locating' | null>(null);
  
  // States per creazione/modifica
  const [isPickerMode, setIsPickerMode] = useState(false);
  const [pickerCoords, setPickerCoords] = useState<[number, number]>(FOGGIA_COORDS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingPinId, setEditingPinId] = useState<string | null>(null);
  
  const [newPinText, setNewPinText] = useState('');
  const [newPinType, setNewPinType] = useState<PinType>('visto');
  const [newPinAddress, setNewPinAddress] = useState('');
  
  const [mapTarget, setMapTarget] = useState<[number, number] | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setPins(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
  }, [pins]);

  const handleEditPin = (pin: Pin) => {
    setEditingPinId(pin.id);
    setNewPinText(pin.text);
    setNewPinType(pin.type);
    setNewPinAddress(pin.address);
    setIsModalOpen(true);
  };

  const startPinFlow = () => {
    setIsPickerMode(true);
    setEditingPinId(null);
    setNewPinText('');
    setNewPinAddress('');
  };

  const confirmLocation = () => {
    setIsPickerMode(false);
    setIsModalOpen(true);
  };

  const handleSavePin = () => {
    if (!newPinText.trim() || !newPinAddress.trim()) return;

    if (editingPinId) {
      setPins(prev => prev.map(p => p.id === editingPinId ? {
        ...p,
        text: newPinText,
        type: newPinType,
        address: newPinAddress,
        emoji: PIN_CONFIG[newPinType].emoji,
        time: 'modificato ora'
      } : p));
    } else {
      const newPin: Pin = {
        id: `real-${Date.now()}`,
        authorId: myId,
        type: newPinType,
        emoji: PIN_CONFIG[newPinType].emoji,
        text: newPinText,
        address: newPinAddress,
        user: "Cittadino Foggiano",
        time: "adesso",
        sentiment: 'neutro',
        reactions: { like: 0, heart: 0, comment: 0 },
        tags: [],
        lat: pickerCoords[0],
        lng: pickerCoords[1],
        rotation: Math.random() * 6 - 3
      };
      setPins(prev => [newPin, ...prev]);
    }
    setIsModalOpen(false);
    setMapTarget(editingPinId ? null : pickerCoords);
  };

  const handleSimulate = async () => {
    setIsBusy('simulating');
    const simulated = await generateSimulatedPins("Aggiungi segnali per il centro storico di Foggia");
    const newPins: Pin[] = simulated.map((p, i) => ({
      ...p,
      id: `sim-${Date.now()}-${i}`,
      authorId: 'system',
      address: 'Via Arpi e dintorni',
      rotation: Math.random() * 8 - 4,
      reactions: p.reactions || { like: 0, heart: 0, comment: 0 },
    } as Pin));
    setPins(prev => [...prev, ...newPins]);
    setIsBusy(null);
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#f4f0e8]">
      {/* Header */}
      <header className="fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-xl border-b border-gray-200 z-[1000] flex items-center justify-between px-4 md:px-8">
        <div className="flex items-center gap-3 md:gap-6">
          <div className="logo-gp">
            <div className="logo-g">G</div>
            <div className="logo-p">P</div>
          </div>
          <div className="flex flex-col">
            <h1 className="font-serif-display text-xl md:text-2xl tracking-tighter text-[#1b2e22] leading-none">
              <span className="text-[#2d6a4f]">G</span>reen <span className="text-[#2d6a4f]">P</span>in <span className="text-gray-400 font-sans font-light ml-1 hidden sm:inline">Foggia</span>
            </h1>
            <p className="font-mono text-[8px] md:text-[9px] uppercase tracking-widest text-gray-400 mt-1">
              Comunità Reale • Identità: {myId.slice(-4)}
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <button onClick={() => setIsAIOpen(true)} className="flex items-center gap-2 bg-[#1b2e22] text-white px-4 py-2 rounded-full font-bold text-[10px] md:text-xs hover:bg-[#2d6a4f] transition-all shadow-lg active:scale-95">
            ✦ AI Engine
          </button>
        </div>
      </header>

      <div className="flex flex-1 mt-16 relative">
        <main className="flex-1 relative h-full w-full">
          <MapContainer center={FOGGIA_COORDS} zoom={15} scrollWheelZoom={true} style={{ height: '100%', width: '100%' }} zoomControl={false}>
            <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" attribution='&copy; OpenStreetMap' />
            <MapController target={mapTarget} userPos={userLocation} />
            {isPickerMode && <MapPickerHelper onMove={setPickerCoords} />}
            {pins.filter(p => filter === 'all' || p.type === filter).map(pin => (
              <PostItMarker key={pin.id} pin={pin} isMyPin={pin.authorId === myId} onReact={() => {}} onEdit={handleEditPin} />
            ))}
          </MapContainer>

          {/* Crosshair Picker Mode */}
          {isPickerMode && (
            <div className="absolute inset-0 pointer-events-none z-[1001] flex items-center justify-center">
              <div className="relative w-12 h-12">
                <div className="absolute top-1/2 left-0 w-full h-0.5 bg-[#2d6a4f]"></div>
                <div className="absolute left-1/2 top-0 w-0.5 h-full bg-[#2d6a4f]"></div>
                <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-4 h-4 border-2 border-[#2d6a4f] rounded-full bg-white/50"></div>
              </div>
              <div className="absolute top-24 px-6 py-2 bg-[#2d6a4f] text-white text-[10px] font-bold uppercase tracking-widest rounded-full shadow-2xl">
                Muovi la mappa per posizionare il segnale
              </div>
            </div>
          )}

          {/* Bottom HUD */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[1000] flex flex-col items-center gap-4 w-[90%] md:w-auto">
             {!isPickerMode ? (
               <div className="flex gap-2 p-2 bg-white/90 backdrop-blur-xl border border-gray-200 rounded-full shadow-2xl">
                  <button onClick={handleSimulate} className="px-6 py-3 bg-[#2d6a4f] text-white rounded-full font-bold text-[10px] md:text-xs shadow-lg">✦ SIMULA</button>
                  <button onClick={startPinFlow} className="px-8 py-3 bg-[#1b2e22] text-white rounded-full font-bold text-[10px] md:text-xs shadow-lg transition-transform active:scale-95">+ NUOVO SEGNALE</button>
               </div>
             ) : (
               <div className="flex gap-2 p-2 bg-white/90 backdrop-blur-xl border border-gray-200 rounded-full shadow-2xl">
                  <button onClick={() => setIsPickerMode(false)} className="px-6 py-3 bg-gray-100 text-gray-500 rounded-full font-bold text-[10px] md:text-xs">ANNULLA</button>
                  <button onClick={confirmLocation} className="px-8 py-3 bg-[#2d6a4f] text-white rounded-full font-bold text-[10px] md:text-xs shadow-lg transition-transform active:scale-95">CONFERMA POSIZIONE</button>
               </div>
             )}
          </div>
        </main>
        <AIPanel isOpen={isAIOpen} onClose={() => setIsAIOpen(false)} onSimulatePins={handleSimulate} />
      </div>

      {/* Modal Inserimento/Modifica */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-[#1b2e22]/40 backdrop-blur-md p-4">
           <div className="bg-white rounded-[2.5rem] p-8 md:p-12 w-full max-w-xl shadow-2xl relative animate-pop-in">
              <h3 className="font-serif-display text-3xl text-[#1b2e22] mb-6">{editingPinId ? 'Modifica segnale' : 'Nuovo segnale'}</h3>
              
              <div className="space-y-6">
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(PIN_CONFIG) as PinType[]).map(type => (
                    <button key={type} onClick={() => setNewPinType(type)} className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-[10px] font-bold ${newPinType === type ? 'border-[#2d6a4f] bg-[#2d6a4f]/5' : 'border-gray-50 text-gray-400'}`}>
                      <span>{PIN_CONFIG[type].emoji}</span> {PIN_CONFIG[type].label}
                    </button>
                  ))}
                </div>

                <div className="space-y-4">
                  <input 
                    className="w-full bg-gray-50 border border-gray-100 rounded-xl px-6 py-4 text-sm outline-none focus:border-[#2d6a4f]/30"
                    placeholder="Via/Indirizzo es. Via Arpi 12"
                    value={newPinAddress}
                    onChange={(e) => setNewPinAddress(e.target.value)}
                  />
                  <textarea 
                    className="w-full h-32 bg-gray-50 border border-gray-100 rounded-2xl p-6 text-sm outline-none focus:border-[#2d6a4f]/30 resize-none"
                    placeholder="Racconta cosa succede qui..."
                    maxLength={140}
                    value={newPinText}
                    onChange={(e) => setNewPinText(e.target.value)}
                  />
                </div>

                <div className="flex gap-3 pt-4">
                   <button onClick={() => setIsModalOpen(false)} className="flex-1 py-4 font-bold text-xs text-gray-400">Annulla</button>
                   <button onClick={handleSavePin} className="flex-[2] py-4 bg-[#2d6a4f] text-white font-bold rounded-2xl shadow-xl active:scale-95">
                     {editingPinId ? 'Salva Modifiche' : 'Pubblica Segnale'}
                   </button>
                </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
