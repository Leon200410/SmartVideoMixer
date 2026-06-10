# SmartVideoMixer - 模板系统使用指南

## ✅ 系统状态

### 已完成的功能

1. **配置驱动的模板系统** ✅
   - 模板配置文件（JSON）
   - 模板注册表和引擎
   - 动态加载模板

2. **4个风格明显的模板** ✅
   - 高光混剪（经典款）
   - 悬念引流（涨粉款）
   - 电影质感（高级感）
   - Vlog日常（轻松款）

3. **后端 API** ✅
   - GET `/api/templates` - 获取模板列表
   - POST `/api/generate` - 使用模板生成视频
   - 支持转场、滤镜、音乐等配置

4. **前端集成** ✅
   - 动态加载模板列表
   - 模板选择器组件
   - 支持任意数量模板

### 测试结果

```bash
# 后端编译
✅ backend: npm run build

# 前端编译  
✅ frontend: npm run build

# 后端启动
✅ Server running at http://localhost:8000
✅ Templates loaded: cinematic, highlights, suspense, vlog

# API 测试
✅ GET /api/templates 返回4个模板
```

## 🚀 快速开始

### 1. 启动服务

```bash
# 终端1：启动后端
cd backend
npm run dev

# 终端2：启动前端
cd frontend
npm run dev
```

### 2. 访问应用

打开浏览器访问：`http://localhost:5173`

### 3. 测试流程

1. **上传视频**
   - 点击上传区域
   - 选择一个视频文件（MP4格式，小于200MB）
   - 等待系统自动切分片段

2. **查看片段**
   - 系统显示所有切分的片段
   - 每个片段有缩略图、时长、AI评分
   - 可以拖拽调整片段顺序

3. **选择模板**
   - 看到4个模板卡片：
     - 🔥 高光混剪 - 经典款
     - ⚡ 悬念引流 - 涨粉款
     - 🎬 电影质感 - 高级感
     - 📹 Vlog日常 - 轻松款
   - 点击选择一个模板

4. **生成视频**
   - 选择宽高比（9:16 竖屏或 16:9 横屏）
   - 点击"生成视频"按钮
   - 等待处理（通常10-60秒）

5. **预览和下载**
   - 查看生成的视频预览
   - 点击下载按钮保存到本地
   - 可以点击"再剪一条"重新开始

## 📝 模板详解

### 模板1：高光混剪（highlights）

**特点：**
- 自动选择评分最高的4-6个片段
- 快节奏拼接，0.3秒淡入淡出转场
- 鲜艳滤镜（饱和度+20%，对比度+15%）
- 配备节奏感强的背景音乐
- 有片头标题"🔥 精彩集锦"

**适用场景：**
- 运动视频精彩瞬间
- 游戏高光时刻
- 活动精彩集锦

**配置文件：** `backend/src/templates/configs/highlights.json`

### 模板2：悬念引流（suspense）

**特点：**
- 选择开头+最佳+结尾3个片段
- AI自动生成悬念标题叠加在画面中央
- 电影感滤镜（对比度+20%）
- 戏剧性背景音乐
- 片尾2秒"关注我获取更多精彩"

**适用场景：**
- 抖音/快手引流视频
- 故事性内容预告
- 悬念吊胃口剪辑

**配置文件：** `backend/src/templates/configs/suspense.json`

### 模板3：电影质感（cinematic）

**特点：**
- 选择评分最高的4个片段，每段4-12秒
- 慢节奏，1秒长淡入淡出转场
- 电影级调色（低饱和度-15%，高对比度+25%）
- 环境音乐背景
- 片头有简洁图标

**适用场景：**
- 风景延时摄影
- 情感表达视频
- 艺术类短片

**配置文件：** `backend/src/templates/configs/cinematic.json`

### 模板4：Vlog日常（vlog）

**特点：**
- 使用所有片段（最多8个），按时间顺序
- 自然暖色调（饱和度+10%）
- 保留完整原音（音量100%）
- 轻柔背景音乐（音量20%）
- 无片头片尾

