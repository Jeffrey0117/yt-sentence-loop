import { NextRequest, NextResponse } from 'next/server';
import { getTranscriptByYtDlp } from '@/lib/transcript';
export const dynamic = 'force-dynamic'; // 需要即時（避免快取）
export async function GET(req: NextRequest) {
  const videoId = req.nextUrl.searchParams.get('videoId');
  const lang = req.nextUrl.searchParams.get('lang') || 'zh-TW,zh,en'; // 多語言優先順序，避免 *
  if (!videoId) return NextResponse.json({ error: 'missing videoId' }, { status: 400 });
  try {
    const cues = await getTranscriptByYtDlp(videoId, String(lang));
    if (!cues || cues.length === 0) return NextResponse.json({ error: 'no subtitles' }, { status: 404 });
    return NextResponse.json({ cues, source: 'yt-dlp' });
  } catch (e: any) {
    return NextResponse.json({ error: e?.message || 'failed' }, { status: 500 });
  }
}
