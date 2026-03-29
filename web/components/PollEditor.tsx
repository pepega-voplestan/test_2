import React, { useState, useRef, useEffect, useImperativeHandle, forwardRef } from 'react';

const POLL_MAX_OPTIONS = 7;
const POLL_OPTION_MAX_LENGTH = 144;

export interface PollPayload {
  multi: boolean;
  options: string[];
}

export interface PollEditorHandle {
  validate: () => boolean;
}

interface PollEditorProps {
  onClose: () => void;
  onChange: (poll: PollPayload | null) => void;
}

const PollEditor = forwardRef<PollEditorHandle, PollEditorProps>(({ onClose, onChange }, ref) => {
  const [options, setOptions] = useState<string[]>(['', '']);
  const [multi, setMulti] = useState(false);
  const [emptyError, setEmptyError] = useState(false);
  const inputRefs = useRef<(HTMLInputElement | null)[]>([]);

  // Focus newly added option input
  const focusIndexRef = useRef<number | null>(null);
  useEffect(() => {
    if (focusIndexRef.current !== null) {
      inputRefs.current[focusIndexRef.current]?.focus();
      focusIndexRef.current = null;
    }
  }, [options.length]);

  const updateOption = (index: number, value: string) => {
    const next = [...options];
    next[index] = value;
    setOptions(next);
    setEmptyError(false);
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

  // Expose validate() to parent via ref
  useImperativeHandle(ref, () => ({
    validate: () => {
      const hasEmpty = options.some(o => !o.trim());
      if (hasEmpty) {
        setEmptyError(true);
        return false;
      }
      return true;
    },
  }), [options]);

  // Clear error when all options are filled
  useEffect(() => {
    if (emptyError && options.every(o => o.trim())) {
      setEmptyError(false);
    }
  }, [options, emptyError]);

  const canRemove = options.length > 2;
  const canAddOption = options.length < POLL_MAX_OPTIONS;
  const canToggleMulti = true;

  return (
    <div className="mt-3 bg-th-inset/50 rounded-lg p-3 border border-th-border-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-bold text-th-text-3">Опрос</span>
        <button
          type="button"
          onClick={handleClose}
          className="text-th-text-3 hover:text-th-text-2 transition-colors"
          title="Убрать опрос"
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
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
              placeholder={`Опция ${i + 1}`}
              className={`flex-1 bg-th-input border rounded px-2 py-1 text-sm text-th-text placeholder-th-text-4 outline-none focus:border-[#0087ff]/50 ${
                emptyError && !opt.trim() ? 'border-red-400' : 'border-th-border'
              }`}
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
              title={canRemove ? 'Удалить опцию' : 'Минимум 2 опции'}
            >
              <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
              </svg>
            </button>
          </div>
        ))}
      </div>

      {emptyError && (
        <div className="text-xs text-red-400 mt-1">Заполните все опции</div>
      )}

      <div className="flex items-center gap-3 mt-1.5">
        <button
          type="button"
          onClick={canAddOption ? addOption : undefined}
          disabled={!canAddOption}
          className={`text-sm font-bold transition-colors ${
            canAddOption
              ? 'text-th-text-3 hover:text-th-text-2'
              : 'text-th-text-4/30 cursor-default'
          }`}
        >
          + Добавить опцию
        </button>
        <button
          type="button"
          onClick={canToggleMulti ? toggleMulti : undefined}
          disabled={!canToggleMulti}
          className={`flex items-center gap-1.5 text-sm font-bold transition-colors ${
            !canToggleMulti
              ? 'text-th-text-4/30 cursor-default'
              : multi
                ? 'text-[#0087ff]'
                : 'text-th-text-3 hover:text-th-text-2'
          }`}
          title={!canToggleMulti ? 'Нужно минимум 3 опции' : multi ? 'Несколько опций (вкл.)' : 'Несколько опций (выкл.)'}
        >
          <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" strokeLinejoin="round">
            <rect x="3" y="3" width="7" height="7" rx="1" />
            <path d="M5 6.5l1.5 1.5L9 5" />
            <rect x="3" y="14" width="7" height="7" rx="1" />
            <path d="M5 17.5l1.5 1.5L9 16" />
            <line x1="14" y1="6" x2="21" y2="6" />
            <line x1="14" y1="10" x2="19" y2="10" />
            <line x1="14" y1="17" x2="21" y2="17" />
            <line x1="14" y1="21" x2="19" y2="21" />
          </svg>
          Несколько опций
        </button>
      </div>
    </div>
  );
});

export default PollEditor;
