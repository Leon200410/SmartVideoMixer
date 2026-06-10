import { useEffect, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { AlertCircle, History } from 'lucide-react';
import { ResultPreview } from '../components/ResultPreview';
import { videoApi } from '../utils/api';
import { useAppStore } from '../store/useAppStore';
import { Generation } from '../types';

export function ResultPage() {
  const { generationId } = useParams<{ generationId: string }>();
  const navigate = useNavigate();
  const reset = useAppStore((s) => s.reset);

  const [generation, setGeneration] = useState<Generation | null>(null);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!generationId) return;
    videoApi
      .getGeneration(generationId)
      .then(setGeneration)
      .catch(() => setError('找不到该生成记录'));
  }, [generationId]);

  const handleStartOver = () => {
    reset();
    navigate('/');
  };

  if (error || generation?.status === 'failed') {
    return (
      <div className="step-panel space-y-8">
        <div className="glass mx-auto flex max-w-xl items-start gap-3 border-red-500/30 bg-red-500/10 p-5">
          <AlertCircle className="mt-0.5 h-5 w-5 flex-shrink-0 text-red-400" />
          <div>
            <h3 className="font-bold text-red-300">
              {error ? '出错了' : '这条视频生成失败'}
            </h3>
            <p className="text-sm text-red-200/80">
              {error || generation?.error || '未知错误'}
            </p>
          </div>
        </div>
        <div className="flex justify-center gap-4">
          <button onClick={handleStartOver} className="btn-primary">
            ✨ 再剪一条
          </button>
          <Link to="/history" className="btn-ghost flex items-center gap-2">
            <History className="h-4 w-4" />
            查看历史
          </Link>
        </div>
      </div>
    );
  }

  if (!generation) {
    return (
      <div className="step-panel flex items-center justify-center py-24 text-slate-400">
        加载中…
      </div>
    );
  }

  return (
    <div className="step-panel space-y-8">
      <ResultPreview result={generation} />
      <div className="flex justify-center gap-4">
        <button onClick={handleStartOver} className="btn-ghost">
          ✨ 再剪一条
        </button>
        {generation.videoId && (
          <button
            onClick={() => navigate(`/video/${generation.videoId}/template`)}
            className="btn-ghost"
          >
            🎨 同素材换个模板
          </button>
        )}
        <Link to="/history" className="btn-ghost flex items-center gap-2">
          <History className="h-4 w-4" />
          查看历史
        </Link>
      </div>
    </div>
  );
}
