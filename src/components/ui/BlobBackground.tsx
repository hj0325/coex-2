'use client';

import { useEffect, useRef, useState } from 'react';
import { CanvasBackground, CanvasPhase } from './BlobBackgroundV2Canvas';

interface BlobBackgroundProps {
  isAnimating?: boolean;
  onAnimationComplete?: () => void;
  className?: string;
}

export default function BlobBackground({
  isAnimating = false,
  onAnimationComplete,
  className = ''
}: BlobBackgroundProps) {
  const [phase, setPhase] = useState<CanvasPhase>('idle');
  const [boosted, setBoosted] = useState(false);
  const [popActive, setPopActive] = useState(false);

  const onAnimationCompleteRef = useRef(onAnimationComplete);
  const hasStartedRef = useRef(false);

  const boostTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const settleTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const popTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const pulseTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const calmTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  useEffect(() => {
    onAnimationCompleteRef.current = onAnimationComplete;
  }, [onAnimationComplete]);

  const clearAll = () => {
    [boostTimeoutRef, settleTimeoutRef, popTimeoutRef, pulseTimeoutRef, calmTimeoutRef].forEach(ref => {
      if (ref.current) {
        clearTimeout(ref.current);
        ref.current = null;
      }
    });
  };

  useEffect(() => {
    if (!isAnimating || hasStartedRef.current) return;
    hasStartedRef.current = true;

    setPopActive(false);
    setPhase('transitioning');
    setBoosted(true);

    boostTimeoutRef.current = setTimeout(() => {
      setBoosted(false);
      // keep transitioning (no mid-way reset to idle) so the blob rise is continuous
      settleTimeoutRef.current = setTimeout(() => {
        setPhase('completed');
        // notify the parent shortly after completion
        setTimeout(() => {
          try {
            onAnimationCompleteRef.current?.();
          } catch {
            // noop
          }
        }, 200);
      }, 900);
    }, 2000);

    return () => clearAll();
  }, [isAnimating]);

  useEffect(() => {
    if (popTimeoutRef.current) clearTimeout(popTimeoutRef.current);
    if (phase === 'completed') {
      popTimeoutRef.current = setTimeout(() => {
        setPopActive(true);
      }, 1500);
    } else {
      setPopActive(false);
    }
    return () => {
      if (popTimeoutRef.current) clearTimeout(popTimeoutRef.current);
    };
  }, [phase]);

  useEffect(() => {
    if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
    if (calmTimeoutRef.current) clearTimeout(calmTimeoutRef.current);
    if (popActive) {
      pulseTimeoutRef.current = setTimeout(() => {
        setBoosted(true);
        calmTimeoutRef.current = setTimeout(() => setBoosted(false), 2800);
      }, 1000);
    } else {
      setBoosted(false);
    }
    return () => {
      if (pulseTimeoutRef.current) clearTimeout(pulseTimeoutRef.current);
      if (calmTimeoutRef.current) clearTimeout(calmTimeoutRef.current);
    };
  }, [popActive]);

  useEffect(() => () => clearAll(), []);

  const wrapperClassName = [
    'coex-v2-host',
    phase !== 'idle' ? 'coex-v2-host--active' : '',
    popActive ? 'coex-v2-host--pop' : '',
    className
  ]
    .filter(Boolean)
    .join(' ');

  return (
    <div className={wrapperClassName} aria-hidden>
      <div className="coex-v2-bg">
        <div className="coex-v2-bg-grad" />
      </div>
      <CanvasBackground boosted={boosted} phase={phase} popActive={popActive} />
      <style jsx>{`
        .coex-v2-host {
          position: fixed;
          inset: 0;
          z-index: 0 !important;
          pointer-events: none;
          background: transparent;
        }
        .coex-v2-host--active :global(.coex-v2-canvas-wrapper) {
          opacity: 0.95;
        }
        .coex-v2-host--pop :global(.coex-v2-canvas-wrapper) {
          filter: saturate(1.06) brightness(1.03);
        }
        .coex-v2-bg {
          position: absolute;
          inset: 0;
          background: #ffffff; /* base to avoid black through transparent canvas */
        }
        .coex-v2-bg-grad {
          position: absolute;
          inset: 0;
          opacity: 0.85;
          background: radial-gradient(circle at 30% 25%, #fdf0f6 0%, #fce6ef 45%, #f7d7e4 100%);
          transition: opacity 900ms ease, filter 1200ms ease;
        }
        .coex-v2-host--active .coex-v2-bg-grad {
          opacity: 1;
        }
        .coex-v2-host--pop .coex-v2-bg-grad {
          filter: saturate(1.08) brightness(1.04);
        }
      `}</style>
    </div>
  );
}
