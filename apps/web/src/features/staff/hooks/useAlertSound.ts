/**
 * features/staff/hooks/useAlertSound.ts — Web Audio API chime for staff alerts.
 * DOC3 §3.6.
 *
 * Rules:
 * - Plays sound ONLY after the user explicitly enables sound (browser autoplay policy)
 * - Soft, calm chime (never abrasive, startling, or loud)
 */

import { useState, useCallback, useRef, useEffect } from 'react';

export interface UseAlertSoundResult {
  isSoundEnabled: boolean;
  enableSound: () => Promise<void>;
  playChime: () => void;
}

export function useAlertSound(): UseAlertSoundResult {
  const [isSoundEnabled, setIsSoundEnabled] = useState<boolean>(false);
  const audioCtxRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    return () => {
      if (audioCtxRef.current && audioCtxRef.current.state !== 'closed') {
        void audioCtxRef.current.close();
      }
    };
  }, []);

  const enableSound = useCallback(async () => {
    try {
      const AudioContextClass =
        window.AudioContext ||
        (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;

      if (!AudioContextClass) {
        return;
      }

      if (!audioCtxRef.current || audioCtxRef.current.state === 'closed') {
        audioCtxRef.current = new AudioContextClass();
      }

      if (audioCtxRef.current.state === 'suspended') {
        await audioCtxRef.current.resume();
      }

      setIsSoundEnabled(true);

      // Play an ultra-subtle, very short confirmation ping (440Hz, 50ms)
      const ctx = audioCtxRef.current;
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = 'sine';
      osc.frequency.setValueAtTime(440, ctx.currentTime);
      gain.gain.setValueAtTime(0.05, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.1);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.1);
    } catch {
      setIsSoundEnabled(false);
    }
  }, []);

  const playChime = useCallback(() => {
    if (!isSoundEnabled || !audioCtxRef.current) {
      return;
    }

    try {
      const ctx = audioCtxRef.current;
      if (ctx.state === 'suspended') {
        void ctx.resume();
      }

      const now = ctx.currentTime;

      // Two-tone warm harmonic chime: C5 (523.25 Hz) -> E5 (659.25 Hz)
      const notes = [
        { freq: 523.25, time: now },
        { freq: 659.25, time: now + 0.12 },
      ];

      for (const note of notes) {
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();

        osc.type = 'sine';
        osc.frequency.setValueAtTime(note.freq, note.time);

        gain.gain.setValueAtTime(0.12, note.time);
        gain.gain.exponentialRampToValueAtTime(0.001, note.time + 0.6);

        osc.connect(gain);
        gain.connect(ctx.destination);

        osc.start(note.time);
        osc.stop(note.time + 0.6);
      }
    } catch {
      // Audio playback silently caught
    }
  }, [isSoundEnabled]);

  return {
    isSoundEnabled,
    enableSound,
    playChime,
  };
}
