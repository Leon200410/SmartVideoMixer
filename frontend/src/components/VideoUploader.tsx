import React, { useState, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Upload, Film, Sparkles } from 'lucide-react';
import { VideoInfo } from '../types';

interface VideoUploaderProps {
  onUploadSuccess: (video: VideoInfo) => void;
  onUploadError: (error: string) => void;
}

export const VideoUploader: React.FC<VideoUploaderProps> = ({
  onUploadSuccess,
  onUploadError,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Gentle float on the upload icon
  useGSAP(
    () => {
      gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
        gsap.to('.up-float', {
          y: -10,
          duration: 1.6,
          repeat: -1,
          yoyo: true,
          ease: 'sine.inOut',
        });
      });
    },
    { scope: rootRef }
  );

  const handleDragOver = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = () => {
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent) => {
    e.preventDefault();
    setIsDragging(false);

    const files = Array.from(e.dataTransfer.files);
    if (files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFile(files[0]);
    }
  };

  const handleFile = async (file: File) => {
    // Validate file type (video/avi: what most browsers report for .avi)
    const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/avi'];
    if (!validTypes.includes(file.type)) {
      onUploadError('只支持 MP4, MOV, AVI 格式的视频文件');
      return;
    }

    // Validate file size (200MB)
    const maxSize = 200 * 1024 * 1024;
    if (file.size > maxSize) {
      onUploadError('视频文件不能超过 200MB');
      return;
    }

    setUploading(true);
    setProgress(0);

    try {
      const formData = new FormData();
      formData.append('video', file);

      const xhr = new XMLHttpRequest();

      xhr.upload.addEventListener('progress', (e) => {
        if (e.lengthComputable) {
          const percentComplete = (e.loaded / e.total) * 100;
          setProgress(percentComplete);
        }
      });

      xhr.addEventListener('load', () => {
        if (xhr.status === 200) {
          const response = JSON.parse(xhr.responseText) as VideoInfo;
          onUploadSuccess(response);
        } else {
          const error = JSON.parse(xhr.responseText);
          onUploadError(error.error || '上传失败');
        }
        setUploading(false);
      });

      xhr.addEventListener('error', () => {
        onUploadError('上传失败，请检查网络连接');
        setUploading(false);
      });

      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    } catch (error) {
      onUploadError('上传过程中出现错误');
      setUploading(false);
    }
  };

  const waitingForAI = uploading && progress >= 100;

  return (
    <div ref={rootRef} className="mx-auto w-full max-w-3xl">
      <div
        className={`
          glass relative cursor-pointer overflow-hidden p-14 text-center
          border-2 border-dashed transition-all duration-300
          ${
            isDragging
              ? 'scale-[1.01] border-fuchsia-400/70 bg-fuchsia-500/10 shadow-neon-lg'
              : 'border-white/15 hover:border-violet-400/50 hover:bg-white/[0.06] hover:shadow-neon'
          }
          ${uploading ? 'pointer-events-none' : ''}
        `}
        onDragOver={handleDragOver}
        onDragLeave={handleDragLeave}
        onDrop={handleDrop}
        onClick={() => !uploading && fileInputRef.current?.click()}
      >
        <input
          ref={fileInputRef}
          type="file"
          accept="video/mp4,video/quicktime,video/x-msvideo,video/avi,.mp4,.mov,.avi"
          onChange={handleFileSelect}
          className="hidden"
        />

        {!uploading ? (
          <>
            <div className="up-float mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-neon">
              <Upload className="h-9 w-9 text-white" />
            </div>
            <h3 className="mb-2 text-2xl font-black text-white">
              拖个视频进来，剩下交给 AI
            </h3>
            <p className="mb-6 text-sm text-slate-400">或者点击这里选择文件</p>
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
              {['MP4 / MOV / AVI', '≤ 200MB', '≤ 10 分钟'].map((tag) => (
                <span
                  key={tag}
                  className="rounded-full border border-white/10 bg-white/5 px-3 py-1 font-medium text-slate-300"
                >
                  {tag}
                </span>
              ))}
            </div>
          </>
        ) : (
          <>
            <div className="mx-auto mb-6 flex h-20 w-20 animate-pulse items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-neon">
              {waitingForAI ? (
                <Sparkles className="h-9 w-9 text-white" />
              ) : (
                <Film className="h-9 w-9 text-white" />
              )}
            </div>
            <h3 className="mb-4 text-2xl font-black text-white">
              {waitingForAI ? '解析视频信息中…' : '上传中…'}
            </h3>
            <div className="mx-auto mb-3 h-2.5 w-full max-w-md overflow-hidden rounded-full bg-white/10">
              <div
                className="shimmer h-full rounded-full bg-gradient-to-r from-violet-500 via-fuchsia-500 to-cyan-400 transition-[width] duration-200"
                style={{ width: `${progress}%` }}
              />
            </div>
            <p className="text-sm text-slate-400">
              {waitingForAI
                ? '生成预览缩略图 + 同步云端存储，马上就好'
                : `${Math.round(progress)}% 完成`}
            </p>
          </>
        )}
      </div>
    </div>
  );
};
