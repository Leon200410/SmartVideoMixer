import React from 'react';
import { Download, Play, PartyPopper } from 'lucide-react';
import { Generation } from '../types';

interface ResultPreviewProps {
  result: Generation;
}

export const ResultPreview: React.FC<ResultPreviewProps> = ({ result }) => {
  const handleDownload = () => {
    if (!result.videoUrl) return;
    const link = document.createElement('a');
    link.href = result.videoUrl;
    link.download = `${result.title || 'video'}.mp4`;
    document.body.appendChild(link);
    link.click();
    link.remove();
  };

  return (
    <div className="mx-auto w-full max-w-2xl">
      <div className="mb-5 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-neon">
          <PartyPopper className="h-5 w-5 text-white" />
        </div>
        <h2 className="text-2xl font-black text-white">
          搞定！<span className="text-neon">你的视频出炉了</span>
        </h2>
      </div>

      <div className="glass overflow-hidden">
        <div className="relative bg-black">
          <video
            controls
            className="mx-auto max-h-[70vh] w-full"
            poster={result.thumbnailUrl}
            src={result.streamUrl || result.videoUrl}
          >
            您的浏览器不支持视频播放
          </video>
        </div>
        <div className="p-6">
          <div className="mb-5 flex flex-wrap items-center gap-2">
            <span className="rounded-full bg-gradient-to-r from-violet-500 to-fuchsia-500 px-3 py-1 text-xs font-bold text-white">
              {result.title}
            </span>
            {result.duration !== undefined && (
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-slate-300">
                ⏱ {result.duration.toFixed(1)}s
              </span>
            )}
            <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-cyan-300">
              {result.aspectRatio === '9:16' ? '📱 竖屏 9:16' : '🖥 横屏 16:9'}
            </span>
            {result.videoName && (
              <span className="rounded-full border border-white/15 bg-white/5 px-3 py-1 text-xs font-medium text-slate-400">
                素材：{result.videoName}
              </span>
            )}
          </div>
          <div className="flex gap-3">
            <button
              onClick={handleDownload}
              disabled={!result.videoUrl}
              className="btn-primary flex flex-1 items-center justify-center gap-2 disabled:cursor-not-allowed"
            >
              <Download className="h-5 w-5" />
              下载视频
            </button>
            <button
              onClick={() => {
                const video = document.querySelector('video');
                if (video) {
                  video.currentTime = 0;
                  video.play();
                }
              }}
              className="btn-ghost flex items-center gap-2"
            >
              <Play className="h-5 w-5" />
              重新播放
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};
