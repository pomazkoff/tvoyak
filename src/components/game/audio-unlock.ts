/**
 * Один общий AudioContext на вкладку для «Звука наоборот».
 *
 * Раньше каждый вопрос создавал свой AudioContext без жеста пользователя.
 * На экране ведущего (телевизор, Safari/iPad, Android WebView) новый
 * контекст рождается «suspended», и разбудить его можно только внутри
 * свежего касания/клика — а в режиме бота у телевизора никто не нажимает.
 * Телефоны игроков этого почти не замечали: там постоянно жмут кнопки.
 *
 * Теперь контекст один и разблокируется на первом же жесте на странице
 * («Начать игру», клик, кнопка пульта) — дальше все треки играют сами,
 * как голос ведущего через один разблокированный <audio> (см. speech.ts).
 */

type AudioContextCtor = typeof AudioContext;

let shared: AudioContext | null = null;
let armed = false;

function contextCtor(): AudioContextCtor | null {
  if (typeof window === "undefined") return null;
  return (
    window.AudioContext ??
    (window as unknown as { webkitAudioContext?: AudioContextCtor })
      .webkitAudioContext ??
    null
  );
}

/** Общий контекст (создаётся при первом обращении). null — Web Audio нет. */
export function sharedAudioContext(): AudioContext | null {
  if (shared && shared.state !== "closed") return shared;
  const Context = contextCtor();
  if (!Context) return null;
  try {
    shared = new Context();
  } catch {
    shared = null;
  }
  return shared;
}

/**
 * Будит контекст. Вызывать внутри жеста пользователя: resume() плюс тихий
 * сэмпл — так Safari и WebView запоминают контекст как разрешённый.
 */
export function unlockAudioContext(): Promise<boolean> {
  const context = sharedAudioContext();
  if (!context) return Promise.resolve(false);
  if (context.state === "running") return Promise.resolve(true);
  try {
    const node = context.createBufferSource();
    node.buffer = context.createBuffer(1, 1, context.sampleRate || 22050);
    node.connect(context.destination);
    node.start(0);
  } catch {
    // Не страшно: главное — resume() ниже.
  }
  return context
    .resume()
    .then(() => (context.state as string) === "running")
    .catch(() => false);
}

/**
 * Слушать жесты на странице и будить общий контекст. Слушатели остаются:
 * iOS может снова «усыпить» контекст (звонок, блокировка экрана), и
 * следующее касание разбудит его опять. Повторные вызовы безопасны.
 */
export function armAudioUnlock(): void {
  if (armed || typeof window === "undefined") return;
  armed = true;
  const unlock = () => {
    if (shared?.state === "running") return;
    void unlockAudioContext();
  };
  window.addEventListener("pointerdown", unlock, true);
  window.addEventListener("keydown", unlock, true);
  window.addEventListener("touchend", unlock, true);
}

/** Только для тестов. */
export function resetAudioUnlockForTests(): void {
  shared = null;
  armed = false;
}
