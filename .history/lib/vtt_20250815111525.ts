// 簡易 VTT 解析：轉 { start, end, text }
export function parseVTT(vtt: string) {
  const lines = vtt.replace(/\r\n/g, '\n').split('\n');
  const cues: { start: number; end: number; text: string }[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i].trim();
    // 找到時間軸行：00:00:01.000 --> 00:00:03.000
    if (/^\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}/.test(line) ||
        /^\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}\.\d{3}/.test(line)) {
      const [s, e] = line.split(/\s+-->\s+/);
      i++;
      const texts: string[] = [];
      while (i < lines.length && lines[i].trim() !== '') {
        texts.push(lines[i]);
        i++;
      }
      const text = texts.join(' ').replace(/<[^>]+>/g, '').trim();
      if (text) cues.push({ start: toSec(s), end: toSec(e), text });
    }
    i++;
  }
  return cues;
}
function toSec(t: string) {
  // 支援 mm:ss.mmm 或 hh:mm:ss.mmm
  const parts = t.split(':');
  let h = 0, m = 0; let s = 0;
  if (parts.length === 3) {
    h = parseInt(parts[0]); m = parseInt(parts[1]); s = parseFloat(parts[2]);
  } else if (parts.length === 2) {
    m = parseInt(parts[0]); s = parseFloat(parts[1]);
  }
  return h*3600 + m*60 + s;
}
