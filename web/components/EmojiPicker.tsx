import React, { useState, useRef, useEffect, useLayoutEffect, useCallback } from 'react';

const EMOJI_GROUPS = [
  { label: 'Часто', emojis: ['😂', '😍', '🔥', '👍', '👎', '❤️', '😢', '😡', '🤔', '🙏', '🎉', '💯'] },
  { label: 'Лица', emojis: ['😀', '😃', '😄', '😁', '😅', '🤣', '😊', '😇', '😉', '😋', '😎', '🤩', '😏', '😒', '😔', '🥱', '😴', '🥵', '🥶', '🤯', '🤮', '🤬', '😱', '😨', '😰', '😥', '😭', '😤', '😠', '😈'] },
  { label: 'Жесты', emojis: ['👍', '👎', '✌️', '🤞', '🤘', '👌', '👏', '🙌', '🙏', '💪', '👀', '🧠'] },
  { label: 'Разное', emojis: ['🔥', '❤️', '💔', '🎮', '🎵', '🎬', '💻', '🚀', '🌟', '🌈', '✅', '❌', '⚠️', '💩'] },
];

// Search keywords for emojis (Russian)
const EMOJI_KEYWORDS: Record<string, string[]> = {
  '😂': ['смех', 'слезы', 'ржу', 'лол', 'хаха', 'laugh'],
  '😍': ['любовь', 'влюблен', 'сердечки', 'love', 'heart eyes'],
  '🔥': ['огонь', 'fire', 'жара', 'круто', 'горячо'],
  '👍': ['лайк', 'класс', 'палец', 'хорошо', 'like', 'ок'],
  '👎': ['дизлайк', 'плохо', 'палец вниз', 'dislike'],
  '❤️': ['сердце', 'любовь', 'heart', 'love'],
  '😢': ['грусть', 'слеза', 'печаль', 'sad', 'cry'],
  '😡': ['злость', 'злой', 'бесит', 'angry'],
  '🤔': ['думаю', 'хмм', 'думать', 'think', 'hmm'],
  '🙏': ['пожалуйста', 'спасибо', 'молитва', 'please', 'thanks', 'pray'],
  '🎉': ['праздник', 'вечеринка', 'ура', 'party'],
  '💯': ['сто', 'точно', 'отлично', 'идеально', 'hundred'],
  '😀': ['улыбка', 'радость', 'smile', 'happy'],
  '😃': ['улыбка', 'радость', 'smile'],
  '😄': ['улыбка', 'радость', 'смех', 'smile'],
  '😁': ['улыбка', 'ухмылка', 'grin'],
  '😅': ['пот', 'неловко', 'sweat'],
  '🤣': ['ржу', 'катаюсь', 'смех', 'rofl'],
  '😊': ['мило', 'стесняюсь', 'blush'],
  '😇': ['ангел', 'святой', 'angel'],
  '😉': ['подмигивание', 'wink'],
  '😋': ['вкусно', 'еда', 'yum'],
  '😎': ['крутой', 'очки', 'cool'],
  '🤩': ['вау', 'звезды', 'wow', 'star'],
  '😏': ['ухмылка', 'smirk'],
  '😒': ['скука', 'недовольный', 'unamused'],
  '😔': ['грусть', 'печаль', 'sad'],
  '🥱': ['зевок', 'скучно', 'yawn'],
  '😴': ['сон', 'спать', 'sleep'],
  '🥵': ['жарко', 'горячо', 'hot'],
  '🥶': ['холодно', 'мерзну', 'cold'],
  '🤯': ['взрыв', 'мозг', 'шок', 'mind blown'],
  '🤮': ['тошнит', 'фу', 'vomit'],
  '🤬': ['ругается', 'мат', 'swear'],
  '😱': ['шок', 'ужас', 'страх', 'scream'],
  '😨': ['испуг', 'страх', 'fear'],
  '😰': ['тревога', 'нервы', 'anxious'],
  '😥': ['грусть', 'разочарование', 'disappointed'],
  '😭': ['плачу', 'рыдаю', 'слезы', 'cry', 'sob'],
  '😤': ['злой', 'пар', 'huff'],
  '😠': ['злой', 'angry'],
  '😈': ['дьявол', 'злой', 'devil'],
  '✌️': ['мир', 'победа', 'peace', 'victory'],
  '🤞': ['удачи', 'скрещены', 'crossed fingers'],
  '🤘': ['рок', 'rock', 'метал'],
  '👌': ['ок', 'отлично', 'ok'],
  '👏': ['аплодисменты', 'браво', 'clap'],
  '🙌': ['ура', 'руки', 'yay'],
  '💪': ['сила', 'мускул', 'strong', 'muscle'],
  '👀': ['глаза', 'смотрю', 'eyes', 'look'],
  '🧠': ['мозг', 'умный', 'brain'],
  '💔': ['разбитое сердце', 'broken heart'],
  '🎮': ['игра', 'геймер', 'game', 'gamer'],
  '🎵': ['музыка', 'music', 'нота'],
  '🎬': ['кино', 'фильм', 'movie'],
  '💻': ['компьютер', 'ноутбук', 'computer', 'laptop'],
  '🚀': ['ракета', 'запуск', 'rocket', 'launch'],
  '🌟': ['звезда', 'star', 'блеск'],
  '🌈': ['радуга', 'rainbow'],
  '✅': ['да', 'готово', 'галочка', 'yes', 'done', 'check'],
  '❌': ['нет', 'крест', 'no', 'cross'],
  '⚠️': ['внимание', 'warning', 'осторожно'],
  '💩': ['какашка', 'фигня', 'poop'],
};

