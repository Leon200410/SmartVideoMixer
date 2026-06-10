import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Download, Clock, Loader2, XCircle, Inbox } from 'lucide-react';
import { videoApi } from '../utils/api';
import { Generation } from '../types';

const STATUS_BADGE: Record<
  Generation['status'],
  { label: string; className: string }
> = {
  completed: { label: '已完成', className: 'bg-emerald-500/15 text-emerald-300 border-emerald-400/30' },
  processing: { label: '生成中', className: 'bg-amber-500/15 text-amber-300 border-amber-400/30' },
  failed: { label: '失败', className: 'bg-red-500/15 text-red-300 border-red-400/30' },
};

export function HistoryPage() {
  const [items, setItems] = useState<Generation[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');

  useEffect(() => {
    videoApi
      .getHistory()
      .then(setItems)
      .catch(() => setError('加载历史记录失败'))
      .finally(() => setLoading(false));
  }, []);

  if (loading) {
    return (
      <div className="step-panel flex items-center justify-center gap-2 py-24 text-slate-400">
        <Loader2 className="h-5 w-5 animate-spin" />
        加载历史记录…
      </div>
    );
  }

  return (
    <div className="step-panel w-full">
      <div className="mb-6 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">生成历史</h2>
          <p className="mt-1 text-sm text-slate-400">
            所有生成过的视频都在这里，随时回看或下载
          </p>
        </div>
        <Link to="/" className="btn-primary">
          ＋ 再剪一条
        </Link>
      </div>

      {error && (
        <div className="glass border-red-500/30 bg-red-500/10 p-4 text-center text-red-300">
          {error}
        </div>
      )}

      {!error && items.length === 0 && (
        <div className="glass flex flex-col items-center gap-3 py-20 text-slate-400">
          <Inbox className="h-10 w-10 text-slate-500" />
          <p>还没有生成记录</p>
          <Link to="/" className="text-sm font-bold text-cyan-300 hover:text-cyan-200">
            去剪第一条视频 →
          </Link>
        </div>
      )}

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {items.map((item) => {
          const badge = STATUS_BADGE[item.status];
          const playable = item.status === 'completed';

          const card = (
            <div
              className={`glass group overflow-hidden transition-all duration-300 ${
                playable
                  ? 'hover:-translate-y-1 hover:border-violet-400/40 hover:shadow-neon'
                  : 'opacity-80'
              }`}
            >
              <div className="relative aspect-video bg-black/50">
                {item.thumbnailUrl ? (
                  <img
                    src={item.thumbnailUrl}
                    alt={item.title}
                    className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
                  />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-3xl">
                    {item.status === 'failed' ? (
                      <XCircle className="h-8 w-8 text-red-400/70" />
                    ) : (
                      <Loader2 className="h-8 w-8 animate-spin text-slate-500" />
                    )}
                  </div>
                )}
                <span
                  className={`absolute left-2 top-2 rounded-full border px-2.5 py-0.5 text-[10px] font-bold backdrop-blur ${badge.className}`}
                >
                  {badge.label}
                </span>
                {item.duration !== undefined && (
                  <span className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-cyan-300 backdrop-blur">
                    {item.duration.toFixed(1)}s
                  </span>
                )}
              </div>

              <div className="space-y-2 p-4">
                <div className="flex items-center justify-between gap-2">
                  <h3 className="truncate font-black text-white">{item.title}</h3>
                  <span className="flex-shrink-0 rounded-full border border-white/15 px-2 py-0.5 text-[10px] font-bold text-slate-400">
                    {item.aspectRatio}
                  </span>
                </div>
                {item.videoName && (
                  <p className="truncate text-xs text-slate-500">
                    素材：{item.videoName}
                  </p>
                )}
                <div className="flex items-center justify-between">
                  <span className="flex items-center gap-1 text-[11px] text-slate-500">
                    <Clock className="h-3 w-3" />
                    {new Date(item.createdAt + 'Z').toLocaleString()}
                  </span>
                  {playable && item.videoUrl && (
                    <button
                      onClick={(e) => {
                        e.preventDefault();
                        window.open(item.videoUrl, '_blank');
                      }}
                      className="flex items-center gap-1 rounded-full border border-white/15 px-2.5 py-1 text-[11px] font-bold text-slate-300 transition-colors hover:border-cyan-400/50 hover:text-cyan-300"
                    >
                      <Download className="h-3 w-3" />
                      下载
                    </button>
                  )}
                </div>
              </div>
            </div>
          );

          return playable ? (
            <Link key={item.generationId} to={`/result/${item.generationId}`}>
              {card}
            </Link>
          ) : (
            <div key={item.generationId}>{card}</div>
          );
        })}
      </div>
    </div>
  );
}
