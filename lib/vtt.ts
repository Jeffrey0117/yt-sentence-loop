// 簡易 VTT 解析：轉 { start, end, text }
export function parseVTT(vtt: string) {
  if (!vtt || typeof vtt !== 'string') {
    console.error('Invalid VTT content');
    return [];
  }

  // 正規化換行符號並分割成行
  const lines = vtt
    .replace(/\r\n/g, '\n')  // 將 Windows 換行轉換為 Unix 換行
    .replace(/\r/g, '\n')     // 處理 Mac 舊版換行
    .split('\n');

  const cues: { start: number; end: number; text: string }[] = [];
  let i = 0;
  
  // 時間戳記匹配
  const timeRegex = /^(\d{1,3}:)?\d{1,2}:\d{2}[\.\,]\d{1,3}\s*-+>\s*(\d{1,3}:)?\d{1,2}:\d{2}[\.\,]\d{1,3}/;
  
  while (i < lines.length) {
    const line = lines[i].trim();
    
    // 跳過空行和註解
    if (!line || line.startsWith('NOTE') || line.startsWith('STYLE') || line.startsWith('REGION')) {
      i++;
      continue;
    }
    
    // 檢查是否為時間戳記行
    if (timeRegex.test(line)) {
      // 分割時間戳記
      const timeParts = line.split(/\s*-+>\s*/);
      if (timeParts.length < 2) {
        i++;
        continue;
      }
      
      const s = timeParts[0].trim();
      const e = timeParts[1].split(/\s+/)[0].trim();
      
      i++;
      
      // 收集所有文本行
      const textLines: string[] = [];
      while (i < lines.length && lines[i].trim() !== '') {
        textLines.push(lines[i].trim());
        i++;
      }
      
      // 合併文本行，只做基本清理
      let t = textLines
        .map(line => 
          line
            // 移除 HTML 標籤
            .replace(/<[^>]+>/g, '')
            // 處理基本特殊字符
            .replace(/&amp;/g, '&')
            .replace(/&lt;/g, '<')
            .replace(/&gt;/g, '>')
            .replace(/&quot;/g, '"')
            .replace(/&apos;/g, "'")
            .trim()
        )
        .filter(line => line.length > 0)
        .join(' ')
        .replace(/\s+/g, ' ')
        .trim();
      
      // 計算時間（秒）
      const start = toSec(s);
      const end = toSec(e) || start + 2; // 如果結束時間無效，使用開始時間+2秒
      
      // 添加字幕
      if (t) {
        cues.push({
          start: parseFloat(start.toFixed(3)),
          end: parseFloat(end.toFixed(3)),
          text: t
        });
      }
    } else {
      i++;
    }
  }
  
  return cues;
  // 1. 先按開始時間排序
  const initialSortedCues = [...cues].sort((a, b) => a.start - b.start || a.end - b.end);
  
  // 2. 合併重疊或連續的時間段
  const mergedTimeRanges: Array<{
    start: number;
    end: number;
    texts: string[];
  }> = [];

  for (const cue of initialSortedCues) {
    // 跳過空文本
    const trimmedText = cue.text.trim();
    if (!trimmedText) continue;
    
    // 尋找重疊或連續的時間段
    let mergedIndex = -1;
    for (let i = 0; i < mergedTimeRanges.length; i++) {
      const m = mergedTimeRanges[i];
      // 檢查是否有重疊或連續（前後1秒內）
      if (cue.start <= m.end + 1 && cue.end >= m.start - 1) {
        mergedIndex = i;
        break;
      }
    }

    if (mergedIndex >= 0) {
      // 合併到現有時間段
      const m = mergedTimeRanges[mergedIndex];
      m.start = Math.min(m.start, cue.start);
      m.end = Math.max(m.end, cue.end);
      m.texts.push(trimmedText);
    } else {
      // 創建新的時間段
      mergedTimeRanges.push({
        start: cue.start,
        end: cue.end,
        texts: [trimmedText]
      });
    }
  }

  // 3. 對每個合併後的時間段，選擇最完整的文本
  const processedCues = mergedTimeRanges.map(group => {
    // 過濾掉重複的文本（保留最長的）
    const uniqueTexts = Array.from(new Set(group.texts));
    const bestText = uniqueTexts.reduce((best, current) => 
      current.length > best.length ? current : best
    );

    // 清理文本
    const cleanedText = bestText
      .replace(/\s+/g, ' ') // 合併多個空白
      .replace(/^\s+|\s+$/g, '') // 移除首尾空白
      .replace(/\.{2,}/g, '.') // 合併多個句點
      .replace(/\s*[\.,;:]\s*/g, match => match.trim() + ' ') // 標準化標點符號後的空白
      .trim();

    return {
      start: group.start,
      end: group.end,
      text: cleanedText
    };
  });

  // 4. 合併重疊的時間段，創建連續的時間軸
  const timeline: Array<{start: number, end: number, text: string}> = [];
  
  // 首先按開始時間排序
  const finalSortedCues = [...processedCues].sort((a, b) => a.start - b.start || a.end - b.end);
  
  if (finalSortedCues.length > 0) {
    // 初始化第一個時間段
    let current = { ...finalSortedCues[0] };
    
    for (let i = 1; i < finalSortedCues.length; i++) {
      const next = finalSortedCues[i];
      
      // 如果下一個字幕與當前時間段重疊或連續
      if (next.start <= current.end + 0.5) { // 0.5秒的緩衝區
        // 合併文本，用空格分隔
        current.text = `${current.text} ${next.text}`.replace(/\s+/g, ' ').trim();
        // 擴展當前時間段的結束時間
        current.end = Math.max(current.end, next.end);
      } else {
        // 保存當前時間段
        timeline.push({ ...current });
        // 開始新的時間段
        current = { ...next };
      }
    }
    // 添加最後一個時間段
    timeline.push(current);
  }
  
  // 5. 將合併後的時間段分割成不重疊的區間
  const finalResult: Array<{start: number, end: number, text: string}> = [];
  
  for (let i = 0; i < timeline.length; i++) {
    const current = timeline[i];
    
    // 如果是第一個時間段，直接添加
    if (i === 0) {
      finalResult.push({ ...current });
      continue;
    }
    
    const prev = finalResult[finalResult.length - 1];
    
    // 確保時間段不重疊
    if (current.start < prev.end) {
      // 調整前一個時間段的結束時間
      prev.end = current.start;
    }
    
    // 添加當前時間段
    finalResult.push({ ...current });
  }
  
  // 6. 清理並合併相鄰的相同文本
  const cleanedResult: typeof finalResult = [];
  
  for (const cue of finalResult) {
    if (cleanedResult.length === 0) {
      cleanedResult.push({ ...cue });
      continue;
    }
    
    const last = cleanedResult[cleanedResult.length - 1];
    
    // 如果文本相同且時間連續，則合併
    if (last.text === cue.text && last.end === cue.start) {
      last.end = cue.end;
    } else {
      cleanedResult.push({ ...cue });
    }
  }
  
  return cleanedResult;
}
function toSec(timeStr: string): number {
  if (!timeStr) return 0;
  
  // 處理逗號或點作為小數點分隔符
  timeStr = timeStr.trim().replace(',', '.');
  
  // 匹配 hh:mm:ss.mmm 或 mm:ss.mmm 或 ss.mmm
  const timeParts = timeStr.split(':');
  
  let seconds = 0;
  
  if (timeParts.length === 3) {
    // 格式: hh:mm:ss.mmm
    seconds += parseInt(timeParts[0], 10) * 3600; // 小時
    seconds += parseInt(timeParts[1], 10) * 60;   // 分鐘
    seconds += parseFloat(timeParts[2]);          // 秒 + 毫秒
  } else if (timeParts.length === 2) {
    // 格式: mm:ss.mmm
    seconds += parseInt(timeParts[0], 10) * 60;   // 分鐘
    seconds += parseFloat(timeParts[1]);          // 秒 + 毫秒
  } else if (timeParts.length === 1) {
    // 格式: ss.mmm
    seconds = parseFloat(timeParts[0]);
  }
  
  // 確保不會返回 NaN 或負數
  return isNaN(seconds) || seconds < 0 ? 0 : seconds;
}
