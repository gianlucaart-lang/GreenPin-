
import React, { useState, useMemo, useEffect, useCallback } from 'react';
import { MapContainer, TileLayer, Marker, useMap, useMapEvents } from 'react-leaflet';
import L from 'leaflet';
import { Pin, PinType, AreaAnalysis } from './types';
import { PIN_CONFIG } from './constants';
import AIPanel from './components/AIPanel';
import { generateSimulatedPins, analyzeArea } from './services/geminiService';

// Icone Leaflet fallback
delete (L.Icon.Default.prototype as any)._getIconUrl;
L.Icon.Default.mergeOptions({
  iconRetinaUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon-2x.png',
  iconUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-icon.png',
  shadowUrl: 'https://unpkg.com/leaflet@1.9.4/dist/images/marker-shadow.png',
});

const FOGGIA_COORDS: [number, number] = [41.4622, 15.5447];
const STORAGE_KEY = 'green_pin_foggia_data';

interface PostItMarkerProps {
  pin: Pin;
  onReact: (id: string, type: 'like' | 'heart' | 'comment') => void;
}

const PostItMarker: React.FC<PostItMarkerProps> = ({ pin, onReact }) => {
  const config = PIN_CONFIG[pin.type];
  const [isExpanded, setIsExpanded] = useState(false);

  const icon = L.divIcon({
    className: 'custom-div-icon',
    html: isExpanded ? `
      <div class="expanded-postit w-56 p-4 shadow-2xl rounded-sm relative" style="background-color: ${config.color}; transform: rotate(${pin.rotation || 0}deg);">
        <div class="absolute -top-2 left-1/2 -translate-x-1/2 w-4 h-4 rounded-full bg-black/20 shadow-inner"></div>
        <div class="font-mono text-[10px] uppercase tracking-widest opacity-60 mb-2">${config.emoji} ${pin.type}</div>
        <div class="font-serif text-[15px] leading-snug text-black/90 mb-3">${pin.text}</div>
        <div class="flex justify-between border-t border-black/5 pt-2 font-mono text-[10px] text-black/40">
          <span>${pin.user}</span>
          <span>${pin.time}</span>
        </div>
        <div class="absolute -bottom-2 -right-2 bg-white rounded-full w-6 h-6 flex items-center justify-center text-[10px] shadow-md border border-gray-100 cursor-pointer hover:bg-gray-50">✖</div>
      </div>
    ` : `
      <div class="pin-3d" style="background: radial-gradient(circle at 30% 30%, ${config.color}, #444);"></div>
    `,
    iconSize: isExpanded ? [240, 180] : [30, 30],
    iconAnchor: isExpanded ? [120, 160] : [15, 30]
  });

  return (
    <Marker 
      position={[pin.lat, pin.lng]} 
      icon={icon}
      eventHandlers={{
        click: (e) => {
          L.DomEvent.stopPropagation(e);
          setIsExpanded(!isExpanded);
        }
      }}
    />
  );
};

const MapController = ({ target, userPos }: { target: [number, number] | null, userPos: [number, number] | null }) => {
  const map = useMap();
  
  useEffect(() => {
    const timer = setTimeout(() => {
      map.invalidateSize();
    }, 400);
    return () => clearTimeout(timer);
  }, [map]);

  useEffect(() => {
    if (target) {
      map.flyTo(target, 16, { duration: 1.5 });
    }
  }, [target, map]);

  useEffect(() => {
    if (userPos) {
      map.flyTo(userPos, 17, { duration: 2 });
    }
  }, [userPos, map]);
  
  return null;
};

