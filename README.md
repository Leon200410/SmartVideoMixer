# SmartVideoMixer - AI 视频混剪助手

基于 AI 的智能视频混剪 Web 应用，自动分析视频片段质量并生成精彩短视频。

## ✨ 功能特性

- 🎬 **模板驱动的智能切分**：先选模板，再按模板的节奏参数（片段时长范围）做场景检测切分
- 🤖 **AI 评分**：使用 Volcengine Ark 视觉模型评估片段精彩度
- 🎨 **多模板支持**（高光混剪 / 悬念引流 / 电影质感 / Vlog 日常），每个模板自带**风格示例视频**
- 🎵 **背景音乐**：模板配套 BGM 自动混音（占位音乐启动时自动合成，可替换为真实音乐文件）
- 📱 **格式可选**：支持竖屏 9:16（抖音/快手）和横屏 16:9（B站/YouTube）
- 🗂 **生成历史**：所有生成记录入库（SQLite），随时回看、下载
- ☁️ **Cloudflare R2 存储**：启用后上传/片段/成品自动同步 R2，本地只是处理缓存
- 🎯 **缩略图预览**：每个片段自动生成缩略图
- 🖱️ **拖拽排序**：拖动片段卡片手动调整拼接顺序
- ⚡ **实时进度**：上传和生成过程实时反馈

## 🏗️ 技术栈

### 后端
- Node.js (≥ 23.4) + Express + TypeScript
- SQLite（内置 `node:sqlite`，零原生依赖）
- FFmpeg (视频处理)
- Volcengine Ark AI (视觉分析)
- Cloudflare R2 / S3 SDK (对象存储，可选)
- Multer (文件上传)

### 前端
- React 18 + TypeScript
- React Router (多页面路由)
- Zustand (全局状态)
- Vite (构建工具)
- TailwindCSS (样式)
- Axios (HTTP 客户端)
- Lucide React (图标)

### 部署
- Docker + Docker Compose

## 📦 快速开始

### 前置要求

- Node.js 23.4+（数据库使用内置 `node:sqlite` 模块）
- FFmpeg 4.3+（本地开发需要；优先使用系统 PATH 中的 ffmpeg，旧版缺少 xfade 转场滤镜）
- Docker & Docker Compose (容器化部署)
- Volcengine Ark API Key

### 1. 克隆项目

```bash
git clone <repository-url>
cd SmartVideoMixer
```

### 2. 配置环境变量

```bash
cd backend
cp .env.example .env
```

编辑 `.env` 文件，填入你的 Ark API Key；Jamendo 可选：

```env
ARK_API_KEY=your_actual_api_key_here
ARK_MODEL=doubao-seed-2-0-mini-260428
JAMENDO_CLIENT_ID=your_jamendo_client_id_here
PORT=8000
```

### 3. 本地开发

#### 后端

```bash
cd backend
npm install
npm run dev
```

后端将在 `http://localhost:8000` 启动

#### 前端

```bash
cd frontend
npm install
npm run dev
```

前端将在 `http://localhost:3000` 启动

### 4. Docker 部署（推荐）

确保 `.env` 文件配置正确，然后：

```bash
# 构建并启动所有服务
docker-compose up -d

# 查看日志
docker-compose logs -f

# 停止服务
docker-compose down
```

访问 `http://localhost:3000` 使用应用

## 📁 项目结构

