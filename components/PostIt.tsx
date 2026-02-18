
import React from 'react';
import { Pin, PinType } from '../types';
import { PIN_CONFIG } from '../constants';

interface PostItProps {
  pin: Pin;
  onReact: (id: string, type: 'like' | 'heart' | 'comment') => void;
  style?: React.CSSProperties;
}

const PostIt: React.FC<PostItProps> = ({ pin, onReact, style }) => {
  const config = PIN_CONFIG[pin.type];
  const rot = pin.rotation || 0;

  return (
    <div
      className="absolute w-44 sm:w-52 rounded-sm p-3 pb-4 cursor-pointer shadow-lg hover:shadow-2xl transition-all duration-200 hover:scale-105 animate-pop-in z-10 hover:z-50"
      style={{
        // Use updated Pin type properties x and y for absolute positioning
        // Added explicit checks for x and y existence now that they are in the interface
        left: pin.x !== undefined ? `${pin.x}%` : '0%',
        top: pin.y !== undefined ? `${pin.y}%` : '0%',
        backgroundColor: config.color,
        transform: `rotate(${rot}deg)`,
        ...style
      }}
    >
      {/* Push-pin visual */}
      <div className="absolute -top-1.5 left-1/2 -translate-x-1/2 w-3 h-3 rounded-full bg-black/20 shadow-md"></div>
      
      <div className="font-mono-code text-[10px] uppercase tracking-widest opacity-60 mb-1.5">
        {config.emoji} {pin.type}
      </div>
      
      <div className="font-serif-display text-sm leading-snug text-black/80 mb-2 min-h-[3rem]">
        {pin.text}
      </div>
      
      <div className="flex items-center justify-between border-t border-black/5 pt-2">
        <span className="font-mono-code text-[10px] text-black/50 truncate max-w-[60%]">{pin.user}</span>
        <span className="font-mono-code text-[9px] text-black/40">{pin.time}</span>
      </div>
      
      <div className="mt-2 flex gap-1.5">
        <button 
          onClick={(e) => { e.stopPropagation(); onReact(pin.id, 'like'); }}
          className="text-[11px] bg-black/5 hover:bg-black/10 rounded-full px-2 py-0.5 transition-colors"
        >
          👍 {pin.reactions.like}
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onReact(pin.id, 'heart'); }}
          className="text-[11px] bg-black/5 hover:bg-black/10 rounded-full px-2 py-0.5 transition-colors"
        >
          ❤️ {pin.reactions.heart}
        </button>
        <button 
          onClick={(e) => { e.stopPropagation(); onReact(pin.id, 'comment'); }}
          className="text-[11px] bg-black/5 hover:bg-black/10 rounded-full px-2 py-0.5 transition-colors"
        >
          💬 {pin.reactions.comment}
        </button>
      </div>
    </div>
  );
};

export default PostIt;
