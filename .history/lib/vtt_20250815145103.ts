// 簡易 VTT 解析：轉 { start, end, text }
export function parseVTT(vtt: string) {
  const lines = vtt.replace(/\r\n/g, '\n').split('\n');
  const cues: { start: number; end: number; text: string }[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    // 支援 0:02.000 這種格式
    if (/^(\d{1,2}:)?\d{2}:\d{2}\.\d{3}\s+-->\s+(\d{1,2}:)?\d{2}:\d{2}\.\d{3}/.test(line) ||
        /^\d{1,2}:\d{2}\.\d{3}\s+-->\s+\d{1,2}:\d{2}\.\d{3}/.test(line)) {
      const [s, e] = line.split(/\s+-->\s+/);
      i++;
      // 只取第一行字幕，避免逐字細分重複
      let t = '';
      if (i < lines.length && lines[i].trim() !== '') {
        t = lines[i];
        t = t.replace(/<\d{1,2}:\d{2}:\d{2}\.\d{3}><c>.*?<\/c>/g, '');
        t = t.replace(/<c>.*?<\/c>/g, '');
        t = t.replace(/<[^>]+>/g, '');
        t = t.trim();
        i++;
      }
      const start = toSec(s);
      let end = toSec(e);
      // 若 end=0，則用 start+2 秒補齊
      if (!end || end <= start) end = start + 2;
      if (t) cues.push({ start, end, text: t });
      // 跳過剩餘空行
      while (i < lines.length && lines[i].trim() !== '') i++;
    }
    i++;
  }
  // 只保留同一時間區間 text 最長的那一句
  const merged: { [key: string]: { start: number; end: number; text: string } } = {};
  for (const c of cues) {
    const key = `${c.start}|${c.end}`;
    if (!merged[key] || c.text.length > merged[key].text.length) {
      merged[key] = { start: c.start, end: c.end, text: c.text };
    }
  }
  // 依時間排序
  return Object.values(merged).sort((a, b) => a.start - b.start);
}
function toSec(t: string) {
  // 支援 hh:mm:ss.mmm、mm:ss.mmm、m:ss.mmm、0:02.000
  const parts = t.split(':');
  let h = 0, m = 0, s = 0;
  if (parts.length === 3) {
    h = parseInt(parts[0]); m = parseInt(parts[1]); s = parseFloat(parts[2]);
  } else if (parts.length === 2) {
    m = parseInt(parts[0]); s = parseFloat(parts[1]);
  } else if (parts.length === 1) {
    s = parseFloat(parts[0]);
  }
  return h * 3600 + m * 60 + s;
}
