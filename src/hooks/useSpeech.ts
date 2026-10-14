import { useCallback, useEffect, useRef, useState } from 'react';

export const SPEECH_RATES = [0.75, 1, 1.25] as const;
export type SpeechRate = (typeof SPEECH_RATES)[number];

const supported = typeof window !== 'undefined' && 'speechSynthesis' in window;

/** Text-to-speech through the Web Speech API (kn-IN voice). */
export function useSpeech() {
  const [speaking, setSpeaking] = useState(false);
  const [rate, setRate] = useState<SpeechRate>(1);
  const [hasKannadaVoice, setHasKannadaVoice] = useState(true);
  const voiceRef = useRef<SpeechSynthesisVoice | null>(null);

  useEffect(() => {
    if (!supported) return;
    const synth = window.speechSynthesis;
    const loadVoices = () => {
      const voice = synth.getVoices().find((v) => v.lang.toLowerCase().startsWith('kn')) ?? null;
      voiceRef.current = voice;
      // Voices load asynchronously; only claim "missing" once the list is populated.
      setHasKannadaVoice(voice !== null || synth.getVoices().length === 0);
    };
    loadVoices();
    synth.addEventListener('voiceschanged', loadVoices);
    return () => {
      synth.removeEventListener('voiceschanged', loadVoices);
      synth.cancel();
    };
  }, []);

  const stop = useCallback(() => {
    if (!supported) return;
    window.speechSynthesis.cancel();
    setSpeaking(false);
  }, []);

  const speak = useCallback(
    (text: string) => {
      if (!supported || !text.trim()) return;
      const synth = window.speechSynthesis;
      synth.cancel();
      const utterance = new SpeechSynthesisUtterance(text);
      utterance.lang = 'kn-IN';
      utterance.rate = rate;
      if (voiceRef.current) utterance.voice = voiceRef.current;
      utterance.onend = () => setSpeaking(false);
      utterance.onerror = () => setSpeaking(false);
      setSpeaking(true);
      synth.speak(utterance);
    },
    [rate],
  );

  const toggle = useCallback(
    (text: string) => {
      if (speaking) stop();
      else speak(text);
    },
    [speaking, speak, stop],
  );

  const cycleRate = useCallback(() => {
    setRate((current) => {
      const index = SPEECH_RATES.indexOf(current);
      return SPEECH_RATES[(index + 1) % SPEECH_RATES.length] ?? 1;
    });
  }, []);

  return { supported, speaking, rate, hasKannadaVoice, speak, stop, toggle, cycleRate };
}
