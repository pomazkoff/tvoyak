"use client";

import {
  setMusicOn,
  setMusicVolume,
  useMusicState,
} from "@/components/game/background-music";

/** Кнопка фоновой музыки на экране ведущего: вкл/выкл и громкость. */
export function MusicToggle({
  raised = false,
  credits = false,
}: {
  raised?: boolean;
  credits?: boolean;
}) {
  const music = useMusicState();
  const label = !music.on
    ? "Музыка выкл."
    : music.blocked
      ? "Нажмите — музыка"
      : "Музыка";
  return (
    <div
      className={`music-toggle hand${raised ? " is-raised" : ""}`}
      data-state={!music.on ? "off" : music.playing ? "playing" : "idle"}
    >
      <button
        type="button"
        className="music-toggle-button"
        aria-pressed={music.on}
        title={
          music.on ? "Выключить фоновую музыку" : "Включить фоновую музыку"
        }
        onClick={() => setMusicOn(!music.on || music.blocked ? true : false)}
      >
        <span aria-hidden="true" className="music-toggle-note">
          {music.on ? "♪" : "×"}
        </span>
        {label}
      </button>
      {music.on ? (
        <input
          type="range"
          min={0}
          max={0.6}
          step={0.02}
          value={music.volume}
          aria-label="Громкость музыки"
          className="music-toggle-volume"
          onChange={(event) => setMusicVolume(Number(event.target.value))}
        />
      ) : null}
      {credits ? (
        <a
          href="/music/CREDITS.md"
          target="_blank"
          rel="noreferrer"
          className="music-toggle-credits"
          title="Треки: Uncan, Alex Morgan, 1000 Handz — Free Music Archive, CC BY 4.0"
        >
          авторы
        </a>
      ) : null}
    </div>
  );
}
