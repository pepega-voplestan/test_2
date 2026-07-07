import React, { useRef, useState, useEffect } from 'react';
import { useGifPicker, GifItem, SEARCH_MIN_CHARS } from '../hooks/useGifPicker';

export type GifPickerSelection =
  | { kind: 'giphy'; giphyId: string; url: string; still: string; width: number; height: number }
  | { kind: 'mygif'; mediaId: string; url: string };

interface GifPickerProps {
  onSelect: (gif: GifPickerSelection) => void;
  reducedMotion: boolean;
  isAuthenticated: boolean;
  mobileReadOnly: boolean;
}

type Section = 'main' | 'favorites' | 'my';

const TRENDING_CATEGORY_LABELS = ['Популярное', 'Реакции', 'Смешное'];

function partitionIntoCategories(items: GifItem[]): { label: string; items: GifItem[] }[] {
  if (items.length === 0) return [];
  const n = TRENDING_CATEGORY_LABELS.length;
  const groups: GifItem[][] = Array.from({ length: n }, () => []);
  items.forEach((item, i) => groups[i % n].push(item));
  return TRENDING_CATEGORY_LABELS.map((label, i) => ({ label, items: groups[i] })).filter((g) => g.items.length > 0);
}

const GRID_THUMB_HEIGHT = 90;

function gifThumbWidth(gif: GifItem): number {
  if (gif.width && gif.height) return Math.round(GRID_THUMB_HEIGHT * (gif.width / gif.height));
  return GRID_THUMB_HEIGHT;
}

const SkeletonGrid: React.FC = () => (
  <div className="flex flex-wrap gap-1 p-2">
    {Array.from({ length: 8 }).map((_, i) => (
      <div key={i} className="rounded bg-th-elevated animate-pulse" style={{ width: 100, height: GRID_THUMB_HEIGHT }} />
    ))}
  </div>
);