// Collect all unique emojis for search
const ALL_EMOJIS = Array.from(new Set(EMOJI_GROUPS.flatMap(g => g.emojis)));

interface EmojiPickerProps {
  onSelect: (emoji: string) => void;
  size?: 'sm' | 'md';
}

const isTouchDevice = () => window.matchMedia('(pointer: coarse)').matches;

const EmojiPicker: React.FC<EmojiPickerProps> = ({ onSelect, size = 'md' }) => {
  const [isOpen, setIsOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [mobileReadOnly, setMobileReadOnly] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const popupRef = useRef<HTMLDivElement>(null);
  const searchRef = useRef<HTMLInputElement>(null);
  const btnRef = useRef<HTMLButtonElement>(null);
  const [popupStyle, setPopupStyle] = useState<React.CSSProperties | null>(null);

  const positionPopup = useCallback(() => {
    const btn = btnRef.current;
    if (!btn) return;
    const rect = btn.getBoundingClientRect();
    const popupW = 272; // w-68 = 17rem = 272px
    const popupH = 320;
    const pad = 8;

    // Vertical: prefer above the button, fall back to below
    let top: number;
    if (rect.top - popupH - pad > 0) {
      top = rect.top - popupH - 4;
    } else {
      top = rect.bottom + 4;
    }

    // Horizontal: prefer right-aligned with button, clamp to viewport
    let left = rect.right - popupW;
    if (left < pad) left = pad;
    if (left + popupW > window.innerWidth - pad) left = window.innerWidth - pad - popupW;

    setPopupStyle({
      position: 'fixed',
      top,
      left,
      width: popupW,
    });
  }, []);

  // Position before browser paint to avoid first-open jump
  useLayoutEffect(() => {
    if (!isOpen) return;
    positionPopup();
  }, [isOpen, positionPopup]);

  useEffect(() => {
    if (!isOpen) return;
    // On mobile: make input readOnly to prevent keyboard on tap; on desktop: autofocus
    if (isTouchDevice()) {
      setMobileReadOnly(true);
    } else {
      setMobileReadOnly(false);
      setTimeout(() => searchRef.current?.focus(), 0);
    }

    const handler = (e: MouseEvent) => {
      if (ref.current && !ref.current.contains(e.target as Node) &&
          popupRef.current && !popupRef.current.contains(e.target as Node)) {
        setIsOpen(false);
        setSearch('');
        setPopupStyle(null);
        setMobileReadOnly(false);
      }
    };
    document.addEventListener('mousedown', handler);
    window.addEventListener('resize', positionPopup);
    window.addEventListener('scroll', positionPopup, true);
    return () => {
      document.removeEventListener('mousedown', handler);
      window.removeEventListener('resize', positionPopup);
      window.removeEventListener('scroll', positionPopup, true);
    };
  }, [isOpen, positionPopup]);

  const btnSize = size === 'sm' ? 'w-4 h-4' : 'w-5 h-5';
  const btnPad = size === 'sm' ? 'p-0.5' : 'p-1';

  const query = search.trim().toLowerCase();
  const filteredEmojis = query
    ? ALL_EMOJIS.filter(emoji => {
        const kws = EMOJI_KEYWORDS[emoji];
        if (!kws) return false;
        return kws.some(kw => kw.toLowerCase().includes(query));
      })
    : null;

  return (
    <div className="relative" ref={ref}>
      <button
        ref={btnRef}
        type="button"
        onMouseDown={(e) => e.preventDefault()}
        onClick={() => { setIsOpen(!isOpen); if (isOpen) { setSearch(''); setPopupStyle(null); } }}
        className={`${btnPad} text-th-text-4 hover:text-th-text-2 transition-colors shrink-0`}
        title="Эмодзи"
      >
        <svg xmlns="http://www.w3.org/2000/svg" className={btnSize} viewBox="0 0 20 20" fill="currentColor">
          <path fillRule="evenodd" d="M10 18a8 8 0 100-16 8 8 0 000 16zM7 9a1 1 0 100-2 1 1 0 000 2zm7-1a1 1 0 11-2 0 1 1 0 012 0zm-.464 5.535a1 1 0 10-1.415-1.414 3 3 0 01-4.242 0 1 1 0 00-1.415 1.414 5 5 0 007.072 0z" clipRule="evenodd" />
        </svg>
      </button>

      {isOpen && (
        <div
          ref={popupRef}
          style={popupStyle ? popupStyle : { position: 'fixed', top: -9999, left: -9999, width: 272 }}
          className="bg-th-card border border-th-border rounded-lg shadow-xl z-[9999] flex flex-col max-h-80"
        >
          {/* Search input */}
          <div className="p-2 pb-1 border-b border-th-border/50">
            <input
              ref={searchRef}
              type="text"
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              readOnly={mobileReadOnly}
              onTouchEnd={() => { if (mobileReadOnly) { setMobileReadOnly(false); setTimeout(() => searchRef.current?.focus(), 0); } }}
              placeholder="Поиск эмодзи..."
              className="w-full bg-th-input text-th-text text-xs rounded-md px-2.5 py-1.5 outline-none border border-th-border/50 focus:border-th-text-4 placeholder-th-text-4 transition-colors"
            />
          </div>

          {/* Emoji grid */}
          <div className="p-2 overflow-y-auto flex-1">
            {filteredEmojis !== null ? (
              filteredEmojis.length > 0 ? (
                <div className="flex flex-wrap gap-0.5">
                  {filteredEmojis.map((emoji, i) => (
                    <button
                      key={i}
                      type="button"
                      onMouseDown={(e) => e.preventDefault()}
                      onClick={() => { onSelect(emoji); setIsOpen(false); setSearch(''); }}
                      className="w-8 h-8 flex items-center justify-center text-lg hover:bg-th-elevated rounded transition-colors"
                    >
                      {emoji}
                    </button>
                  ))}
                </div>
              ) : (
                <div className="text-xs text-th-text-4 text-center py-4">Ничего не найдено</div>
              )
            ) : (
              EMOJI_GROUPS.map((group) => (
                <div key={group.label} className="mb-2 last:mb-0">
                  <div className="text-[10px] text-th-text-4 font-medium px-1 mb-1">{group.label}</div>
                  <div className="flex flex-wrap gap-0.5">
                    {group.emojis.map((emoji, i) => (
                      <button
                        key={i}
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={() => { onSelect(emoji); setIsOpen(false); setSearch(''); }}
                        className="w-8 h-8 flex items-center justify-center text-lg hover:bg-th-elevated rounded transition-colors"
                      >
                        {emoji}
                      </button>
                    ))}
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      )}
    </div>
  );
};

export default EmojiPicker;
