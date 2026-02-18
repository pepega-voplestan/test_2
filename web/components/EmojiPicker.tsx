import React, { useState, useRef, useEffect } from 'react';

const EMOJI_GROUPS = [
  { label: 'Часто', emojis: ['\uD83D\uDE02', '\uD83D\uDE0D', '\uD83D\uDD25', '\uD83D\uDC4D', '\uD83D\uDC4E', '\u2764\uFE0F', '\uD83D\uDE22', '\uD83D\uDE21', '\uD83E\uDD14', '\uD83D\uDE4F', '\uD83C\uDF89', '\uD83D\uDCAF'] },
  { label: 'Лица', emojis: ['\uD83D\uDE00', '\uD83D\uDE03', '\uD83D\uDE04', '\uD83D\uDE01', '\uD83D\uDE05', '\uD83E\uDD23', '\uD83D\uDE0A', '\uD83D\uDE07', '\uD83D\uDE09', '\uD83D\uDE0B', '\uD83D\uDE0E', '\uD83E\uDD29', '\uD83D\uDE0F', '\uD83D\uDE12', '\uD83D\uDE14', '\uD83E\uDD71', '\uD83D\uDE34', '\uD83E\uDD75', '\uD83E\uDD76', '\uD83E\uDD2F', '\uD83E\uDD2E', '\uD83E\uDD2C', '\uD83D\uDE31', '\uD83D\uDE28', '\uD83D\uDE30', '\uD83D\uDE25', '\uD83D\uDE2D', '\uD83D\uDE24', '\uD83D\uDE20', '\uD83D\uDE08'] },
  { label: 'Жесты', emojis: ['\uD83D\uDC4D', '\uD83D\uDC4E', '\u270C\uFE0F', '\uD83E\uDD1E', '\uD83E\uDD18', '\uD83D\uDC4C', '\uD83D\uDC4F', '\uD83D\uDE4C', '\uD83D\uDE4F', '\uD83D\uDCAA', '\uD83D\uDC40', '\uD83E\uDDE0'] },
  { label: 'Разное', emojis: ['\uD83D\uDD25', '\u2764\uFE0F', '\uD83D\uDC94', '\uD83C\uDFAE', '\uD83C\uDFB5', '\uD83C\uDFAC', '\uD83D\uDCBB', '\uD83D\uDE80', '\uD83C\uDF1F', '\uD83C\uDF08', '\u2705', '\u274C', '\u26A0\uFE0F', '\uD83D\uDCA9'] },
];

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  size?: 'sm' | 'md';
}

const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, size = 'md' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!isOpen) return;
    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node)) {
        setIsOpen(false);
      }
    };
    document.addEventListener('mousedown', handler);
    return () => document.removeEventListener('mousedown', handler);
  }, [isOpen]);

  const btnSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const btnPad = size === 'sm' ? 'p-0.5' : 'p-1';

  return (
    <div className="relative" ref={ref}>
      <button
        type="button"
        onClick={() => setIsOpen(!isOpen)}
        className={`${btnPad} text-th-text-4 hover:text-th-text-2 transition-colors shrink-0`}
        title="Эмодзи"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className={btnSize} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 100-2 1 1 0 000 2zm7-1a1 1 0 11-2 0 1 1 0 012 0zm-.464 5.535a1 1 0 10-1.415-1.414 3 3 0 01-4.242 0 1 1 0 00-1.415 1.414 5 5 0 007.072 0z" clipRule="evenodd" />
        </svg>
      </button>

      {isOpen && (
        <div className="absolute bottom-full right-0 mb-1 w-64 bg-th-card border border-th-border rounded-lg shadow-xl z-50 p-2 max-h-52 overflow-y-auto">
          {EMOJI_GROUPS.map((group) => (
            <div key={group.label} className="mb-2 last:mb-0">
              <div className="text-[10px] text-th-text-4 font-medium px-1 mb-1">{group.label}</div>
              <div className="flex flex-wrap gap-0.5">
                {group.emojis.map((emoji, i) => (
                  <button
                    key={i}
                    type="button"
                    onClick={() => { onSelect(emoji); setIsOpen(false); }}
                    className="w-7 h-7 flex items-center justify-center text-base hover:bg-th-elevated rounded transition-colors"
                  >
                    {emoji}
                  </button>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};

export default EmojiPicker;
