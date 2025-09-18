import { spawn } from 'child_process';
import fs from 'fs/promises';
import path from 'path';
import os from 'os';
import { parseVTT } from './vtt';

export async function getTranscriptByYtDlp(videoId: string, lang = 'en,*') {
  const workdir = await fs.mkdtemp(path.join(os.tmpdir(), 'yt-vtt-'));
  const url = `https://www.youtube.com/watch?v=${videoId}`;

  try {
    // 優先作者字幕，否則自動字幕；輸出成    // 首先檢查是否有可用的字幕
    const listArgs = [
      '--list-subs',
      '--skip-download',
      url
    ];
    
    console.log('Checking available subtitles...');
    const listProcess = spawn('yt-dlp', listArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
    
    let hasSubtitles = false;
    let output = '';
    
    for await (const data of listProcess.stdout) {
      const text = data.toString();
      output += text;
      // 檢查是否有可用的字幕（包括自動字幕和人工字幕）
      if (text.includes('Available subtitles for') ||
          text.includes('Available automatic captions') ||
          text.match(/\w+\s+\w+\s+[\w-]+/)) {
        hasSubtitles = true;
      }
    }
    
    // 等待進程完成
    await new Promise((resolve, reject) => {
      listProcess.on('close', (code) => {
        if (code === 0) resolve(code);
        else reject(new Error(`yt-dlp list-subs failed with code ${code}`));
      });
    });
    
    if (!hasSubtitles) {
      console.log('No subtitles available for this video. Output:', output);
      throw new Error('No subtitles available for this video. The video may not have subtitles enabled.');
    }
    
    console.log('Subtitles available, proceeding with download...');
    
    // 下載字幕的參數，添加速率限制和重試機制
    const args = [
      url,
      '--skip-download',
      '--sub-lang', 'en,zh-TW,zh-Hant,zh,en-US,en-UK,en-GB,en-CA,en-AU,en-NZ,en-IE,en-ZA,en-JM,en-BZ,en-TT,zh-Hans,zh-CN,zh-SG,zh-HK,zh-MO,zh-TW',
      '--write-sub',
      '--write-auto-sub',
      '--sub-format', 'vtt',
      '--convert-subs', 'vtt',
      '-o', path.join(workdir, '%(id)s.%(ext)s'),
      '--no-warnings',
      '--no-check-certificate',
      '--ignore-errors',
      '--no-call-home',
      '--no-progress',
      '--sleep-interval', '1',
      '--max-sleep-interval', '5',
      '--retries', '3',
      '--extractor-retries', '3',
      '--user-agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
    ];
    
    console.log('Running yt-dlp with args:', args.join(' '));

    console.log(`Downloading subtitles for video: ${videoId}`);
    await run('yt-dlp', args);

    // 找出所有可能的字幕文件
    const files = await fs.readdir(workdir);
    console.log('All files in temp directory:', files);
    
    // 嘗試查找任何字幕文件
    const subtitleExtensions = ['.vtt', '.srt', '.ass', '.ssa', '.vtt.yt-dlp', '.srt.yt-dlp'];
    const subtitleFiles = files.filter(f => 
      subtitleExtensions.some(ext => f.endsWith(ext))
    );
    
    if (subtitleFiles.length === 0) {
      console.error('No subtitle files found in:', workdir);
      console.log('Available files:', files);
      
      // 嘗試獲取視頻信息以提供更好的錯誤信息
      const infoArgs = [
        '--skip-download',
        '--dump-json',
        '--no-warnings',
        url
      ];
      
      try {
        const infoOutput = await new Promise<string>((resolve, reject) => {
          const infoProcess = spawn('yt-dlp', infoArgs, { stdio: ['ignore', 'pipe', 'pipe'] });
          let output = '';
          infoProcess.stdout.on('data', (data) => output += data.toString());
          infoProcess.stderr.on('data', (data) => console.error('yt-dlp stderr:', data.toString()));
          infoProcess.on('close', (code) => {
            if (code === 0) resolve(output);
            else reject(new Error(`yt-dlp info failed with code ${code}`));
          });
        });
        
        const videoInfo = JSON.parse(infoOutput);
        console.log('Video info:', {
          title: videoInfo.title,
          duration: videoInfo.duration,
          uploader: videoInfo.uploader,
          is_live: videoInfo.is_live
        });
        
        // 檢查是否是直播或即將直播的視頻
        if (videoInfo.is_live || videoInfo.live_status === 'is_upcoming') {
          throw new Error('This is a live or upcoming stream. Subtitles are typically not available for live content.');
        }
        
        // 檢查視頻時長
        if (videoInfo.duration < 30) {
          throw new Error('This video is very short. Subtitles may not be available for very short videos.');
        }
        
        // 檢查視頻是否被下架或私密
        if (videoInfo.availability === 'private' || videoInfo.availability === 'unlisted') {
          throw new Error('This video is private or unlisted. Subtitles may not be available.');
        }
        
      } catch (error) {
        console.error('Error getting video info:', error);
        // 繼續使用通用錯誤信息
      }
      
      throw new Error(`No subtitles available for this video. The video may not have subtitles enabled or they may be restricted.`);
    }
    
    console.log('Found subtitle files:', subtitleFiles);
    const vtts = subtitleFiles;  // 使用找到的所有字幕文件

    // 按語言優先級排序
    vtts.sort((a, b) => {
      const langOrder = ['zh-TW', 'zh-Hant', 'zh', 'en', 'a.*'];
      const aLang = a.split('.')[1] || '';
      const bLang = b.split('.')[1] || '';
      return langOrder.indexOf(aLang) - langOrder.indexOf(bLang);
    });

    // 讀取第一個可用的 VTT 文件
    const file = path.join(workdir, vtts[0]);
    console.log(`Using subtitle file: ${file}`);
    
    const text = await fs.readFile(file, 'utf8');
    
    // 清理 VTT 內容
    const cleanedText = text
      .replace(/^WEBVTT.*\n\n/, '')  // 移除 WEBVTT 標頭
      .replace(/\r\n/g, '\n')       // 統一換行符
      .replace(/\r/g, '\n')
      .replace(/^\s+/, '')           // 移除開頭空白
      .replace(/\s+$/, '');          // 移除結尾空白

    console.log('VTT content length:', cleanedText.length);
    
    // 解析 VTT 內容
    const cues = parseVTT(cleanedText);
    
    if (cues.length === 0) {
      console.warn('No cues found in VTT content');
    } else {
      console.log(`Parsed ${cues.length} cues from VTT`);
    }
    
    return cleanedText;  // 返回原始 VTT 內容，由 parseVTT 處理
    
  } catch (error) {
    console.error('Error in getTranscriptByYtDlp:', error);
    throw error;
    
  } finally {
    // 清理暫存目錄
    try {
      await fs.rm(workdir, { recursive: true, force: true });
    } catch (error) {
      console.warn('Failed to clean up temp directory:', error);
    }
  }
}
async function run(cmd: string, args: string[]) {
  return new Promise<void>((resolve, reject) => {
    const p = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'] });
    
    let stdout = '';
    let stderr = '';
    
    p.stdout?.on('data', (data) => {
      const text = data.toString();
      stdout += text;
      console.log(text);
    });
    
    p.stderr?.on('data', (data) => {
      const text = data.toString();
      stderr += text;
      console.error(text);
    });
    
    p.on('error', reject);
    p.on('exit', (code) => {
      if (code === 0) {
        resolve();
      } else {
        reject(new Error(`${cmd} exit ${code}. stderr: ${stderr}`));
      }
    });
  });
}
