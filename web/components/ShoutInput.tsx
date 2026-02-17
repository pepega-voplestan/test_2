import React, { useState } from 'react';
import { useAuth } from '../context/AuthContext';

interface ShoutInputProps {
  onShoutCreated: () => void;
}

const ShoutInput: React.FC<ShoutInputProps> = ({ onShoutCreated }) => {
  const { user, openModal } = useAuth();
  const [content, setContent] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!content.trim() || !user || isSubmitting) return;

    setIsSubmitting(true);
    console.log('[ShoutInput] Submitting:', content.substring(0, 50));

    try {
      const res = await fetch('/api/shouts', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ content: content.trim() })
      });

      if (!res.ok) {
        const data = await res.json();
        console.error('[ShoutInput] Error:', data.error);
        return;
      }

      console.log('[ShoutInput] Shout created successfully');
      setContent('');
      onShoutCreated();
    } catch (err) {
      console.error('[ShoutInput] Network error:', err);
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <form onSubmit={handleSubmit} className="bg-[#1e1e1e] rounded-lg p-4 flex gap-4 mb-6 shadow-sm border border-zinc-800/50">
      <div className="shrink-0">
         <div className="w-10 h-10 rounded-full bg-zinc-800 flex items-center justify-center overflow-hidden">
            {user ? (
                <img src={user.avatar} alt={user.name} className="w-full h-full object-cover" />
            ) : (
                <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6 text-[#0087ff]" viewBox="0 0 40 40" fill="currentColor">
                    <path fillRule="evenodd" clipRule="evenodd" d="M20 38C29.9411 38 38 29.9411 38 20C38 10.0589 29.9411 2 20 2C10.0589 2 2 10.0589 2 20C2 29.9411 10.0589 38 20 38ZM20 40C31.0457 40 40 31.0457 40 20C40 8.9543 31.0457 0 20 0C8.9543 0 0 8.9543 0 20C0 31.0457 8.9543 40 20 40ZM20 23C23.3137 23 26 20.3137 26 17C26 13.6863 23.3137 11 20 11C16.6863 11 14 13.6863 14 17C14 20.3137 16.6863 23 20 23ZM20 25C24.4183 25 28 21.4183 28 17C28 12.5817 24.4183 9 20 9C15.5817 9 12 12.5817 12 17C12 21.4183 15.5817 25 20 25ZM16 29C15.4477 29 15 29.4477 15 30C15 30.5523 15.4477 31 16 31H23C23.5523 31 24 30.5523 24 30C24 29.4477 23.5523 29 23 29H16Z"></path>
                </svg>
            )}
         </div>
      </div>
      <div className="grow flex items-center">
        {user ? (
            <div className="flex w-full gap-2">
                <input
                    type="text"
                    placeholder="Расскажите, что нового?"
                    className="bg-transparent w-full border-none outline-none text-white placeholder-zinc-500"
                    value={content}
                    onChange={(e) => setContent(e.target.value)}
                    disabled={isSubmitting}
                />
                {content.trim() && (
                    <button
                        type="submit"
                        disabled={isSubmitting}
                        className="text-[#0087ff] hover:text-blue-400 text-sm font-bold whitespace-nowrap disabled:opacity-50"
                    >
                        {isSubmitting ? '...' : 'Отправить'}
                    </button>
                )}
            </div>
        ) : (
            <div className="text-zinc-400 text-sm">
                Чтобы оставить Вопль, <button type="button" onClick={openModal} className="text-white hover:underline font-medium">Войдите</button> или <button type="button" onClick={openModal} className="text-white hover:underline font-medium">Зарегистрируйтесь</button>
            </div>
        )}
      </div>
    </form>
  );
};

export default ShoutInput;
