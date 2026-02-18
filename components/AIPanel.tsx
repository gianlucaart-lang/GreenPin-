
import React, { useState, useRef, useEffect } from 'react';
import { ChatMessage } from '../types';
import { chatWithAI } from '../services/geminiService';

interface AIPanelProps {
  isOpen: boolean;
  onClose: () => void;
  onSimulatePins: (scenario: string) => void;
}

const AIPanel: React.FC<AIPanelProps> = ({ isOpen, onClose, onSimulatePins }) => {
  const [messages, setMessages] = useState<ChatMessage[]>([
    { role: 'bot', content: "Ciao! Sono il motore AI di GreenPin. Dimmi la zona che vuoi esplorare e cosa stai cercando di fare: generare post-it simulati, analizzare una community esistente, o affinare il concept della piattaforma. Parto subito." }
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
    
    // Check if user is asking to generate pins specifically
    const isAskingToGen = userMsg.toLowerCase().includes('genera') || userMsg.toLowerCase().includes('simula');

    setMessages(prev => [...prev, { role: 'bot', content: '', isGenerating: true }]);
    
    const botResponse = await chatWithAI(userMsg, messages.map(m => ({ role: m.role, content: m.content })));
    
    setMessages(prev => {
      const filtered = prev.filter(m => !m.isGenerating);
      return [...filtered, { role: 'bot', content: botResponse }];
    });

    if (isAskingToGen) {
      onSimulatePins(userMsg);
    }
  };

  return (
    <div className={`fixed right-0 top-16 bottom-0 w-80 md:w-96 bg-[#1b2e22]/95 backdrop-blur-xl border-l border-[#95d5b2]/15 z-[80] flex flex-col transition-transform duration-500 ease-[cubic-bezier(0.16,1,0.3,1)] ${isOpen ? 'translate-x-0' : 'translate-x-full'}`}>
      <div className="p-5 border-b border-[#95d5b2]/10 flex items-center justify-between">
        <h3 className="font-serif-display text-lg text-[#95d5b2]">✦ GreenPin AI</h3>
        <button onClick={onClose} className="text-[#5a7a65] hover:text-[#95d5b2] text-xl">&times;</button>
      </div>
      
      <div className="flex-1 overflow-y-auto p-4 space-y-4">
        {messages.map((m, i) => (
          <div key={i} className={`flex ${m.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-[85%] p-3 rounded-xl text-sm leading-relaxed ${
              m.role === 'user' 
                ? 'bg-[#95d5b2]/10 text-[#f4f0e8] rounded-br-none' 
                : 'bg-[#2d6a4f]/40 border border-[#95d5b2]/15 text-[#b7e4c7] rounded-bl-none'
            }`}>
              {m.isGenerating ? (
                <div className="flex gap-1 py-1">
                  <div className="w-1.5 h-1.5 bg-[#95d5b2] rounded-full animate-bounce"></div>
                  <div className="w-1.5 h-1.5 bg-[#95d5b2] rounded-full animate-bounce [animation-delay:0.2s]"></div>
                  <div className="w-1.5 h-1.5 bg-[#95d5b2] rounded-full animate-bounce [animation-delay:0.4s]"></div>
                </div>
              ) : m.content}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>

      <div className="p-4 border-t border-[#95d5b2]/10 flex gap-2">
        <textarea
          value={input}
          onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => { if(e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); handleSend(); } }}
          placeholder="Es: genera 5 post-it per un parco..."
          className="flex-1 bg-[#95d5b2]/5 border border-[#95d5b2]/20 rounded-lg p-2.5 text-sm text-[#f4f0e8] placeholder-[#5a7a65] outline-none focus:border-[#95d5b2]/50 resize-none"
          rows={2}
        />
        <button 
          onClick={handleSend}
          className="bg-[#95d5b2] text-[#1b2e22] rounded-lg px-4 hover:bg-[#b7e4c7] transition-all font-bold"
        >
          →
        </button>
      </div>
    </div>
  );
};

export default AIPanel;
