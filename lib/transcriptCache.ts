import fs from 'fs/promises';
import path from 'path';
import { parseVTT } from './vtt';

const CACHE_DIR = path.join(process.cwd(), '.cache', 'transcripts');

// 確保快取目錄存在
async function ensureCacheDir() {
  try {
    await fs.mkdir(CACHE_DIR, { recursive: true });
  } catch (error) {
    console.error('Failed to create cache directory:', error);
  }
}

// 生成快取檔案名稱
function getCacheFilename(videoId: string): string {
  return path.join(CACHE_DIR, `${videoId}.json`);
}

// 檢查快取是否存在
async function hasCache(videoId: string): Promise<boolean> {
  try {
    await fs.access(getCacheFilename(videoId));
    return true;
  } catch {
    return false;
  }
}

// 讀取快取
async function readCache(videoId: string): Promise<any> {
  try {
    const cacheFile = getCacheFilename(videoId);
    const data = await fs.readFile(cacheFile, 'utf-8');
    return JSON.parse(data);
  } catch (error) {
    console.error('Failed to read cache:', error);
    return null;
  }
}

// 寫入快取
async function writeCache(videoId: string, data: any): Promise<void> {
  try {
    await ensureCacheDir();
    const cacheFile = getCacheFilename(videoId);
    await fs.writeFile(cacheFile, JSON.stringify(data, null, 2), 'utf-8');
  } catch (error) {
    console.error('Failed to write cache:', error);
  }
}

// 清理 VTT 文本，移除重複內容和時間標記
function cleanTranscriptText(text: string): string {
  // 移除時間標記 <00:00:00.000>
  let cleaned = text.replace(/<\d{1,2}:\d{2}:\d{2}[\.\,]\d{3}>/g, '');
  // 移除 <c> 標籤
  cleaned = cleaned.replace(/<\/?c>/g, '');
  // 移除其他 HTML 標籤
  cleaned = cleaned.replace(/<[^>]+>/g, '');
  // 合併多個空白字元
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  return cleaned;
}

// 處理 VTT 並快取結果
export async function getOrCreateTranscript(videoId: string, vttContent: string) {
  // 檢查是否有快取
  if (vttContent === '' && await hasCache(videoId)) {
    try {
      return await readCache(videoId);
    } catch (error) {
      console.warn('Failed to read from cache, regenerating...', error);
      // 繼續生成新的快取
    }
  }

  // 如果沒有提供 VTT 內容，返回空結果
  if (!vttContent) {
    return {
      videoId,
      cues: [],
      timestamp: new Date().toISOString()
    };
  }

  // 解析 VTT
  let cues;
  try {
    cues = parseVTT(vttContent);
  } catch (error) {
    console.error('Failed to parse VTT content:', error);
    throw new Error('Invalid VTT content');
  }
  
  // 清理文本
  const cleanedCues = cues.map(cue => ({
    ...cue,
    text: cleanTranscriptText(cue.text)
  })).filter(cue => cue.text.trim().length > 0);

  // 移除重複的句子
  const uniqueCues = [];
  const seenTexts = new Set<string>();
  
  for (const cue of cleanedCues) {
    if (!seenTexts.has(cue.text) && cue.text.trim().length > 0) {
      seenTexts.add(cue.text);
      uniqueCues.push(cue);
    }
  }

  // 合併連續的相同句子
  const mergedCues = [];
  let lastCue = null;
  
  for (const cue of uniqueCues) {
    if (!lastCue || lastCue.text !== cue.text) {
      lastCue = { ...cue };
      mergedCues.push(lastCue);
    } else {
      // 合併時間範圍
      lastCue.end = Math.max(lastCue.end, cue.end);
    }
  }

  const result = {
    videoId,
    cues: mergedCues,
    timestamp: new Date().toISOString()
  };

  // 寫入快取
  await writeCache(videoId, result);
  return result;
}
