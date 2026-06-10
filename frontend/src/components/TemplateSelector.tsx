import React, { useRef, useEffect, useState } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Sparkles, Zap, Film, Video } from 'lucide-react';
import { Template } from '../types';
import { videoApi } from '../utils/api';

interface TemplateSelectorProps {
  selected: string | null;
  onSelect: (template: string) => void;
}

// Icon mapping
const ICON_MAP: Record<string, any> = {
  highlights: Sparkles,
  suspense: Zap,
  cinematic: Film,
  vlog: Video,
};

// Color mapping
const COLOR_MAP: Record<string, { accent: string; ring: string }> = {
  highlights: {
    accent: 'from-rose-500 to-amber-400',
    ring: 'ring-rose-400/70',
  },
  suspense: {
    accent: 'from-cyan-400 to-emerald-500',
    ring: 'ring-cyan-400/70',
  },
  cinematic: {
    accent: 'from-stone-700 to-amber-500',
    ring: 'ring-amber-400/70',
  },
  vlog: {
    accent: 'from-sky-400 to-lime-400',
    ring: 'ring-sky-400/70',
  },
};

export const TemplateSelector: React.FC<TemplateSelectorProps> = ({
  selected,
  onSelect,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const [templates, setTemplates] = useState<Template[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string>('');

  const { contextSafe } = useGSAP(() => {}, { scope: rootRef });

  const pulse = contextSafe((el: HTMLElement) => {
    gsap.fromTo(
      el,
      { scale: 0.96 },
      { scale: 1, duration: 0.45, ease: 'back.out(2.5)', clearProps: 'scale' }
    );
  });

  // Load templates from backend
  useEffect(() => {
    const loadTemplates = async () => {
      try {
        setLoading(true);
        const data = await videoApi.getTemplates();
        setTemplates(data);
        setError('');
      } catch (err) {
        console.error('Failed to load templates:', err);
        setError('加载模板失败');
      } finally {
        setLoading(false);
      }
    };

    loadTemplates();
  }, []);

  if (loading) {
    return (
      <div className="w-full">
        <h2 className="mb-5 text-2xl font-black text-white">选择模板</h2>
        <div className="flex items-center justify-center py-12">
          <div className="text-slate-400">加载模板中...</div>
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div className="w-full">
        <h2 className="mb-5 text-2xl font-black text-white">选择模板</h2>
        <div className="glass border-red-500/30 bg-red-500/10 p-4 text-center text-red-300">
          {error}
        </div>
      </div>
    );
  }

  return (
    <div ref={rootRef} className="w-full">
      <h2 className="mb-1 text-2xl font-black text-white">选择模板</h2>
      <p className="mb-5 text-sm text-slate-400">
        每个模板有不同的拆分与剪辑逻辑，小窗为风格示例
      </p>
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {templates.map((tpl) => {
          const active = selected === tpl.id;
          const Icon = ICON_MAP[tpl.id] || Sparkles;
          const colors = COLOR_MAP[tpl.id] || COLOR_MAP.highlights;

          return (
            <button
              key={tpl.id}
              onClick={(e) => {
                onSelect(tpl.id);
                pulse(e.currentTarget);
              }}
              className={`glass p-6 text-left transition-all duration-300 ${
                active
                  ? `ring-2 ${colors.ring} bg-white/[0.07] shadow-neon`
                  : 'hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.06]'
              }`}
            >
              <div className="mb-3 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div
                    className={`flex h-11 w-11 items-center justify-center rounded-xl bg-gradient-to-br ${colors.accent} shadow-neon`}
                  >
                    <Icon className="h-5 w-5 text-white" />
                  </div>
                  <h3 className="text-xl font-black text-white">{tpl.name}</h3>
                </div>
                <span
                  className={`rounded-full px-2.5 py-1 text-[10px] font-bold ${
                    active
                      ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white'
                      : 'border border-white/15 text-slate-400'
                  }`}
                >
                  {tpl.tag}
                </span>
              </div>

              <div className="flex items-start gap-4">
                <p className="flex-1 text-sm leading-relaxed text-slate-400">
                  {tpl.description}
                </p>
              </div>
            </button>
          );
        })}
      </div>
    </div>
  );
};