```
SmartVideoMixer/
├── backend/                    # 后端服务
│   ├── src/
│   │   ├── routes/            # API 路由
│   │   │   ├── upload.ts      # 上传 / 视频详情 / 按模板拆分
│   │   │   ├── generate.ts    # 生成视频 + 模板列表/示例
│   │   │   ├── history.ts     # 生成历史
│   │   │   └── download.ts    # 下载/预览/缩略图（本地缺失自动 302 到 R2）
│   │   ├── services/          # 业务逻辑
│   │   │   ├── videoSplitter.ts      # 场景检测切分
│   │   │   ├── aiAnalyzer.ts         # AI 评分
│   │   │   ├── ffmpegUtils.ts        # FFmpeg 工具（xfade/acrossfade 拼接）
│   │   │   ├── storage.ts            # 存储门面（本地缓存 + R2 持久层）
│   │   │   ├── r2Storage.ts          # R2 客户端
│   │   │   ├── musicLibrary.ts       # 占位背景音乐合成
│   │   │   ├── sampleGenerator.ts    # 模板示例视频生成
│   │   │   └── fontResolver.ts       # drawtext 字体解析
│   │   ├── templates/         # 模板系统（配置驱动）
│   │   │   ├── configs/       # highlights/suspense/cinematic/vlog.json
│   │   │   ├── engine.ts      # 片段选择/滤镜/转场
│   │   │   └── generator.ts   # 模板 → 成片
│   │   ├── db.ts              # SQLite 持久层（videos/segments/generations）
│   │   ├── config.ts          # 配置
│   │   ├── types.ts           # 类型定义
│   │   └── index.ts           # 入口文件
│   ├── assets/fonts/          # 字体文件（中文字幕）
│   ├── assets/music/          # 背景音乐（缺失时启动自动合成占位曲）
│   ├── assets/samples/        # 模板示例视频（启动自动生成）
│   ├── data/                  # SQLite 数据库
│   ├── uploads/               # 上传文件（R2 模式下为缓存）
│   ├── segments/              # 切分片段（R2 模式下为缓存）
│   ├── results/               # 生成结果（R2 模式下为缓存）
│   └── temp/                  # 临时文件
├── frontend/                  # 前端应用
│   ├── src/
│   │   ├── pages/             # 路由页面
│   │   │   ├── UploadPage.tsx     # / 上传
│   │   │   ├── TemplatePage.tsx   # /video/:id/template 选模板+拆分
│   │   │   ├── EditPage.tsx       # /video/:id/edit 排序+格式+生成
│   │   │   ├── ResultPage.tsx     # /result/:genId 结果
│   │   │   └── HistoryPage.tsx    # /history 历史
│   │   ├── layouts/AppLayout.tsx  # 导航 + 步骤指示
│   │   ├── components/        # React 组件
│   │   ├── store/useAppStore.ts   # Zustand 全局状态
│   │   ├── utils/api.ts       # API 调用
│   │   ├── types/index.ts     # 类型定义
│   │   ├── App.tsx            # 路由定义
│   │   └── main.tsx           # 入口
│   └── nginx.conf             # Nginx 配置
├── docker-compose.yml         # Docker Compose 配置
└── README.md                  # 项目文档
```

## 🔑 API 端点

### POST /api/upload
仅存储视频（本地 + R2）并返回元数据，**不再在上传时切分**

**请求**：
- `multipart/form-data`
- `video`: 视频文件（MP4/MOV/AVI，≤200MB，≤10分钟）

**响应**：
```json
{
  "videoId": "uuid",
  "originalName": "my.mp4",
  "duration": 120.5,
  "width": 1920,
  "height": 1080,
  "previewUrl": "https://r2.../uploads/uuid.mp4",
  "thumbnailUrl": "https://r2.../thumbnails/uuid_thumb.jpg"
}
```

### POST /api/video/:videoId/split
按所选模板的片段时长参数切分 + Ark 评分（重复调用会替换上次拆分）

**请求**：`{ "templateId": "highlights" }`

**响应**：
```json
{
  "videoId": "uuid",
  "templateId": "highlights",
  "segments": [
    {
      "id": "seg_xxx",
      "start": 0,
      "end": 5.2,
      "duration": 5.2,
      "thumbnailUrl": "...",
      "geminiScore": 8.3,
      "geminiReason": "Great composition and lighting"
    }
  ]
}
```

### GET /api/video/:videoId
视频详情 + 当前片段列表（重启后仍可用，读 SQLite）

### GET /api/templates
模板列表（含 `sampleUrl` 风格示例视频地址）

### GET /api/templates/:id/sample
模板示例视频（启动时自动生成）

### POST /api/generate
生成最终视频，并写入生成历史

**请求**：
```json
{
  "videoId": "uuid",
  "template": "highlights",
  "aspectRatio": "9:16" | "16:9",
  "segmentOrder": ["seg1", "seg2"]  // 可选，拖拽排序后传入
}
```

**响应**：
```json
{
  "generationId": "uuid",
  "status": "completed",
  "videoUrl": "https://r2.../results/highlights_xxx.mp4",
  "streamUrl": "...",
  "thumbnailUrl": "...",
  "duration": 25.6,
  "title": "高光混剪",
  "aspectRatio": "9:16"
}
```

### GET /api/history
生成历史列表（最新在前，含 processing/failed 状态）

### GET /api/history/:id
单条生成记录

### GET /api/download/:filename · GET /api/stream/:filename · GET /api/thumbnail/:filename
本地文件服务；启用 R2 且本地缓存已清理时自动 302 重定向到 R2

## ⚙️ 配置说明

### 视频限制
- 最大文件大小：200MB
- 最大时长：10分钟
- 支持格式：MP4, MOV, AVI

### AI 模型
默认使用 `doubao-seed-2-0-mini-260428`，可在 `.env` 中修改：
- `ARK_MODEL`：火山引擎 Ark 模型名
- `ARK_BASE_URL`：Ark Responses API 基础地址，默认 `https://ark.cn-beijing.volces.com/api/v3`

使用自定义 Ark 网关时，在 `.env` 中额外配置基础地址：
```env
ARK_BASE_URL=https://your-ark-compatible-endpoint.example.com/api/v3
```

