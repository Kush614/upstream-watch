import { useCallback, useRef } from "react";

/**
 * Two chords: dissonant when a change is found, resolved when it is fixed.
 *
 * Muted by default and generated with WebAudio, so there are no asset files and nothing
 * plays unless someone asks for it.
 */
const TENSE = [220, 233.08, 311.13];   // A3, A#3, D#4 — a tritone with a semitone rub
const RESOLVED = [220, 277.18, 329.63]; // A3, C#4, E4 — A major

export function useSound(enabled: boolean) {
  const ctxRef = useRef<AudioContext | null>(null);

  return useCallback(
    (kind: "tense" | "resolved") => {
      if (!enabled) return;
      try {
        ctxRef.current ??= new AudioContext();
        const ctx = ctxRef.current;
        void ctx.resume();

        const now = ctx.currentTime;
        const gain = ctx.createGain();
        gain.gain.setValueAtTime(0.0001, now);
        gain.gain.exponentialRampToValueAtTime(0.06, now + 0.05);
        gain.gain.exponentialRampToValueAtTime(0.0001, now + 1.6);
        gain.connect(ctx.destination);

        for (const hz of kind === "tense" ? TENSE : RESOLVED) {
          const osc = ctx.createOscillator();
          osc.type = "sine";
          osc.frequency.value = hz;
          osc.connect(gain);
          osc.start(now);
          osc.stop(now + 1.7);
        }
      } catch {
        // Audio is a flourish; a browser that refuses it changes nothing that matters.
      }
    },
    [enabled],
  );
}
