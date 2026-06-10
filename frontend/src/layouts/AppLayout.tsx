import { useRef } from 'react';
import { Link, Outlet, useLocation } from 'react-router-dom';
import gsap from 'gsap';
import { useGSAP } from '@gsap/react';
import { Clapperboard, History, Check } from 'lucide-react';

gsap.registerPlugin(useGSAP);

const FLOW_STEPS = [
  { label: '上传素材', match: /^\/$/ },
  { label: '选择模板', match: /^\/video\/[^/]+\/template$/ },
  { label: '剪辑配置', match: /^\/video\/[^/]+\/edit$/ },
  { label: '生成结果', match: /^\/result\/[^/]+$/ },
];

export function AppLayout() {
  const appRef = useRef<HTMLDivElement>(null);
  const location = useLocation();

  const activeStepIndex = FLOW_STEPS.findIndex((s) => s.match.test(location.pathname));
  const isFlowPage = activeStepIndex >= 0;

  // Intro timeline + ambient background blobs (skipped for reduced motion)
  useGSAP(
    () => {
      gsap
        .timeline({ defaults: { ease: 'power3.out' } })
        .from('.intro-logo', {
          scale: 0,
          rotation: -16,
          autoAlpha: 0,
          duration: 0.6,
          ease: 'back.out(1.8)',
        })
        .from('.intro-title', { y: 24, autoAlpha: 0, duration: 0.5 }, '-=0.25')
        .from('.intro-sub', { y: 14, autoAlpha: 0, duration: 0.45 }, '-=0.3');

      gsap.matchMedia().add('(prefers-reduced-motion: no-preference)', () => {
        gsap.to('.bg-blob-1', {
          x: 90, y: -50, scale: 1.15,
          duration: 10, repeat: -1, yoyo: true, ease: 'sine.inOut',
        });
        gsap.to('.bg-blob-2', {
          x: -80, y: 60, scale: 0.92,
          duration: 12, repeat: -1, yoyo: true, ease: 'sine.inOut',
        });
        gsap.to('.bg-blob-3', {
          x: 60, y: -70, scale: 1.18,
          duration: 14, repeat: -1, yoyo: true, ease: 'sine.inOut',
        });
      });
    },
    { scope: appRef }
  );

  // Per-route panel reveal (skip when the page hasn't rendered content yet,
  // e.g. while a loading state resolves)
  useGSAP(
    () => {
      const targets = gsap.utils.toArray('.step-panel > *');
      if (targets.length === 0) return;
      gsap.from(targets, {
        y: 28,
        autoAlpha: 0,
        duration: 0.55,
        stagger: 0.09,
        ease: 'power3.out',
        clearProps: 'all',
      });
    },
    { scope: appRef, dependencies: [location.pathname], revertOnUpdate: true }
  );

  return (
    <div
      ref={appRef}
      className="relative min-h-screen overflow-hidden bg-[#06060f] text-slate-100"
    >
      {/* Ambient gradient blobs */}
      <div className="pointer-events-none absolute inset-0">
        <div className="bg-blob-1 absolute -left-32 -top-32 h-[420px] w-[420px] rounded-full bg-violet-600/30 blur-[120px]" />
        <div className="bg-blob-2 absolute -right-40 top-1/3 h-[480px] w-[480px] rounded-full bg-fuchsia-600/25 blur-[130px]" />
        <div className="bg-blob-3 absolute -bottom-44 left-1/4 h-[460px] w-[460px] rounded-full bg-cyan-500/20 blur-[130px]" />
        <div className="absolute inset-0 bg-[radial-gradient(ellipse_at_top,rgba(255,255,255,0.05),transparent_55%)]" />
      </div>

      {/* Header */}
      <header className="relative z-10">
        <div className="mx-auto flex max-w-6xl flex-col gap-6 px-4 pb-2 pt-10 md:flex-row md:items-center md:justify-between">
          <Link to="/" className="flex items-center gap-4">
            <div className="intro-logo flex h-14 w-14 items-center justify-center rounded-2xl bg-gradient-to-br from-violet-500 via-fuchsia-500 to-cyan-400 shadow-neon">
              <Clapperboard className="h-7 w-7 text-white" />
            </div>
            <div>
              <h1 className="intro-title text-3xl font-black tracking-tight md:text-4xl">
                <span className="text-neon">SmartVideoMixer</span>
              </h1>
              <p className="intro-sub mt-1 text-sm text-slate-400">
                AI 驱动 · 一键混剪出爆款短视频 ⚡
              </p>
            </div>
          </Link>

          <div className="flex items-center gap-4">
            {/* Step indicator (flow pages only) */}
            {isFlowPage && (
              <div className="hidden items-center gap-2 lg:flex">
                {FLOW_STEPS.map((step, i) => {
                  const reached = i <= activeStepIndex;
                  const active = i === activeStepIndex;
                  return (
                    <div key={step.label} className="flex items-center gap-2">
                      {i > 0 && (
                        <div
                          className={`h-px w-5 ${
                            reached ? 'bg-fuchsia-400/60' : 'bg-white/10'
                          }`}
                        />
                      )}
                      <div
                        className={`flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-bold transition-all duration-300 ${
                          active
                            ? 'bg-gradient-to-r from-violet-500 to-fuchsia-500 text-white shadow-neon'
                            : reached
                            ? 'border border-fuchsia-400/40 text-fuchsia-300'
                            : 'border border-white/10 text-slate-500'
                        }`}
                      >
                        {reached && !active ? <Check className="h-3 w-3" /> : null}
                        {step.label}
                      </div>
                    </div>
                  );
                })}
              </div>
            )}

            <Link
              to="/history"
              className={`flex items-center gap-2 rounded-full border px-4 py-2 text-sm font-bold transition-all duration-300 ${
                location.pathname === '/history'
                  ? 'border-fuchsia-400/60 bg-white/[0.07] text-fuchsia-300 shadow-neon'
                  : 'border-white/10 text-slate-300 hover:border-white/25 hover:bg-white/[0.06]'
              }`}
            >
              <History className="h-4 w-4" />
              历史记录
            </Link>
          </div>
        </div>
      </header>

      {/* Main */}
      <main className="relative z-10 mx-auto max-w-6xl px-4 pb-24 pt-10">
        <Outlet />
      </main>

      {/* Footer */}
      <footer className="relative z-10 pb-8 text-center text-xs text-slate-600">
        Powered by Volcengine Ark × FFmpeg × GSAP
      </footer>
    </div>
  );
}
