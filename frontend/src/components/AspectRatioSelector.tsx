import React, { useRef } from 'react';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Smartphone, Monitor } from 'lucide-react';

interface AspectRatioSelectorProps {
  value: '9:16' | '16:9';
  onChange: (ratio: '9:16' | '16:9') => void;
}

const RATIOS = [
  {
    id: '9:16' as const,
    icon: Smartphone,
    name: '竖屏 9:16',
    desc: '抖音 / 快手',
    previewClass: 'h-12 w-7',
  },
  {
    id: '16:9' as const,
    icon: Monitor,
    name: '横屏 16:9',
    desc: 'B站 / YouTube',
    previewClass: 'h-7 w-12',
  },
];

export const AspectRatioSelector: React.FC<AspectRatioSelectorProps> = ({
  value,
  onChange,
}) => {
  const rootRef = useRef<HTMLDivElement>(null);
  const { contextSafe } = useGSAP(() => {}, { scope: rootRef });

  const pulse = contextSafe((el: HTMLElement) => {
    gsap.fromTo(
      el,
      { scale: 0.96 },
      { scale: 1, duration: 0.45, ease: 'back.out(2.5)', clearProps: 'scale' }
    );
  });

  return (
    <div ref={rootRef} className="w-full">
      <h2 className="mb-5 text-2xl font-black text-white">输出格式</h2>
      <div className="flex flex-wrap gap-4">
        {RATIOS.map((ratio) => {
          const active = value === ratio.id;
          const Icon = ratio.icon;
          return (
            <button
              key={ratio.id}
              onClick={(e) => {
                onChange(ratio.id);
                pulse(e.currentTarget);
              }}
              className={`glass flex items-center gap-4 px-6 py-4 transition-all duration-300 ${
                active
                  ? 'bg-white/[0.07] ring-2 ring-violet-400/70 shadow-neon'
                  : 'hover:-translate-y-0.5 hover:border-white/25 hover:bg-white/[0.06]'
              }`}
            >
              <Icon
                className={`h-6 w-6 ${active ? 'text-fuchsia-400' : 'text-slate-400'}`}
              />
              <div className="text-left">
                <div className="font-black text-white">{ratio.name}</div>
                <div className="text-xs text-slate-400">{ratio.desc}</div>
              </div>
              <div
                className={`${ratio.previewClass} rounded-md transition-all duration-300 ${
                  active
                    ? 'bg-gradient-to-br from-violet-500 to-cyan-400 shadow-neon'
                    : 'bg-white/10'
                }`}
              />
            </button>
          );
        })}
      </div>
    </div>
  );
};