**适用场景：**
- 日常生活记录
- 旅行Vlog
- 产品开箱评测

**配置文件：** `backend/src/templates/configs/vlog.json`

## 🎨 添加新模板

### 步骤1：创建配置文件

在 `backend/src/templates/configs/` 创建新文件，例如 `fast-beat.json`：

```json
{
  "id": "fast-beat",
  "name": "快节奏卡点",
  "description": "音乐驱动，快速切换，无转场，强节奏感",
  "tag": "热门款",
  "segmentSelection": {
    "strategy": "top-scored",
    "maxSegments": 10,
    "minDuration": 1,
    "maxDuration": 3,
    "sortBy": "score"
  },
  "layout": {},
  "transitions": {
    "type": "none",
    "duration": 0
  },
  "visualStyle": {
    "filter": "vibrant",
    "brightness": 0.15,
    "contrast": 0.2,
    "saturation": 0.3
  },
  "backgroundMusic": {
    "enabled": true,
    "file": "edm-beat.mp3",
    "volume": 0.6
  },
  "audioProcessing": {
    "keepOriginal": false,
    "originalVolume": 0
  }
}
```

### 步骤2：添加音乐文件（可选）

如果模板使用背景音乐，将 MP3 文件放到：
```
backend/assets/music/edm-beat.mp3
```

### 步骤3：添加前端图标（可选）

在 `frontend/src/components/TemplateSelector.tsx` 中添加图标映射：

```typescript
import { Music } from 'lucide-react';

const ICON_MAP: Record<string, any> = {
  // ...现有的
  'fast-beat': Music,
};

const COLOR_MAP: Record<string, { accent: string; ring: string }> = {
  // ...现有的
  'fast-beat': {
    accent: 'from-red-500 to-orange-500',
    ring: 'ring-red-400/70',
  },
};
```

### 步骤4：重启服务

```bash
# 后端会自动重新加载模板
# 如果没有自动重载，手动重启：
cd backend
npm run dev
```

新模板会自动出现在前端！

## 🔧 配置参数说明

### segmentSelection（片段选择）

- `strategy`: 选择策略
  - `top-scored`: 按评分从高到低选择
  - `first-best-last`: 第一个+最佳+最后一个
  - `all`: 使用所有片段
  - `custom`: 使用用户拖拽的顺序
- `maxSegments`: 最多选择几个片段
- `minDuration`: 单个片段最小时长（秒）
- `maxDuration`: 单个片段最大时长（秒）
- `sortBy`: 排序方式（`score` 或 `time`）

### transitions（转场）

- `type`: 转场类型
  - `fade`: 淡入淡出
  - `wipe`: 擦除（暂未实现）
  - `slide`: 滑动（暂未实现）
  - `zoom`: 缩放（暂未实现）
  - `none`: 无转场
- `duration`: 转场时长（秒）

### visualStyle（视觉风格）

- `filter`: 预设滤镜
  - `warm`: 暖色调
  - `cool`: 冷色调
  - `vibrant`: 鲜艳
  - `bw`: 黑白
  - `cinematic`: 电影感
  - `none`: 无滤镜
- `brightness`: 亮度调整（-1 到 1）
- `contrast`: 对比度调整（-1 到 1）
- `saturation`: 饱和度调整（-1 到 1）

### textOverlay（文字叠加）

- `enabled`: 是否启用
- `position`: 位置（`top`, `center`, `bottom`）
- `fontSize`: 字体大小
- `fontColor`: 字体颜色
- `backgroundColor`: 背景颜色（如 `black@0.5` 表示半透明黑色）
- `generateWithAI`: 是否用 AI 生成标题

### backgroundMusic（背景音乐）

- `enabled`: 是否启用
- `file`: 音乐文件名（在 `assets/music/` 下）
- `volume`: 音乐音量（0-1）
- `fadeIn`: 淡入时长（秒）
- `fadeOut`: 淡出时长（秒）

### audioProcessing（音频处理）

