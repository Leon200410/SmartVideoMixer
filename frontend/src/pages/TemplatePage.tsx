import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, Scissors, ArrowRight } from 'lucide-react';
import { TemplateSelector } from '../components/TemplateSelector';
import { videoApi } from '../utils/api';
import { useAppStore } from '../store/useAppStore';

export function TemplatePage() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const {
    video,
    templateId,
    splitTemplateId,
    segments,
    setVideo,
    setTemplateId,
    setSplitTemplateId,
    setSegments,
  } = useAppStore();

  const [error, setError] = useState('');
  const [splitting, setSplitting] = useState(false);

  // Re-hydrate from the API on refresh / direct link
  useEffect(() => {
    if (!videoId) return;
    if (video?.videoId === videoId) return;

    videoApi
      .getVideo(videoId)
      .then((detail) => {
        setVideo(detail);
        setSegments(detail.segments);
        setSplitTemplateId(detail.templateId);
        if (detail.templateId) setTemplateId(detail.templateId);
      })
      .catch(() => setError('视频不存在或已过期，请重新上传'));
  }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleSplit = async () => {
    if (!videoId || !templateId) {
      setError('请先选择一个模板');
      return;
    }

    setSplitting(true);
    setError('');
    try {
      const result = await videoApi.splitVideo(videoId, templateId);
      setSegments(result.segments);
      setSplitTemplateId(templateId);
      navigate(`/video/${videoId}/edit`);
    } catch (err: any) {
      setError(err.response?.data?.error || '拆分视频失败');
    } finally {
      setSplitting(false);
    }
  };

  const canSkip =
    segments.length > 0 && splitTemplateId !== null && splitTemplateId === templateId;

  if (splitting) {
    return (
      <div className="step-panel flex flex-col items-center py-24">
        <div className="relative mb-8 h-28 w-28">
          <div className="absolute inset-0 animate-pulse rounded-full bg-fuchsia-500/25 blur-2xl" />
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-white/5 border-r-violet-500 border-t-fuchsia-500" />
          <div className="absolute inset-0 flex items-center justify-center text-3xl">
            ✂️
          </div>
        </div>
        <h2 className="text-2xl font-black">
          <span className="text-neon">按模板逻辑拆分中…</span>
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          场景检测 → 切片 → Ark 逐段打分，通常需要 1-3 分钟
        </p>
      </div>
    );
  }

  return (
    <div className="step-panel space-y-10">
      {error && (
        <div className="glass flex items-start gap-3 border-red-500/30 bg-red-500/10 p-4">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" />
          <div>
            <h3 className="font-bold text-red-300">出错了</h3>
            <p className="text-sm text-red-200/80">{error}</p>
          </div>
        </div>
      )}

      {/* Original video preview */}
      {video && (
        <div className="w-full">
          <h2 className="mb-1 text-2xl font-black text-white">已上传视频</h2>
          <p className="mb-5 text-sm text-slate-400">
            {video.originalName} · {video.duration.toFixed(1)}s ·{' '}
            {video.width}×{video.height}
          </p>
          <div className="glass mx-auto max-w-xl overflow-hidden bg-black/60">
            <video
              controls
              preload="metadata"
              poster={video.thumbnailUrl}
              src={video.previewUrl}
              className="mx-auto max-h-[40vh] w-full"
            />
          </div>
        </div>
      )}

      <TemplateSelector selected={templateId} onSelect={setTemplateId} />

      <div className="flex flex-col items-center gap-3">
        <div className="flex justify-center gap-4">
          <button onClick={() => navigate('/')} className="btn-ghost">
            重新上传
          </button>
          <button
            onClick={handleSplit}
            disabled={!templateId}
            className="btn-primary flex items-center gap-2 disabled:cursor-not-allowed"
          >
            <Scissors className="h-5 w-5" />
            {canSkip ? '重新拆分' : '开始拆分'}
          </button>
        </div>
        {canSkip && (
          <button
            onClick={() => navigate(`/video/${videoId}/edit`)}
            className="flex items-center gap-1 text-sm font-bold text-cyan-300 hover:text-cyan-200"
          >
            跳过，使用上次拆分结果
            <ArrowRight className="h-4 w-4" />
          </button>
        )}
      </div>
    </div>
  );
}