### 场景检测
在 `backend/src/config.ts` 中调整：
```typescript
video: {
  minSegmentDuration: 5,        // 最小片段时长（秒）
  maxSegmentDuration: 8,        // 最大片段时长（秒）
  sceneDetectionThreshold: 0.3  // 场景变化阈值 (0-1)
}
```

### 文件清理
自动清理超过 2 小时的临时文件（可配置）

## 🎯 使用流程

1. **上传视频**：拖拽或选择视频文件，上传后可在页面中预览原片
2. **选择模板**：每个模板卡片带风格示例视频；不同模板的拆分节奏不同
3. **开始拆分**：按模板参数场景检测切分 + Ark 逐段评分
4. **调整片段 & 格式**：拖拽排序、选择竖屏 9:16 或 横屏 16:9
5. **生成视频**：等待 AI 生成（自动混入模板背景音乐）
6. **预览下载**：在线预览或下载；所有结果保存在「历史记录」中

## 🐛 常见问题

### 1. FFmpeg 相关错误
确保系统已安装 FFmpeg：
```bash
# macOS
brew install ffmpeg

# Ubuntu/Debian
apt-get install ffmpeg

# Windows
# 从 https://ffmpeg.org/download.html 下载
```

### 2. Ark API 错误
- 检查 API Key 是否正确
- 确认 API 配额是否充足
- 确认 `ARK_MODEL` 是否已开通

### 3. 中文字幕不显示
Docker 镜像已内置 Noto CJK 字体，容器部署无需任何配置。

仅本地开发（不用 Docker）时需要提供中文字体，任选其一：
- 下载字体放到 `backend/assets/fonts/NotoSansSC-Regular.ttf`：
  ```bash
  cd backend/assets/fonts
  wget https://github.com/googlefonts/noto-cjk/raw/main/Sans/OTF/SimplifiedChinese/NotoSansSC-Regular.otf
  mv NotoSansSC-Regular.otf NotoSansSC-Regular.ttf
  ```
- 或设置环境变量 `FONT_PATH` 指向系统中任意支持中文的字体文件。

### 4. 内存不足
减少并发 API 调用数量，在 `backend/src/routes/upload.ts` 中修改：
```typescript
const scores = await scoreSegments(
  segments.map((s) => s.path),
  2  // 降低并发数（默认为 3）
);
```

## 📊 性能优化建议

1. **减少 API 调用**：每个片段抽 2 帧评分（中间帧 + 随机帧），如需降低成本可改为只抽 1 帧
2. **并发控制**：限制同时处理的视频数量
3. **使用缓存**：Redis 缓存视频元数据
4. **CDN 加速**：使用 Cloudflare R2 存储结果视频
5. **队列系统**：使用 Bull 处理长任务

## 💾 存储与数据

- **SQLite**（`backend/data/app.db`）：视频、片段、生成历史三张表，服务重启不丢数据
- **本地目录**（uploads/segments/results）：FFmpeg 的工作缓存
- **R2 启用时**：所有文件镜像到 R2，浏览器直接走 R2 公网 URL；本地缓存被定时清理或重启丢失后，会自动从 R2 拉回继续工作（生成时下载素材、下载接口 302 重定向）
- **R2 关闭时**：results/uploads/segments 不参与定时清理（它们是唯一副本），仅清理 temp
- **背景音乐**：`assets/music/*.mp3` 缺失时启动自动合成占位曲，放入真实音乐文件即可替换
- **模板示例**：`assets/samples/<templateId>.mp4` 缺失时启动自动生成，可放自己的示例覆盖

## 🚀 生产部署

### 使用 Cloudflare R2（可选）

编辑 `.env`：
```env
R2_ENABLED=true
R2_ENDPOINT=https://<account-id>.r2.cloudflarestorage.com
R2_ACCESS_KEY_ID=your_key
R2_SECRET_ACCESS_KEY=your_secret
R2_BUCKET_NAME=smart-video-mixer
R2_PUBLIC_URL=https://your-r2-domain.com
```

> ⚠️ `R2_PUBLIC_URL` 需要开启桶的公开访问（或绑定自定义域）；不设置该值时，文件通过后端 302 签名 URL 访问。
> ⚠️ 切勿把含真实密钥的 `.env` 提交进 git（已在 .gitignore 中）。

### 环境变量
生产环境建议设置：
```env
NODE_ENV=production
CLEANUP_INTERVAL_HOURS=1
MAX_FILE_AGE_HOURS=1
```

## 📝 License

MIT

## 🤝 贡献

欢迎提交 Issue 和 Pull Request！

## 📮 联系

如有问题，请提交 Issue 或联系开发团队。

---

**Powered by Volcengine Ark & FFmpeg** 🎬✨
