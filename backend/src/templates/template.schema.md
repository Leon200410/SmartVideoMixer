# 模板配置格式说明

## 模板配置 JSON Schema

```typescript
interface TemplateConfig {
  id: string;                    // 模板ID
  name: string;                  // 模板名称
  description: string;           // 模板描述
  
  // 片段选择策略
  segmentSelection: {
    strategy: 'top-scored' | 'first-best-last' | 'all' | 'custom';
    maxSegments?: number;        // 最大片段数
    minDuration?: number;        // 单个片段最小时长（秒）
    maxDuration?: number;        // 单个片段最大时长（秒）
    sortBy?: 'score' | 'time';   // 排序方式
  };
  
  // 视频布局
  layout: {
    intro?: {                    // 片头
      duration: number;          // 时长（秒）
      type: 'text' | 'image';
      text?: string;
      style?: VideoStyle;
    };
    outro?: {                    // 片尾
      duration: number;
      type: 'text' | 'image';
      text?: string;
      style?: VideoStyle;
    };
  };
  
  // 转场效果
  transitions: {
    type: 'fade' | 'wipe' | 'slide' | 'zoom' | 'none';
    duration: number;            // 转场时长（秒）
  };
  
  // 视觉风格
  visualStyle: {
    filter?: 'warm' | 'cool' | 'vibrant' | 'bw' | 'cinematic' | 'none';
    brightness?: number;         // 亮度调整 -1 to 1
    contrast?: number;           // 对比度 -1 to 1
    saturation?: number;         // 饱和度 -1 to 1
  };
  
  // 文字叠加
  textOverlay?: {
    enabled: boolean;
    position: 'top' | 'center' | 'bottom';
    fontSize: number;
    fontColor: string;
    backgroundColor?: string;
    generateWithAI: boolean;     // 是否用AI生成标题
  };
  
  // 背景音乐
  backgroundMusic?: {
    enabled: boolean;
    file?: string;               // 音乐文件名（在 assets/music/ 下）
    volume: number;              // 音量 0-1
    fadeIn: number;              // 淡入时长（秒）
    fadeOut: number;             // 淡出时长（秒）
  };
  
  // 音频处理
  audioProcessing: {
    keepOriginal: boolean;       // 保留原视频音频
    originalVolume: number;      // 原音量 0-1
    normalize: boolean;          // 音频标准化
  };
}

interface VideoStyle {
  backgroundColor?: string;
  textColor?: string;
  fontSize?: number;
}
```

## 示例配置

### 1. 高光混剪模板
快节奏，多片段，强烈转场

### 2. 悬念引流模板
3片段，AI标题，结尾引导

### 3. 电影质感模板
慢节奏，电影滤镜，淡入淡出

### 4. 卡点节奏模板
音乐驱动，快速切换，无转场

### 5. Vlog日常模板
自然，保留原音，轻音乐
