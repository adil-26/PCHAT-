import { useEffect, useMemo, useState } from 'react';
import { AnimatePresence, motion } from 'framer-motion';

interface OnboardingProps {
  onComplete: () => void;
}

const STEP_MS = 5000;

const slides = [
  {
    title: 'You are now a Node.',
    subtitle: 'No profiles. No history.',
  },
  {
    title: 'This is the Global Pulse.',
    subtitle: "Share what's happening right now.",
  },
  {
    title: 'Vibes are live reactions.',
    subtitle: 'Feel the mood, not the metrics.',
  },
  {
    title: 'Auras connect strangers.',
    subtitle: 'Some interactions exist only in the moment.',
  },
] as const;

export function Onboarding({ onComplete }: OnboardingProps) {
  const [index, setIndex] = useState(0);
  const [tick, setTick] = useState(0);
  const isLast = index === slides.length - 1;
  const progress = useMemo(
    () => ((index * STEP_MS + tick * 250) / (slides.length * STEP_MS)) * 100,
    [index, tick],
  );

  useEffect(() => {
    if (isLast) return;
    const id = window.setInterval(() => {
      setTick((value) => value + 1);
    }, 250);
    return () => window.clearInterval(id);
  }, [isLast]);

  useEffect(() => {
    if (tick < STEP_MS / 250) return;
    setIndex((value) => Math.min(value + 1, slides.length - 1));
    setTick(0);
  }, [tick]);

  const handlePrimary = () => {
    onComplete();
  };

  return (
    <motion.div
      className="onboarding-overlay"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={{ duration: 0.25 }}
    >
      <div className="onboarding-shell">
        <span className="onboarding-kicker">PULSELY</span>
        <div className="onboarding-progress" aria-hidden>
          <i style={{ width: `${Math.min(100, progress)}%` }} />
        </div>
        <div className="onboarding-stage">
          <AnimatePresence mode="wait">
            <motion.div
              key={index}
              className="onboarding-copy"
              initial={{ opacity: 0, x: 32 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -32 }}
              transition={{ duration: 0.24 }}
            >
              <h1 className="onboarding-title">{slides[index].title}</h1>
              <p className="onboarding-subtitle">{slides[index].subtitle}</p>
            </motion.div>
          </AnimatePresence>
        </div>
        <div className="onboarding-foot">
          <div className="onboarding-dots" aria-hidden>
            {slides.map((_, dotIndex) => (
              <i key={dotIndex} className={dotIndex === index ? 'active' : ''} />
            ))}
          </div>
          <div className="onboarding-actions">
            <button type="button" className="primary" onClick={handlePrimary}>
              Enter Live Layer
            </button>
          </div>
        </div>
      </div>
    </motion.div>
  );
}
