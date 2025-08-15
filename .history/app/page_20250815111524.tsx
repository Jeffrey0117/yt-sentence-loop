"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
// --- 型別 ---
type Cue = { start: number; end: number; text: string };
declare global {
  interface Window {
    YT: any;
    onYouTubeIframeAPIReady: () => void;
  }
}
export default function Page() {
  const [videoId, setVideoId] = useState('cs7EQdWO5o0');
  const [cues, setCues] = useState<Cue[]>([]);
  const [loading, setLoading] = useState(false);
  const [err, setErr] = useState<string | null>(null);
  const [index, setIndex] = useState(0);
  const [looping, setLooping] = useState(true);
  const [rate, setRate] = useState(1);
  const playerRef = useRef<any>(null);
  const timerRef = useRef<any>(null);
  const url = useMemo(() => `https://www.youtube.com/watch?v=${videoId}`, [videoId]);
  useEffect(() => {
    if (window.YT && window.YT.Player) return;
    const s = document.createElement('script');
    s.src = 'https://www.youtube.com/iframe_api';
    document.body.appendChild(s);
    window.onYouTubeIframeAPIReady = () => {};
  }, []);
  useEffect(() => {
    const tryInit = () => {
      if (!window.YT || !window.YT.Player) {
        return setTimeout(tryInit, 200);
      }
      if (playerRef.current) {
        playerRef.current.destroy?.();
        playerRef.current = null;
      }
      playerRef.current = new window.YT.Player('player', {
        videoId,
        playerVars: { rel: 0, modestbranding: 1, playsinline: 1 },
        events: {
          onReady: () => {
            playerRef.current.setPlaybackRate?.(rate);
          },
        },
      });
    };
    tryInit();
  }, [videoId]);
  async function fetchTranscript() {
    setLoading(true); setErr(null);
    try {
      const r = await fetch(`/api/transcript?videoId=${encodeURIComponent(videoId)}`);
      if (!r.ok) throw new Error(`${r.status} ${r.statusText}`);
      const data = await r.json();
      setCues(data.cues || []);
      setIndex(0);
    } catch (e: any) {
      setErr(e.message || '取得字幕失敗');
      setCues([]);
    } finally {
      setLoading(false);
    }
  }
  useEffect(() => {
    if (!looping || !cues[index]) return;
    clearInterval(timerRef.current);
    timerRef.current = setInterval(() => {
      const p = playerRef.current;
      if (!p || !p.getCurrentTime) return;
      const t = p.getCurrentTime();
      const { start, end } = cues[index];
      if (typeof t === 'number' && end && t >= end - 0.05) {
        p.seekTo(start, true);
        p.playVideo?.();
      }
    }, 120);
    return () => clearInterval(timerRef.current);
  }, [looping, cues, index]);
  function playSentence(i: number) {
    if (!cues[i]) return;
    setIndex(i);
    const { start } = cues[i];
    const p = playerRef.current;
    p?.seekTo(start, true);
    p?.playVideo?.();
  }
  function prev() { if (index > 0) playSentence(index - 1); }
  function next() { if (index < cues.length - 1) playSentence(index + 1); }
  function setPlaybackRate(v: number) {
    setRate(v);
    playerRef.current?.setPlaybackRate?.(v);
  }
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.target && (e.target as any).tagName === 'INPUT') return;
      if (e.key === 'j' || e.key === 'J') prev();
      if (e.key === 'k' || e.key === 'K') next();
      if (e.key === 'l' || e.key === 'L') setLooping(v => !v);
      if (e.key === ' ') {
        e.preventDefault();
        const p = playerRef.current;
        if (p?.getPlayerState?.() === 1) p.pauseVideo?.(); else p?.playVideo?.();
      }
      if (e.key === 'r' || e.key === 'R') playSentence(index);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index]);
  return (
    <div className="min-h-screen grid grid-cols-1 md:grid-cols-[1fr_380px] gap-4 p-4">
      <div className="space-y-3">
        <h1 className="text-2xl font-semibold">YouTube 逐句循環播放器</h1>
        <div className="flex gap-2 items-center">
          <input className="input input-bordered w-full max-w-xl border rounded px-3 py-2"
                 placeholder="輸入 YouTube 影片 ID 或 URL"
                 value={videoId}
                 onChange={(e)=> setVideoId(normalizeToId(e.target.value))} />
          <button onClick={fetchTranscript} className="px-3 py-2 rounded bg-black text-white">
            {loading ? '讀取中…' : '抓字幕'}
          </button>
        </div>
        <div id="player" className="aspect-video w-full bg-black/80 rounded" />
        <div className="flex items-center gap-3">
          <button className="px-3 py-1 border rounded" onClick={()=>setLooping(v=>!v)}>
            循環本句：{looping? '開' : '關'} (L)
          </button>
          <button className="px-3 py-1 border rounded" onClick={prev}>上一句 (J)</button>
          <button className="px-3 py-1 border rounded" onClick={next}>下一句 (K)</button>
          <button className="px-3 py-1 border rounded" onClick={()=>playSentence(index)}>重播 (R)</button>
          <label className="ml-2">速度</label>
          <select className="border rounded px-2 py-1" value={rate}
                  onChange={(e)=> setPlaybackRate(Number(e.target.value))}>
            {[0.5, 0.75, 1, 1.25, 1.5, 1.75].map(v=> (
              <option key={v} value={v}>{v}x</option>
            ))}
          </select>
        </div>
        {err && <p className="text-red-600">{err}</p>}
      </div>
      <aside className="h-[80vh] overflow-auto border rounded p-2">
        <h2 className="font-semibold mb-2">逐字稿（{cues.length}）</h2>
        <ul className="space-y-1">
          {cues.map((c, i)=> (
            <li key={i}>
              <button
                onClick={()=> playSentence(i)}
                className={`text-left w-full px-2 py-1 rounded ${i===index? 'bg-yellow-100' : 'hover:bg-gray-100'}`}
              >
                <span className="text-xs opacity-60 mr-2">{fmt(c.start)}—{fmt(c.end)}</span>
                {c.text}
              </button>
            </li>
          ))}
        </ul>
      </aside>
    </div>
  );
}
function normalizeToId(input: string) {
  try {
    const u = new URL(input);
    if (u.hostname.includes('youtu')) {
      if (u.searchParams.get('v')) return u.searchParams.get('v')!;
      const m = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{6,})/);
      if (m) return m[1];
      const shorts = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{6,})/);
      if (shorts) return shorts[1];
    }
  } catch {}
  return input.replace(/[^a-zA-Z0-9_-]/g, '');
}
function fmt(t: number) {
  const s = Math.floor(t % 60).toString().padStart(2, '0');
  const m = Math.floor((t/60) % 60).toString().padStart(2, '0');
  const h = Math.floor(t/3600);
  return (h>0? h+':' : '') + m + ':' + s;
}
