# yt-sentence-loop 專案規劃與架構文件

## 專案概述

yt-sentence-loop 是一個基於 Next.js 的 YouTube 逐句循環播放器，專為語言學習、聽力練習和深度視頻學習而設計。

### 核心功能
- 自動下載 YouTube 影片字幕（透過 yt-dlp）
- 逐句循環播放與導航
- 鍵盤快捷鍵控制
- 響應式 UI 設計（使用 Tailwind CSS）
- 支援人工字幕和自動生成字幕

## 技術架構

### 技術棧
- **前端框架**: Next.js 14.2.3 (App Router)
- **UI 框架**: React 18.2.0
- **樣式**: Tailwind CSS + PostCSS
- **語言**: TypeScript
- **字幕處理**: yt-dlp + 自定義 VTT 解析器
- **快取機制**: 本地文件系統快取

### 專案結構

```
yt-sentence-loop/
├── app/                          # Next.js App Router
│   ├── globals.css              # 全域樣式
│   ├── layout.tsx               # 根佈局組件
│   ├── page.tsx                 # 主頁面（YouTube 播放器界面）
│   └── api/
│       └── transcript/
│           └── route.ts         # 字幕 API 端點
├── lib/                         # 核心工具庫
│   ├── transcript.ts            # yt-dlp 字幕下載邏輯
│   ├── transcriptCache.ts       # 字幕快取管理
│   └── vtt.ts                   # VTT 格式解析器
├── .cache/                      # 字幕快取目錄
│   └── transcripts/
├── 配置文件
│   ├── package.json             # 依賴管理
│   ├── tsconfig.json            # TypeScript 配置
│   ├── tailwind.config.js       # Tailwind CSS 配置
│   └── postcss.config.js        # PostCSS 配置
└── README.md                    # 專案說明
```

## 核心模組設計

### 1. 前端播放器 ([`app/page.tsx`](app/page.tsx))

**主要功能：**
- YouTube IFrame API 整合
- 字幕逐句導航與循環
- 鍵盤快捷鍵支援
- 播放速度控制

**關鍵組件：**
- `Page` 組件：主要應用界面
- YouTube 播放器初始化和控制
- 字幕顯示和交互邏輯

**鍵盤快捷鍵：**
- `J/j`: 上一句
- `K/k`: 下一句  
- `L/l`: 切換循環模式
- `Space`: 播放/暫停
- `R/r`: 重播當前句子

### 2. 字幕 API ([`app/api/transcript/route.ts`](app/api/transcript/route.ts))

**端點：** `GET /api/transcript?videoId={id}&lang={lang}&forceRefresh={boolean}`

**功能流程：**
1. 檢查快取是否存在
2. 若無快取或強制刷新，調用 yt-dlp 下載字幕
3. 解析 VTT 格式字幕
4. 清理和處理字幕數據
5. 更新快取並返回結果

**回應格式：**
```json
{
  "videoId": "string",
  "cues": [
    {
      "start": "number (秒)",
      "end": "number (秒)", 
      "text": "string"
    }
  ],
  "source": "cache|yt-dlp",
  "timestamp": "ISO 8601"
}
```

### 3. 字幕下載模組 ([`lib/transcript.ts`](lib/transcript.ts))

**核心函數：** `getTranscriptByYtDlp(videoId: string, lang?: string)`

**處理流程：**
1. 檢查影片是否有可用字幕
2. 建立暫存目錄
3. 執行 yt-dlp 下載字幕
4. 多語言優先級處理
5. 錯誤處理和清理

**語言優先級：**
1. zh-TW (繁體中文)
2. zh-Hant (繁體中文)
3. zh (中文)
4. en (英文)
5. 其他可用語言

### 4. VTT 解析器 ([`lib/vtt.ts`](lib/vtt.ts))

**核心函數：** `parseVTT(vtt: string)`

**解析功能：**
- 時間戳記解析與驗證
- HTML 標籤清理
- 重複內容合併
- 時間軸正規化
- 文本清理和格式化