const App: React.FC = () => {
  const [pins, setPins] = useState<Pin[]>([]);
  const [filter, setFilter] = useState<PinType | 'all'>('all');
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [analysis, setAnalysis] = useState<AreaAnalysis | null>(null);
  const [isBusy, setIsBusy] = useState<'simulating' | 'analyzing' | 'locating' | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mapTarget, setMapTarget] = useState<[number, number] | null>(null);
  const [userLocation, setUserLocation] = useState<[number, number] | null>(null);
  
  // New Pin State
  const [newPinText, setNewPinText] = useState('');
  const [newPinType, setNewPinType] = useState<PinType>('visto');

  // Load pins from localStorage on mount
  useEffect(() => {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
      try {
        setPins(JSON.parse(saved));
      } catch (e) {
        console.error("Failed to parse saved pins", e);
      }
    }
  }, []);

  // Save pins to localStorage whenever they change
  useEffect(() => {
    if (pins.length > 0) {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(pins));
    }
  }, [pins]);

  const filteredPins = useMemo(() => pins.filter(p => filter === 'all' || p.type === filter), [pins, filter]);

  const handleReact = (id: string, type: 'like' | 'heart' | 'comment') => {
    setPins(prev => prev.map(p => {
      if (p.id === id) {
        return { ...p, reactions: { ...p.reactions, [type]: p.reactions[type] + 1 } };
      }
      return p;
    }));
  };

  const findMe = () => {
    setIsBusy('locating');
    navigator.geolocation.getCurrentPosition(
      (pos) => {
        const coords: [number, number] = [pos.coords.latitude, pos.coords.longitude];
        setUserLocation(coords);
        setIsBusy(null);
      },
      (err) => {
        console.error(err);
        alert("Impossibile accedere alla tua posizione. Controlla i permessi.");
        setIsBusy(null);
      }
    );
  };

  const handleCreatePin = () => {
    if (!newPinText.trim()) return;
    
    // Fallback to center of map or current location
    const coords = userLocation || FOGGIA_COORDS;

    const newPin: Pin = {
      id: `real-${Date.now()}`,
      type: newPinType,
      emoji: PIN_CONFIG[newPinType].emoji,
      text: newPinText,
      user: "Utente Verificato",
      time: "adesso",
      sentiment: 'neutro',
      reactions: { like: 0, heart: 0, comment: 0 },
      tags: [],
      lat: coords[0],
      lng: coords[1],
      rotation: Math.random() * 8 - 4
    };

    setPins(prev => [newPin, ...prev]);
    setIsModalOpen(false);
    setNewPinText('');
    setMapTarget([newPin.lat, newPin.lng]);
  };

  const handleSimulate = async () => {
    setIsBusy('simulating');
    const simulated = await generateSimulatedPins("Aggiungi segnali per il degrado delle periferie e le iniziative dei giovani");
    const newPins: Pin[] = simulated.map((p, i) => ({
      ...p,
      id: `sim-${Date.now()}-${i}`,
      rotation: Math.random() * 8 - 4,
      reactions: p.reactions || { like: 0, heart: 0, comment: 0 },
    } as Pin));
    setPins(prev => [...prev, ...newPins]);
    setIsBusy(null);
    if (newPins.length > 0) setMapTarget([newPins[0].lat, newPins[0].lng]);
  };

  const handleAnalyze = async () => {
    setIsBusy('analyzing');
    const result = await analyzeArea(pins);
    setAnalysis(result);
    setIsBusy(null);
  };

  return (
    <div className="flex h-screen w-screen flex-col overflow-hidden bg-[#f4f0e8]">
      {/* Header Premium */}
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
              Comunità Reale • Geoverificata
            </p>
          </div>
        </div>

        <div className="flex items-center gap-2 md:gap-4">
          <button 
            onClick={() => setIsAIOpen(true)}
            className="flex items-center gap-2 bg-[#1b2e22] text-white px-4 md:px-6 py-2 rounded-full font-bold text-[10px] md:text-xs hover:bg-[#2d6a4f] transition-all shadow-lg active:scale-95"
          >
            ✦ <span className="hidden sm:inline">Motore AI</span>
          </button>
          <div onClick={findMe} className={`w-10 h-10 rounded-full bg-white border border-gray-200 flex items-center justify-center text-xs font-bold text-[#2d6a4f] cursor-pointer hover:shadow-md transition-all ${isBusy === 'locating' ? 'animate-pulse' : ''}`}>
            {isBusy === 'locating' ? '...' : '📍'}
          </div>
        </div>
      </header>

      <div className="flex flex-1 mt-16 relative">
        {/* Sidebar - Desktop Only */}
        <aside className="w-72 bg-white border-r border-gray-100 p-8 flex flex-col gap-10 z-[500] shadow-sm overflow-y-auto hidden lg:flex">
          <div>
            <h2 className="font-mono text-[10px] text-gray-400 uppercase tracking-[0.2em] mb-6">Filtra Segnali</h2>
            <div className="space-y-2">
              <button onClick={() => setFilter('all')} className={`w-full flex items-center gap-4 p-4 rounded-2xl text-xs font-bold transition-all ${filter === 'all' ? 'bg-[#95d5b2]/20 text-[#2d6a4f]' : 'text-gray-400 hover:bg-gray-50'}`}>
                <div className={`w-2.5 h-2.5 rounded-full ${filter === 'all' ? 'bg-[#2d6a4f]' : 'bg-gray-200'}`}></div> Tutti
              </button>
              {(Object.keys(PIN_CONFIG) as PinType[]).map(type => (
                <button key={type} onClick={() => setFilter(type)} className={`w-full flex items-center gap-4 p-4 rounded-2xl text-xs font-bold transition-all ${filter === type ? 'bg-[#95d5b2]/20 text-[#2d6a4f]' : 'text-gray-400 hover:bg-gray-50'}`}>
                  <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIN_CONFIG[type].color }}></div> {PIN_CONFIG[type].label}
                </button>
              ))}
            </div>
          </div>

          <div className="mt-auto">
             <div className="p-6 bg-gray-50 rounded-[2rem] mb-6 border border-gray-100">
               <p className="text-[11px] text-gray-500 leading-relaxed font-medium italic">"Ogni pin è una promessa per il futuro di Foggia."</p>
             </div>
             <button onClick={() => setIsModalOpen(true)} className="w-full bg-[#2d6a4f] text-white py-5 rounded-3xl font-bold text-sm hover:shadow-2xl hover:-translate-y-1 transition-all active:scale-95 shadow-xl">
               + Nuovo Segnale
             </button>
          </div>
        </aside>

        {/* Mappa Area */}
        <main className="flex-1 relative h-full w-full">
          <MapContainer 
            center={FOGGIA_COORDS} 
            zoom={15} 
            scrollWheelZoom={true} 
            style={{ height: '100%', width: '100%' }}
            zoomControl={false}
          >
            <TileLayer
              url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
              attribution='&copy; OpenStreetMap contributors'
            />
            
            <MapController target={mapTarget} userPos={userLocation} />

            {userLocation && (
              <Marker position={userLocation} icon={L.divIcon({
                className: 'user-pos-marker',
                html: '<div class="w-4 h-4 bg-blue-500 border-2 border-white rounded-full shadow-lg animate-pulse"></div>',
                iconSize: [16, 16],
                iconAnchor: [8, 8]
              })} />
            )}

            {filteredPins.map(pin => (
              <PostItMarker key={pin.id} pin={pin} onReact={handleReact} />
            ))}
          </MapContainer>

          {/* HUD fluttuante per Mobile e Desktop */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[1000] flex flex-col md:flex-row items-center gap-3 w-[90%] md:w-auto">
             <div className="flex gap-2 p-2 bg-white/90 backdrop-blur-xl border border-gray-200 rounded-full shadow-2xl">
                <button 
                    onClick={handleSimulate} 
                    disabled={!!isBusy}
                    className="px-6 py-3 bg-[#2d6a4f] text-white rounded-full font-bold text-[10px] md:text-xs hover:bg-[#1b2e22] transition-all flex items-center gap-2 active:scale-95 shadow-lg whitespace-nowrap"
                >
                  {isBusy === 'simulating' ? <div className="animate-spin w-3 h-3 border-2 border-white/30 border-t-white rounded-full"></div> : '✦'}
                  SIMULA
                </button>
                <button 
                    onClick={handleAnalyze} 
                    disabled={!!isBusy}
                    className="px-6 py-3 bg-white text-[#1b2e22] border border-gray-200 rounded-full font-bold text-[10px] md:text-xs hover:bg-gray-50 transition-all flex items-center gap-2 active:scale-95 shadow-lg whitespace-nowrap"
                >
                  🔍 ANALISI
                </button>
             </div>
             
             {/* Mobile-only CTA */}
             <button onClick={() => setIsModalOpen(true)} className="lg:hidden w-full py-4 bg-[#2d6a4f] text-white rounded-full font-bold text-sm shadow-2xl active:scale-95">
               + NUOVO SEGNALE
             </button>
          </div>

          {/* Analisi report */}
          {analysis && (
            <div className="absolute top-4 md:top-10 left-4 md:left-10 w-[92vw] md:w-96 bg-white border border-gray-200 rounded-[2rem] md:rounded-[2.5rem] p-6 md:p-8 shadow-2xl z-[1000] animate-pop-in max-h-[70vh] overflow-y-auto">
              <div className="flex justify-between items-start mb-6">
                 <span className="font-mono text-[9px] text-[#2d6a4f] font-bold uppercase tracking-[0.2em]">Rapporto Territoriale</span>
                 <button onClick={() => setAnalysis(null)} className="text-gray-300 hover:text-gray-500 font-bold text-xl leading-none">&times;</button>
              </div>
              <h4 className="font-serif-display text-xl md:text-2xl mb-2 text-[#1b2e22] leading-tight">{analysis.insight_principale}</h4>
              <div className="space-y-4 my-6">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">Zona analizzata</span>
                  <span className="font-bold">{analysis.zona}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">Temi</span>
                  <div className="flex gap-1">
                    {analysis.temi_ricorrenti.slice(0, 2).map(t => <span key={t} className="bg-gray-100 px-2 py-0.5 rounded text-[9px]">{t}</span>)}
                  </div>
                </div>
              </div>
              <div className="p-4 bg-green-50 rounded-xl border border-green-100">
                 <p className="text-[10px] text-green-800 font-bold mb-1 uppercase tracking-wider">Azione Consigliata</p>
                 <p className="text-[12px] text-green-900 leading-relaxed font-medium">{analysis.azione_consigliata}</p>
              </div>
            </div>
          )}
        </main>

        <AIPanel isOpen={isAIOpen} onClose={() => setIsAIOpen(false)} onSimulatePins={handleSimulate} />
      </div>

      {/* Modal Nuovo Pin Perfezionato */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-[#1b2e22]/30 backdrop-blur-md p-4">
           <div className="bg-white rounded-[2rem] md:rounded-[3.5rem] p-6 md:p-12 w-full max-w-xl shadow-2xl relative overflow-y-auto max-h-[90vh]">
              <div className="flex justify-between items-center mb-6">
                <h3 className="font-serif-display text-2xl md:text-4xl text-[#1b2e22]">Invia un segnale</h3>
                <button onClick={() => setIsModalOpen(false)} className="text-gray-300 hover:text-gray-500 text-3xl">&times;</button>
              </div>
              
              <div className="space-y-6">
                <div>
                  <label className="font-mono text-[10px] uppercase text-gray-400 block mb-3">Categoria del segnale</label>
                  <div className="grid grid-cols-2 gap-2">
                    {(Object.keys(PIN_CONFIG) as PinType[]).map(type => (
                      <button 
                        key={type}
                        onClick={() => setNewPinType(type)}
                        className={`flex items-center gap-2 p-3 rounded-xl border-2 transition-all text-xs font-bold ${newPinType === type ? 'border-[#2d6a4f] bg-[#2d6a4f]/5 text-[#1b2e22]' : 'border-gray-100 text-gray-400'}`}
                      >
                        <span>{PIN_CONFIG[type].emoji}</span> {PIN_CONFIG[type].label}
                      </button>
                    ))}
                  </div>
                </div>

                <div>
                  <label className="font-mono text-[10px] uppercase text-gray-400 block mb-3">Messaggio (max 140 car.)</label>
                  <textarea 
                    className="w-full h-32 md:h-44 bg-gray-50 border border-gray-100 rounded-[1.5rem] md:rounded-[2rem] p-6 text-gray-800 focus:bg-white focus:border-[#2d6a4f]/30 transition-all outline-none text-base md:text-lg resize-none shadow-inner"
                    placeholder="Esempio: Ho visto un bellissimo tramonto in via Arpi, ma c'è troppa spazzatura..."
                    maxLength={140}
                    value={newPinText}
                    onChange={(e) => setNewPinText(e.target.value)}
                  />
                  <div className="text-right text-[10px] text-gray-300 mt-2 font-mono">
                    {newPinText.length}/140
                  </div>
                </div>

                <div className="flex flex-col md:flex-row gap-3">
                   <button onClick={() => setIsModalOpen(false)} className="order-2 md:order-1 flex-1 py-4 text-gray-400 font-bold text-sm hover:text-gray-600 transition-colors">Annulla</button>
                   <button 
                      onClick={handleCreatePin} 
                      disabled={!newPinText.trim()}
                      className="order-1 md:order-2 flex-[2] py-4 bg-[#2d6a4f] text-white font-bold rounded-2xl shadow-xl hover:bg-[#1b2e22] transition-all active:scale-95 disabled:opacity-50 disabled:active:scale-100"
                   >
                     Pubblica Segnale
                   </button>
                </div>

                <p className="text-[10px] text-center text-gray-400 italic">
                  * Il segnale sarà posizionato nella tua posizione attuale ({userLocation ? 'Geoverificata' : 'Centro Foggia'}).
                </p>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
