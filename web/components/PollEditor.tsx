import React, { useState, useRef, useEffect } from 'react';

const POLL_MAX_OPTIONS = 7;
const POLL_OPTION_MAX_LENGTH = 144;

export interface PollPayload {
  multi: boolean;
  options: string[];
}

interface PollEditorProps {
  onClose: () => void;
  onChange: (poll: PollPayload | null) => void;
}

const PollEditor: React.FC<PollEditorProps> = ({ onClose, onChange }) => {
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multi, setMulti] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus newly added option input
  const focusIndexRef = useRef<number | null>(null);
  useEffect(() => {
    if (focusIndexRef.current !== null) {
      inputRefs.current[focusIndexRef.current]?.focus();
      focusIndexRef.current = null;
    }
  });

  const updateOption = (index: number, value: string) => {
    const next = [...options];
    next[index] = value;
    setOptions(next);
    emitChange(next, multi);
  };

  const addOption = () => {
    if (options.length >= POLL_MAX_OPTIONS) return;
    const next = [...options, ''];
    setOptions(next);
    focusIndexRef.current = next.length - 1;
    emitChange(next, multi);
  };

  const removeOption = (index: number) => {
    if (options.length <= 2) return;
    const next = options.filter((_, i) => i !== index);
    setOptions(next);
    emitChange(next, multi);
  };

  const toggleMulti = () => {
    const next = !multi;
    setMulti(next);
    emitChange(options, next);
  };

  const emitChange = (opts: string[], m: boolean) => {
    const filled = opts.filter(o => o.trim());
    if (filled.length > 0) {
      onChange({ multi: m, options: filled });
    } else {
      onChange(null);
    }
  };

  const handleClose = () => {
    onChange(null);
    onClose();
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLInputElement>, index: number) => {
    if (e.key === 'Enter') {
      e.preventDefault();
      e.stopPropagation();
      if (options.length < POLL_MAX_OPTIONS) {
        addOption();
      }
    }
    if (e.key === 'Backspace' && options[index] === '' && options.length > 2) {
      e.preventDefault();
      removeOption(index);
      // Focus previous input
      const prevIndex = Math.max(0, index - 1);
      setTimeout(() => inputRefs.current[prevIndex]?.focus(), 0);
    }
  };

  const canRemove = options.length > 2;

  return (
    <div className="mt-3 bg-th-inset/50 rounded-lg p-3 border border-th-border-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-th-text-3">Опрос</span>
        <button
          type="button"
          onClick={handleClose}
          className="text-th-text-4 hover:text-th-text-2 transition-colors"
          title="Убрать опрос"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
            <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
          </svg>
        </button>
      </div>

      <div className="flex flex-col gap-1.5">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              ref={el => { inputRefs.current[i] = el; }}
              type="text"
              value={opt}
              onChange={(e) => updateOption(i, e.target.value)}
              onKeyDown={(e) => handleKeyDown(e, i)}
              maxLength={POLL_OPTION_MAX_LENGTH}
              placeholder={`Вариант ${i + 1}`}
              className="flex-1 bg-th-input border border-th-border rounded px-2 py-1 text-sm text-th-text placeholder-th-text-4 outline-none focus:border-[#0087ff]/50"
            />
            {opt.length > POLL_OPTION_MAX_LENGTH * 0.9 && (
              <span className={`text-[10px] shrink-0 ${opt.length >= POLL_OPTION_MAX_LENGTH ? 'text-red-400' : 'text-yellow-400'}`}>
                {opt.length}/{POLL_OPTION_MAX_LENGTH}
              </span>
            )}
            <button
              type="button"
              onClick={() => canRemove && removeOption(i)}
              disabled={!canRemove}
              className={`shrink-0 transition-colors ${
                canRemove
                  ? 'text-th-text-4 hover:text-red-400 cursor-pointer'
                  : 'text-th-text-4/30 cursor-default'
              }`}
              title={canRemove ? 'Удалить вариант' : 'Минимум 2 варианта'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      <div className="flex items-center justify-between mt-2">
        {options.length < POLL_MAX_OPTIONS ? (
          <button
            type="button"
            onClick={addOption}
            className="text-[#0087ff] hover:bg-[#0087ff]/10 active:bg-[#0087ff]/20 text-sm font-bold px-3 py-1 rounded border border-[#0087ff]/30 transition-all"
          >
            + Добавить вариант
          </button>
        ) : (
          <div />
        )}

        <button
          type="button"
          onClick={toggleMulti}
          className="flex items-center gap-2 text-sm text-th-text-3 select-none cursor-pointer group"
        >
          <span className="text-th-text-4 group-hover:text-th-text-3 transition-colors">Несколько вариантов</span>
          <div className={`relative w-8 h-[18px] rounded-full transition-colors duration-200 ${multi ? 'bg-[#0087ff]' : 'bg-th-text-4/30'}`}>
            <div className={`absolute top-[2px] w-[14px] h-[14px] rounded-full bg-white shadow transition-transform duration-200 ${multi ? 'translate-x-[16px]' : 'translate-x-[2px]'}`} />
          </div>
        </button>
      </div>
    </div>
  );
};

export default PollEditor;