const GifPicker: React.FC<GifPickerProps> = ({ onSelect, reducedMotion, isAuthenticated, mobileReadOnly: initialMobileReadOnly }) => {
  const gp = useGifPicker(isAuthenticated);
  const [section, setSection] = useState<Section>('main');
  const [mobileReadOnly, setMobileReadOnly] = useState(initialMobileReadOnly);
  const searchRef = useRef<HTMLInputElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  // Touch devices get the full FR-019 44x44px tap target; mouse/trackpad users get a
  // hit box matched to the visible glyph so hovering the thumbnail doesn't steal clicks
  // meant for GIF selection (see /speckit-converge finding F2 / task T022).
  const [coarsePointer] = useState(() => window.matchMedia('(pointer: coarse)').matches);
  const iconBtnBoxClass = coarsePointer
    ? 'absolute top-0 right-0 w-11 h-11 flex items-start justify-end p-1'
    : 'absolute top-0.5 right-0.5 w-7 h-7 flex items-center justify-center';

  useEffect(() => {
    gp.fetchTrending();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (section === 'favorites') gp.fetchFavorites();
    if (section === 'my') gp.fetchMyGifs();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [section]);

  const isSearchQuery = gp.query.trim().length > 0;
  const isSearchTooShort = isSearchQuery && gp.query.trim().length < SEARCH_MIN_CHARS;
  const mainGifs = isSearchQuery ? gp.searchResults : gp.trending;
  const categories = !isSearchQuery ? partitionIntoCategories(gp.trending) : [];

  const selectGiphy = (gif: GifItem) => {
    onSelect({ kind: 'giphy', giphyId: gif.id, url: gif.url, still: gif.still, width: gif.width, height: gif.height });
  };

  const handleUploadClick = () => fileInputRef.current?.click();
  const handleFileChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (file) await gp.uploadGif(file);
  };

  const renderGifThumb = (gif: GifItem, favToggle?: boolean) => {
    const w = gifThumbWidth(gif);
    const src = reducedMotion ? gif.still : gif.url;
    const favored = gp.isFavorite(gif.id);
    return (
      <div key={gif.id} className="relative shrink-0 group" style={{ width: w, height: GRID_THUMB_HEIGHT }}>
        <img
          src={src}
          alt={gif.title || 'GIF'}
          width={w}
          height={GRID_THUMB_HEIGHT}
          loading="lazy"
          onClick={() => selectGiphy(gif)}
          className="w-full h-full object-cover rounded cursor-pointer hover:opacity-90 transition-opacity"
        />
        {isAuthenticated && favToggle !== false && (
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={(e) => { e.stopPropagation(); gp.toggleFavorite(gif); }}
            className={`${iconBtnBoxClass} text-[27px] leading-none drop-shadow`}
            title={favored ? 'Убрать из избранного' : 'В избранное'}
          >
            <span className={favored ? 'text-yellow-400' : 'text-white/70'}>{favored ? '★' : '☆'}</span>
          </button>
        )}
      </div>
    );
  };

  return (
    <div className="flex flex-col flex-1 min-h-0">
      {/* Search input */}
      <div className="p-2 pb-1 border-b border-th-border/50 shrink-0">
        <input
          ref={searchRef}
          type="text"
          value={gp.query}
          onChange={(e) => gp.setQuery(e.target.value)}
          readOnly={mobileReadOnly}
          onTouchEnd={() => { if (mobileReadOnly) { setMobileReadOnly(false); setTimeout(() => searchRef.current?.focus(), 0); } }}
          placeholder="Поиск GIF..."
          className="w-full bg-th-input text-th-text text-base rounded-md px-2.5 py-1.5 outline-none border border-th-border/50 focus:border-th-text-4 placeholder-th-text-4 transition-colors"
        />
      </div>

      {/* Sub-tabs */}
      <div className="flex gap-1 px-2 py-1.5 border-b border-th-border/50 shrink-0">
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setSection('main')}
          className={`px-2 py-1 text-xs rounded transition-colors min-h-[44px] flex items-center justify-center ${section === 'main' ? 'bg-th-elevated text-th-text' : 'text-th-text-4 hover:text-th-text-2'}`}
        >
          Библиотека
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setSection('favorites')}
          className={`px-2 py-1 text-xs rounded transition-colors min-h-[44px] flex items-center justify-center ${section === 'favorites' ? 'bg-th-elevated text-th-text' : 'text-th-text-4 hover:text-th-text-2'}`}
        >
          Избранное
        </button>
        <button
          type="button"
          onMouseDown={(e) => e.preventDefault()}
          onClick={() => setSection('my')}
          className={`px-2 py-1 text-xs rounded transition-colors min-h-[44px] flex items-center justify-center ${section === 'my' ? 'bg-th-elevated text-th-text' : 'text-th-text-4 hover:text-th-text-2'}`}
        >
          Мои GIF
        </button>
      </div>

      {/* Category quick-nav (only for trending, empty query, main section) */}
      {section === 'main' && !isSearchQuery && categories.length > 1 && (
        <div className="flex gap-1 px-2 py-1.5 border-b border-th-border/50 overflow-x-auto shrink-0">
          {categories.map((cat) => (
            <button
              key={cat.label}
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => document.getElementById(`gif-category-${cat.label}`)?.scrollIntoView({ behavior: 'smooth', block: 'start' })}
              className="px-2 py-1 text-[11px] text-th-text-3 hover:bg-th-elevated rounded transition-colors shrink-0 whitespace-nowrap"
            >
              {cat.label}
            </button>
          ))}
        </div>
      )}

      {/* Content */}
      <div className="overflow-y-auto flex-1 min-h-0">
        {section === 'main' && (
          <>
            {isSearchQuery ? (
              isSearchTooShort ? (
                <div className="text-xs text-th-text-4 text-center py-4 px-2">Введите ещё {SEARCH_MIN_CHARS - gp.query.trim().length} симв.</div>
              ) : gp.isSearching ? (
                <SkeletonGrid />
              ) : gp.searchError ? (
                <div className="text-xs text-red-400 text-center py-4 px-2">{gp.searchError}</div>
              ) : mainGifs.length === 0 ? (
                <div className="text-xs text-th-text-4 text-center py-4">Ничего не найдено</div>
              ) : (
                <div className="flex flex-wrap gap-1 p-2">
                  {mainGifs.map((gif) => renderGifThumb(gif))}
                </div>
              )
            ) : gp.isTrendingLoading ? (
              <SkeletonGrid />
            ) : gp.trendingError ? (
              <div className="text-xs text-red-400 text-center py-4 px-2">{gp.trendingError}</div>
            ) : categories.length === 0 ? (
              <div className="text-xs text-th-text-4 text-center py-4">Нет доступных GIF</div>
            ) : (
              <div className="p-2">
                {categories.map((cat) => (
                  <div key={cat.label} id={`gif-category-${cat.label}`} className="mb-2 last:mb-0">
                    <div className="text-[10px] text-th-text-4 font-medium mb-1 sticky top-0 bg-th-card py-0.5 z-10">{cat.label}</div>
                    <div className="flex flex-wrap gap-1">
                      {cat.items.map((gif) => renderGifThumb(gif))}
                    </div>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {section === 'favorites' && (
          !isAuthenticated ? (
            <div className="text-xs text-th-text-4 text-center py-6 px-3">Войдите, чтобы сохранять GIF в избранное</div>
          ) : gp.isFavoritesLoading ? (
            <SkeletonGrid />
          ) : gp.favorites.length === 0 ? (
            <div className="text-xs text-th-text-4 text-center py-6 px-3">Нажмите ★ на любом GIF, чтобы добавить в избранное</div>
          ) : (
            <div className="flex flex-wrap gap-1 p-2">
              {gp.favorites.map((gif) => renderGifThumb(gif))}
            </div>
          )
        )}

        {section === 'my' && (
          !isAuthenticated ? (
            <div className="text-xs text-th-text-4 text-center py-6 px-3">Войдите, чтобы загружать свои GIF</div>
          ) : (
            <div className="p-2">
              <div className="flex items-center gap-2 mb-2">
                <button
                  type="button"
                  onMouseDown={(e) => e.preventDefault()}
                  onClick={handleUploadClick}
                  disabled={gp.isUploading}
                  className="min-w-[44px] min-h-[44px] px-3 flex items-center justify-center gap-1.5 text-xs text-th-text-2 bg-th-elevated hover:bg-th-elevated/70 rounded transition-colors disabled:opacity-50"
                >
                  {gp.isUploading ? (
                    <span className="w-3.5 h-3.5 border-2 border-th-text-4 border-t-th-text rounded-full animate-spin" />
                  ) : (
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3 17a1 1 0 011-1h12a1 1 0 110 2H4a1 1 0 01-1-1zm6.293-13.707a1 1 0 011.414 0l4 4a1 1 0 01-1.414 1.414L11 6.414V15a1 1 0 11-2 0V6.414L6.707 8.707a1 1 0 01-1.414-1.414l4-4z" clipRule="evenodd" />
                    </svg>
                  )}
                  Загрузить GIF
                </button>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept="image/gif"
                  className="hidden"
                  onChange={handleFileChange}
                />
              </div>
              {gp.uploadError && (
                <div className="text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded px-2 py-1.5 mb-2">{gp.uploadError}</div>
              )}
              {gp.isMyGifsLoading ? (
                <SkeletonGrid />
              ) : gp.myGifs.length === 0 ? (
                <div className="text-xs text-th-text-4 text-center py-4">Загрузите свой первый GIF</div>
              ) : (
                <div className="flex flex-wrap gap-1">
                  {gp.myGifs.map((item) => (
                    <div key={item.id} className="relative shrink-0" style={{ width: 100, height: GRID_THUMB_HEIGHT }}>
                      <img
                        src={reducedMotion ? item.thumb : item.gif}
                        alt="Мой GIF"
                        loading="lazy"
                        onClick={() => onSelect({ kind: 'mygif', mediaId: item.mediaId, url: item.gif })}
                        className="w-full h-full object-cover rounded cursor-pointer hover:opacity-90 transition-opacity"
                      />
                      <button
                        type="button"
                        onMouseDown={(e) => e.preventDefault()}
                        onClick={(e) => { e.stopPropagation(); gp.deleteMyGif(item.id); }}
                        className={`${iconBtnBoxClass} text-white/80 hover:text-red-400 drop-shadow transition-colors`}
                        title="Удалить"
                      >
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-6 h-6" viewBox="0 0 20 20" fill="currentColor">
                          <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                        </svg>
                      </button>
                    </div>
                  ))}
                </div>
              )}
            </div>
          )
        )}
      </div>

      {/* Attribution footer (Giphy ToS) */}
      <div className="shrink-0 border-t border-th-border/50 px-2 py-1 text-center text-[10px] text-th-text-4">
        Powered by GIPHY
      </div>
    </div>
  );
};

export default GifPicker;
