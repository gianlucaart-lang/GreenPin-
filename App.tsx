
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Pin, PinType, AreaAnalysis } from './types';
import { PIN_CONFIG } from './constants';
import AIPanel from './components/AIPanel';
import { generateSimulatedPins, analyzeArea } from './services/geminiService';

const FOGGIA_COORDS: [number, number] = [41.4622, 15.5447];
const STORAGE_KEY = 'green_pin_foggia_v3';
const USER_ID_KEY = 'gp_author_token';

// Genera o recupera un ID unico per l'utente (persiste nel browser)
const getAuthorToken = () => {
  let token = localStorage.getItem(USER_ID_KEY);
  if (!token) {
    token = 'cit_' + Math.random().toString(36).substr(2, 9);
    localStorage.setItem(USER_ID_KEY, token);
  }
  return token;
};

// Algoritmo di spaziatura: se più pin hanno le stesse coordinate, li sposta leggermente
const deconflictPins = (pins: Pin[]): Pin[] => {
  const coordinateMap: Record<string, number> = {};
  return pins.map(pin => {
    const key = `${pin.lat.toFixed(6)},${pin.lng.toFixed(6)}`;
    const count = coordinateMap[key] || 0;
    coordinateMap[key] = count + 1;
    
    if (count === 0) return pin;
    
    // Offset calcolato per creare un effetto "massa" naturale senza sovrapposizioni totali
    const offset = 0.00008 * count;
    const angle = count * (360 / 8); // Distribuzione a raggiera
    const latOffset = offset * Math.cos(angle * (Math.PI / 180));
    const lngOffset = offset * Math.sin(angle * (Math.PI / 180));
    
    return {
      ...pin,
      lat: pin.lat + latOffset,
      lng: pin.lng + lngOffset
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
        
        <div class="font-mono text-[9px] uppercase font-extrabold tracking-widest text-black/40 mb-2">
          ${config.emoji} ${pin.type} • ${pin.address}
        </div>
        
        <div class="font-serif text-[16px] leading-snug text-black/90 mb-4 font-medium italic">
          "${pin.text}"
        </div>
        
        <div class="flex justify-between items-center border-t border-black/5 pt-3">
          <div class="flex flex-col">
            <span class="font-mono text-[9px] font-bold text-black/60">${pin.user}</span>
            <span class="font-mono text-[8px] text-black/30">${pin.time}</span>
          </div>
          ${isOwner ? `<button id="btn-edit-${pin.id}" class="bg-black/80 text-white text-[8px] px-2 py-1 rounded uppercase font-bold tracking-tighter hover:bg-black transition-all">Modifica</button>` : ''}
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
    <Marker 
      position={[pin.lat, pin.lng]} 
      icon={icon}
      eventHandlers={{
        click: (e) => { L.DomEvent.stopPropagation(e); setIsExpanded(!isExpanded); }
      }}
    />
  );
};

const MapPicker = ({ onPositionChange }: { onPositionChange: (latlng: [number, number]) => void }) => {
  useMapEvents({
    move: (e) => {
      const center = e.target.getCenter();
      onPositionChange([center.lat, center.lng]);
    }
  });
  return null;
};

const App: React.FC = () => {
  const myToken = useMemo(() => getAuthorToken(), []);
  const [pins, setPins] = useState<Pin[]>([]);
  const [isPickerActive, setIsPickerActive] = useState(false);
  const [pickerPos, setPickerPos] = useState<[number, number]>(FOGGIA_COORDS);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isAIOpen, setIsAIOpen] = useState(false);
  
  // State del Form
  const [editingId, setEditingId] = useState<string | null>(null);
  const [formText, setFormText] = useState('');
  const [formAddress, setFormAddress] = useState('');
  const [formType, setFormType] = useState<PinType>('visto');

  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) setPins(JSON.parse(saved));
  }, []);

  useEffect(() => {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
  }, [pins]);

  const handleStartNewPin = () => {
    setIsPickerActive(true);
    setEditingId(null);
    setFormText('');
    setFormAddress('');
  };

  const handleConfirmPosition = () => {
    setIsPickerActive(false);
    setIsModalOpen(true);
  };

  const handleEdit = (pin: Pin) => {
    setEditingId(pin.id);
    setFormText(pin.text);
    setFormAddress(pin.address);
    setFormType(pin.type);
    setIsModalOpen(true);
  };

  const handleSave = () => {
    if (!formText.trim() || !formAddress.trim()) {
      alert("Per favore, inserisci sia il messaggio che la via.");
      return;
    }

    if (editingId) {
      setPins(prev => prev.map(p => p.id === editingId ? {
        ...p,
        text: formText,
        address: formAddress,
        type: formType,
        emoji: PIN_CONFIG[formType].emoji,
        time: 'aggiornato ora'
      } : p));
    } else {
      const newPin: Pin = {
        id: `pin-${Date.now()}`,
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
      setPins(prev => [newPin, ...prev]);
    }
    setIsModalOpen(false);
  };

  const deconflictedPins = useMemo(() => deconflictPins(pins), [pins]);

  return (
    <div className="h-screen w-screen flex flex-col bg-[#f4f0e8] overflow-hidden font-sans">
      {/* Header Strategico */}
      <header className="h-16 bg-white border-b border-gray-200 z-[1000] flex items-center justify-between px-6">
        <div className="flex items-center gap-4">
          <div className="logo-gp">
            <div className="logo-g">G</div>
            <div className="logo-p">P</div>
          </div>
          <div>
            <h1 className="font-serif-display text-xl tracking-tighter">Green Pin <span className="text-gray-400">Foggia</span></h1>
            <p className="text-[8px] uppercase tracking-[0.2em] font-bold text-gray-400">Civic Action Network</p>
          </div>
        </div>
        <button 
          onClick={() => setIsAIOpen(true)}
          className="bg-[#1b2e22] text-white px-4 py-2 rounded-full text-[10px] font-bold tracking-widest uppercase shadow-lg hover:bg-[#2d6a4f] transition-all"
        >
          ✦ AI Engine
        </button>
      </header>

      <main className="flex-1 relative">
        <MapContainer center={FOGGIA_COORDS} zoom={15} zoomControl={false} style={{ height: '100%', width: '100%' }}>
          <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
          
          {isPickerActive && <MapPicker onPositionChange={setPickerPos} />}
          
          {deconflictedPins.map(pin => (
            <PostItMarker 
              key={pin.id} 
              pin={pin} 
              isOwner={pin.authorId === myToken} 
              onEdit={handleEdit} 
            />
          ))}
        </MapContainer>

        {/* Mirino "Glovo Style" */}
        {isPickerActive && (
          <div className="absolute inset-0 pointer-events-none z-[1001] flex items-center justify-center">
            <div className="relative flex items-center justify-center">
              <div className="absolute w-20 h-[2px] bg-[#2d6a4f]"></div>
              <div className="absolute h-20 w-[2px] bg-[#2d6a4f]"></div>
              <div className="w-6 h-6 border-4 border-[#2d6a4f] rounded-full bg-white shadow-2xl"></div>
            </div>
            <div className="absolute top-20 bg-[#1b2e22] text-white px-6 py-3 rounded-full text-[10px] font-bold uppercase tracking-[0.2em] shadow-2xl">
              Trascina la mappa sotto il mirino
            </div>
          </div>
        )}

        {/* Controlli Inferiori */}
        <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[1000] w-[90%] max-w-md flex flex-col gap-4">
          {!isPickerActive ? (
            <button 
              onClick={handleStartNewPin}
              className="w-full bg-[#2d6a4f] text-white py-5 rounded-2xl font-bold text-sm tracking-widest uppercase shadow-2xl hover:scale-[1.02] active:scale-95 transition-all flex items-center justify-center gap-3"
            >
              <span className="text-xl">+</span> Nuovo Segnale
            </button>
          ) : (
            <div className="flex gap-2">
              <button 
                onClick={() => setIsPickerActive(false)}
                className="flex-1 bg-white border border-gray-200 text-gray-500 py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-xl"
              >
                Annulla
              </button>
              <button 
                onClick={handleConfirmPosition}
                className="flex-[2] bg-[#1b2e22] text-white py-4 rounded-2xl font-bold text-[10px] uppercase tracking-widest shadow-xl"
              >
                Conferma Punto
              </button>
            </div>
          )}
        </div>
      </main>

      <AIPanel isOpen={isAIOpen} onClose={() => setIsAIOpen(false)} onSimulatePins={() => {}} />

      {/* Modal Form di Precisione */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-[#1b2e22]/60 backdrop-blur-md p-4">
          <div className="bg-white rounded-[2.5rem] p-8 md:p-12 w-full max-w-xl shadow-2xl animate-pop-in">
            <div className="flex justify-between items-center mb-8">
              <h3 className="font-serif-display text-3xl text-[#1b2e22]">
                {editingId ? 'Modifica Segnale' : 'Dettagli Segnale'}
              </h3>
              <button onClick={() => setIsModalOpen(false)} className="text-gray-300 hover:text-gray-500 text-3xl">&times;</button>
            </div>

            <div className="space-y-6">
              {/* Selezione Categoria */}
              <div>
                <label className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-3 block">Tipo di azione</label>
                <div className="grid grid-cols-2 gap-2">
                  {(Object.keys(PIN_CONFIG) as PinType[]).map(type => (
                    <button 
                      key={type}
                      onClick={() => setFormType(type)}
                      className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-[10px] font-bold ${formType === type ? 'border-[#2d6a4f] bg-[#2d6a4f]/5 text-[#2d6a4f]' : 'border-gray-50 text-gray-400'}`}
                    >
                      <span>{PIN_CONFIG[type].emoji}</span> {PIN_CONFIG[type].label}
                    </button>
                  ))}
                </div>
              </div>

              {/* Input Via */}
              <div>
                <label className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-2 block">Dove? (Via / Piazza / Corso)</label>
                <input 
                  autoFocus
                  className="w-full bg-gray-50 border border-gray-100 rounded-xl px-6 py-4 text-sm outline-none focus:bg-white focus:border-[#2d6a4f]/30 transition-all font-medium"
                  placeholder="es. Via Arpi, Corso Giannone..."
                  value={formAddress}
                  onChange={(e) => setFormAddress(e.target.value)}
                />
              </div>

              {/* Input Messaggio */}
              <div>
                <label className="text-[9px] uppercase tracking-widest font-bold text-gray-400 mb-2 block">Cosa succede? (max 140 car.)</label>
                <textarea 
                  className="w-full h-32 bg-gray-50 border border-gray-100 rounded-2xl p-6 text-sm outline-none focus:bg-white focus:border-[#2d6a4f]/30 resize-none transition-all shadow-inner"
                  placeholder="Racconta brevemente..."
                  maxLength={140}
                  value={formText}
                  onChange={(e) => setFormText(e.target.value)}
                />
              </div>

              <button 
                onClick={handleSave}
                className="w-full py-5 bg-[#2d6a4f] text-white font-bold rounded-2xl shadow-xl hover:bg-[#1b2e22] transition-all transform active:scale-95"
              >
                {editingId ? 'Salva Modifiche' : 'Attacca sulla Mappa'}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default App;
