// XSS 防護工具
export function sanitizeHtml(input: string): string {
  // 移除潛在的 HTML 標籤和腳本
  return input
    .replace(/<script\b[^<]*(?:(?!<\/script>)<[^<]*)*<\/script>/gi, '')
    .replace(/<[^>]*>/g, '')
    .replace(/javascript:/gi, '')
    .replace(/on\w+=/gi, '')
    .trim()
}

// 驗證並清理 YouTube URL
export function sanitizeYouTubeUrl(url: string): string {
  try {
    const parsedUrl = new URL(url)
    
    // 只允許 YouTube 域名
    const allowedHosts = ['youtube.com', 'www.youtube.com', 'youtu.be', 'm.youtube.com']
    if (!allowedHosts.includes(parsedUrl.hostname)) {
      throw new Error('Invalid YouTube domain')
    }
    
    // 清理查詢參數，只保留必要的
    const videoId = parsedUrl.searchParams.get('v') || parsedUrl.pathname.slice(1)
    return videoId
  } catch {
    throw new Error('Invalid YouTube URL')
  }
}

// CSRF 令牌生成
export function generateCSRFToken(): string {
  return crypto.randomUUID()
}

// 驗證 CSRF 令牌
export function validateCSRFToken(token: string, expectedToken: string): boolean {
  return token === expectedToken && token.length > 0
}

// 安全的本地存儲操作
export const secureStorage = {
  setItem: (key: string, value: any) => {
    try {
      const sanitizedKey = sanitizeHtml(key)
      const sanitizedValue = typeof value === 'string' ? sanitizeHtml(value) : value
      localStorage.setItem(sanitizedKey, JSON.stringify(sanitizedValue))
    } catch (error) {
      console.error('Storage error:', error)
    }
  },
  
  getItem: (key: string) => {
    try {
      const sanitizedKey = sanitizeHtml(key)
      const item = localStorage.getItem(sanitizedKey)
      return item ? JSON.parse(item) : null
    } catch (error) {
      console.error('Storage error:', error)
      return null
    }
  },
  
  removeItem: (key: string) => {
    try {
      const sanitizedKey = sanitizeHtml(key)
      localStorage.removeItem(sanitizedKey)
    } catch (error) {
      console.error('Storage error:', error)
    }
  }
}