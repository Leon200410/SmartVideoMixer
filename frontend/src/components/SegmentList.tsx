import React, { useState, useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { GripVertical } from 'lucide-react';
import { Segment } from '../types';

// Seconds → m:ss for the segment time range
const fmtTime = (s: number) => {
  const m = Math.floor(s / 60);
  const sec = Math.floor(s % 60);
  return `${m}:${sec.toString().padStart(2, '0')}`;
};

interface SegmentListProps {
  segments: Segment[];
  onReorder?: (newOrder: string[]) => void;
}

export const SegmentList: React.FC<SegmentListProps> = ({ segments, onReorder }) => {
  const listRef = useRef<HTMLDivElement>(null);
  const [dragIndex, setDragIndex] = useState<number | null>(null);
  const [overIndex, setOverIndex] = useState<number | null>(null);

  const draggable = !!onReorder;

  // Staggered card entrance (mount only, so reordering doesn't replay it)
  useGSAP(
    () => {
      gsap.from('.seg-card', {
        y: 30,
        autoAlpha: 0,
        scale: 0.95,
        duration: 0.5,
        stagger: 0.06,
        delay: 0.15,
        ease: 'power3.out',
        clearProps: 'all',
      });
    },
    { scope: listRef }
  );

  const resetDrag = () => {
    setDragIndex(null);
    setOverIndex(null);
  };

  const handleDrop = (targetIndex: number) => {
    if (dragIndex === null || dragIndex === targetIndex) {
      resetDrag();
      return;
    }
    const ids = segments.map((s) => s.id);
    const [moved] = ids.splice(dragIndex, 1);
    ids.splice(targetIndex, 0, moved);
    onReorder?.(ids);
    resetDrag();
  };

  return (
    <div ref={listRef} className="w-full">
      <div className="mb-5 flex items-end justify-between">
        <div>
          <h2 className="text-2xl font-black text-white">
            视频片段 <span className="text-neon">×{segments.length}</span>
          </h2>
          {draggable && (
            <p className="mt-1 text-sm text-slate-400">
              <GripVertical className="mr-1 inline h-3.5 w-3.5 text-fuchsia-400" />
              拖拽卡片调整顺序，生成时按此顺序选取片段
            </p>
          )}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {segments.map((segment, index) => (
          <div
            key={segment.id}
            draggable={draggable}
            onDragStart={() => setDragIndex(index)}
            onDragOver={(e) => {
              e.preventDefault();
              setOverIndex(index);
            }}
            onDrop={(e) => {
              e.preventDefault();
              handleDrop(index);
            }}
            onDragEnd={resetDrag}
            className={`seg-card glass group overflow-hidden transition-all duration-300 hover:-translate-y-1 hover:border-violet-400/40 hover:shadow-neon ${
              draggable ? 'cursor-move' : ''
            } ${dragIndex === index ? 'scale-95 opacity-40' : ''} ${
              overIndex === index && dragIndex !== null && dragIndex !== index
                ? 'ring-2 ring-fuchsia-400 shadow-neon-lg'
                : ''
            }`}
          >
            <div className="relative aspect-video bg-black/40">
              <img
                src={segment.thumbnailUrl}
                alt={`Segment ${segment.id}`}
                draggable={false}
                className="h-full w-full object-cover transition-transform duration-500 group-hover:scale-105"
              />
              <div className="absolute left-2 top-2 flex h-6 w-6 items-center justify-center rounded-full bg-gradient-to-br from-violet-500 to-fuchsia-500 text-xs font-black text-white shadow-neon">
                {index + 1}
              </div>
              {segment.geminiScore !== undefined && (
                <div className="absolute right-2 top-2 rounded-full bg-black/70 px-2.5 py-1 text-xs font-black backdrop-blur">
                  <span className="text-neon">{segment.geminiScore.toFixed(1)}</span>{' '}
                  ⭐
                </div>
              )}
              <div className="absolute bottom-2 left-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-slate-200 backdrop-blur">
                {fmtTime(segment.start)} → {fmtTime(segment.end)}
              </div>
              <div className="absolute bottom-2 right-2 rounded-md bg-black/60 px-1.5 py-0.5 text-[10px] font-bold text-cyan-300 backdrop-blur">
                {segment.duration.toFixed(1)}s
              </div>
            </div>
            {(segment.sourceName || segment.geminiReason) && (
              <div className="p-3">
                {segment.sourceName && (
                  <p className="mb-1 truncate text-[11px] font-bold text-cyan-300">
                    {segment.sourceName}
                  </p>
                )}
                {segment.geminiReason && (
                  <p className="line-clamp-2 text-xs leading-relaxed text-slate-400">
                    {segment.geminiReason}
                  </p>
                )}
              </div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
};
