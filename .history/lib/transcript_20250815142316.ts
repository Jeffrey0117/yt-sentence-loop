import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { parseVTT } from './vtt';
export async function getTranscriptByYtDlp(videoId: string, lang = 'en,*') {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-vtt-'));
  const url = `https://www.youtube.com/watch?v=${videoId}`;
  // 優先作者字幕，否則自動字幕；輸出成 vtt 檔
  const args = [
    url,
    '--skip-download',
    `--sub-lang`, lang,
    '--write-sub',
    '--write-auto-sub',
    '--sub-format', 'vtt',
    '-o', path.join(workdir, '%(id)s.%(ext)s')
  ];
  await run('yt-dlp', args);
  // 找出 vtt 檔（可能有多語言，只取一個優先）
  const files = await fs.readdir(workdir);
  const vtts = files.filter(f => f.endsWith('.vtt'));
  if (vtts.length === 0) throw new Error('no vtt');
  // 簡單挑一個（你可改成優先 zh-TW > en > *）
  const file = path.join(workdir, vtts[0]);
  const text = await fs.readFile(file, 'utf8');
  console.log('VTT內容：', text);
  const cues = parseVTT(text);
  // 清理暫存
  try { await fs.rm(workdir, { recursive: true, force: true }); } catch {}
  return cues;
}
async function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: 'inherit' });
    p.on('error', reject);
    p.on('exit', (code) => {
      if (code === 0) resolve(); else reject(new Error(`${cmd} exit ${code}`));
    });
  });
}
