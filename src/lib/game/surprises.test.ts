// Живая проверка «Сюрпризов» на базе (как rebuzz.test.ts): пропускается без
// SUPABASE_URL / SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY. Эффекты
// задаются тестовым крючком debug_force_surprise (только service_role).
import { existsSync, readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterAll, describe, expect, it } from "vitest";
import type { SurpriseEffect } from "./surprises";

function loadLocalEnv() {
  if (!existsSync(".env.local")) return;
  for (const line of readFileSync(".env.local", "utf8").split("\n")) {
    const match = line.match(/^([A-Z0-9_]+)=(.*)$/);
    if (!match || process.env[match[1]]) continue;
    process.env[match[1]] = match[2];
  }
}

loadLocalEnv();

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const live = Boolean(url && anonKey && serviceKey);

type Rpc = Record<string, unknown> & { ok?: boolean; error?: string };
type Seat = { id: string; token: string; nickname: string };

function client(key: string) {
  return createClient(url ?? "", key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

async function rpc(supabase: SupabaseClient, name: string, args: object) {
  const { data, error } = await supabase.rpc(name, args);
  if (error) throw new Error(`${name}: ${error.message}`);
  return data as Rpc;
}

describe.skipIf(!live)("сюрпризы на базе", { timeout: 180_000 }, () => {
  const service = client(serviceKey ?? "");
  const anon = client(anonKey ?? "");
  const rooms: string[] = [];

  afterAll(async () => {
    for (const roomId of rooms.splice(0)) {
      await service
        .from("game_states")
        .update({ current_question_id: null })
        .eq("room_id", roomId);
      await service.from("rooms").delete().eq("id", roomId);
    }
  });

  // Клиент без схемы: строки разбираем сами.
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  type Loose = any;
  async function must(
    query: PromiseLike<{ data: unknown; error: { message: string } | null }>,
  ): Promise<Loose> {
    const { data, error } = await query;
    if (error || data === null) throw new Error(error?.message ?? "нет данных");
    return data;
  }

  async function table(surprises: boolean | null = true) {
    const created = await rpc(service, "create_room", { p_host_mode: "bot" });
    const roomId = String(created.room_id);
    const code = String(created.code);
    rooms.push(roomId);
    if (surprises !== null) {
      await must(
        service
          .from("rooms")
          .update({ surprises })
          .eq("id", roomId)
          .select("id"),
      );
    }
    const seats: Seat[] = [];
    for (const nickname of ["Анна", "Bob", "Кир", "Женя"]) {
      const joined = await rpc(anon, "join_room", {
        p_code: code,
        p_nickname: nickname,
        p_role: "player",
      });
      expect(joined.ok).toBe(true);
      seats.push({
        id: String(joined.player_id),
        token: String(joined.player_token),
        nickname,
      });
    }
    expect((await rpc(service, "start_game", { p_code: code })).ok).toBe(true);
    return { roomId, code, seats };
  }

  type Table = Awaited<ReturnType<typeof table>>;

  async function state(room: Table) {
    return must(
      service
        .from("game_states")
        .select(
          "phase, chooser_player_id, buzz_winner_player_id, deadline, current_question_id",
        )
        .eq("room_id", room.roomId)
        .single(),
    );
  }

  async function setScores(room: Table, scores: number[]) {
    for (const [index, seat] of room.seats.entries()) {
      await must(
        service
          .from("players")
          .update({ score: scores[index] })
          .eq("id", seat.id)
          .select("id"),
      );
    }
  }

  async function scores(room: Table) {
    const rows = await must(
      service.from("players").select("id, score").eq("room_id", room.roomId),
    );
    return room.seats.map(
      (seat) => rows.find((row: Loose) => row.id === seat.id)?.score ?? NaN,
    );
  }

  async function freeCell(room: Table) {
    const marked = await must(
      service
        .from("room_surprises")
        .select("question_id")
        .eq("room_id", room.roomId),
    );
    const cells = await must(
      service
        .from("questions")
        .select("id, value")
        .eq("room_id", room.roomId)
        .eq("round", 1)
        .eq("status", "hidden")
        .is("special", null)
        .order("value"),
    );
    const used = new Set(marked.map((row: Loose) => row.question_id));
    const cell = cells.find((row: Loose) => !used.has(row.id));
    if (!cell) throw new Error("клетки кончились");
    return cell as { id: string; value: number };
  }

  async function expire(room: Table) {
    await must(
      service
        .from("game_states")
        .update({ deadline: new Date(Date.now() - 1000).toISOString() })
        .eq("room_id", room.roomId)
        .select("room_id"),
    );
    return rpc(service, "tick_room", { p_room_id: room.roomId });
  }

  /** Открывает клетку-сюрприз игроком opener и докручивает рулетку. */
  async function surprise(room: Table, opener: Seat, effect: SurpriseEffect) {
    const cell = await freeCell(room);
    await must(
      service
        .from("game_states")
        .update({ chooser_player_id: opener.id })
        .eq("room_id", room.roomId)
        .select("room_id"),
    );
    expect(
      (
        await rpc(service, "debug_force_surprise", {
          p_code: room.code,
          p_question_id: cell.id,
          p_effect: effect,
        })
      ).ok,
    ).toBe(true);
    const picked = await rpc(anon, "pick_cell", {
      p_code: room.code,
      p_player_token: opener.token,
      p_question_id: cell.id,
    });
    expect(picked).toMatchObject({ ok: true, surprise: true });
    expect((await state(room)).phase).toBe("surprise");
    const rolling = await must(
      service
        .from("room_surprises")
        .select("effect, status, opener_player_id")
        .eq("question_id", cell.id)
        .single(),
    );
    expect(rolling).toEqual({
      effect,
      status: "rolling",
      opener_player_id: opener.id,
    });
    await expire(room);
    return cell;
  }

  async function outcome(cellId: string) {
    return must(
      service
        .from("room_surprises")
        .select("status, outcome")
        .eq("question_id", cellId)
        .single(),
    );
  }

  /** Отвечает на текущий вопрос: buzz → begin_answer → вердикт. */
  async function answer(
    room: Table,
    seat: Seat,
    text: string,
    correct: boolean,
  ) {
    const now = await state(room);
    if (now.phase === "question")
      await rpc(service, "open_buzz", { p_code: room.code });
    const buzz = await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: seat.token,
    });
    expect(buzz.ok).toBe(true);
    const begun = await rpc(service, "begin_answer", {
      p_code: room.code,
      p_player_token: seat.token,
      p_text: text,
    });
    expect(begun.ok).toBe(true);
    return rpc(service, "apply_verdict", {
      p_code: room.code,
      p_correct: correct,
      p_method: "host",
      p_player_id: null,
    });
  }

  async function finish(room: Table, seat: Seat) {
    await answer(room, seat, "ответ", true);
    expect(
      (await rpc(service, "continue_game", { p_code: room.code })).ok,
    ).toBe(true);
    expect((await state(room)).phase).toBe("board");
  }

  it("старая комната (surprises = null) — клеток-сюрпризов нет, включённая — 2–3", async () => {
    const old = await table(null);
    const on = await table(true);
    const count = async (room: Table) => {
      const cells = await must(
        service.from("questions").select("id").eq("room_id", room.roomId),
      );
      const secrets = await must(
        service
          .from("question_secrets")
          .select("question_id")
          .eq("surprise", true)
          .in(
            "question_id",
            cells.map((cell: Loose) => cell.id),
          ),
      );
      return secrets.length;
    };
    expect(await count(old)).toBe(0);
    const marked = await count(on);
    expect(marked).toBeGreaterThanOrEqual(2);
    expect(marked).toBeLessThanOrEqual(3);
    // Секретную отметку не видно анониму.
    const { data } = await anon
      .from("question_secrets")
      .select("surprise")
      .limit(1);
    expect(data ?? []).toEqual([]);
  });

  it("мгновенные эффекты меняют счёт и пишут журнал", async () => {
    const room = await table();
    const [anna, bob, kir, zhenya] = room.seats;

    await setScores(room, [300, 900, -100, 500]);
    let cell = await surprise(room, anna, "letter_a");
    expect(await scores(room)).toEqual([1300, 900, -100, 500]);
    expect((await state(room)).phase).toBe("question");
    await finish(room, anna);

    await setScores(room, [300, 900, -100, 500]);
    cell = await surprise(room, kir, "letter_a");
    expect(await scores(room)).toEqual([300, 900, -100, 500]);
    expect((await outcome(cell.id)).outcome).toMatchObject({ nothing: true });
    await finish(room, anna);

    await setScores(room, [300, 900, -100, 500]);
    await surprise(room, kir, "steal");
    expect(await scores(room)).toEqual([300, 400, 400, 500]);
    await finish(room, anna);

    await setScores(room, [300, 900, -100, 500]);
    await surprise(room, bob, "steal");
    expect(await scores(room)).toEqual([300, 1400, -100, 0]);
    await finish(room, anna);

    await setScores(room, [300, 900, -100, 500]);
    await surprise(room, anna, "swap_left");
    expect(await scores(room)).toEqual([500, 900, -100, 300]);
    await finish(room, anna);

    await setScores(room, [300, 900, -100, 500]);
    await surprise(room, zhenya, "shortest_nick");
    expect(await scores(room)).toEqual([300, 400, -600, 500]);
    await finish(room, anna);

    await setScores(room, [300, 900, -100, 500]);
    await surprise(room, anna, "rotate");
    expect(await scores(room)).toEqual([500, 300, 900, -100]);
    await finish(room, anna);

    await setScores(room, [300, 900, -100, -100]);
    cell = await surprise(room, anna, "robin_hood");
    expect(await scores(room)).toEqual([300, 900, 1400, 1400]);
    const done = await outcome(cell.id);
    expect(done.status).toBe("done");
    expect((done.outcome as { changes: unknown[] }).changes).toHaveLength(2);

    const log = await must(
      service
        .from("score_events")
        .select("effect, delta, reason")
        .eq("room_id", room.roomId)
        .eq("reason", "effect"),
    );
    const effects = new Set(log.map((row: Loose) => row.effect));
    for (const effect of [
      "letter_a",
      "steal",
      "swap_left",
      "shortest_nick",
      "rotate",
      "robin_hood",
    ]) {
      expect(effects.has(effect)).toBe(true);
    }
  });

  it("×2, щит и ×3 меняют очки за ответ", async () => {
    const room = await table();
    const [anna, bob, kir] = room.seats;

    await setScores(room, [0, 0, 0, 0]);
    let cell = await surprise(room, anna, "double");
    let verdict = await answer(room, anna, "ответ", true);
    expect(verdict.delta).toBe(cell.value * 2);
    await rpc(service, "continue_game", { p_code: room.code });

    await setScores(room, [0, 0, 0, 0]);
    cell = await surprise(room, bob, "shield");
    verdict = await answer(room, bob, "не то", false);
    expect(verdict.delta).toBe(0);
    expect(await scores(room)).toEqual([0, 0, 0, 0]);
    // Щит одноразовый: следующий промах уже с минусом.
    await finish(room, anna);
    cell = await freeCell(room);
    await must(
      service
        .from("game_states")
        .update({ chooser_player_id: bob.id })
        .eq("room_id", room.roomId)
        .select("room_id"),
    );
    await rpc(anon, "pick_cell", {
      p_code: room.code,
      p_player_token: bob.token,
      p_question_id: cell.id,
    });
    verdict = await answer(room, bob, "не то", false);
    expect(verdict.delta).toBe(-cell.value);
    await finish(room, anna);

    await setScores(room, [0, 0, 0, 0]);
    cell = await surprise(room, kir, "triple");
    verdict = await answer(room, kir, "не то", false);
    expect(verdict.delta).toBe(-cell.value * 3);
    verdict = await answer(room, anna, "ответ", true);
    expect(verdict.delta).toBe(cell.value * 3);
    await rpc(service, "continue_game", { p_code: room.code });
    const left = await must(
      service
        .from("room_effects")
        .select("effect, status")
        .eq("room_id", room.roomId)
        .eq("status", "active"),
    );
    expect(left).toEqual([]);
  });

  it("КАПС и одно слово: не тот формат — неверно", async () => {
    const room = await table();
    const [anna, bob] = room.seats;
    await setScores(room, [0, 0, 0, 0]);

    let cell = await surprise(room, anna, "caps");
    let verdict = await answer(room, anna, "пушкин", true);
    expect(verdict.correct).toBe(false);
    expect(verdict.delta).toBe(-cell.value);
    const method = await must(
      service
        .from("answers")
        .select("method")
        .eq("question_id", cell.id)
        .eq("player_id", anna.id)
        .single(),
    );
    expect(method.method).toBe("format");
    await finish(room, bob);

    cell = await surprise(room, bob, "one_word");
    verdict = await answer(room, bob, "Пушкин", true);
    expect(verdict.correct).toBe(true);
    expect(verdict.delta).toBe(cell.value);
    await rpc(service, "continue_game", { p_code: room.code });
  });

  it("подсказка, заморозка, полтаймера и перемешка", async () => {
    const room = await table();
    const [anna, bob, kir] = room.seats;

    await surprise(room, anna, "hint");
    const hint = await rpc(anon, "my_hint", {
      p_code: room.code,
      p_player_token: anna.token,
    });
    expect(hint.ok).toBe(true);
    expect(String(hint.letter)).toMatch(/^[\p{Lu}\p{N}]$/u);
    const other = await rpc(anon, "my_hint", {
      p_code: room.code,
      p_player_token: bob.token,
    });
    expect(other.letter ?? null).toBeNull();
    await finish(room, bob);
    const after = await rpc(anon, "my_hint", {
      p_code: room.code,
      p_player_token: anna.token,
    });
    expect(after.letter ?? null).toBeNull();

    await surprise(room, kir, "freeze");
    await rpc(service, "open_buzz", { p_code: room.code });
    const frozen = await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: kir.token,
    });
    expect(frozen).toMatchObject({ ok: false, error: "frozen" });
    await finish(room, bob);

    await surprise(room, bob, "half_timer");
    await rpc(service, "open_buzz", { p_code: room.code });
    await rpc(anon, "buzz", { p_code: room.code, p_player_token: bob.token });
    const deadline = Date.parse(String((await state(room)).deadline));
    expect(deadline - Date.now()).toBeLessThan(11_000);
    expect(deadline - Date.now()).toBeGreaterThan(5_000);
    await rpc(service, "apply_verdict", {
      p_code: room.code,
      p_correct: true,
      p_method: "host",
      p_player_id: null,
    });
    await rpc(service, "continue_game", { p_code: room.code });

    const cell = await surprise(room, anna, "scramble");
    const fx = await must(
      service
        .from("room_effects")
        .select("player_id, question_id, status")
        .eq("room_id", room.roomId)
        .eq("effect", "scramble"),
    );
    expect(fx).toEqual([
      { player_id: null, question_id: cell.id, status: "active" },
    ]);
    await finish(room, anna);
    const gone = await must(
      service
        .from("room_effects")
        .select("status")
        .eq("room_id", room.roomId)
        .eq("effect", "scramble"),
    );
    expect(gone[0].status).not.toBe("active");
  });

  it("выбор хода: открывший назначает, кто выберет следующую клетку", async () => {
    const room = await table();
    const [anna, bob, kir] = room.seats;

    await surprise(room, anna, "pick_next");
    expect((await state(room)).phase).toBe("surprise_pick");
    const notYou = await rpc(anon, "surprise_choose", {
      p_code: room.code,
      p_player_token: bob.token,
      p_target_id: kir.id,
    });
    expect(notYou.ok).toBe(false);
    const chosen = await rpc(anon, "surprise_choose", {
      p_code: room.code,
      p_player_token: anna.token,
      p_target_id: kir.id,
    });
    expect(chosen.ok).toBe(true);
    expect((await state(room)).phase).toBe("question");
    await finish(room, bob);
    expect((await state(room)).chooser_player_id).toBe(kir.id);

    // Не выбрал за 20 с — выбирает сам открывший.
    await surprise(room, bob, "pick_next");
    await expire(room);
    expect((await state(room)).phase).toBe("question");
    await finish(room, anna);
    expect((await state(room)).chooser_player_id).toBe(bob.id);
  });
});