**處理策略：**
1. 按時間排序字幕條目
2. 合併重疊或連續時間段
3. 選擇最完整的文本內容
4. 清理重複和無效內容

### 5. 快取管理 ([`lib/transcriptCache.ts`](lib/transcriptCache.ts))

**快取位置：** `.cache/transcripts/{videoId}.json`

**快取策略：**
- 以 videoId 為鍵的 JSON 文件存儲
- 自動建立快取目錄
- 包含時間戳記的快取驗證
- 錯誤容錯機制

## 開發指南

### 本地開發環境設置

1. **前置需求：**
   ```bash
   # Node.js 18+ 
   # yt-dlp (必須在 PATH 中可用)
   # ffmpeg (可選，用於進階功能)
   ```

2. **安裝依賴：**
   ```bash
   pnpm install
   # 或
   npm install
   ```

3. **啟動開發伺服器：**
   ```bash
   pnpm dev
   # 或
   npm run dev
   ```

4. **存取應用：**
   ```
   http://localhost:3000
   ```

### 建置和部署

**建置指令：**
```bash
pnpm build
pnpm start
```

**部署注意事項：**
- Vercel 預設無法執行 yt-dlp
- 建議使用支援系統指令的平台：
  - Fly.io
  - Render
  - Railway
  - 自架 VPS
- 確保部署環境有 yt-dlp 可執行檔

## 功能擴展規劃

### 短期優化 (1-2 個月)

1. **UI/UX 改進**
   - 字幕文字大小調整
   - 深色模式支援
   - 進度條顯示
   - 載入狀態優化

2. **字幕功能增強**
   - 字幕搜尋功能
   - 書籤/收藏句子
   - 字幕匯出功能
   - 多語言字幕切換

3. **播放體驗優化**
   - 自動跳到下一個影片
   - 播放清單支援
   - 重複間隔設定
   - 鍵盤快捷鍵自定義

### 中期發展 (3-6 個月)

1. **ASR 整合**
   - Whisper API 整合
   - 本地 Whisper 模型
   - 無字幕影片轉錄
   - 字幕準確度改進

2. **使用者功能**
   - 使用者帳號系統
   - 學習進度追蹤
   - 個人化設定
   - 雲端同步

3. **語言學習功能**
   - 生詞標記
   - 發音練習
   - 語言檢測
   - 學習統計

### 長期願景 (6-12 個月)

1. **多平台支援**
   - PWA 支援
   - 行動應用
   - 桌面應用
   - 瀏覽器擴充功能

2. **AI 增強功能**
   - 智慧句子分割
   - 語法分析
   - 個人化推薦
   - 學習路徑規劃

3. **協作功能**
   - 字幕協作編輯
   - 社群分享
   - 學習群組
   - 教師管理介面

## 技術債務與改進

### 程式碼品質
- [ ] 增加單元測試覆蓋率
- [ ] 實作 E2E 測試
- [ ] 程式碼分割優化
- [ ] 錯誤邊界實作

### 效能優化
- [ ] 字幕預載機制
- [ ] 影片預載優化
- [ ] 記憶體使用優化
- [ ] 快取策略改進

### 安全性
- [ ] 輸入驗證強化
- [ ] XSS 防護
- [ ] CSRF 保護
- [ ] 速率限制

## 監控與維護

### 關鍵指標
- API 回應時間
- 字幕下載成功率
- 使用者停留時間
- 錯誤發生率

### 日誌策略
- 字幕下載日誌
- API 請求日誌
- 錯誤追蹤
- 效能監控

### 維護排程
- 每週快取清理
- 每月依賴更新
- 季度安全審查
- 年度架構檢視

## 參與貢獻

### 開發流程
1. Fork 專案
2. 建立功能分支
3. 提交變更並測試
4. 建立 Pull Request
5. 程式碼審查
6. 合併到主分支

### 程式碼規範
- TypeScript 強型別
- ESLint 規則遵循
- Prettier 格式化
- 有意義的提交訊息

---

*最後更新：2025-09-18*
*版本：1.0.0*