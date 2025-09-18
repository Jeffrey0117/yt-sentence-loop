"use client";
import { useEffect, useMemo, useRef, useState } from 'react';
import { subtitleCache } from '../lib/subtitleCache';

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
  const [fontSize, setFontSize] = useState(16);
  const [darkMode, setDarkMode] = useState(false);
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [searchTerm, setSearchTerm] = useState('');
  const [filteredCues, setFilteredCues] = useState<Cue[]>([]);
  const [bookmarks, setBookmarks] = useState<Set<number>>(new Set());
  const [showBookmarksOnly, setShowBookmarksOnly] = useState(false);
  const [repeatDelay, setRepeatDelay] = useState(0);
  const [customKeys, setCustomKeys] = useState({
    prev: 'j',
    next: 'k',
    loop: 'l',
    replay: 'r',
    playPause: ' '
  });
  const [showKeySettings, setShowKeySettings] = useState(false);
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
            setDuration(playerRef.current.getDuration());
          },
          onStateChange: (event: any) => {
            if (event.data === 1) { // playing
              const updateTime = () => {
                if (playerRef.current?.getCurrentTime) {
                  setCurrentTime(playerRef.current.getCurrentTime());
                }
              };
              updateTime();
              const interval = setInterval(updateTime, 100);
              return () => clearInterval(interval);
            }
          }
        },
      });
    };
    tryInit();
  }, [videoId]);
  async function fetchTranscript() {
    // 驗證影片 ID
    const validatedId = validateVideoId(videoId);
    if (!validatedId) {
      setErr('請輸入有效的 YouTube 影片 ID 或 URL');
      return;
    }

    setLoading(true);
    setErr(null);
    
    try {
      // 先檢查快取
      const cachedCues = subtitleCache.get(validatedId);
      if (cachedCues) {
        console.log('使用快取的字幕:', validatedId);
        setCues(cachedCues);
        setFilteredCues(cachedCues);
        setIndex(0);
        setSearchTerm('');
        setLoading(false);
        return;
      }

      // 快取未命中，從 API 獲取
      const r = await fetch(`/api/transcript?videoId=${encodeURIComponent(validatedId)}`);
      if (!r.ok) {
        const errorData = await r.json().catch(() => ({}));
        throw new Error(errorData.error || `${r.status} ${r.statusText}`);
      }
      const data = await r.json();
      
      // 存入快取
      if (data.cues && data.cues.length > 0) {
        subtitleCache.set(validatedId, data.cues);
      }
      
      setCues(data.cues || []);
      setFilteredCues(data.cues || []);
      setIndex(0);
      setSearchTerm('');
    } catch (e: any) {
      setErr(e.message || '取得字幕失敗');
      setCues([]);
      setFilteredCues([]);
    } finally {
      setLoading(false);
    }
  }

  // 書籤功能
  function toggleBookmark(index: number) {
    setBookmarks(prev => {
      const newBookmarks = new Set(prev);
      if (newBookmarks.has(index)) {
        newBookmarks.delete(index);
      } else {
        newBookmarks.add(index);
      }
      // 保存到 localStorage
      localStorage.setItem(`bookmarks-${videoId}`, JSON.stringify(Array.from(newBookmarks)));
      return newBookmarks;
    });
  }

  // 從 localStorage 載入書籤
  useEffect(() => {
    if (videoId) {
      const saved = localStorage.getItem(`bookmarks-${videoId}`);
      if (saved) {
        try {
          const bookmarkArray = JSON.parse(saved);
          setBookmarks(new Set(bookmarkArray));
        } catch (e) {
          console.error('Failed to load bookmarks:', e);
        }
      } else {
        setBookmarks(new Set());
      }
    }
  }, [videoId]);

  // 載入自定義快捷鍵
  useEffect(() => {
    const savedKeys = localStorage.getItem('customKeys');
    if (savedKeys) {
      try {
        setCustomKeys(JSON.parse(savedKeys));
      } catch (e) {
        console.error('Failed to load custom keys:', e);
      }
    }
  }, []);

  // 保存自定義快捷鍵
  function saveCustomKeys(newKeys: typeof customKeys) {
    setCustomKeys(newKeys);
    localStorage.setItem('customKeys', JSON.stringify(newKeys));
  }

  // 搜尋功能
  function handleSearch(term: string) {
    setSearchTerm(term);
    updateFilteredCues(term, showBookmarksOnly);
  }

  function updateFilteredCues(term: string, bookmarksOnly: boolean) {
    let filtered = cues;
    
    if (bookmarksOnly) {
      filtered = cues.filter((_, i) => bookmarks.has(i));
    }
    
    if (term.trim()) {
      filtered = filtered.filter(cue =>
        cue.text.toLowerCase().includes(term.toLowerCase())
      );
    }
    
    setFilteredCues(filtered);
  }

  // 更新過濾結果當書籤或搜尋改變時
  useEffect(() => {
    updateFilteredCues(searchTerm, showBookmarksOnly);
  }, [cues, bookmarks, showBookmarksOnly, searchTerm]);

  // 匯出功能
  function exportSubtitles(format: 'txt' | 'srt' | 'json') {
    const exportCues = showBookmarksOnly ?
      cues.filter((_, i) => bookmarks.has(i)) : cues;
    
    let content = '';
    let filename = `${videoId}_subtitles`;
    let mimeType = 'text/plain';

    switch (format) {
      case 'txt':
        content = exportCues.map(cue =>
          `[${fmt(cue.start)} - ${fmt(cue.end)}] ${cue.text}`
        ).join('\n\n');
        filename += '.txt';
        break;
        
      case 'srt':
        content = exportCues.map((cue, i) =>
          `${i + 1}\n${formatSRTTime(cue.start)} --> ${formatSRTTime(cue.end)}\n${cue.text}\n`
        ).join('\n');
        filename += '.srt';
        break;
        
      case 'json':
        content = JSON.stringify({
          videoId,
          url,
          subtitles: exportCues,
          exportDate: new Date().toISOString(),
          bookmarksOnly: showBookmarksOnly
        }, null, 2);
        filename += '.json';
        mimeType = 'application/json';
        break;
    }

    // 下載檔案
    const blob = new Blob([content], { type: mimeType });
    const downloadUrl = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = downloadUrl;
    link.download = filename;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(downloadUrl);
  }

  function formatSRTTime(seconds: number): string {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = Math.floor(seconds % 60);
    const ms = Math.floor((seconds % 1) * 1000);
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')},${ms.toString().padStart(3, '0')}`;
  }

  function highlightText(text: string, term: string) {
    if (!term.trim()) return text;
    
    const regex = new RegExp(`(${term.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')})`, 'gi');
    const parts = text.split(regex);
    
    return parts.map((part, i) =>
      regex.test(part) ?
        <mark key={i} className={`${darkMode ? 'bg-yellow-600 text-white' : 'bg-yellow-200'}`}>
          {part}
        </mark> : part
    );
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
        if (repeatDelay > 0) {
          // 暫停影片
          p.pauseVideo?.();
          // 等待延遲時間後重播
          setTimeout(() => {
            p.seekTo(start, true);
            p.playVideo?.();
          }, repeatDelay * 1000);
        } else {
          // 立即重播
          p.seekTo(start, true);
          p.playVideo?.();
        }
      }
    }, 120);
    return () => clearInterval(timerRef.current);
  }, [looping, cues, index, repeatDelay]);
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
      
      const key = e.key.toLowerCase();
      
      if (key === customKeys.prev.toLowerCase()) prev();
      if (key === customKeys.next.toLowerCase()) next();
      if (key === customKeys.loop.toLowerCase()) setLooping(v => !v);
      if (key === customKeys.playPause) {
        e.preventDefault();
        const p = playerRef.current;
        if (p?.getPlayerState?.() === 1) p.pauseVideo?.(); else p?.playVideo?.();
      }
      if (key === customKeys.replay.toLowerCase()) playSentence(index);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [index, customKeys]);
  return (
    <div className={`min-h-screen grid grid-cols-1 md:grid-cols-[1fr_380px] gap-4 p-4 ${darkMode ? 'bg-gray-900 text-white' : 'bg-white text-black'}`}>
      <div className="space-y-3">
        <div className="flex items-center justify-between">
          <h1 className="text-2xl font-semibold">YouTube 逐句循環播放器</h1>
          <button
            onClick={() => setDarkMode(!darkMode)}
            className={`px-3 py-1 rounded border ${darkMode ? 'border-gray-600 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'}`}
          >
            {darkMode ? '🌞' : '🌙'}
          </button>
        </div>
        <div className="flex gap-2 items-center">
          <input className={`w-full max-w-xl border rounded px-3 py-2 ${
            !validateVideoId(videoId) && videoId.length > 0
              ? (darkMode ? 'border-red-500 bg-red-900/20' : 'border-red-500 bg-red-50')
              : (darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300')
          }`}
                 placeholder="輸入 YouTube 影片 ID 或 URL (11 字符)"
                 value={videoId}
                 onChange={(e)=> {
                   const input = e.target.value;
                   setVideoId(input);
                   // 清除錯誤訊息當用戶開始輸入時
                   if (err && input !== videoId) {
                     setErr(null);
                   }
                 }}
                 onBlur={(e) => {
                   // 當失去焦點時自動格式化
                   const normalized = normalizeToId(e.target.value);
                   if (normalized !== e.target.value) {
                     setVideoId(normalized);
                   }
                 }} />
          <button
            onClick={fetchTranscript}
            disabled={loading}
            className={`px-3 py-2 rounded flex items-center gap-2 ${
              loading ? 'opacity-50 cursor-not-allowed' : ''
            } ${darkMode ? 'bg-gray-700 hover:bg-gray-600 text-white' : 'bg-black text-white hover:bg-gray-800'}`}
          >
            {loading && (
              <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
            )}
            {loading ? '抓取字幕中…' : '抓字幕'}
          </button>
        </div>
        <div id="player" className="aspect-video w-full bg-black/80 rounded" />
        
        {/* 影片進度條 */}
        {duration > 0 && (
          <div className="w-full">
            <div className={`h-2 rounded-full ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
              <div
                className="h-2 bg-blue-500 rounded-full transition-all duration-100"
                style={{ width: `${(currentTime / duration) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span>{fmt(currentTime)}</span>
              <span>{fmt(duration)}</span>
            </div>
          </div>
        )}
        
        {/* 字幕進度條 */}
        {cues.length > 0 && (
          <div className="w-full">
            <div className="text-sm mb-1">字幕進度</div>
            <div className={`h-2 rounded-full ${darkMode ? 'bg-gray-700' : 'bg-gray-200'}`}>
              <div
                className="h-2 bg-green-500 rounded-full transition-all duration-100"
                style={{ width: `${((index + 1) / cues.length) * 100}%` }}
              />
            </div>
            <div className="flex justify-between text-sm mt-1">
              <span>{index + 1} / {cues.length}</span>
              <span>{Math.round(((index + 1) / cues.length) * 100)}%</span>
            </div>
          </div>
        )}
        <div className="flex items-center gap-3">
          <button className={`px-3 py-1 border rounded ${darkMode ? 'border-gray-600 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'}`} onClick={()=>setLooping(v=>!v)}>
            循環本句：{looping? '開' : '關'} ({customKeys.loop.toUpperCase()})
          </button>
          <button className={`px-3 py-1 border rounded ${darkMode ? 'border-gray-600 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'}`} onClick={prev}>上一句 ({customKeys.prev.toUpperCase()})</button>
          <button className={`px-3 py-1 border rounded ${darkMode ? 'border-gray-600 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'}`} onClick={next}>下一句 ({customKeys.next.toUpperCase()})</button>
          <button className={`px-3 py-1 border rounded ${darkMode ? 'border-gray-600 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'}`} onClick={()=>playSentence(index)}>重播 ({customKeys.replay.toUpperCase()})</button>
          <button
            className={`px-3 py-1 border rounded ${darkMode ? 'border-gray-600 hover:bg-gray-800' : 'border-gray-300 hover:bg-gray-100'}`}
            onClick={() => setShowKeySettings(!showKeySettings)}
          >
            ⚙️ 快捷鍵
          </button>
          <label className="ml-2">速度</label>
          <select className={`border rounded px-2 py-1 ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300'}`} value={rate}
                  onChange={(e)=> setPlaybackRate(Number(e.target.value))}>
            {[0.5, 0.75, 1, 1.25, 1.5, 1.75].map(v=> (
              <option key={v} value={v}>{v}x</option>
            ))}
          </select>
          <label className="ml-2">字體</label>
          <select className={`border rounded px-2 py-1 ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300'}`} value={fontSize}
                  onChange={(e)=> setFontSize(Number(e.target.value))}>
            {[12, 14, 16, 18, 20, 24].map(size=> (
              <option key={size} value={size}>{size}px</option>
            ))}
          </select>
          <label className="ml-2">間隔</label>
          <select className={`border rounded px-2 py-1 ${darkMode ? 'bg-gray-800 border-gray-600 text-white' : 'bg-white border-gray-300'}`} value={repeatDelay}
                  onChange={(e)=> setRepeatDelay(Number(e.target.value))}>
            {[0, 0.5, 1, 1.5, 2, 3, 5].map(delay=> (
              <option key={delay} value={delay}>{delay === 0 ? '無間隔' : `${delay}秒`}</option>
            ))}
          </select>
        </div>
        {/* 載入狀態和錯誤訊息 */}
        {loading && (
          <div className={`p-4 rounded border ${darkMode ? 'bg-gray-800 border-gray-600' : 'bg-blue-50 border-blue-200'}`}>
            <div className="flex items-center gap-3">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-blue-500"></div>
              <div>
                <p className={`font-medium ${darkMode ? 'text-blue-400' : 'text-blue-800'}`}>正在處理字幕...</p>
                <p className={`text-sm ${darkMode ? 'text-gray-400' : 'text-gray-600'}`}>請稍等，正在從 YouTube 下載並解析字幕</p>
              </div>
            </div>
          </div>
        )}
        
        {err && (
          <div className={`p-4 rounded border ${darkMode ? 'bg-red-900 border-red-600' : 'bg-red-50 border-red-200'}`}>
            <div className="flex items-start gap-3">
              <div className="text-red-500 mt-0.5">⚠️</div>
              <div>
                <p className={`font-medium ${darkMode ? 'text-red-400' : 'text-red-800'}`}>字幕載入失敗</p>
                <p className={`text-sm ${darkMode ? 'text-red-300' : 'text-red-600'}`}>{err}</p>
                <p className={`text-xs mt-1 ${darkMode ? 'text-gray-400' : 'text-gray-500'}`}>
                  提示：請確認影片 ID 正確，且影片有可用的字幕
                </p>
              </div>
            </div>
          </div>
        )}
        
        {/* 快捷鍵設定面板 */}
        {showKeySettings && (
          <div className={`p-4 border rounded ${darkMode ? 'bg-gray-800 border-gray-600' : 'bg-gray-50 border-gray-300'}`}>
            <div className="flex items-center justify-between mb-3">
              <h3 className="font-semibold">自定義快捷鍵</h3>
              <button
                onClick={() => setShowKeySettings(false)}
                className={`px-2 py-1 text-sm rounded ${darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-200'}`}
              >
                ✕
              </button>
            </div>
            <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
              <div>
                <label className="block text-sm mb-1">上一句</label>
                <input
                  type="text"
                  maxLength={1}
                  value={customKeys.prev}
                  onChange={(e) => saveCustomKeys({...customKeys, prev: e.target.value.toLowerCase()})}
                  className={`w-full px-2 py-1 text-center border rounded ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">下一句</label>
                <input
                  type="text"
                  maxLength={1}
                  value={customKeys.next}
                  onChange={(e) => saveCustomKeys({...customKeys, next: e.target.value.toLowerCase()})}
                  className={`w-full px-2 py-1 text-center border rounded ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">循環模式</label>
                <input
                  type="text"
                  maxLength={1}
                  value={customKeys.loop}
                  onChange={(e) => saveCustomKeys({...customKeys, loop: e.target.value.toLowerCase()})}
                  className={`w-full px-2 py-1 text-center border rounded ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">重播</label>
                <input
                  type="text"
                  maxLength={1}
                  value={customKeys.replay}
                  onChange={(e) => saveCustomKeys({...customKeys, replay: e.target.value.toLowerCase()})}
                  className={`w-full px-2 py-1 text-center border rounded ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}
                />
              </div>
              <div>
                <label className="block text-sm mb-1">播放/暫停</label>
                <select
                  value={customKeys.playPause}
                  onChange={(e) => saveCustomKeys({...customKeys, playPause: e.target.value})}
                  className={`w-full px-2 py-1 border rounded ${darkMode ? 'bg-gray-700 border-gray-600' : 'bg-white border-gray-300'}`}
                >
                  <option value=" ">空白鍵</option>
                  <option value="p">P</option>
                  <option value="enter">Enter</option>
                </select>
              </div>
            </div>
            <div className="mt-3 flex gap-2">
              <button
                onClick={() => saveCustomKeys({prev: 'j', next: 'k', loop: 'l', replay: 'r', playPause: ' '})}
                className={`px-3 py-1 text-sm rounded ${darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300'}`}
              >
                重設為預設值
              </button>
            </div>
          </div>
        )}
      </div>
      <aside className={`h-[80vh] overflow-auto border rounded p-2 ${darkMode ? 'bg-gray-800 border-gray-600' : 'bg-white border-gray-300'}`}>
        <div className="flex items-center justify-between mb-2">
          <h2 className="font-semibold">
            逐字稿（{cues.length}）
            {bookmarks.size > 0 && (
              <span className="text-xs ml-1">📌 {bookmarks.size}</span>
            )}
          </h2>
          <div className="flex items-center gap-2 text-sm">
            {(searchTerm || showBookmarksOnly) && (
              <span>
                {showBookmarksOnly ? '書籤：' : '搜尋：'}{filteredCues.length} 個結果
              </span>
            )}
          </div>
        </div>
        
        {/* 書籤控制和匯出功能 */}
        <div className="space-y-2 mb-3">
          <div className="flex gap-2">
            <button
              onClick={() => {
                setShowBookmarksOnly(!showBookmarksOnly);
                setSearchTerm('');
              }}
              className={`px-3 py-1 text-sm rounded ${
                showBookmarksOnly
                  ? (darkMode ? 'bg-blue-600 text-white' : 'bg-blue-500 text-white')
                  : (darkMode ? 'bg-gray-700 hover:bg-gray-600 text-gray-300' : 'bg-gray-100 hover:bg-gray-200 text-gray-600')
              }`}
            >
              📌 書籤 ({bookmarks.size})
            </button>
            {bookmarks.size > 0 && (
              <button
                onClick={() => {
                  setBookmarks(new Set());
                  localStorage.removeItem(`bookmarks-${videoId}`);
                }}
                className={`px-3 py-1 text-sm rounded ${
                  darkMode
                    ? 'bg-red-700 hover:bg-red-600 text-red-300'
                    : 'bg-red-100 hover:bg-red-200 text-red-600'
                }`}
              >
                清除全部
              </button>
            )}
          </div>
          
          {/* 匯出選項 */}
          {cues.length > 0 && (
            <div className="flex gap-1 flex-wrap">
              <span className="text-xs self-center mr-1">匯出：</span>
              <button
                onClick={() => exportSubtitles('txt')}
                className={`px-2 py-1 text-xs rounded ${
                  darkMode ? 'bg-green-700 hover:bg-green-600 text-green-200' : 'bg-green-100 hover:bg-green-200 text-green-700'
                }`}
              >
                📄 TXT
              </button>
              <button
                onClick={() => exportSubtitles('srt')}
                className={`px-2 py-1 text-xs rounded ${
                  darkMode ? 'bg-purple-700 hover:bg-purple-600 text-purple-200' : 'bg-purple-100 hover:bg-purple-200 text-purple-700'
                }`}
              >
                🎬 SRT
              </button>
              <button
                onClick={() => exportSubtitles('json')}
                className={`px-2 py-1 text-xs rounded ${
                  darkMode ? 'bg-orange-700 hover:bg-orange-600 text-orange-200' : 'bg-orange-100 hover:bg-orange-200 text-orange-700'
                }`}
              >
                📋 JSON
              </button>
              {showBookmarksOnly && (
                <span className="text-xs self-center text-blue-500">
                  (僅書籤)
                </span>
              )}
            </div>
          )}
        </div>
        
        {/* 搜尋框 */}
        <div className="mb-3">
          <input
            type="text"
            placeholder="搜尋字幕內容..."
            value={searchTerm}
            onChange={(e) => handleSearch(e.target.value)}
            className={`w-full px-3 py-2 text-sm border rounded ${
              darkMode
                ? 'bg-gray-700 border-gray-600 text-white placeholder-gray-400'
                : 'bg-white border-gray-300 placeholder-gray-500'
            }`}
          />
          {searchTerm && (
            <button
              onClick={() => handleSearch('')}
              className={`mt-1 text-xs px-2 py-1 rounded ${
                darkMode
                  ? 'bg-gray-700 hover:bg-gray-600 text-gray-300'
                  : 'bg-gray-100 hover:bg-gray-200 text-gray-600'
              }`}
            >
              清除搜尋
            </button>
          )}
        </div>
        <ul className="space-y-1">
          {(searchTerm || showBookmarksOnly ? filteredCues : cues).map((c, i)=> {
            const originalIndex = (searchTerm || showBookmarksOnly) ? cues.findIndex(cue => cue === c) : i;
            const isBookmarked = bookmarks.has(originalIndex);
            return (
              <li key={originalIndex}>
                <div className="flex items-start gap-1">
                  <button
                    onClick={()=> playSentence(originalIndex)}
                    className={`text-left flex-1 px-2 py-1 rounded ${originalIndex===index
                      ? (darkMode ? 'bg-yellow-600' : 'bg-yellow-100')
                      : (darkMode ? 'hover:bg-gray-700' : 'hover:bg-gray-100')}`}
                    style={{ fontSize: `${fontSize}px` }}
                  >
                    <span className="text-xs opacity-60 mr-2">{fmt(c.start)}—{fmt(c.end)}</span>
                    <span>{highlightText(c.text, searchTerm)}</span>
                  </button>
                  <button
                    onClick={() => toggleBookmark(originalIndex)}
                    className={`px-2 py-1 text-sm rounded ${
                      isBookmarked
                        ? (darkMode ? 'bg-blue-600 hover:bg-blue-500' : 'bg-blue-500 hover:bg-blue-400')
                        : (darkMode ? 'bg-gray-700 hover:bg-gray-600' : 'bg-gray-200 hover:bg-gray-300')
                    }`}
                    title={isBookmarked ? '移除書籤' : '加入書籤'}
                  >
                    {isBookmarked ? '📌' : '📍'}
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      </aside>
    </div>
  );
}
function normalizeToId(input: string): string {
  if (!input || typeof input !== 'string') {
    return '';
  }

  // 清理輸入，移除前後空白
  const cleanInput = input.trim();
  
  // 檢查是否為空
  if (!cleanInput) {
    return '';
  }

  try {
    const u = new URL(cleanInput);
    // 只允許 YouTube 域名
    const validHosts = [
      'youtube.com', 'www.youtube.com', 'm.youtube.com',
      'youtu.be', 'www.youtu.be'
    ];
    
    if (validHosts.some(host => u.hostname === host || u.hostname.endsWith('.' + host))) {
      if (u.searchParams.get('v')) {
        const videoId = u.searchParams.get('v')!;
        return validateVideoId(videoId);
      }
      const embedMatch = u.pathname.match(/\/embed\/([a-zA-Z0-9_-]{11})/);
      if (embedMatch) return validateVideoId(embedMatch[1]);
      
      const shortsMatch = u.pathname.match(/\/shorts\/([a-zA-Z0-9_-]{11})/);
      if (shortsMatch) return validateVideoId(shortsMatch[1]);
      
      // youtu.be 短網址
      if (u.hostname.includes('youtu.be')) {
        const videoId = u.pathname.substring(1);
        return validateVideoId(videoId);
      }
    }
  } catch {}
  
  // 直接輸入的影片 ID
  const directId = cleanInput.replace(/[^a-zA-Z0-9_-]/g, '');
  return validateVideoId(directId);
}

function validateVideoId(videoId: string): string {
  // YouTube 影片 ID 必須是 11 個字符
  if (!videoId || videoId.length !== 11) {
    return '';
  }
  
  // 只允許字母、數字、底線和破折號
  if (!/^[a-zA-Z0-9_-]{11}$/.test(videoId)) {
    return '';
  }
  
  return videoId;
}
function fmt(t: number) {
  const s = Math.floor(t % 60).toString().padStart(2, '0');
  const m = Math.floor((t/60) % 60).toString().padStart(2, '0');
  const h = Math.floor(t/3600);
  return (h>0? h+':' : '') + m + ':' + s;
}
