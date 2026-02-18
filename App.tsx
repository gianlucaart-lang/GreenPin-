
import React, { useState, useMemo, useEffect } from 'react';
import { MapContainer, TileLayer, Marker, useMap } from 'react-leaflet';
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

const INITIAL_PINS: Pin[] = [
  { 
    id: 'p1', type: 'offro', emoji: '🤝', text: 'Offro aiuto per pulire i giardinetti di Piazza Cavour sabato mattina!', 
    user: 'Antonio F.', time: '10min fa', sentiment: 'ispirante', reactions: { like: 12, heart: 5, comment: 3 }, tags: ['#piazzaCavour'], lat: 41.4585, lng: 15.5515, rotation: -2 
  },
  { 
    id: 'p2', type: 'visto', emoji: '👁', text: 'Ancora troppi rifiuti abbandonati vicino alla Villa Comunale. Facciamo qualcosa?', 
    user: 'Maria G.', time: '1h fa', sentiment: 'urgente', reactions: { like: 24, heart: 2, comment: 8 }, tags: ['#villaComunale'], lat: 41.4640, lng: 15.5550, rotation: 3 
  },
  { 
    id: 'p3', type: 'fatto', emoji: '💪', text: 'Ho sistemato le aiuole davanti alla stazione stamattina. Chi si unisce domani?', 
    user: 'Luigi P.', time: '3h fa', sentiment: 'positivo', reactions: { like: 45, heart: 12, comment: 5 }, tags: ['#quartiereFerrovia'], lat: 41.4590, lng: 15.5430, rotation: -1 
  }
];

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

const MapController = ({ target }: { target: [number, number] | null }) => {
  const map = useMap();
  
  // Fix per il caricamento parziale della mappa
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
  
  return null;
};

