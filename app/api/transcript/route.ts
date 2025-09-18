import { NextRequest, NextResponse } from 'next/server';
import { getTranscriptByYtDlp } from '@/lib/transcript';
import { getOrCreateTranscript } from '@/lib/transcriptCache';
import { parseVTT } from '@/lib/vtt';

// Helper function to convert cues to VTT format
function cuesToVTT(cues: Array<{ start: number; end: number; text: string }>): string {
  let vtt = 'WEBVTT\n\n';
  
  cues.forEach((cue, index) => {
    vtt += `${index + 1}\n`;
    vtt += `${formatTime(cue.start)} --> ${formatTime(cue.end)}\n`;
    vtt += `${cue.text}\n\n`;
  });
  
  return vtt;
}

// Helper function to format time in VTT format (HH:MM:SS.mmm)
function formatTime(seconds: number): string {
  const date = new Date(0);
  date.setSeconds(seconds);
  return date.toISOString().substr(11, 12).replace('.', ',');
}

export const dynamic = 'force-dynamic';

// 驗證 YouTube 影片 ID
function validateVideoId(videoId: string): boolean {
  if (!videoId || typeof videoId !== 'string') {
    return false;
  }
  
  // YouTube 影片 ID 必須是 11 個字符，只能包含字母、數字、底線和破折號
  return /^[a-zA-Z0-9_-]{11}$/.test(videoId);
}

// 清理和驗證語言參數
function validateLangParam(lang: string | null): string {
  if (!lang) return 'zh-TW,zh,en';
  
  // 只允許特定的語言代碼格式
  const validLangPattern = /^[a-zA-Z]{2}(-[a-zA-Z]{2,4})?(,[a-zA-Z]{2}(-[a-zA-Z]{2,4})?)*$/;
  
  if (!validLangPattern.test(lang)) {
    return 'zh-TW,zh,en'; // 回退到預設值
  }
  
  return lang;
}

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get('videoId');
  const langParam = req.nextUrl.searchParams.get('lang');
  const forceRefreshParam = req.nextUrl.searchParams.get('forceRefresh');
  
  // 驗證必要參數
  if (!videoId) {
    return NextResponse.json({
      error: 'missing videoId',
      message: 'videoId parameter is required'
    }, { status: 400 });
  }

  // 驗證影片 ID 格式
  if (!validateVideoId(videoId)) {
    return NextResponse.json({
      error: 'invalid videoId',
      message: 'videoId must be a valid 11-character YouTube video ID'
    }, { status: 400 });
  }

  // 驗證和清理語言參數
  const lang = validateLangParam(langParam);
  
  // 驗證 forceRefresh 參數
  const forceRefresh = forceRefreshParam !== 'false';

  try {
    // 強制刷新或使用快取
    if (!forceRefresh) {
      try {
        // 先嘗試從快取讀取
        const cached = await getOrCreateTranscript(videoId, '');
        if (cached) {
          return NextResponse.json({
            ...cached,
            source: 'cache',
            timestamp: new Date().toISOString()
          });
        }
      } catch (error) {
        console.warn('Cache read failed, falling back to fresh fetch:', error);
      }
    }

    // 從 YouTube 獲取新的字幕
    console.log(`Fetching subtitles for video: ${videoId}`);
    
    try {
      const vttContent = await getTranscriptByYtDlp(videoId, String(lang));
      
      if (!vttContent) {
        console.error('No subtitle content returned from getTranscriptByYtDlp');
        return NextResponse.json({ 
          error: 'No subtitles available',
          message: 'This video may not have subtitles or they may be disabled.'
        }, { status: 404 });
      }
      
      console.log('Successfully fetched VTT content, length:', vttContent.length);
      
      // 解析 VTT 內容
      console.log('Parsing VTT content...');
      const cues = parseVTT(vttContent);
      
      if (!cues || cues.length === 0) {
        console.error('No cues found in VTT content');
        return NextResponse.json({ 
          error: 'No subtitles found',
          message: 'The video appears to have subtitles but they could not be parsed.'
        }, { status: 400 });
      }

      console.log(`Successfully parsed ${cues.length} cues`);
      
      // 處理並快取字幕
      console.log('Caching transcript...');
      const result = await getOrCreateTranscript(videoId, vttContent);
      console.log('Transcript cached successfully');
      
      return NextResponse.json({
        ...result,
        source: 'yt-dlp',
        timestamp: new Date().toISOString()
      });
      
    } catch (error) {
      console.error('Error processing transcript:', error);
      return NextResponse.json(
        { 
          error: 'Failed to process transcript',
          details: error instanceof Error ? error.message : 'Unknown error occurred'
        },
        { status: 500 }
      );
    }

  } catch (e: any) {
    console.error('Transcript error:', e);
    return NextResponse.json(
      { error: e?.message || 'Failed to process transcript' },
      { status: 500 }
    );
  }
}