- `keepOriginal`: 是否保留原视频音频
- `originalVolume`: 原音量（0-1）
- `normalize`: 是否标准化音频（暂未实现）

## 📚 技术架构

```
SmartVideoMixer/
├── backend/
│   ├── src/
│   │   ├── templates/           # 模板系统
│   │   │   ├── types.ts        # 类型定义
│   │   │   ├── registry.ts     # 模板注册表
│   │   │   ├── engine.ts       # 模板引擎
│   │   │   ├── generator.ts    # 视频生成器
│   │   │   └── configs/        # 模板配置
│   │   │       ├── highlights.json
│   │   │       ├── suspense.json
│   │   │       ├── cinematic.json
│   │   │       └── vlog.json
│   │   ├── services/           # 核心服务
│   │   │   ├── ffmpegUtils.ts
│   │   │   ├── geminiAnalyzer.ts
│   │   │   └── videoSplitter.ts
│   │   └── routes/             # API 路由
│   └── assets/
│       └── music/              # 背景音乐
├── frontend/
│   └── src/
│       ├── components/
│       │   └── TemplateSelector.tsx  # 模板选择器
│       ├── types/
│       │   └── index.ts              # 类型定义
│       └── utils/
│           └── api.ts                # API 调用
└── TEMPLATE_SYSTEM_REFACTOR.md       # 重构说明
```

## 🐛 故障排除

### 问题1：模板加载失败

**症状：** 后端启动时显示 `Total templates loaded: 0`

**解决：**
```bash
# 检查配置文件是否存在
ls backend/src/templates/configs/

# 检查 JSON 格式是否正确
cd backend/src/templates/configs
for f in *.json; do echo "Checking $f"; python -m json.tool $f > /dev/null && echo "OK" || echo "INVALID"; done
```

### 问题2：生成视频时报错 "Invalid template"

**症状：** 前端选择模板后，生成时后端返回错误

**解决：**
```bash
# 测试模板 API
curl http://localhost:8000/api/templates

# 确保前端传递的 template ID 与后端配置的 id 一致
```

### 问题3：背景音乐不起作用

**症状：** 生成的视频没有背景音乐

**原因：** 音乐文件不存在

**解决：**
```bash
# 检查音乐文件
ls backend/assets/music/

# 下载免费音乐并放到该目录
# 或者在模板配置中设置 "backgroundMusic.enabled": false
```

### 问题4：AI 标题生成失败

**症状：** 使用"悬念引流"模板时报错

**原因：** 未配置 Gemini API Key

**解决：**
```bash
# 在 backend/.env 文件中添加
GEMINI_API_KEY=your_api_key_here

# 或者在模板配置中禁用 AI 标题
"textOverlay": {
  "enabled": false
}
```

## 📊 性能优化建议

1. **视频处理时间**
   - 短视频（<1分钟）：10-30秒
   - 中等视频（1-3分钟）：30-60秒
   - 长视频（3-5分钟）：1-2分钟

2. **优化建议**
   - 使用较少片段的模板处理更快
   - 关闭 AI 标题生成可加快速度
   - 转场时长设置为0可略微加快

3. **服务器配置**
   - 推荐：4核CPU + 8GB内存
   - 安装 FFmpeg 硬件加速版本

## 🎯 下一步计划

- [ ] 添加实际的背景音乐文件
- [ ] 实现更多转场效果（wipe, slide, zoom）
- [ ] 支持用户上传自定义模板配置
- [ ] 添加模板预览功能（小视频示例）
- [ ] 支持批量生成（一键生成多个模板）
- [ ] 添加模板市场（分享和下载社区模板）

## 📖 相关文档

- [TEMPLATE_SYSTEM_REFACTOR.md](./TEMPLATE_SYSTEM_REFACTOR.md) - 重构技术文档
- [plan.md](./plan.md) - 项目需求文档
- [backend/src/templates/template.schema.md](./backend/src/templates/template.schema.md) - 模板配置 Schema

---

**项目状态：** ✅ 模板系统重构完成，功能正常，可以使用！