const App: React.FC = () => {
  const [pins, setPins] = useState<Pin[]>(INITIAL_PINS);
  const [filter, setFilter] = useState<PinType | 'all'>('all');
  const [isAIOpen, setIsAIOpen] = useState(false);
  const [analysis, setAnalysis] = useState<AreaAnalysis | null>(null);
  const [isBusy, setIsBusy] = useState<'simulating' | 'analyzing' | null>(null);
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [mapTarget, setMapTarget] = useState<[number, number] | null>(null);
  const [newPinText, setNewPinText] = useState('');

  const filteredPins = useMemo(() => pins.filter(p => filter === 'all' || p.type === filter), [pins, filter]);

  const handleReact = (id: string, type: 'like' | 'heart' | 'comment') => {
    setPins(prev => prev.map(p => {
      if (p.id === id) {
        return { ...p, reactions: { ...p.reactions, [type]: p.reactions[type] + 1 } };
      }
      return p;
    }));
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
      <header className="fixed top-0 left-0 right-0 h-16 bg-white/80 backdrop-blur-xl border-b border-gray-200 z-[1000] flex items-center justify-between px-8">
        <div className="flex items-center gap-6">
          {/* Logo Abbracciato Stile Apple */}
          <div className="logo-gp">
            <div className="logo-g">G</div>
            <div className="logo-p">P</div>
          </div>
          <div className="flex flex-col">
            <h1 className="font-serif-display text-2xl tracking-tighter text-[#1b2e22] leading-none">
              <span className="text-[#2d6a4f]">G</span>reen <span className="text-[#2d6a4f]">P</span>in <span className="text-gray-400 font-sans font-light ml-1">Foggia</span>
            </h1>
            <p className="font-mono text-[9px] uppercase tracking-widest text-gray-400 mt-1">
              Comunità Reale • Geoverificata
            </p>
          </div>
        </div>

        <div className="flex items-center gap-4">
          <button 
            onClick={() => setIsAIOpen(true)}
            className="hidden md:flex items-center gap-2 bg-[#1b2e22] text-white px-6 py-2 rounded-full font-bold text-xs hover:bg-[#2d6a4f] transition-all shadow-lg active:scale-95"
          >
            ✦ Motore AI
          </button>
          <div className="w-10 h-10 rounded-full bg-gray-100 border border-gray-200 flex items-center justify-center text-xs font-bold text-gray-500 cursor-pointer hover:bg-white transition-all shadow-sm">FG</div>
        </div>
      </header>

      <div className="flex flex-1 mt-16 relative">
        {/* Sidebar */}
        <aside className="w-72 bg-white border-r border-gray-100 p-8 flex flex-col gap-10 z-[500] shadow-sm overflow-y-auto hidden lg:flex">
          <div>
            <h2 className="font-mono text-[10px] text-gray-400 uppercase tracking-[0.2em] mb-6">Naviga Segnali</h2>
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
            
            <MapController target={mapTarget} />

            {filteredPins.map(pin => (
              <PostItMarker key={pin.id} pin={pin} onReact={handleReact} />
            ))}
          </MapContainer>

          {/* HUD fluttuante */}
          <div className="absolute bottom-10 left-1/2 -translate-x-1/2 z-[1000] flex items-center gap-3 p-3 bg-white/90 backdrop-blur-xl border border-gray-200 rounded-[2rem] shadow-2xl">
             <button 
                onClick={handleSimulate} 
                disabled={!!isBusy}
                className="px-8 py-4 bg-[#2d6a4f] text-white rounded-full font-bold text-xs hover:bg-[#1b2e22] transition-all flex items-center gap-2 active:scale-95 shadow-lg"
             >
               {isBusy === 'simulating' ? <div className="animate-spin w-3 h-3 border-2 border-white/30 border-t-white rounded-full"></div> : '✦'}
               SIMULA CITTÀ
             </button>
             <button 
                onClick={handleAnalyze} 
                disabled={!!isBusy}
                className="px-8 py-4 bg-white text-[#1b2e22] border border-gray-200 rounded-full font-bold text-xs hover:bg-gray-50 transition-all flex items-center gap-2 active:scale-95 shadow-lg"
             >
               🔍 ANALISI AI
             </button>
          </div>

          {/* Analisi report */}
          {analysis && (
            <div className="absolute top-10 left-10 w-96 bg-white border border-gray-200 rounded-[2.5rem] p-8 shadow-2xl z-[1000] animate-pop-in">
              <div className="flex justify-between items-start mb-6">
                 <span className="font-mono text-[9px] text-[#2d6a4f] font-bold uppercase tracking-[0.2em]">Rapporto Territoriale</span>
                 <button onClick={() => setAnalysis(null)} className="text-gray-300 hover:text-gray-500 font-bold text-xl leading-none">&times;</button>
              </div>
              <h4 className="font-serif-display text-2xl mb-2 text-[#1b2e22] leading-tight">{analysis.insight_principale}</h4>
              <div className="space-y-4 my-6">
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">Zona analizzata</span>
                  <span className="font-bold">{analysis.zona}</span>
                </div>
                <div className="flex justify-between items-center text-xs">
                  <span className="text-gray-400">Sentiment medio</span>
                  <span className="font-bold text-green-600">Proattivo</span>
                </div>
              </div>
              <div className="p-5 bg-green-50 rounded-2xl border border-green-100">
                 <p className="text-[11px] text-green-800 font-bold mb-1 uppercase tracking-wider">Azione Consigliata</p>
                 <p className="text-[12px] text-green-900 leading-relaxed font-medium">{analysis.azione_consigliata}</p>
              </div>
            </div>
          )}
        </main>

        <AIPanel isOpen={isAIOpen} onClose={() => setIsAIOpen(false)} onSimulatePins={handleSimulate} />
      </div>

      {/* Modal Nuovo Pin */}
      {isModalOpen && (
        <div className="fixed inset-0 z-[2000] flex items-center justify-center bg-[#1b2e22]/20 backdrop-blur-md p-6">
           <div className="bg-white rounded-[3.5rem] p-12 w-full max-w-xl shadow-2xl relative">
              <h3 className="font-serif-display text-4xl text-[#1b2e22] mb-4">Invia un segnale</h3>
              <p className="text-gray-400 text-sm mb-10 leading-relaxed">Il tuo messaggio sarà visibile a tutti i cittadini di Foggia in tempo reale.</p>
              
              <div className="space-y-6">
                <textarea 
                  className="w-full h-44 bg-gray-50 border border-gray-100 rounded-[2rem] p-8 text-gray-800 focus:bg-white focus:border-[#2d6a4f]/30 transition-all outline-none text-lg resize-none shadow-inner"
                  placeholder="Cosa sta succedendo nel tuo quartiere?"
                  value={newPinText}
                  onChange={(e) => setNewPinText(e.target.value)}
                />
                <div className="flex gap-4">
                   <button onClick={() => setIsModalOpen(false)} className="flex-1 py-5 text-gray-400 font-bold text-sm hover:text-gray-600 transition-colors">Annulla</button>
                   <button onClick={() => setIsModalOpen(false)} className="flex-[2] py-5 bg-[#2d6a4f] text-white font-bold rounded-2xl shadow-xl hover:bg-[#1b2e22] transition-all active:scale-95">Pubblica Segnale</button>
                </div>
              </div>
           </div>
        </div>
      )}
    </div>
  );
};

export default App;
