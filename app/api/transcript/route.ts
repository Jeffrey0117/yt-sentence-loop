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

export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get('videoId');
  const lang = req.nextUrl.searchParams.get('lang') || 'zh-TW,zh,en';
  // 預設強制刷新快取
  const forceRefresh = req.nextUrl.searchParams.get('forceRefresh') !== 'false';

  if (!videoId) {
    return NextResponse.json({ error: 'missing videoId' }, { status: 400 });
  }

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
