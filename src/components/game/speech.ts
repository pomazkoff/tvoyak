/**
 * Голос ведущего на телевизоре. Сначала — Марина из Yandex SpeechKit через
 * /api/tts (mp3 в <audio>), если за 3 секунды звук не пришёл или не
 * играет — встроенный speechSynthesis браузера. onEnd вызывается не больше
 * одного раза; игра не должна от него зависеть (у вызывающего свой таймер).
 */

export type TtsAuth = { code: string; hostSecret: string };

const TTS_WAIT_MS = 3000;

let generation = 0;
let activeAudio: HTMLAudioElement | null = null;
let activeAbort: AbortController | null = null;
let activeUrl: string | null = null;

function speakBrowser(text: string, onEnd?: () => void): boolean {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ru-RU";
  utterance.rate = 0.95;
  if (onEnd) utterance.onend = onEnd;
  window.speechSynthesis.speak(utterance);
  return true;
}

function releaseAudio() {
  activeAbort?.abort();
  activeAbort = null;
  if (activeAudio) {
    activeAudio.onended = null;
    activeAudio.onerror = null;
    activeAudio.pause();
    activeAudio.remove();
    activeAudio = null;
  }
  if (activeUrl) {
    URL.revokeObjectURL(activeUrl);
    activeUrl = null;
  }
}

export function stopSpeech(): void {
  if (typeof window === "undefined") return;
  generation += 1;
  releaseAudio();
  window.speechSynthesis?.cancel();
}

export function speakRussian(
  text: string,
  onEnd?: () => void,
  tts?: TtsAuth | null,
): boolean {
  if (typeof window === "undefined") return false;
  stopSpeech();
  if (!tts || typeof Audio === "undefined" || typeof fetch === "undefined") {
    return speakBrowser(text, onEnd);
  }

  const mine = generation;
  let finished = false;
  let fellBack = false;
  const finish = () => {
    if (finished) return;
    finished = true;
    onEnd?.();
  };
  const fallback = () => {
    if (mine !== generation || fellBack) return;
    fellBack = true;
    releaseAudio();
    if (!speakBrowser(text, finish)) finish();
  };

  const abort = new AbortController();
  activeAbort = abort;
  const slow = window.setTimeout(fallback, TTS_WAIT_MS);

  void fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, code: tts.code, hostSecret: tts.hostSecret }),
    signal: abort.signal,
  })
    .then(async (response) => {
      if (!response.ok) throw new Error(`tts_${response.status}`);
      const blob = await response.blob();
      if (mine !== generation || fellBack) return;
      window.clearTimeout(slow);
      const url = URL.createObjectURL(blob);
      const audio = document.createElement("audio");
      audio.id = "host-voice";
      audio.hidden = true;
      audio.preload = "auto";
      audio.dataset.text = text;
      audio.src = url;
      activeUrl = url;
      activeAudio = audio;
      document.body.appendChild(audio);
      let playing = false;
      audio.onplaying = () => {
        playing = true;
      };
      audio.onended = () => {
        if (mine !== generation) return;
        releaseAudio();
        finish();
      };
      audio.onerror = () => {
        if (playing) {
          releaseAudio();
          finish();
        } else fallback();
      };
      // Автоплей может быть запрещён — тогда говорит браузер.
      await audio.play().catch(() => fallback());
    })
    .catch(() => {
      window.clearTimeout(slow);
      fallback();
    });
  return true;
}

/** Фоновый прогрев голоса на раунд — без ожидания и без ошибок наружу. */
export function prewarmSpeech(tts: TtsAuth): void {
  if (typeof fetch === "undefined") return;
  void fetch("/api/tts/prewarm", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(tts),
    keepalive: true,
  }).catch(() => undefined);
}
