import React, { useState } from 'react';

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
    emitChange(next, multi);
  };

  const removeOption = (index: number) => {
    if (options.length <= 1) return;
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

  return (
    <div className="mt-3 ml-14 bg-th-inset/50 rounded-lg p-3 border border-th-border-2">
      <div className="flex items-center justify-between mb-2">
        <span className="text-xs font-medium text-th-text-3">Опрос</span>
        <div className="flex items-center gap-2">
          <button
            type="button"
            onClick={toggleMulti}
            className={`text-[10px] px-2 py-0.5 rounded-full border transition-colors ${
              multi ? 'bg-[#0087ff]/10 border-[#0087ff]/30 text-[#0087ff]' : 'border-th-border-2 text-th-text-4 hover:text-th-text-3'
            }`}
          >
            {multi ? 'Несколько' : 'Один'}
          </button>
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
      </div>

      <div className="flex flex-col gap-1.5">
        {options.map((opt, i) => (
          <div key={i} className="flex items-center gap-1.5">
            <input
              type="text"
              value={opt}
              onChange={(e) => updateOption(i, e.target.value)}
              maxLength={POLL_OPTION_MAX_LENGTH}
              placeholder={`Вариант ${i + 1}`}
              className="flex-1 bg-th-input border border-th-border rounded px-2 py-1 text-sm text-th-text placeholder-th-text-4 outline-none focus:border-[#0087ff]/50"
            />
            {opt.length > POLL_OPTION_MAX_LENGTH * 0.9 && (
              <span className={`text-[10px] shrink-0 ${opt.length >= POLL_OPTION_MAX_LENGTH ? 'text-red-400' : 'text-yellow-400'}`}>
                {opt.length}/{POLL_OPTION_MAX_LENGTH}
              </span>
            )}
            {options.length > 1 && (
              <button
                type="button"
                onClick={() => removeOption(i)}
                className="text-th-text-4 hover:text-red-400 transition-colors shrink-0"
              >
                <svg xmlns="http://www.w3.org/2000/svg" className="w-3.5 h-3.5" viewBox="0 0 20 20" fill="currentColor">
                  <path fillRule="evenodd" d="M4.293 4.293a1 1 0 011.414 0L10 8.586l4.293-4.293a1 1 0 111.414 1.414L11.414 10l4.293 4.293a1 1 0 01-1.414 1.414L10 11.414l-4.293 4.293a1 1 0 01-1.414-1.414L8.586 10 4.293 5.707a1 1 0 010-1.414z" clipRule="evenodd" />
                </svg>
              </button>
            )}
          </div>
        ))}
      </div>

      {options.length < POLL_MAX_OPTIONS && (
        <button
          type="button"
          onClick={addOption}
          className="mt-1.5 text-xs text-[#0087ff] hover:text-blue-400 transition-colors"
        >
          + Добавить вариант
        </button>
      )}
    </div>
  );
};

export default PollEditor;
