import { useCallback, useEffect, useRef, useState } from 'react';
import { api, ApiError, isAbortError } from '@/api';
import { speechChunks } from '@/lib/speechChunks';

export const SPEECH_RATES = [0.75, 1, 1.25] as const;
export type SpeechRate = (typeof SPEECH_RATES)[number];

const browserTts = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Backend errors that mean "no speech service here" (use the browser voice) rather than a failure. */
const isUnavailable = (error: unknown): boolean =>
  error instanceof ApiError && (error.code === 'unsupported' || error.status === 404 || error.status === 501);

/**
 * Text-to-speech. Uses the backend's offline Kannada voice (POST /tts), one sentence at a time with
 * the next sentence fetched while the current one plays. Falls back to the Web Speech API (kn-IN
 * voice) when the backend has no speech service, e.g. in demo mode.
 */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const [rate, setRate] = useState<SpeechRate>(1);
  const [hasKannadaVoice, setHasKannadaVoice] = useState(true);
  const [usingBrowser, setUsingBrowser] = useState(false);
  const [error, setError] = useState(false);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);
  const rateRef = useRef<SpeechRate>(1);
  const runRef = useRef<{ controller: AbortController; audio: HTMLAudioElement | null } | null>(null);

  useEffect(() => {
    if (!browserTts) return;
    const synth = window.speechSynthesis;
    const loadVoices = () => {
      const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('kn')) ?? null;
      voiceRef.current = voice;
      // Voices load asynchronously; only claim "missing" once the list is populated.
      setHasKannadaVoice(voice !== null || synth.getVoices().length === 0);
    };
    loadVoices();
    synth.addEventListener('voiceschanged', loadVoices);
    return () => synth.removeEventListener('voiceschanged', loadVoices);
  }, []);

  const stop = useCallback(() => {
    const run = runRef.current;
    runRef.current = null;
    if (run) {
      run.controller.abort();
      run.audio?.pause();
    }
    if (browserTts) window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  useEffect(() => stop, [stop]);

  const speakWithBrowser = useCallback((text: string) => {
    if (!browserTts) {
      setSpeaking(false);
      setError(true);
      return;
    }
    const synth = window.speechSynthesis;
    synth.cancel();
    const utterance = new SpeechSynthesisUtterance(text);
    utterance.lang = 'kn-IN';
    utterance.rate = rateRef.current;
    if (voiceRef.current) utterance.voice = voiceRef.current;
    utterance.onend = () => setSpeaking(false);
    utterance.onerror = () => setSpeaking(false);
    synth.speak(utterance);
  }, []);

  const speak = useCallback(
    async (text: string) => {
      const chunks = speechChunks(text);
      if (chunks.length === 0) return;
      stop();
      const run = { controller: new AbortController(), audio: null as HTMLAudioElement | null };
      runRef.current = run;
      const { signal } = run.controller;
      setError(false);
      setSpeaking(true);

      const fetchChunk = (i: number) => api.speak(chunks[i] as string, signal);
      let next: Promise<Blob> | null = fetchChunk(0);
      try {
        for (let i = 0; i < chunks.length && next; i += 1) {
          const blob: Blob = await next;
          // Generate the following sentence while this one plays.
          next = i + 1 < chunks.length ? fetchChunk(i + 1) : null;
          next?.catch(() => undefined); // handled when awaited; avoid an unhandled-rejection warning
          if (signal.aborted) return;
          const url = URL.createObjectURL(blob);
          try {
            const audio = new Audio(url);
            audio.playbackRate = rateRef.current; // pitch is preserved by default
            run.audio = audio;
            await new Promise<void>((resolve, reject) => {
              audio.onended = () => resolve();
              audio.onerror = () => reject(new Error('Audio playback failed'));
              signal.addEventListener('abort', () => resolve(), { once: true });
              audio.play().catch(reject);
            });
          } finally {
            URL.revokeObjectURL(url);
          }
          if (signal.aborted) return;
        }
        setUsingBrowser(false);
        if (runRef.current === run) setSpeaking(false);
      } catch (err) {
        if (signal.aborted || isAbortError(err)) return;
        if (isUnavailable(err)) {
          setUsingBrowser(true);
          speakWithBrowser(text);
          return;
        }
        if (runRef.current === run) {
          runRef.current = null;
          setSpeaking(false);
          setError(true);
        }
      }
    },
    [speakWithBrowser, stop],
  );

  const toggle = useCallback(
    (text: string) => {
      if (speaking) stop();
      else void speak(text);
    },
    [speaking, speak, stop],
  );

  const cycleRate = useCallback(() => {
    setRate((current) => {
      const index = SPEECH_RATES.indexOf(current);
      const nextRate = SPEECH_RATES[(index + 1) % SPEECH_RATES.length] ?? 1;
      rateRef.current = nextRate;
      // Applies immediately to the sentence that is playing.
      if (runRef.current?.audio) runRef.current.audio.playbackRate = nextRate;
      return nextRate;
    });
  }, []);

  return {
    // The backend voice works in every browser that can play audio.
    supported: typeof Audio !== 'undefined' || browserTts,
    speaking,
    rate,
    // Only relevant when falling back to the browser's own voices.
    hasKannadaVoice: !usingBrowser || hasKannadaVoice,
    error,
    speak,
    stop,
    toggle,
    cycleRate,
  };
}
