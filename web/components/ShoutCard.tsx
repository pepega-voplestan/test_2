import React, { useState, useEffect, useRef } from 'react';
import { Shout, Comment } from '../types';
import { useAuth } from '../context/AuthContext';
import { useContentPreferences } from '../context/ContentPreferencesContext';
import { useIgnoredUsers } from '../context/IgnoredUsersContext';
import { useScrollLock } from '../hooks/useScrollLock';
import EmojiPicker from './EmojiPicker';
import Lightbox from './Lightbox';
import MentionInput, { MentionInputHandle, effectiveLength, isIOS } from './MentionInput';
import PollBlock from './PollBlock';

interface ShoutCardProps {
  shout: Shout;
  showMedia?: boolean;
  onCommentAdded?: (shoutId: string, comment: Comment) => void;
  onDelete?: (shoutId: string) => void;
  onCommentDeleted?: (shoutId: string, commentId: string) => void;
  isThreadOpen?: boolean;
  onThreadToggle?: (shoutId: string) => void;
}

const SHOUT_MAX_LENGTH = 400;
const NEWLINE_CHAR_COST = 40;
const MEDIA_MAX_MB = 10;

const YT_PATTERNS = [
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/watch\?[^\s]*v=([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/shorts\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/live\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?(?:www\.)?youtube\.com\/embed\/([a-zA-Z0-9_-]{11})/,
  /(?:https?:\/\/)?youtu\.be\/([a-zA-Z0-9_-]{11})/,
];

function detectYouTubeId(text: string): string | null {
  for (const p of YT_PATTERNS) {
    const m = text.match(p);
    if (m) return m[1];
  }
  return null;
}

/* ---------- Embed detection & rendering ---------- */

type EmbedInfo =
  | { type: 'imgur'; imageId: string; ext: string }
  | { type: 'imgur-album'; albumId: string; url: string }
  | { type: 'coub'; videoId: string }
  | { type: 'tenor'; url: string; tenorId: string }
  | { type: 'imgur-direct'; url: string }
  | { type: 'twitter'; tweetId: string; url: string }
  | { type: 'giphy'; giphyId: string }
  | { type: 'steam'; appId: string; slug?: string };

function extractEmbeds(text: string): EmbedInfo[] {
  const embeds: EmbedInfo[] = [];
  const urls = text.match(/https?:\/\/[^\s]+/g) || [];
  for (const url of urls) {
    // Direct imgur image: i.imgur.com/XXXX.ext
    const imgurDirect = url.match(/https?:\/\/i\.imgur\.com\/([a-zA-Z0-9]+)\.(jpg|jpeg|png|gif|webp|mp4)/i);
    if (imgurDirect) {
      embeds.push({ type: 'imgur-direct', url });
      continue;
    }
    // Imgur page: imgur.com/XXXX (not album, not gallery)
    const imgurPage = url.match(/https?:\/\/(?:www\.)?imgur\.com\/([a-zA-Z0-9]{5,10})(?:[?#]|$)/);
    if (imgurPage) {
      embeds.push({ type: 'imgur', imageId: imgurPage[1], ext: 'jpg' });
      continue;
    }
    // Imgur album/gallery: imgur.com/a/XXXX or imgur.com/gallery/slug-XXXX
    const imgurAlbum = url.match(/https?:\/\/(?:www\.)?imgur\.com\/(?:a|gallery)\/([\w-]+)/);
    if (imgurAlbum) {
      const parts = imgurAlbum[1].split('-');
      const albumId = parts[parts.length - 1];
      embeds.push({ type: 'imgur-album', albumId, url });
      continue;
    }
    // Twitter/X: twitter.com, x.com, fxtwitter.com, vxtwitter.com, fixupx.com
    const tweet = url.match(/https?:\/\/(?:www\.)?(?:twitter\.com|x\.com|fxtwitter\.com|vxtwitter\.com|fixupx\.com)\/\w+\/status\/(\d+)/);
    if (tweet) {
      embeds.push({ type: 'twitter', tweetId: tweet[1], url });
      continue;
    }
    // Coub: coub.com/view/XXXX
    const coub = url.match(/https?:\/\/(?:www\.)?coub\.com\/view\/([a-zA-Z0-9_-]+)/);
    if (coub) {
      embeds.push({ type: 'coub', videoId: coub[1] });
      continue;
    }
    // Tenor: tenor.com/view/xxx-12345
    const tenor = url.match(/https?:\/\/(?:www\.)?tenor\.com\/(?:[a-z]{2}\/)?view\/[\w-]+-(\d+)/);
    if (tenor) {
      embeds.push({ type: 'tenor', url, tenorId: tenor[1] });
      continue;
    }
    // Direct tenor media (media.tenor.com or media1.tenor.com)
    const tenorDirect = url.match(/https?:\/\/media\d?\.tenor\.com\/[^\s]+\.(gif|mp4)/i);
    if (tenorDirect) {
      embeds.push({ type: 'imgur-direct', url });
      continue;
    }
    // Giphy short direct: i.giphy.com/ID.gif or i.giphy.com/media/ID/giphy.gif
    const giphyShortDirect = url.match(/https?:\/\/i\.giphy\.com\/(?:media\/)?([a-zA-Z0-9]+)(?:\/[^\s]*)?\.(gif|webp)/i);
    if (giphyShortDirect) {
      embeds.push({ type: 'imgur-direct', url });
      continue;
    }
    // Giphy: giphy.com/gifs/slug-ID or giphy.com/embed/ID or media.giphy.com direct
    const giphyPage = url.match(/https?:\/\/(?:www\.)?giphy\.com\/gifs\/(?:[\w-]+-)*([a-zA-Z0-9]+)(?:[?#]|$)/);
    if (giphyPage) {
      embeds.push({ type: 'giphy', giphyId: giphyPage[1] });
      continue;
    }
    const giphyEmbed = url.match(/https?:\/\/(?:www\.)?giphy\.com\/embed\/([a-zA-Z0-9]+)/);
    if (giphyEmbed) {
      embeds.push({ type: 'giphy', giphyId: giphyEmbed[1] });
      continue;
    }
    // Giphy direct media: media0-4.giphy.com/media/ID/... or media0-4.giphy.com/media/v1.xxx/ID/giphy.gif
    const giphyDirectGif = url.match(/https?:\/\/media[0-4]?\.giphy\.com\/media\/(?:v1\.[^\s/]+\/)?([a-zA-Z0-9]+)\/[^\s]*\.gif/i);
    if (giphyDirectGif) {
      embeds.push({ type: 'imgur-direct', url });
      continue;
    }
    const giphyDirect = url.match(/https?:\/\/media[0-4]?\.giphy\.com\/media\/(?:v1\.[^\s/]+\/)?([a-zA-Z0-9]+)\//);
    if (giphyDirect) {
      embeds.push({ type: 'giphy', giphyId: giphyDirect[1] });
      continue;
    }
    // Steam store: store.steampowered.com/app/APPID/Optional_Slug/
    const steam = url.match(/https?:\/\/store\.steampowered\.com\/app\/(\d+)(?:\/([^/?#]*))?/);
    if (steam) {
      embeds.push({ type: 'steam', appId: steam[1], slug: steam[2] || undefined });
      continue;
    }
  }
  return embeds;
}

interface TweetData {
  text: string;
  author: { name: string; screen_name: string; avatar_url: string };
  created_at: string;
  likes: number;
  retweets: number;
  media?: { photos?: { url: string; width: number; height: number }[]; videos?: { thumbnail_url: string; url: string }[] };
}

const tweetCache = new Map<string, TweetData | null>();

const TwitterEmbedCard: React.FC<{ tweetId: string; url: string }> = ({ tweetId, url }) => {
  const [tweet, setTweet] = useState<TweetData | null>(tweetCache.get(tweetId) ?? null);
  const [loading, setLoading] = useState(!tweetCache.has(tweetId));
  const [error, setError] = useState(false);
  const [avatarError, setAvatarError] = useState(false);
  const [photoErrors, setPhotoErrors] = useState<Set<number>>(new Set());

  useEffect(() => {
    if (tweetCache.has(tweetId)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`https://api.fxtwitter.com/status/${tweetId}`);
        if (!res.ok) throw new Error();
        const data = await res.json();
        const t = data.tweet as TweetData;
        tweetCache.set(tweetId, t);
        if (!cancelled) setTweet(t);
      } catch {
        tweetCache.set(tweetId, null);
        if (!cancelled) setError(true);
      } finally {
        if (!cancelled) setLoading(false);
      }
    })();
    return () => { cancelled = true; };
  }, [tweetId]);

  if (loading) {
    return (
      <div className="mb-2 rounded-lg border border-th-border/50 bg-th-card p-4">
        <div className="flex items-center gap-2 text-th-text-4 text-sm">
          <div className="w-4 h-4 border-2 border-th-border border-t-th-text-3 rounded-full animate-spin" />
          Загрузка твита…
        </div>
      </div>
    );
  }

  if (error || !tweet) return null;

  const date = new Date(tweet.created_at);
  const formatted = date.toLocaleString('ru-RU', { day: 'numeric', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit' });
  const photos = tweet.media?.photos || [];
  const videos = tweet.media?.videos || [];

  const initial = tweet.author.name.charAt(0).toUpperCase();

  // For photos/videos, use fxtwitter proxy URLs (pbs.twimg.com is blocked by referrer policy)
  const proxyImg = (u: string) => u.replace('https://pbs.twimg.com/', 'https://pbs.fxtwitter.com/');

  return (
    <div className="mb-2 rounded-lg border-l-4 border-[#1d9bf0] bg-th-card overflow-hidden">
      <div className="p-3">
        <a href={url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-2 mb-2 group">
          {avatarError ? (
            <div className="w-8 h-8 rounded-full bg-[#1d9bf0] flex items-center justify-center text-white text-sm font-bold shrink-0">{initial}</div>
          ) : (
            <img src={proxyImg(tweet.author.avatar_url)} alt="" className="w-8 h-8 rounded-full shrink-0" referrerPolicy="no-referrer" onError={() => setAvatarError(true)} />
          )}
          <div className="min-w-0">
            <div className="text-sm font-semibold text-th-text group-hover:underline truncate">{tweet.author.name}</div>
            <div className="text-xs text-th-text-4">@{tweet.author.screen_name}</div>
          </div>
          <svg className="w-4 h-4 ml-auto text-[#1d9bf0] shrink-0" viewBox="0 0 24 24" fill="currentColor"><path d="M18.244 2.25h3.308l-7.227 8.26 8.502 11.24H16.17l-5.214-6.817L4.99 21.75H1.68l7.73-8.835L1.254 2.25H8.08l4.713 6.231zm-1.161 17.52h1.833L7.084 4.126H5.117z"/></svg>
        </a>
        <div className="text-sm text-th-text whitespace-pre-wrap break-words mb-2">{tweet.text}</div>
        {photos.length > 0 && (
          <div className={`rounded-lg overflow-hidden mb-2 ${photos.length > 1 ? 'grid grid-cols-2 gap-0.5' : ''}`}>
            {photos.map((p, i) => !photoErrors.has(i) ? (
              <img key={i} src={proxyImg(p.url)} alt="" loading="lazy" referrerPolicy="no-referrer" className="w-full h-auto object-cover max-h-[300px]" onError={() => setPhotoErrors(prev => new Set(prev).add(i))} />
            ) : null)}
          </div>
        )}
        {videos.length > 0 && videos.map((v, i) => (
          <a key={i} href={url} target="_blank" rel="noopener noreferrer" className="block rounded-lg overflow-hidden mb-2 relative group/vid">
            <img src={proxyImg(v.thumbnail_url)} alt="" referrerPolicy="no-referrer" className="w-full max-h-[300px] object-cover" />
            <div className="absolute inset-0 flex items-center justify-center bg-black/20 group-hover/vid:bg-black/30 transition-colors">
              <div className="w-12 h-12 rounded-full bg-[#1d9bf0] flex items-center justify-center">
                <svg className="w-5 h-5 text-white ml-0.5" viewBox="0 0 24 24" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
              </div>
            </div>
          </a>
        ))}
        <div className="flex items-center gap-4 text-xs text-th-text-4">
          <span>{formatted}</span>
          {tweet.likes > 0 && <span className="flex items-center gap-1"><svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M20.884 13.19c-1.351 2.48-4.001 5.12-8.379 7.67l-.503.3-.504-.3c-4.379-2.55-7.029-5.19-8.382-7.67-1.36-2.5-1.45-4.92-.334-6.98C3.907 3.96 5.944 3 8.26 3c1.876 0 3.378.79 4.24 1.58.86-.79 2.362-1.58 4.24-1.58 2.314 0 4.352.96 5.48 3.21 1.117 2.06 1.028 4.48-.336 6.98z"/></svg>{tweet.likes.toLocaleString()}</span>}
          {tweet.retweets > 0 && <span className="flex items-center gap-1"><svg className="w-3 h-3" viewBox="0 0 24 24" fill="currentColor"><path d="M4.5 3.88l4.432 4.14-1.364 1.46L5.5 7.55V16c0 1.1.896 2 2 2H13v2H7.5c-2.209 0-4-1.79-4-4V7.55L1.432 9.48.068 8.02 4.5 3.88zM16.5 6H11V4h5.5c2.209 0 4 1.79 4 4v8.45l2.068-1.93 1.364 1.46-4.432 4.14-4.432-4.14 1.364-1.46 2.068 1.93V8c0-1.1-.896-2-2-2z"/></svg>{tweet.retweets.toLocaleString()}</span>}
        </div>
      </div>
    </div>
  );
};

/* ---------- Steam embed card (Discord-style with API fetch) ---------- */

interface SteamAppData {
  name: string;
  short_description: string;
  header_image: string;
  price_overview?: { final_formatted: string };
  recommendations?: { total: number };
}

const steamCache = new Map<string, SteamAppData | null>();

const SteamEmbedCard: React.FC<{ appId: string; slug?: string }> = ({ appId, slug }) => {
  const [data, setData] = useState<SteamAppData | null>(steamCache.get(appId) ?? null);
  const [loaded, setLoaded] = useState(steamCache.has(appId));
  const [imgError, setImgError] = useState(false);

  const fallbackName = slug ? slug.replace(/_/g, ' ') : null;

  useEffect(() => {
    if (steamCache.has(appId)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/v1/steam/app/${appId}`, { credentials: 'include' });
        if (!res.ok) throw new Error();
        const json = await res.json();
        const entry = json[appId];
        if (!entry?.success || !entry.data) throw new Error();
        const d = entry.data as SteamAppData;
        steamCache.set(appId, d);
        if (!cancelled) setData(d);
      } catch {
        steamCache.set(appId, null);
      } finally {
        if (!cancelled) setLoaded(true);
      }
    })();
    return () => { cancelled = true; };
  }, [appId]);

  const storeUrl = `https://store.steampowered.com/app/${appId}/`;
  const headerImg = data?.header_image || `https://cdn.akamai.steamstatic.com/steam/apps/${appId}/header.jpg`;
  const title = data?.name || fallbackName || 'Steam Store';
  const description = data?.short_description;

  return (
    <a href={storeUrl} target="_blank" rel="noopener noreferrer" className="block mb-2 rounded-lg overflow-hidden border-l-4 border-[#1b2838] bg-[#1b2838]/90 hover:bg-[#1b2838] transition-colors group max-w-[460px]">
      <div className="px-3 pt-2.5 pb-2">
        <div className="flex items-center gap-1.5 mb-1">
          <svg viewBox="0 0 24 24" className="w-3.5 h-3.5 text-[#66c0f4] shrink-0" fill="currentColor">
            <path d="M12 0C5.37 0 0 5.37 0 12c0 5.08 3.15 9.43 7.6 11.22l3.44-4.97c-.24-.01-.49-.03-.74-.08-1.79-.33-3.14-1.73-3.36-3.41l-2.34-3.38c-.24-1.04.03-2.14.73-2.95.95-1.1 2.48-1.45 3.82-.89l5.05 2.1c.67-.05 1.36.04 2.02.27 2.09.71 3.4 2.72 3.17 4.87-.22 2.15-1.93 3.83-4.09 4.05-.66.07-1.31-.01-1.92-.22L10.66 24c.43.02.87.03 1.34.03 6.63 0 12-5.37 12-12S18.63 0 12 0z"/>
          </svg>
          <span className="text-xs text-[#8f98a0]">Steam</span>
        </div>
        <div className="text-sm text-[#67c1f5] font-medium group-hover:underline leading-snug mb-1">{title}</div>
        {loaded && description && (
          <div className="text-xs text-[#acb2b8] leading-relaxed mb-1.5 line-clamp-3" dangerouslySetInnerHTML={{ __html: description }} />
        )}
        {loaded && data && (data.price_overview || data.recommendations) && (
          <div className="flex items-center gap-4 text-xs mb-1">
            {data.price_overview && (
              <div>
                <div className="text-[#8f98a0] font-medium">Цена</div>
                <div className="text-[#acb2b8]">{data.price_overview.final_formatted}</div>
              </div>
            )}
            {data.recommendations && (
              <div>
                <div className="text-[#8f98a0] font-medium">Отзывы</div>
                <div className="text-[#acb2b8]">{data.recommendations.total.toLocaleString()}</div>
              </div>
            )}
          </div>
        )}
      </div>
      {!imgError && (
        <img src={headerImg} alt="" loading="lazy" className="w-full aspect-[460/215] object-cover" onError={() => setImgError(true)} />
      )}
    </a>
  );
};

const EmbedCard: React.FC<{ embed: EmbedInfo }> = ({ embed }) => {
  const [imgError, setImgError] = useState(false);
  const [lightboxOpen, setLightboxOpen] = useState(false);

  if (embed.type === 'imgur-direct') {
    if (imgError) return null;
    if (embed.url.endsWith('.mp4')) {
      return (
        <div className="mb-2 rounded-lg overflow-hidden max-w-full">
          <video src={embed.url} controls loop className="max-h-[300px] max-w-full rounded-lg" ref={el => { if (el) el.volume = 0.3; }} />
        </div>
      );
    }
    return (
      <div className="mb-2 rounded-lg">
        <img src={embed.url} alt="Imgur" loading="lazy" onError={() => setImgError(true)} onClick={() => setLightboxOpen(true)} className="block cursor-pointer max-h-[300px] max-w-full h-auto object-contain hover:opacity-90 transition-opacity rounded-lg" />
        {lightboxOpen && <Lightbox src={embed.url} onClose={() => setLightboxOpen(false)} />}
      </div>
    );
  }

  if (embed.type === 'imgur') {
    if (imgError) return null;
    const imgSrc = `https://i.imgur.com/${embed.imageId}.${embed.ext}`;
    return (
      <div className="mb-2 rounded-lg">
        <img src={imgSrc} alt="Imgur" loading="lazy" onError={() => setImgError(true)} onClick={() => setLightboxOpen(true)} className="block cursor-pointer max-h-[300px] max-w-full h-auto object-contain hover:opacity-90 transition-opacity rounded-lg" />
        {lightboxOpen && <Lightbox src={imgSrc} onClose={() => setLightboxOpen(false)} />}
      </div>
    );
  }

  if (embed.type === 'imgur-album') {
    return (
      <a href={embed.url} target="_blank" rel="noopener noreferrer" className="flex items-center gap-3 mb-2 px-3 py-2.5 rounded-lg border border-th-border/50 hover:border-th-text-4 bg-th-elevated/50 transition-colors group">
        <div className="w-10 h-10 rounded-lg bg-[#1bb76e] flex items-center justify-center shrink-0">
          <svg viewBox="0 0 24 24" className="w-6 h-6 text-white" fill="currentColor"><path d="M2 6h6v6H2V6zm8 0h6v6h-6V6zm8 0h6v6h-6V6zM2 14h6v6H2v-6zm8 0h6v6h-6v-6z"/></svg>
        </div>
        <div className="min-w-0 flex-1">
          <div className="text-th-text text-sm font-medium truncate">Imgur альбом</div>
          <div className="text-th-text-4 text-xs truncate">{embed.url}</div>
        </div>
        <svg viewBox="0 0 20 20" className="w-4 h-4 text-th-text-4 shrink-0 group-hover:text-th-text-2 transition-colors" fill="currentColor"><path fillRule="evenodd" d="M4.25 5.5a.75.75 0 00-.75.75v8.5c0 .414.336.75.75.75h8.5a.75.75 0 00.75-.75v-4a.75.75 0 011.5 0v4A2.25 2.25 0 0112.75 17h-8.5A2.25 2.25 0 012 14.75v-8.5A2.25 2.25 0 014.25 4h5a.75.75 0 010 1.5h-5zm7.25-.75a.75.75 0 01.75-.75h3.5a.75.75 0 01.75.75v3.5a.75.75 0 01-1.5 0V6.31l-5.47 5.47a.75.75 0 01-1.06-1.06l5.47-5.47H12.25a.75.75 0 01-.75-.75z" clipRule="evenodd"/></svg>
      </a>
    );
  }

  if (embed.type === 'coub') {
    return (
      <div className="mb-2 rounded-lg overflow-hidden border border-th-border/50">
        <div className="w-full aspect-video">
          <iframe
            src={`https://coub.com/embed/${embed.videoId}?muted=false&autostart=false&originalSize=false&startWithHD=true`}
            className="w-full h-full"
            allowFullScreen
            allow="autoplay"
            sandbox="allow-scripts allow-same-origin allow-presentation"
            title="Coub"
          />
        </div>
      </div>
    );
  }

  if (embed.type === 'tenor') {
    return (
      <div className="mb-2 rounded-lg overflow-hidden border border-th-border/50">
        <div className="w-full" style={{ paddingBottom: '75%', position: 'relative' }}>
          <iframe
            src={`https://tenor.com/embed/${embed.tenorId}`}
            className="absolute inset-0 w-full h-full"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-presentation"
            title="Tenor GIF"
          />
        </div>
      </div>
    );
  }

  if (embed.type === 'giphy') {
    return (
      <div className="mb-2 rounded-lg overflow-hidden border border-th-border/50">
        <div className="w-full" style={{ paddingBottom: '75%', position: 'relative' }}>
          <iframe
            src={`https://giphy.com/embed/${embed.giphyId}`}
            className="absolute inset-0 w-full h-full"
            allowFullScreen
            sandbox="allow-scripts allow-same-origin allow-presentation"
            title="Giphy GIF"
          />
        </div>
      </div>
    );
  }

  if (embed.type === 'steam') {
    return <SteamEmbedCard appId={embed.appId} slug={embed.slug} />;
  }

  if (embed.type === 'twitter') {
    return <TwitterEmbedCard tweetId={embed.tweetId} url={embed.url} />;
  }

  return null;
};

/* ---------- Media hidden placeholder ---------- */

const PlaceholderIcon = () => (
  <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" className="text-th-text-4/50">
    <polygon points="23 7 16 12 23 17 23 7" />
    <rect x="1" y="5" width="15" height="14" rx="2" ry="2" />
    <line x1="2" y1="2" x2="22" y2="22" />
  </svg>
);

interface MediaPlaceholderProps {
  className?: string;
}

const MediaPlaceholder: React.FC<MediaPlaceholderProps> = ({ className = '' }) => {
  return (
    <div
      className={`bg-th-elevated/60 rounded-lg flex items-center justify-center ${className}`}
      style={{ height: 48, maxWidth: 160 }}
    >
      <PlaceholderIcon />
    </div>
  );
};

/* ---------- Inline spoiler component ---------- */

const InlineSpoiler: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [revealed, setRevealed] = React.useState(false);
  return (
    <span
      onClick={(e) => { e.stopPropagation(); setRevealed(r => !r); }}
      className={`inline rounded px-0.5 cursor-pointer transition-all duration-200 ${
        revealed
          ? 'bg-th-text-4/20 text-inherit'
          : 'bg-th-text-4/40 text-transparent select-none hover:bg-th-text-4/50'
      }`}
      title={revealed ? 'Нажмите, чтобы скрыть' : 'Нажмите, чтобы раскрыть спойлер'}
    >
      {children}
    </span>
  );
};

/* ---------- Content rendering ---------- */

function renderContent(text: string) {
  // First split on inline spoiler tokens ||...||, keeping delimiters
  const spoilerParts = text.split(/(\|\|[\s\S]*?\|\|)/);
  return spoilerParts.map((spoilerPart, si) => {
    const spoilerMatch = spoilerPart.match(/^\|\|([\s\S]*?)\|\|$/);
    if (spoilerMatch) {
      // Render inner content (mentions/URLs still parsed inside spoilers)
      return <InlineSpoiler key={`sp-${si}`}>{renderInline(spoilerMatch[1], `sp-${si}`)}</InlineSpoiler>;
    }
    return renderInline(spoilerPart, `${si}`);
  });
}

function renderInline(text: string, keyPrefix: string) {
  // Split on mention tokens @[name:id], bare @words (legacy), and URLs, keeping the delimiters.
  // Structured mentions must come first so @[name:id] is never partially matched by @word.
  const parts = text.split(/((?:@\[[^\]]+:[^\]]+\])|(?:@[a-zA-Z0-9_-]+)|(?:https?:\/\/[^\s]+))/);
  return parts.map((part, i) => {
    // Structured mention token: @[username:userId]
    const mentionMatch = part.match(/^@\[([^\]]+):([^\]]+)\]$/);
    if (mentionMatch) {
      const [, name, id] = mentionMatch;
      return (
        <a key={`${keyPrefix}-${i}`} href={`/profile/${id}`} className="text-blue-400 hover:underline font-medium">
          @{name}
        </a>
      );
    }
    // URL
    if (/^https?:\/\//.test(part)) {
      return <a key={`${keyPrefix}-${i}`} href={part} target="_blank" rel="noopener noreferrer" className="text-sky-500 hover:underline">{part}</a>;
    }
    // Legacy bare @username (backwards-compat with old shouts).
    // Strict check: only a single word, never an arbitrary segment starting with @.
    if (/^@[a-zA-Z0-9_-]+$/.test(part)) {
      return <span key={`${keyPrefix}-${i}`} className="text-sky-500">{part}</span>;
    }
    return <React.Fragment key={`${keyPrefix}-${i}`}>{part}</React.Fragment>;
  });
}

/* ---------- Comment card (separate entity) ---------- */

interface CommentCardProps {
  comment: Comment;
  showMedia?: boolean;
  onDelete?: (commentId: string) => void;
  onReply?: (author: { id: string; name: string }) => void;
}

const CommentCard: React.FC<CommentCardProps> = ({ comment, showMedia = true, onDelete, onReply }) => {
  const { user, openModal } = useAuth();
  const { isIgnored } = useIgnoredUsers();
  const [likes, setLikes] = useState(comment.likes);
  const [isLiked, setIsLiked] = useState(
    user && comment.likedBy ? comment.likedBy.includes(user.id) : false
  );
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [ytLoaded, setYtLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);
  const [ignoreRevealed, setIgnoreRevealed] = useState(false);
  const isOwner = user && user.id === comment.user.id;
  const isCommentAuthorIgnored = isIgnored(comment.user.id);
  const isCommentIgnored = isCommentAuthorIgnored && !ignoreRevealed;

  useScrollLock(confirmDelete);

  // Separate effects: update likes count from props, but only update isLiked when likedBy changes
  useEffect(() => {
    setLikes(comment.likes);
  }, [comment.likes]);

  useEffect(() => {
    setIsLiked(user && comment.likedBy ? comment.likedBy.includes(user.id) : false);
  }, [comment.likedBy, user]);

  const handleLike = async () => {
    if (!user) { openModal(); return; }
    const newIsLiked = !isLiked;
    setIsLiked(newIsLiked);
    setLikes(prev => newIsLiked ? prev + 1 : Math.max(0, prev - 1));
    try {
      const res = await fetch(`/api/v1/comments/${comment.id}/like`, { method: 'POST', credentials: 'include' });
      if (!res.ok) { setIsLiked(!newIsLiked); setLikes(prev => newIsLiked ? prev - 1 : prev + 1); return; }
      const data = await res.json();
      setLikes(data.likes); setIsLiked(data.isLiked);
    } catch { setIsLiked(!newIsLiked); setLikes(prev => newIsLiked ? prev - 1 : prev + 1); }
  };

  const handleDelete = async () => {
    if (!user || !isOwner) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/comments/${comment.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || `Ошибка ${res.status}`); }
      setConfirmDelete(false);
      if (onDelete) onDelete(comment.id);
    } catch (err: unknown) {
      console.error('[CommentCard] Delete error:', err);
      setConfirmDelete(false);
    } finally { setIsDeleting(false); }
  };

  const embeds = comment.content ? extractEmbeds(comment.content) : [];

  if (isCommentIgnored) {
    return (
      <div className="flex flex-col mt-4 border-l-2 border-th-border-2 pl-4">
        <div
          className="flex items-center gap-3 py-1 cursor-pointer rounded-lg bg-th-text-4/40 hover:bg-th-text-4/50 px-3 transition-all duration-200 select-none"
          onClick={() => setIgnoreRevealed(true)}
          title="Нажмите, чтобы показать"
          data-testid="ignored-comment-overlay"
        >
          <div className="shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4 text-th-text-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
              <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
            </svg>
          </div>
          <span className="text-xs text-th-text-4">Контент от этого пользователя скрыт</span>
        </div>
      </div>
    );
  }

  const commentInner = (
    <>
      <div>
        <div className="flex items-center gap-2 mb-2">
          <a href={`/profile/${comment.user.id}`} className="shrink-0">
            <div className="w-10 h-10 rounded-full overflow-hidden bg-th-input hover:ring-2 hover:ring-th-border transition-all">
              {comment.user.avatar ? (
                <img src={comment.user.avatar} alt={comment.user.name} className="w-full h-full object-cover" />
              ) : (
                <div className="w-full h-full flex items-center justify-center text-th-text-4 text-sm font-bold">
                  {comment.user.name.charAt(0).toUpperCase()}
                </div>
              )}
            </div>
          </a>
          <a href={`/profile/${comment.user.id}`} className={`font-bold text-sm hover:underline ${comment.user.isBanned ? 'text-th-text-4 line-through' : 'text-th-text-2'}`}>
            {comment.user.name}
          </a>
          <span className="text-xs text-th-text-4">{formatTimestamp(comment.timestamp)}</span>
          {isOwner && (
            <button onClick={() => setConfirmDelete(true)} className="text-xs text-th-text-4 hover:text-red-400 transition-colors ml-auto" title="Удалить">
              <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
              </svg>
            </button>
          )}
        </div>

          {comment.content && (
            <div className="text-th-text-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap mb-2">
              {renderContent(comment.content)}
            </div>
          )}

          {showMedia ? embeds.map((embed, idx) => (
            <EmbedCard key={`embed-${idx}`} embed={embed} />
          )) : embeds.length > 0 ? <MediaPlaceholder className="mb-2" /> : null}

          {showMedia && comment.media?.type === 'image' && (
            <div className="mb-2 rounded-lg">
              <img
                src={comment.media.animated && comment.media.gif ? comment.media.gif : comment.media.url} alt="attachment" loading="lazy"
                onClick={() => setLightboxOpen(true)}
                className="block cursor-pointer max-h-[200px] max-w-full h-auto object-contain hover:opacity-90 transition-opacity rounded-lg"
              />
            </div>
          )}

          {!showMedia && comment.media?.type === 'image' && (
            <MediaPlaceholder className="mb-2" />
          )}

          {lightboxOpen && comment.media?.type === 'image' && (
            <Lightbox
              src={comment.media.animated && comment.media.gif ? comment.media.gif : comment.media.full}
              onClose={() => setLightboxOpen(false)}
            />
          )}

          {showMedia && comment.media?.type === 'video' && (
            <div className="mb-2 rounded-lg overflow-hidden">
              <video src={comment.media.url} controls loop className="max-h-[200px] max-w-full rounded-lg" style={{ minWidth: 'min(300px, 100%)' }} ref={el => { if (el) el.volume = 0.3; }} />
            </div>
          )}

          {!showMedia && comment.media?.type === 'video' && (
            <MediaPlaceholder className="mb-2" />
          )}

          {showMedia && comment.media?.type === 'youtube' && (
            <div className="mb-2 rounded-lg overflow-hidden bg-th-card border border-th-border/50">
              <div className="w-full aspect-video bg-black relative cursor-pointer" onClick={() => !ytLoaded && setYtLoaded(true)}>
                {ytLoaded ? (
                  <iframe className="w-full h-full" src={`${comment.media.embedUrl}?autoplay=1`} title={comment.media.title || "YouTube"}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen
                    sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox" />
                ) : (
                  <>
                    <img src={`https://img.youtube.com/vi/${comment.media.videoId}/hqdefault.jpg`} alt={comment.media.title || "YouTube video"} loading="lazy" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-12 h-8 bg-red-600 rounded-xl flex items-center justify-center shadow-lg hover:bg-red-500 transition-colors">
                        <svg viewBox="0 0 24 24" className="w-5 h-5 text-white ml-0.5" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    </div>
                  </>
                )}
              </div>
              {(comment.media.title || comment.media.channel) && (
                <div className="px-3 py-2">
                  {comment.media.title && <div className="text-xs text-th-text-2 font-medium leading-snug line-clamp-2">{comment.media.title}</div>}
                  {comment.media.channel && <div className="text-[10px] text-th-text-3 mt-0.5">{comment.media.channel}</div>}
                </div>
              )}
            </div>
          )}

          {!showMedia && comment.media?.type === 'youtube' && (
            <MediaPlaceholder className="mb-2" />
          )}

          <div className="flex items-center justify-between text-xs font-medium text-th-text-4 select-none mt-2">
            {isCommentAuthorIgnored ? (
              <span className="opacity-30 cursor-default" title="Вы игнорируете этого пользователя">Ответить</span>
            ) : (
              <button onClick={() => onReply?.({ id: comment.user.id, name: comment.user.name })} className="hover:text-th-text-2 transition-colors">Ответить</button>
            )}
            {isCommentAuthorIgnored ? (
              <span className="flex items-center gap-1 opacity-30 cursor-default" title="Вы игнорируете этого пользователя">
                <span className="text-xs font-bold">{likes}</span>
                <span className="text-base leading-none">{'\uD83E\uDD18'}</span>
              </span>
            ) : (
              <button onClick={handleLike} className={`flex items-center gap-1 transition-transform active:scale-95 ${isLiked ? 'text-[#e6a700]' : 'text-th-text-4 hover:text-th-text-2'}`} title={isLiked ? "Убрать лайк" : "Нравится"}>
                <span className="text-xs font-bold">{likes}</span>
                <span className="text-base leading-none">{'\uD83E\uDD18'}</span>
              </button>
            )}
          </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" style={{ touchAction: 'none' }} onClick={() => !isDeleting && setConfirmDelete(false)}>
          <div className="bg-th-card border border-th-border rounded-xl p-5 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-th-text font-medium mb-2">Удалить комментарий?</div>
            <div className="text-th-text-3 text-sm mb-4">Это действие нельзя отменить. Комментарий будет скрыт от всех пользователей.</div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(false)} disabled={isDeleting} className="px-4 py-1.5 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors rounded">Отмена</button>
              <button onClick={handleDelete} disabled={isDeleting} className="px-4 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white rounded font-medium disabled:opacity-50 transition-colors">
                {isDeleting ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );

  return (
    <div id={`comment-${comment.id}`} className="flex flex-col mt-4 border-l-2 border-th-border-2 pl-4">
      {isCommentAuthorIgnored && ignoreRevealed ? (
        <div
          className="rounded-lg bg-th-text-4/20 p-2 cursor-pointer transition-all duration-200 hover:bg-th-text-4/30"
          onClick={(e) => { if (e.target === e.currentTarget || !(e.target as HTMLElement).closest('a, button, [role="button"]')) setIgnoreRevealed(false); }}
          title="Нажмите, чтобы скрыть"
        >
          {commentInner}
        </div>
      ) : (
        commentInner
      )}
    </div>
  );
};

/* ---------- Main ShoutCard ---------- */

const ShoutCard: React.FC<ShoutCardProps> = ({
  shout, showMedia = true, onCommentAdded, onDelete, onCommentDeleted,
  isThreadOpen, onThreadToggle
}) => {
  const { user, openModal } = useAuth();
  const { prefs } = useContentPreferences();
  const { isIgnored } = useIgnoredUsers();
  const [replyContent, setReplyContent] = useState('');
  const [isSubmittingReply, setIsSubmittingReply] = useState(false);
  const [replyError, setReplyError] = useState<string | null>(null);
  const [lightboxOpen, setLightboxOpen] = useState(false);
  const [ytLoaded, setYtLoaded] = useState(false);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [isDeleting, setIsDeleting] = useState(false);

  const [replyMediaId, setReplyMediaId] = useState<string | null>(null);
  const [replyMediaPreview, setReplyMediaPreview] = useState<string | null>(null);
  const [replyMediaIsVideo, setReplyMediaIsVideo] = useState(false);
  const [isReplyUploading, setIsReplyUploading] = useState(false);
  const [replyDetectedYtId, setReplyDetectedYtId] = useState<string | null>(null);
  const replyFileInputRef = useRef<HTMLInputElement>(null);
  const mentionInputRef = useRef<MentionInputHandle>(null);
  const [pendingMention, setPendingMention] = useState<{ id: string; name: string } | null>(null);

  const [likes, setLikes] = useState(shout.likes);
  const [isLiked, setIsLiked] = useState(
    user && shout.likedBy ? shout.likedBy.includes(user.id) : false
  );

  useScrollLock(confirmDelete);

  // Separate effects: update likes count from props, but only update isLiked when likedBy changes
  useEffect(() => {
    setLikes(shout.likes);
  }, [shout.likes]);

  useEffect(() => {
    setIsLiked(user && shout.likedBy ? shout.likedBy.includes(user.id) : false);
  }, [shout.likedBy, user]);

  const repliesOpen = isThreadOpen ?? false;
  const hasComments = shout.comments && shout.comments.length > 0;
  const commentCount = shout.comments ? shout.comments.length : 0;
  const replyCharCount = effectiveLength(replyContent, NEWLINE_CHAR_COST);
  const isReplyOverLimit = replyCharCount > SHOUT_MAX_LENGTH;
  const replyHasMedia = !!replyMediaId || !!replyDetectedYtId;
  const canSubmitReply = (replyContent.trim() || replyHasMedia) && !isReplyOverLimit && !isSubmittingReply && !isReplyUploading;
  const isOwner = user && shout.user && user.id === shout.user.id;

  // Content hiding state
  const [spoilerRevealed, setSpoilerRevealed] = useState(false);
  const [nsfwRevealed, setNsfwRevealed] = useState(false);
  const [politicsRevealed, setPoliticsRevealed] = useState(false);
  const [ignoreRevealed, setIgnoreRevealed] = useState(false);

  const pinnedCollapseKey = shout.isPinned ? `pinnedCollapsed:${shout.id}` : null;
  const [isPinnedCollapsed, setIsPinnedCollapsed] = useState(() =>
    pinnedCollapseKey ? localStorage.getItem(pinnedCollapseKey) === '1' : false
  );
  const togglePinnedCollapsed = () => {
    if (!pinnedCollapseKey) return;
    const next = !isPinnedCollapsed;
    setIsPinnedCollapsed(next);
    if (next) localStorage.setItem(pinnedCollapseKey, '1');
    else localStorage.removeItem(pinnedCollapseKey);
  };

  const isDeleted = !!shout.isDeleted;
  const isShoutAuthorIgnored = !isDeleted && !!shout.user && isIgnored(shout.user.id);
  const isShoutIgnored = isShoutAuthorIgnored && !ignoreRevealed;
  const tag = shout.visibilityTag || '';
  const isSpoilerHidden = tag === 'spoiler' && !spoilerRevealed;
  const isNsfwHidden = tag === 'nsfw' && !nsfwRevealed && !prefs.showNsfw;
  const isPoliticsHidden = tag === 'politics' && !politicsRevealed && !prefs.showPolitics;
  const isMediaOnlyHidden = isSpoilerHidden || isNsfwHidden;

  useEffect(() => {
    if (replyMediaId) { setReplyDetectedYtId(null); return; }
    setReplyDetectedYtId(detectYouTubeId(replyContent));
  }, [replyContent, replyMediaId]);

  const toggleThread = () => {
    if (onThreadToggle) onThreadToggle(shout.id);
  };

  // Once the thread is open and a pending mention is queued, insert it.
  // Async context (useEffect + setTimeout) breaks iOS user activation,
  // so on iOS we only scroll into view — the user taps to open keyboard.
  // insertMention() still runs (it uses preventScroll focus for DOM ops).
  useEffect(() => {
    if (!repliesOpen || !pendingMention) return;
    const id = setTimeout(() => {
      if (isIOS()) {
        mentionInputRef.current?.insertMention(pendingMention);
        mentionInputRef.current?.scrollIntoView();
      } else {
        mentionInputRef.current?.focus(true);
        mentionInputRef.current?.insertMention(pendingMention);
      }
      setPendingMention(null);
    }, 50);
    return () => clearTimeout(id);
  }, [repliesOpen, pendingMention]);

  // Scroll reply input into view after the thread opens via "Ответить".
  // On iOS: scroll only, user taps to focus. On others: focus + scroll.
  const [pendingFocus, setPendingFocus] = useState(false);
  useEffect(() => {
    if (!repliesOpen || !pendingFocus) return;
    const id = setTimeout(() => {
      if (isIOS()) {
        mentionInputRef.current?.scrollIntoView();
      } else {
        mentionInputRef.current?.focus(true);
      }
      setPendingFocus(false);
    }, 50);
    return () => clearTimeout(id);
  }, [repliesOpen, pendingFocus]);

  const handleMentionReply = (author: { id: string; name: string }) => {
    if (!user) { openModal(); return; }
    if (!repliesOpen) {
      toggleThread();
      setPendingMention(author);
    } else if (isIOS()) {
      // iOS: insert mention (uses preventScroll focus for DOM ops), scroll only.
      mentionInputRef.current?.insertMention(author);
      mentionInputRef.current?.scrollIntoView();
    } else {
      // Android/Desktop: focus first to open keyboard, then insert mention.
      mentionInputRef.current?.focus(true);
      mentionInputRef.current?.insertMention(author);
    }
  };

  const handleReplyClick = () => {
    if (!user) { openModal(); return; }
    if (!repliesOpen) {
      toggleThread();
      setPendingFocus(true);
    } else {
      mentionInputRef.current?.focus(true);
    }
  };

  const uploadReplyFile = async (file: File) => {
    if (file.size > MEDIA_MAX_MB * 1024 * 1024) { setReplyError(`Файл слишком большой (макс. ${MEDIA_MAX_MB} МБ)`); return; }
    if (!['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'video/mp4'].includes(file.type)) { setReplyError('Допустимые форматы: JPG, PNG, WebP, GIF, MP4'); return; }
    setReplyError(null);
    setIsReplyUploading(true);
    const isVideo = file.type === 'video/mp4';
    setReplyMediaIsVideo(isVideo);
    const localUrl = URL.createObjectURL(file);
    setReplyMediaPreview(localUrl);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const res = await fetch('/api/v1/upload/media', { method: 'POST', credentials: 'include', body: formData });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || `Ошибка ${res.status}`); }
      const data = await res.json();
      setReplyMediaId(data.mediaId);
      if (!isVideo) {
        setReplyMediaPreview(data.urls.thumb);
        URL.revokeObjectURL(localUrl);
      }
    } catch (err: unknown) {
      setReplyError(err instanceof Error ? err.message : 'Ошибка загрузки');
      setReplyMediaPreview(null); URL.revokeObjectURL(localUrl);
    } finally { setIsReplyUploading(false); }
  };

  const handleReplyFileSelect = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    e.target.value = '';
    await uploadReplyFile(file);
  };

  const removeReplyMedia = () => {
    if (replyMediaPreview) URL.revokeObjectURL(replyMediaPreview);
    setReplyMediaId(null); setReplyMediaPreview(null); setReplyMediaIsVideo(false); setReplyError(null);
  };

  const submitReply = async () => {
    if (!canSubmitReply || !user) return;
    setIsSubmittingReply(true); setReplyError(null);
    try {
      const body: Record<string, string> = { content: replyContent.trim() };
      if (replyMediaId) body.mediaId = replyMediaId;
      else if (replyDetectedYtId) { const m = replyContent.match(/https?:\/\/[^\s]+/); if (m) body.youtubeUrl = m[0]; }
      const res = await fetch(`/api/v1/shouts/${shout.id}/replies`, {
        method: 'POST', credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body)
      });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || `Ошибка ${res.status}`); }
      const data = await res.json();
      const newComment: Comment = {
        id: data.id, shoutId: shout.id,
        user: { id: user.id, name: user.name, avatar: user.avatar },
        content: replyContent.trim(), timestamp: new Date().toISOString(),
        likes: 0, likedBy: [],
        ...(data.media ? { media: data.media } : {}),
      };
      mentionInputRef.current?.clear(); // also calls onContentChange('') → setReplyContent('')
      setReplyMediaId(null); setReplyMediaPreview(null);
      setReplyDetectedYtId(null); setReplyError(null);
      if (onCommentAdded) onCommentAdded(shout.id, newComment);
    } catch (err: unknown) {
      setReplyError(err instanceof Error ? err.message : 'Не удалось отправить ответ');
    } finally { setIsSubmittingReply(false); }
  };

  const handleLike = async () => {
    if (!user) { openModal(); return; }
    const newIsLiked = !isLiked;
    setIsLiked(newIsLiked);
    setLikes(prev => newIsLiked ? prev + 1 : Math.max(0, prev - 1));
    try {
      const res = await fetch(`/api/v1/shouts/${shout.id}/like`, { method: 'POST', credentials: 'include' });
      if (!res.ok) { setIsLiked(!newIsLiked); setLikes(prev => newIsLiked ? prev - 1 : prev + 1); return; }
      const data = await res.json();
      setLikes(data.likes); setIsLiked(data.isLiked);
    } catch { setIsLiked(!newIsLiked); setLikes(prev => newIsLiked ? prev - 1 : prev + 1); }
  };

  const handleDelete = async () => {
    if (!user || !isOwner) return;
    setIsDeleting(true);
    try {
      const res = await fetch(`/api/v1/shouts/${shout.id}`, { method: 'DELETE', credentials: 'include' });
      if (!res.ok) { const data = await res.json().catch(() => ({})); throw new Error(data.error || `Ошибка ${res.status}`); }
      setConfirmDelete(false);
      if (onDelete) onDelete(shout.id);
    } catch (err: unknown) {
      console.error('[ShoutCard] Delete error:', err);
      setConfirmDelete(false);
    } finally { setIsDeleting(false); }
  };

  const handleCommentDelete = (commentId: string) => {
    if (onCommentDeleted) onCommentDeleted(shout.id, commentId);
  };

  const insertEmoji = (emoji: string) => mentionInputRef.current?.insertText(emoji);

  const embeds = shout.content ? extractEmbeds(shout.content) : [];

  // Whether the entire shout body is hidden (politics only; spoiler now only hides media)
  const fullHide = isPoliticsHidden;

  // For GIFs: use static WebP thumbnail when media should not play (behind any hide)
  const gifSrc = (shout.media?.type === 'image' && shout.media.animated && shout.media.gif)
    ? (fullHide || isMediaOnlyHidden ? shout.media.url : shout.media.gif)
    : (shout.media?.type === 'image' ? shout.media.url : undefined);

  // Render media section (reused in normal and NSFW-only blur mode)
  const hasMediaContent = embeds.length > 0 || !!shout.media;

  // Always renders actual media (used by spoiler/NSFW blur overlays)
  const renderActualMedia = () => (
    <>
      {embeds.map((embed, idx) => (
        <EmbedCard key={`embed-${idx}`} embed={embed} />
      ))}

      {shout.media?.type === 'image' && (
         <div className="mb-3 rounded-lg">
             <img
               src={gifSrc} alt="attachment" loading="lazy"
               onClick={() => setLightboxOpen(true)}
               className="block cursor-pointer max-h-[300px] max-w-full h-auto object-contain hover:opacity-90 transition-opacity rounded-lg"
             />
         </div>
      )}

      {lightboxOpen && shout.media?.type === 'image' && (
        <Lightbox
          src={shout.media.animated && shout.media.gif ? shout.media.gif : shout.media.full}
          onClose={() => setLightboxOpen(false)}
        />
      )}

      {shout.media?.type === 'video' && (
        <div className="mb-3 rounded-lg overflow-hidden">
          <video src={shout.media.url} controls loop className="max-h-[300px] max-w-full rounded-lg" style={{ minWidth: 'min(300px, 100%)' }} ref={el => { if (el) el.volume = 0.3; }} />
        </div>
      )}

      {shout.media?.type === 'youtube' && (
          <div className="mb-3 rounded-lg overflow-hidden bg-th-card border border-th-border/50">
            <div className="w-full aspect-video bg-black relative cursor-pointer" onClick={() => !ytLoaded && setYtLoaded(true)}>
                {ytLoaded ? (
                  <iframe className="w-full h-full" src={`${shout.media.embedUrl}?autoplay=1`} title={shout.media.title || "YouTube"}
                    allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowFullScreen
                    sandbox="allow-scripts allow-same-origin allow-presentation allow-popups allow-popups-to-escape-sandbox" />
                ) : (
                  <>
                    <img src={`https://img.youtube.com/vi/${shout.media.videoId}/hqdefault.jpg`} alt={shout.media.title || "YouTube video"} loading="lazy" className="w-full h-full object-cover" />
                    <div className="absolute inset-0 flex items-center justify-center">
                      <div className="w-14 h-10 bg-red-600 rounded-xl flex items-center justify-center shadow-lg hover:bg-red-500 transition-colors">
                        <svg viewBox="0 0 24 24" className="w-6 h-6 text-white ml-0.5" fill="currentColor"><path d="M8 5v14l11-7z"/></svg>
                      </div>
                    </div>
                  </>
                )}
            </div>
            {(shout.media.title || shout.media.channel) && (
              <div className="px-3 py-2">
                {shout.media.title && <div className="text-sm text-th-text-2 font-medium leading-snug line-clamp-2">{shout.media.title}</div>}
                {shout.media.channel && <div className="text-xs text-th-text-3 mt-0.5">{shout.media.channel}</div>}
              </div>
            )}
          </div>
      )}
    </>
  );

  // Placeholder version for when showMedia is off
  const renderMediaPlaceholders = () => {
    if (!hasMediaContent) return null;
    return (
      <>
        {embeds.length > 0 && <MediaPlaceholder className="mb-2" />}
        {shout.media && <MediaPlaceholder className="mb-3" />}
      </>
    );
  };

  const renderMediaSection = () => {
    if (!showMedia) return renderMediaPlaceholders();
    return renderActualMedia();
  };

  return (
    <div className="flex flex-col relative">
      {shout.isPinned && !isDeleted && !isOwner && !isPinnedCollapsed && (
        <div className="absolute top-0 right-0 flex items-center gap-1">
          <span className="cursor-pointer text-th-text-4 hover:text-th-text transition-colors" onClick={togglePinnedCollapsed} title="Свернуть вопль">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
              <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
            </svg>
          </span>
          <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px] text-[#e6a700] rotate-45" viewBox="0 0 24 24" fill="currentColor">
            <path d="M16 2c.55 0 1 .45 1 1v3.17l1.71 1.71c.18.18.29.43.29.71v3.41c0 .55-.45 1-1 1h-4v5l-1 2-1-2v-5H7c-.55 0-1-.45-1-1V8.59c0-.27.11-.52.29-.71L8 6.17V3c0-.55.45-1 1-1h7z" />
          </svg>
        </div>
      )}
      {shout.isPinned && !isDeleted && isPinnedCollapsed ? (
        <div className="flex items-center justify-center py-0.5">
          <button
            onClick={togglePinnedCollapsed}
            className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-th-card border border-th-border shadow-sm hover:bg-th-elevated transition-colors text-xs text-th-text-2"
          >
            <svg xmlns="http://www.w3.org/2000/svg" className="w-[12px] h-[12px] text-[#e6a700] rotate-45 shrink-0" viewBox="0 0 24 24" fill="currentColor">
              <path d="M16 2c.55 0 1 .45 1 1v3.17l1.71 1.71c.18.18.29.43.29.71v3.41c0 .55-.45 1-1 1h-4v5l-1 2-1-2v-5H7c-.55 0-1-.45-1-1V8.59c0-.27.11-.52.29-.71L8 6.17V3c0-.55.45-1 1-1h7z" />
            </svg>
            <span className="font-bold">ЗАКРЕП</span>
            <span>·</span>
            <span className="font-bold">ПОКАЗАТЬ</span>
          </button>
        </div>
      ) : isShoutIgnored ? (
        /* --- Ignored user shout: fully hidden behind spoiler overlay --- */
        <div
          className="flex items-center gap-3 py-2 cursor-pointer rounded-lg bg-th-text-4/40 hover:bg-th-text-4/50 px-4 transition-all duration-200 select-none"
          onClick={() => setIgnoreRevealed(true)}
          title="Нажмите, чтобы показать"
          data-testid="ignored-shout-overlay"
        >
          <div className="shrink-0">
            <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-th-text-4" viewBox="0 0 20 20" fill="currentColor">
              <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
              <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
            </svg>
          </div>
          <span className="text-sm text-th-text-4">Контент от этого пользователя скрыт</span>
        </div>
      ) : (
      <>
      <div
        className={`${isShoutAuthorIgnored && ignoreRevealed ? 'rounded-lg bg-th-text-4/20 p-3 cursor-pointer transition-all duration-200 hover:bg-th-text-4/30' : ''}`}
        {...(isShoutAuthorIgnored && ignoreRevealed ? { onClick: (e: React.MouseEvent) => { if (e.target === e.currentTarget || !(e.target as HTMLElement).closest('a, button, [role="button"]')) setIgnoreRevealed(false); }, title: 'Нажмите, чтобы скрыть' } : {})}
      >
          {isDeleted ? (
            /* --- Deleted shout placeholder --- */
            <>
              <div className="flex items-center gap-2 mb-2">
                <div className="shrink-0">
                  <div className="w-10 h-10 rounded-full bg-th-input flex items-center justify-center">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-th-text-4" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                    </svg>
                  </div>
                </div>
                <a href={`/shout/${shout.id}`} className="text-xs text-th-text-4 hover:underline">{formatTimestamp(shout.timestamp)}</a>
              </div>
              <div className="text-th-text-4 text-sm italic mb-3">
                Этот вопль был удалён
              </div>
            </>
          ) : (
            /* --- Normal shout content --- */
            <>
              <div className="flex items-center gap-2 mb-2">
                {shout.user ? (
                  <a href={`/profile/${shout.user.id}`} className="shrink-0">
                    <div className="w-10 h-10 rounded-full overflow-hidden bg-th-input hover:ring-2 hover:ring-th-border transition-all">
                      {shout.user.avatar ? (
                        <img src={shout.user.avatar} alt={shout.user.name} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-th-text-4 text-sm font-bold">
                          {shout.user.name.charAt(0).toUpperCase()}
                        </div>
                      )}
                    </div>
                  </a>
                ) : (
                  <div className="shrink-0">
                    <div className="w-10 h-10 rounded-full bg-th-input flex items-center justify-center">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-5 h-5 text-th-text-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </div>
                  </div>
                )}
                {shout.user && (
                  <a href={`/profile/${shout.user.id}`} className={`font-bold text-sm hover:underline ${shout.user.isBanned ? 'text-th-text-4 line-through' : 'text-th-text-2'}`}>
                    {shout.user.name}
                  </a>
                )}
                <a href={`/shout/${shout.id}`} className="text-xs text-th-text-4 hover:underline">{formatTimestamp(shout.timestamp)}</a>
                {/* Content flag badges */}
                {tag === 'spoiler' && (
                  <span className="inline-flex items-center text-amber-400 bg-amber-500/15 p-1 rounded">
                    <svg xmlns="http://www.w3.org/2000/svg" className="w-3 h-3" viewBox="0 0 20 20" fill="currentColor">
                      <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                      <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                    </svg>
                  </span>
                )}
                {tag === 'nsfw' && <span className="text-[10px] font-bold text-red-400 bg-red-500/15 px-1.5 py-0.5 rounded">NSFW</span>}
                {tag === 'politics' && <span className="text-[10px] font-bold text-blue-400 bg-blue-500/15 px-1.5 py-0.5 rounded">ПОЛИТИКА</span>}
                {isOwner && (
                  <div className="flex items-center gap-2 ml-auto">
                    {shout.isPinned && (
                      <>
                        <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px] text-[#e6a700] rotate-45" viewBox="0 0 24 24" fill="currentColor">
                          <path d="M16 2c.55 0 1 .45 1 1v3.17l1.71 1.71c.18.18.29.43.29.71v3.41c0 .55-.45 1-1 1h-4v5l-1 2-1-2v-5H7c-.55 0-1-.45-1-1V8.59c0-.27.11-.52.29-.71L8 6.17V3c0-.55.45-1 1-1h7z" />
                        </svg>
                        <span className="cursor-pointer text-th-text-4 hover:text-th-text transition-colors" onClick={togglePinnedCollapsed} title="Свернуть вопль">
                          <svg xmlns="http://www.w3.org/2000/svg" className="w-[18px] h-[18px]" viewBox="0 0 20 20" fill="currentColor">
                            <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                            <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                          </svg>
                        </span>
                      </>
                    )}
                    <button onClick={() => setConfirmDelete(true)} className="text-xs text-th-text-4 hover:text-red-400 transition-colors" title="Удалить">
                      <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                        <path fillRule="evenodd" d="M9 2a1 1 0 00-.894.553L7.382 4H4a1 1 0 000 2v10a2 2 0 002 2h8a2 2 0 002-2V6a1 1 0 100-2h-3.382l-.724-1.447A1 1 0 0011 2H9zM7 8a1 1 0 012 0v6a1 1 0 11-2 0V8zm5-1a1 1 0 00-1 1v6a1 1 0 102 0V8a1 1 0 00-1-1z" clipRule="evenodd" />
                      </svg>
                    </button>
                  </div>
                )}
              </div>

              {fullHide ? (
                /* --- Politics: blurred content overlay matching real body size --- */
                <div className="relative rounded-lg overflow-hidden">
                  <div className="blur-xl select-none pointer-events-none" aria-hidden="true">
                    {shout.content && (
                      <div className="text-th-text-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap mb-3">
                        {renderContent(shout.content)}
                      </div>
                    )}
                    {renderActualMedia()}
                  </div>
                  <div className="absolute inset-0 bg-th-inset/40 flex items-center justify-center rounded-lg">
                    <button
                      onClick={() => setPoliticsRevealed(true)}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-th-card border border-th-border shadow-sm hover:bg-th-elevated transition-colors text-xs text-th-text-2"
                    >
                      <span className="font-bold">ПОЛИТИКА</span>
                      <span>·</span>
                      <span className="font-bold">ПОКАЗАТЬ</span>
                    </button>
                  </div>
                </div>
              ) : (
                /* --- Normal / NSFW content render --- */
                <>
                  {shout.content && (
                    <div className="text-th-text-2 text-[15px] leading-relaxed break-words whitespace-pre-wrap mb-3">
                       {renderContent(shout.content)}
                    </div>
                  )}

                  {isMediaOnlyHidden && hasMediaContent ? (
                    /* --- NSFW / Spoiler: always blur actual media, not placeholders --- */
                    <div className="relative rounded-lg overflow-hidden mb-3 inline-block max-w-full">
                      <div className="blur-xl select-none pointer-events-none" aria-hidden="true">
                        {renderActualMedia()}
                      </div>
                      <div className="absolute inset-0 flex items-center justify-center">
                        <button
                          onClick={() => isSpoilerHidden ? setSpoilerRevealed(true) : setNsfwRevealed(true)}
                          className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-full bg-th-card/90 border border-th-border shadow-sm hover:bg-th-elevated transition-colors backdrop-blur-sm text-xs text-th-text-2"
                        >
                          <span className="font-bold">{isSpoilerHidden ? 'СПОЙЛЕР' : 'NSFW'}</span>
                          <span>·</span>
                          <span className="font-bold">ПОКАЗАТЬ</span>
                        </button>
                      </div>
                    </div>
                  ) : (
                    renderMediaSection()
                  )}

                  {shout.poll && !isMediaOnlyHidden && (
                    <PollBlock poll={shout.poll} onVote={() => {}} />
                  )}
                </>
              )}
            </>
          )}

          {/* Action bar — always visible, even for deleted shouts */}
          <div className="flex items-center justify-between text-xs font-medium text-th-text-4 select-none mt-2">
            <div className="flex items-center gap-4">
              {isShoutAuthorIgnored ? (
                <span className="opacity-30 cursor-default" title="Вы игнорируете этого пользователя">Ответить</span>
              ) : (
                <button onClick={handleReplyClick} className={`hover:text-th-text-2 transition-colors ${repliesOpen ? 'text-th-text' : ''}`}>Ответить</button>
              )}
              {hasComments ? (
                <button onClick={toggleThread} className={`transition-colors ${repliesOpen ? 'text-red-400' : 'hover:text-th-text-2'}`}>
                  {repliesOpen ? 'Закрыть' : `${commentCount} ${getReplyDeclension(commentCount)}`}
                </button>
              ) : (
                <span className="opacity-50 cursor-default">0 ответов</span>
              )}
            </div>
            {!isDeleted && (
              <div className="flex items-center">
                {isShoutAuthorIgnored ? (
                  <span className="flex items-center gap-1 opacity-30 cursor-default" title="Вы игнорируете этого пользователя">
                      <span className="text-xs font-bold">{likes}</span>
                      <span className="text-base leading-none">{'\uD83E\uDD18'}</span>
                  </span>
                ) : (
                  <button onClick={handleLike} className={`flex items-center gap-1 transition-transform active:scale-95 ${isLiked ? 'text-[#e6a700]' : 'text-th-text-4 hover:text-th-text-2'}`} title={isLiked ? "Убрать лайк" : "Нравится"}>
                      <span className="text-xs font-bold">{likes}</span>
                      <span className="text-base leading-none">{'\uD83E\uDD18'}</span>
                  </button>
                )}
              </div>
            )}
          </div>
      </div>

      {confirmDelete && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm" style={{ touchAction: 'none' }} onClick={() => !isDeleting && setConfirmDelete(false)}>
          <div className="bg-th-card border border-th-border rounded-xl p-5 max-w-sm w-full mx-4 shadow-2xl" onClick={(e) => e.stopPropagation()}>
            <div className="text-th-text font-medium mb-2">Удалить вопль?</div>
            <div className="text-th-text-3 text-sm mb-4">Содержимое вопля будет скрыто, но комментарии останутся доступны.</div>
            <div className="flex gap-3 justify-end">
              <button onClick={() => setConfirmDelete(false)} disabled={isDeleting} className="px-4 py-1.5 text-sm text-neutral-500 dark:text-neutral-400 hover:text-neutral-800 dark:hover:text-neutral-200 transition-colors rounded">Отмена</button>
              <button onClick={handleDelete} disabled={isDeleting} className="px-4 py-1.5 text-sm bg-red-600 hover:bg-red-500 text-white rounded font-medium disabled:opacity-50 transition-colors">
                {isDeleting ? 'Удаление...' : 'Удалить'}
              </button>
            </div>
          </div>
        </div>
      )}

      {repliesOpen && (
        <div className="mt-2">
           {hasComments && shout.comments!.map(comment => (
               <CommentCard key={comment.id} comment={comment} showMedia={showMedia} onDelete={handleCommentDelete} onReply={handleMentionReply} />
           ))}
           {user && !isShoutAuthorIgnored && (
             <div className="mt-4">
               <div className="bg-th-card p-3 rounded flex gap-4">
                  <form className="w-full flex flex-col gap-2 min-w-0" onSubmit={(e) => { e.preventDefault(); submitReply(); }}>
                      <MentionInput
                          ref={mentionInputRef}
                          placeholder="Напишите ответ..."
                          disabled={isSubmittingReply}
                          onContentChange={(text) => { setReplyContent(text); setReplyError(null); }}
                          onSubmit={submitReply}
                          onImagePaste={async (file) => {
                            if (!replyMediaId && !isReplyUploading) await uploadReplyFile(file);
                          }}
                          size="sm"
                      />
                      <div className="flex items-center gap-2 justify-end">
                        <div className="flex items-center gap-1 shrink-0">
                          <EmojiPicker size="sm" onSelect={insertEmoji} />
                          <button type="button" onClick={() => replyFileInputRef.current?.click()}
                            disabled={isReplyUploading || !!replyMediaId}
                            className={`p-0.5 transition-colors ${replyMediaId ? 'text-[#0087ff]' : 'text-th-text-4 hover:text-th-text-2'} disabled:opacity-40`}
                            title={replyMediaId ? 'Изображение прикреплено' : 'Прикрепить изображение'}>
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M4 3a2 2 0 00-2 2v10a2 2 0 002 2h12a2 2 0 002-2V5a2 2 0 00-2-2H4zm12 12H4l4-8 3 6 2-4 3 6z" clipRule="evenodd" />
                            </svg>
                          </button>
                          <button type="button" onClick={() => mentionInputRef.current?.wrapSpoiler()}
                            className="p-0.5 text-th-text-4 hover:text-th-text-2 transition-colors"
                            title="Спойлер (||текст||)">
                            <svg xmlns="http://www.w3.org/2000/svg" className="w-4 h-4" viewBox="0 0 20 20" fill="currentColor">
                              <path fillRule="evenodd" d="M3.707 2.293a1 1 0 00-1.414 1.414l14 14a1 1 0 001.414-1.414l-1.473-1.473A10.014 10.014 0 0019.542 10C18.268 5.943 14.478 3 10 3a9.958 9.958 0 00-4.512 1.074l-1.78-1.781zm4.261 4.26l1.514 1.515a2.003 2.003 0 012.45 2.45l1.514 1.514a4 4 0 00-5.478-5.478z" clipRule="evenodd" />
                              <path d="M12.454 16.697L9.75 13.992a4 4 0 01-3.742-3.741L2.335 6.578A9.98 9.98 0 00.458 10c1.274 4.057 5.065 7 9.542 7 .847 0 1.669-.105 2.454-.303z" />
                            </svg>
                          </button>
                        </div>
                        <input ref={replyFileInputRef} type="file" accept="image/jpeg,image/png,image/webp,image/gif,video/mp4" className="hidden" onChange={handleReplyFileSelect} />
                        {(replyContent.trim() || replyHasMedia) && (
                          <span className={`text-xs whitespace-nowrap ${isReplyOverLimit ? 'text-red-400 font-semibold' : replyCharCount > SHOUT_MAX_LENGTH * 0.9 ? 'text-yellow-400' : 'text-th-text-4'}`}>
                            {replyCharCount}/{SHOUT_MAX_LENGTH}
                          </span>
                        )}
                        <button type="submit" disabled={!canSubmitReply} className="text-[#0087ff] hover:text-blue-400 text-sm font-medium disabled:opacity-30">
                            {isSubmittingReply ? '...' : 'Отправить'}
                        </button>
                      </div>
                      {replyMediaPreview && (
                        <div className="relative inline-block mt-1">
                          {replyMediaIsVideo ? (
                            <video src={replyMediaPreview} className="max-h-24 rounded border border-th-border" muted preload="metadata" />
                          ) : (
                            <img src={replyMediaPreview} alt="preview" className="max-h-24 rounded border border-th-border" />
                          )}
                          {isReplyUploading && <div className="absolute inset-0 bg-black/50 rounded flex items-center justify-center"><div className="w-4 h-4 border-2 border-th-text-4 border-t-th-text rounded-full animate-spin" /></div>}
                          {!isReplyUploading && <button type="button" onClick={removeReplyMedia} className="absolute -top-1.5 -right-1.5 w-5 h-5 bg-th-input border border-th-border rounded-full flex items-center justify-center text-th-text-2 hover:text-th-text hover:bg-th-elevated text-[10px]">X</button>}
                        </div>
                      )}
                      {!replyMediaId && replyDetectedYtId && (
                        <div className="flex items-center gap-2 mt-1 bg-th-inset/50 rounded p-1.5 border border-th-border-2">
                          <img src={`https://img.youtube.com/vi/${replyDetectedYtId}/default.jpg`} alt="YouTube" className="w-14 h-10 rounded object-cover shrink-0" />
                          <div className="text-[10px] text-th-text-3">YouTube видео</div>
                        </div>
                      )}
                  </form>
               </div>
               {replyError && <div className="mt-1 text-xs text-red-400 bg-red-500/10 border border-red-500/20 rounded-lg px-3 py-2">{replyError}</div>}
             </div>
           )}
           {user && isShoutAuthorIgnored && (
             <div className="mt-4">
               <div className="bg-th-card/50 p-3 rounded flex items-center gap-4 opacity-40 cursor-default select-none" title="Вы игнорируете этого пользователя">
                 <div className="w-10 h-10 bg-th-elevated rounded-full shrink-0" />
                 <div className="text-sm text-th-text-4">Ответы заблокированы — пользователь в игноре</div>
               </div>
             </div>
           )}
        </div>
      )}
      </>
      )}
    </div>
  );
};

function formatTimestamp(ts: string): string {
  try {
    const date = new Date(ts);
    if (isNaN(date.getTime())) return ts;
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMin = Math.floor(diffMs / 60000);
    if (diffMin < 1) return 'только что';
    if (diffMin < 60) return `${diffMin} ${getDeclension(diffMin, 'минуту', 'минуты', 'минут')} назад`;
    const diffHours = Math.floor(diffMin / 60);
    if (diffHours < 24) return `${diffHours} ${getDeclension(diffHours, 'час', 'часа', 'часов')} назад`;
    const diffDays = Math.floor(diffHours / 24);
    return `${diffDays} ${getDeclension(diffDays, 'день', 'дня', 'дней')} назад`;
  } catch { return ts; }
}

function getReplyDeclension(count: number): string {
    const ld = count % 10, lt = count % 100;
    if (lt >= 11 && lt <= 19) return 'ответов';
    if (ld === 1) return 'ответ';
    if (ld >= 2 && ld <= 4) return 'ответа';
    return 'ответов';
}

function getDeclension(count: number, one: string, few: string, many: string): string {
    const ld = count % 10, lt = count % 100;
    if (lt >= 11 && lt <= 19) return many;
    if (ld === 1) return one;
    if (ld >= 2 && ld <= 4) return few;
    return many;
}

export default ShoutCard;
