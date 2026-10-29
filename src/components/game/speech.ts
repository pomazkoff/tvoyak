/**
 * Голос ведущего на телевизоре. Сначала — Марина из Yandex SpeechKit через
 * /api/tts (mp3 в <audio>), если за 3 секунды звук не пришёл или не
 * играет — встроенный speechSynthesis браузера. onEnd вызывается не больше
 * одного раза; игра не должна от него зависеть (у вызывающего свой таймер).
 *
 * Голос звучит из ОДНОГО постоянного <audio>, который «разблокируется» на
 * первом касании/клике/кнопке пульта (armSpeechUnlock). Телевизоры с Android
 * WebView и Safari пускают звук без жеста только у уже разблокированного
 * элемента: новый <audio> на каждую фразу там молчал, а speechSynthesis в
 * WebView нет — голос пропадал целиком.
 */

export type TtsAuth = { code: string; hostSecret: string };

const TTS_WAIT_MS = 3000;

let generation = 0;
let activeAudio: HTMLAudioElement | null = null;
let activeAbort: AbortController | null = null;
let activeUrl: string | null = null;
let voiceElement: HTMLAudioElement | null = null;
let voiceUnlocked = false;
let unlockArmed = false;
// «Верно!» и «Неверно.» звучат много раз за игру — держим mp3 в памяти.
const blobCache = new Map<string, Blob>();

// Говорит ли сейчас ведущий — под голос приглушается фоновая музыка.
let speaking = false;
const speakingListeners = new Set<() => void>();

function setSpeaking(value: boolean) {
  if (speaking === value) return;
  speaking = value;
  for (const listener of speakingListeners) listener();
}

export function isSpeaking(): boolean {
  return speaking;
}

export function subscribeSpeaking(listener: () => void): () => void {
  speakingListeners.add(listener);
  return () => {
    speakingListeners.delete(listener);
  };
}

function fetchSpeech(
  text: string,
  tts: TtsAuth,
  signal: AbortSignal,
): Promise<Blob> {
  const cached = blobCache.get(text);
  if (cached) return Promise.resolve(cached);
  return fetch("/api/tts", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ text, code: tts.code, hostSecret: tts.hostSecret }),
    signal,
  }).then(async (response) => {
    if (!response.ok) throw new Error(`tts_${response.status}`);
    const blob = await response.blob();
    blobCache.set(text, blob);
    if (blobCache.size > 24) {
      const oldest = blobCache.keys().next().value;
      if (oldest !== undefined) blobCache.delete(oldest);
    }
    return blob;
  });
}

function speakBrowser(text: string, onEnd?: () => void): boolean {
  if (typeof window === "undefined" || !window.speechSynthesis) return false;
  window.speechSynthesis.cancel();
  const utterance = new SpeechSynthesisUtterance(text);
  utterance.lang = "ru-RU";
  utterance.rate = 0.95;
  utterance.onstart = () => setSpeaking(true);
  utterance.onend = () => {
    setSpeaking(false);
    onEnd?.();
  };
  utterance.onerror = () => setSpeaking(false);
  window.speechSynthesis.speak(utterance);
  return true;
}

function ensureVoiceElement(): HTMLAudioElement {
  if (voiceElement && voiceElement.isConnected) return voiceElement;
  const audio = voiceElement ?? document.createElement("audio");
  audio.id = "host-voice";
  audio.hidden = true;
  audio.preload = "auto";
  document.body.appendChild(audio);
  voiceElement = audio;
  return audio;
}

// 0,02 с тишины (WAV 8 кГц) — чтобы проиграть что-то внутри жеста.
function silentWavUrl(): string {
  const samples = 160;
  const bytes = new Uint8Array(44 + samples * 2);
  const view = new DataView(bytes.buffer);
  const text = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1)
      bytes[offset + i] = value.charCodeAt(i);
  };
  text(0, "RIFF");
  view.setUint32(4, 36 + samples * 2, true);
  text(8, "WAVEfmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, 8000, true);
  view.setUint32(28, 16000, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  text(36, "data");
  view.setUint32(40, samples * 2, true);
  return URL.createObjectURL(new Blob([bytes], { type: "audio/wav" }));
}

function unlockVoice(): Promise<void> {
  const audio = ensureVoiceElement();
  // Уже звучит фраза — элемент и так разблокирован.
  if (activeAudio === audio && !audio.paused) return Promise.resolve();
  if (activeAudio === audio) return Promise.reject(new Error("busy"));
  const url = silentWavUrl();
  audio.src = url;
  return audio
    .play()
    .then(() => {
      if (activeAudio !== audio) audio.pause();
    })
    .finally(() => {
      URL.revokeObjectURL(url);
      if (activeAudio !== audio) audio.removeAttribute("src");
    });
}

/**
 * Разблокировать голос на первом жесте пользователя (клик, тач, кнопка
 * пульта). Безопасно вызывать сколько угодно раз.
 */
export function armSpeechUnlock(): void {
  if (voiceUnlocked || unlockArmed || typeof window === "undefined") return;
  unlockArmed = true;
  const unlock = () => {
    window.removeEventListener("pointerdown", unlock, true);
    window.removeEventListener("keydown", unlock, true);
    window.removeEventListener("touchend", unlock, true);
    unlockArmed = false;
    unlockVoice().then(
      () => {
        voiceUnlocked = true;
      },
      () => armSpeechUnlock(),
    );
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  window.addEventListener("touchend", unlock, true);
}

function releaseAudio() {
  activeAbort?.abort();
  activeAbort = null;
  if (activeAudio) {
    activeAudio.onended = null;
    activeAudio.onerror = null;
    activeAudio.onplaying = null;
    activeAudio.pause();
    activeAudio.removeAttribute("src");
    activeAudio = null;
  }
  setSpeaking(false);
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
  setSpeaking(false);
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

  void fetchSpeech(text, tts, abort.signal)
    .then(async (blob) => {
      if (mine !== generation || fellBack) return;
      window.clearTimeout(slow);
      const url = URL.createObjectURL(blob);
      const audio = ensureVoiceElement();
      audio.pause();
      audio.dataset.text = text;
      audio.src = url;
      activeUrl = url;
      activeAudio = audio;
      let playing = false;
      audio.onplaying = () => {
        playing = true;
        setSpeaking(true);
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
      await audio.play().catch(() => {
        // Жеста ещё не было — разблокируем на следующем и говорим браузером.
        voiceUnlocked = false;
        armSpeechUnlock();
        fallback();
      });
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
