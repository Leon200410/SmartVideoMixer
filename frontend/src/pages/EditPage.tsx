import { useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, ArrowLeft } from 'lucide-react';
import { SegmentList } from '../components/SegmentList';
import { AspectRatioSelector } from '../components/AspectRatioSelector';
import { videoApi } from '../utils/api';
import { useAppStore } from '../store/useAppStore';

export function EditPage() {
  const { videoId } = useParams<{ videoId: string }>();
  const navigate = useNavigate();
  const {
    video,
    templateId,
    segments,
    aspectRatio,
    orderCustomized,
    setVideo,
    setTemplateId,
    setSplitTemplateId,
    setSegments,
    reorderSegments,
    setAspectRatio,
  } = useAppStore();

  const [error, setError] = useState('');
  const [generating, setGenerating] = useState(false);

  // Re-hydrate from the API on refresh / direct link
  useEffect(() => {
    if (!videoId) return;
    if (video?.videoId === videoId && segments.length > 0) return;

    videoApi
      .getVideo(videoId)
      .then((detail) => {
        setVideo(detail);
        if (detail.segments.length === 0) {
          // No split yet — back to the template step
          navigate(`/video/${videoId}/template`, { replace: true });
          return;
        }
        setSegments(detail.segments);
        setSplitTemplateId(detail.templateId);
        if (detail.templateId) setTemplateId(detail.templateId);
      })
      .catch(() => setError('视频不存在或已过期，请重新上传'));
  }, [videoId]); // eslint-disable-line react-hooks/exhaustive-deps

  const handleGenerate = async () => {
    if (!videoId || !templateId) {
      setError('缺少模板信息，请返回上一步重新选择');
      return;
    }

    setGenerating(true);
    setError('');
    try {
      const generation = await videoApi.generateVideo({
        videoId,
        template: templateId,
        aspectRatio,
        // Only send a custom order if the user actually rearranged segments
        segmentOrder: orderCustomized ? segments.map((s) => s.id) : undefined,
      });
      navigate(`/result/${generation.generationId}`);
    } catch (err: any) {
      setError(err.response?.data?.error || '生成视频失败');
      setGenerating(false);
    }
  };

  if (generating) {
    return (
      <div className="step-panel flex flex-col items-center py-24">
        <div className="relative mb-8 h-28 w-28">
          <div className="absolute inset-0 animate-pulse rounded-full bg-fuchsia-500/25 blur-2xl" />
          <div className="absolute inset-0 animate-spin rounded-full border-4 border-white/5 border-r-violet-500 border-t-fuchsia-500" />
          <div className="absolute inset-0 flex items-center justify-center text-3xl">
            🎬
          </div>
        </div>
        <h2 className="text-2xl font-black">
          <span className="text-neon">AI 正在生成你的视频…</span>
        </h2>
        <p className="mt-2 text-sm text-slate-400">
          转码 + 拼接 + 特效处理中，通常需要几十秒，别走开
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

      <SegmentList segments={segments} onReorder={reorderSegments} />

      <AspectRatioSelector value={aspectRatio} onChange={setAspectRatio} />

      <div className="flex justify-center gap-4">
        <button
          onClick={() => navigate(`/video/${videoId}/template`)}
          className="btn-ghost flex items-center gap-2"
        >
          <ArrowLeft className="h-4 w-4" />
          重选模板
        </button>
        <button
          onClick={handleGenerate}
          disabled={segments.length === 0}
          className="btn-primary disabled:cursor-not-allowed"
        >
          🚀 生成视频
        </button>
      </div>
    </div>
  );
}
