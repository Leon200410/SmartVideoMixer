import React, { useState, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Upload, Film, Sparkles } from 'lucide-react';
import { VideoInfo } from '../types';

interface VideoUploaderProps {
  onUploadSuccess: (video: VideoInfo) => void;
  onUploadError: (error: string) => void;
}

const SINGLE_MAX_SIZE = 200 * 1024 * 1024;
const MULTI_MAX_SIZE = 30 * 1024 * 1024;
const MULTI_MAX_DURATION = 30;

const readVideoDuration = (file: File): Promise<number> =>
  new Promise((resolve, reject) => {
    const video = document.createElement('video');
    const url = URL.createObjectURL(file);

    video.preload = 'metadata';
    video.onloadedmetadata = () => {
      URL.revokeObjectURL(url);
      resolve(video.duration);
    };
    video.onerror = () => {
      URL.revokeObjectURL(url);
      reject(new Error('无法读取视频时长'));
    };
    video.src = url;
  });

export const VideoUploader: React.FC<VideoUploaderProps> = ({
  onUploadSuccess,
  onUploadError,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [isDragging, setIsDragging] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [progress, setProgress] = useState(0);
  const [queuedFiles, setQueuedFiles] = useState<File[]>([]);
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
      handleFiles(files);
    }
  };

  const handleFileSelect = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (files && files.length > 0) {
      handleFiles(Array.from(files));
    }
  };

  const handleFiles = async (files: File[]) => {
    const videoFiles = files.filter((file) => file.type.startsWith('video/'));
    if (videoFiles.length === 0) {
      onUploadError('请选择视频文件');
      return;
    }

    const isMultiUpload = videoFiles.length > 1;

    if (videoFiles.length > 10) {
      onUploadError('一次最多上传 10 个视频');
      return;
    }

    // Validate file type (video/avi: what most browsers report for .avi)
    const validTypes = ['video/mp4', 'video/quicktime', 'video/x-msvideo', 'video/avi'];
    const invalidFile = videoFiles.find((file) => !validTypes.includes(file.type));
    if (invalidFile) {
      onUploadError(`"${invalidFile.name}" 格式不支持，只支持 MP4, MOV, AVI`);
      return;
    }

    const maxSize = isMultiUpload ? MULTI_MAX_SIZE : SINGLE_MAX_SIZE;
    const oversizedFile = videoFiles.find((file) => file.size > maxSize);
    if (oversizedFile) {
      onUploadError(
        isMultiUpload
          ? `多个视频上传时，每个视频不能超过 30MB："${oversizedFile.name}"`
          : `"${oversizedFile.name}" 超过 200MB`
      );
      return;
    }

    if (isMultiUpload) {
      try {
        for (const file of videoFiles) {
          const duration = await readVideoDuration(file);
          if (duration > MULTI_MAX_DURATION) {
            onUploadError(`多个视频上传时，每个视频不能超过 30 秒："${file.name}"`);
            return;
          }
        }
      } catch {
        onUploadError('读取视频时长失败，请确认文件可正常播放');
        return;
      }
    }

    setUploading(true);
    setProgress(0);
    setQueuedFiles(videoFiles);

    try {
      const formData = new FormData();
      videoFiles.forEach((file) => formData.append('videos', file));

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
        setQueuedFiles([]);
      });

      xhr.addEventListener('error', () => {
        onUploadError('上传失败，请检查网络连接');
        setUploading(false);
        setQueuedFiles([]);
      });

      xhr.open('POST', '/api/upload');
      xhr.send(formData);
    } catch (error) {
      onUploadError('上传过程中出现错误');
      setUploading(false);
      setQueuedFiles([]);
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
          multiple
          onChange={handleFileSelect}
          className="hidden"
        />

        {!uploading ? (
          <>
            <div className="up-float mx-auto mb-6 flex h-20 w-20 items-center justify-center rounded-3xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-neon">
              <Upload className="h-9 w-9 text-white" />
            </div>
            <h3 className="mb-2 text-2xl font-black text-white">
              拖一组视频进来，剩下交给 AI
            </h3>
            <p className="mb-6 text-sm text-slate-400">或者点击这里多选素材文件</p>
            <div className="flex flex-wrap items-center justify-center gap-2 text-xs">
              {['单个：≤200MB / ≤10分钟', '多素材：每个≤30MB / ≤30秒', '最多 10 个'].map((tag) => (
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
              {waitingForAI ? '解析素材信息中…' : `上传 ${queuedFiles.length} 个视频中…`}
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
            {queuedFiles.length > 0 && (
              <div className="mx-auto mt-5 max-h-32 max-w-md space-y-2 overflow-y-auto rounded-lg border border-white/10 bg-black/20 p-3 text-left">
                {queuedFiles.map((file) => (
                  <div
                    key={`${file.name}-${file.size}`}
                    className="flex items-center justify-between gap-3 text-xs text-slate-300"
                  >
                    <span className="truncate">{file.name}</span>
                    <span className="flex-shrink-0 text-slate-500">
                      {(file.size / 1024 / 1024).toFixed(1)} MB
                    </span>
                  </div>
                ))}
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
};
