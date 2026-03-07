
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { chatWithAI } from '../services/geminiService';

interface AIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSimulatePins: (scenario: string) => void;
  lat: number;
  lng: number;
  cityCode: string;
}

const AIPanel: React.FC<AIPanelProps> = ({ isOpen, onClose, onSimulatePins, lat, lng, cityCode }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'bot', content: "Sincronizzazione completata. Sono il modulo AI di PIN. Posso simulare impulsi iperlocali o analizzare il battito della città in tempo reale. Cosa vuoi trasmettere?" }
  ]);
  const [input, setInput] = useState('');
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  useEffect(() => {
    if (isOpen) scrollToBottom();
  }, [messages, isOpen]);

  const handleSend = async () => {
    if (!input.trim()) return;

    const userMsg = input.trim();
    setInput('');
    setMessages(prev => [...prev, { role: 'user', content: userMsg }]);
    
    const isAskingToGen = userMsg.toLowerCase().includes('genera') || userMsg.toLowerCase().includes('simula') || userMsg.toLowerCase().includes('impulsi');

    setMessages(prev => [...prev, { role: 'bot', content: '', isGenerating: true }]);
    
    const botResponse = await chatWithAI(userMsg, messages.map(m => ({ role: m.role, content: m.content })), lat, lng, cityCode);
    
    setMessages(prev => {
      const filtered = prev.filter(m => !m.isGenerating);
      return [...filtered, { role: 'bot', content: botResponse }];
    });

    if (isAskingToGen) {
      onSimulatePins(userMsg);
    }
  };

  const triggerNewsCollection = async () => {
    setMessages(prev => [...prev, { role: 'bot', content: '📡 Avvio scansione testate giornalistiche foggiane in corso...', isGenerating: true }]);
    try {
      const res = await fetch('/api/collect-news', { method: 'POST' });
      if (res.ok) {
        setMessages(prev => {
          const filtered = prev.filter(m => !m.isGenerating);
          return [...filtered, { role: 'bot', content: '✅ Scansione completata. I nuovi impulsi sono stati trasmessi sulla mappa.' }];
        });
      }
    } catch (e) {
      setMessages(prev => {
        const filtered = prev.filter(m => !m.isGenerating);
        return [...filtered, { role: 'bot', content: '❌ Errore durante la scansione delle news.' }];
      });
    }
  };

  return (
    <div className={`fixed right-0 top-16 bottom-0 w-80 md:w-96 bg-black/95 backdrop-blur-xl border-l border-white/10 z-[80] flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="p-5 border-b border-white/10 flex items-center justify-between">
        <h3 className="font-black text-sm text-[#00ff41] uppercase tracking-widest">✦ AI Pulse Engine</h3>
        <button onClick={onClose} className="text-white/40 hover:text-white text-xl">&times;</button>
      </div>

      <div className="p-3 bg-[#00ff41]/5 border-b border-[#00ff41]/10">
        <button 
          onClick={triggerNewsCollection}
          className="w-full py-2 bg-[#00ff41]/10 border border-[#00ff41]/30 text-[#00ff41] text-[10px] font-black uppercase tracking-tighter hover:bg-[#00ff41]/20 transition-all flex items-center justify-center gap-2"
        >
          <span className="animate-pulse">📡</span> Sincronizza News Foggia
        </button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4 font-mono">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded text-[11px] leading-relaxed ${
              m.role === 'user' 
                ? 'bg-white/10 text-white rounded-br-none' 
                : 'bg-[#00ff41]/10 border border-[#00ff41]/20 text-[#00ff41] rounded-bl-none'
            }`}>
              {m.isGenerating ? (
                <div className="flex gap-1 py-1">
                  <div className="w-1 h-1 bg-[#00ff41] rounded-full animate-pulse"></div>
                  <div className="w-1 h-1 bg-[#00ff41] rounded-full animate-pulse [animation-delay:0.2s]"></div>
                  <div className="w-1 h-1 bg-[#00ff41] rounded-full animate-pulse [animation-delay:0.4s]"></div>
                </div>
              ) : m.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-white/10 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Es: simula impulsi per un concerto..."
          className="flex-1 bg-white/5 border border-white/10 rounded p-2.5 text-[11px] text-white placeholder-white/20 outline-none focus:border-[#00ff41]/50 resize-none"
          rows={2}
        />
        <button 
          onClick={handleSend}
          className="bg-[#00ff41] text-black rounded px-4 hover:brightness-110 transition-all font-bold"
        >
          →
        </button>
      </div>
    </div>
  );
};

export default AIPanel;
