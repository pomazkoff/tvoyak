import { existsSync, readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";

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

type Rpc = {
  ok?: boolean;
  error?: string;
  code?: string;
  room_id?: string;
  player_id?: string;
  player_token?: string;
  won?: boolean;
  advanced?: boolean;
  stale?: boolean;
  reason?: string;
  version?: number;
  delta?: number;
};

type Seat = { player_id?: string; player_token?: string };

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

describe.skipIf(!live)("серверные сроки (advance_clock)", () => {
  const service = client(serviceKey ?? "");
  const anon = client(anonKey ?? "");
  const rooms: string[] = [];

  afterEach(async () => {
    for (const roomId of rooms.splice(0)) {
      await service
        .from("game_states")
        .update({ current_question_id: null })
        .eq("room_id", roomId);
      await service.from("rooms").delete().eq("id", roomId);
    }
  });

  async function table(names = ["Сол", "Соджа", "Мира"]) {
    const created = await rpc(service, "create_room", { p_host_mode: "bot" });
    expect(created.ok).toBe(true);
    const roomId = created.room_id ?? "";
    const code = created.code ?? "";
    rooms.push(roomId);
    const seats: Seat[] = [];
    for (const nickname of names) {
      const joined = await rpc(anon, "join_room", {
        p_code: code,
        p_nickname: nickname,
        p_role: "player",
      });
      expect(joined.ok).toBe(true);
      seats.push(joined);
    }
    expect((await rpc(service, "start_game", { p_code: code })).ok).toBe(true);
    const { data: game } = await service
      .from("game_states")
      .select("chooser_player_id")
      .eq("room_id", roomId)
      .single();
    const { data: cells } = await service
      .from("questions")
      .select("id, value")
      .eq("room_id", roomId)
      .eq("round", 1)
      .eq("status", "hidden")
      .is("special", null)
      .limit(1);
    if (!game || !cells?.[0]) throw new Error("нет партии");
    const chooser =
      seats.find((seat) => seat.player_id === game.chooser_player_id) ??
      seats[0];
    const others = seats.filter((seat) => seat !== chooser);
    await rpc(anon, "pick_cell", {
      p_code: code,
      p_player_token: chooser.player_token,
      p_question_id: cells[0].id,
    });
    expect((await rpc(service, "open_buzz", { p_code: code })).ok).toBe(true);
    return {
      code,
      roomId,
      chooser,
      others,
      value: cells[0].value as number,
    };
  }

  async function stateOf(roomId: string) {
    const { data, error } = await service
      .from("game_states")
      .select(
        "phase, version, chooser_player_id, buzz_winner_player_id, revealed_answer, deadline",
      )
      .eq("room_id", roomId)
      .single();
    if (error || !data) throw new Error(error?.message ?? "нет состояния");
    return data;
  }

  async function expire(roomId: string) {
    const { error } = await service
      .from("game_states")
      .update({ deadline: new Date(Date.now() - 3000).toISOString() })
      .eq("room_id", roomId);
    if (error) throw new Error(error.message);
  }

  async function scoreOf(playerId?: string) {
    const { data } = await service
      .from("players")
      .select("score")
      .eq("id", playerId ?? "")
      .single();
    return data?.score as number;
  }

  it("просроченный ответ: −цена, кнопка снова у тех, кто не пробовал; повтор — без второго штрафа", async () => {
    const room = await table();
    const [sodja, mira] = room.others;
    expect(
      (
        await rpc(anon, "buzz", {
          p_code: room.code,
          p_player_token: sodja.player_token,
        })
      ).won,
    ).toBe(true);
    const before = await stateOf(room.roomId);
    expect(before.phase).toBe("answering");

    const early = await rpc(anon, "advance_clock", {
      p_code: room.code,
      p_version: before.version,
    });
    expect(early.advanced).toBe(false);

    await expire(room.roomId);
    const [first, second] = await Promise.all([
      rpc(anon, "advance_clock", {
        p_code: room.code,
        p_version: before.version,
      }),
      rpc(anon, "advance_clock", {
        p_code: room.code,
        p_version: before.version,
      }),
    ]);
    expect([first.advanced, second.advanced].filter(Boolean)).toHaveLength(1);
    expect(await scoreOf(sodja.player_id)).toBe(-room.value);

    const reopened = await stateOf(room.roomId);
    expect(reopened.phase).toBe("buzzing");
    expect(reopened.buzz_winner_player_id).toBeNull();

    const stale = await rpc(anon, "advance_clock", {
      p_code: room.code,
      p_version: before.version,
    });
    expect(stale.stale).toBe(true);

    const again = await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: sodja.player_token,
    });
    expect(again.error).toBe("already_buzzed");
    const next = await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: mira.player_token,
    });
    expect(next.won).toBe(true);
  });

  it("ответ после срока отклоняется как answer_late и штрафует один раз", async () => {
    const room = await table();
    const [sodja] = room.others;
    await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: sodja.player_token,
    });
    await expire(room.roomId);
    const late = await rpc(service, "begin_answer", {
      p_code: room.code,
      p_player_token: sodja.player_token,
      p_text: "что-то",
    });
    expect(late.ok).toBe(false);
    expect(late.error).toBe("answer_late");
    expect(late.delta).toBe(-room.value);
    expect(await scoreOf(sodja.player_id)).toBe(-room.value);
    const after = await rpc(anon, "advance_clock", { p_code: room.code });
    expect(after.advanced).toBe(false);
    expect(await scoreOf(sodja.player_id)).toBe(-room.value);
  });

  it("никто не нажал: ответ на 4 секунды, потом поле с тем же выбирающим", async () => {
    const room = await table();
    await expire(room.roomId);
    const passed = await rpc(anon, "advance_clock", { p_code: room.code });
    expect(passed.advanced).toBe(true);
    const reveal = await stateOf(room.roomId);
    expect(reveal.phase).toBe("reveal");
    expect(reveal.revealed_answer).toBeTruthy();
    expect(reveal.deadline).not.toBeNull();

    const late = await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: room.others[0].player_token,
    });
    expect(late.ok).toBe(false);
    expect(late.error).toBe("buzz_closed");

    await expire(room.roomId);
    const back = await rpc(anon, "advance_clock", { p_code: room.code });
    expect(back.advanced).toBe(true);
    const board = await stateOf(room.roomId);
    expect(board.phase).toBe("board");
    expect(board.chooser_player_id).toBe(room.chooser.player_id);
  });

  it("последний отвечающий молчит: штраф и вскрытие ответа", async () => {
    const room = await table(["Сол", "Соджа"]);
    const [sodja] = room.others;
    await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: sodja.player_token,
    });
    await rpc(service, "apply_verdict", {
      p_code: room.code,
      p_correct: false,
      p_method: "host",
    });
    const lastWin = await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: room.chooser.player_token,
    });
    expect(lastWin.won).toBe(true);
    await expire(room.roomId);
    const done = await rpc(anon, "advance_clock", { p_code: room.code });
    expect(done.reason).toBe("answer_timeout");
    expect(await scoreOf(room.chooser.player_id)).toBe(-room.value);
    const reveal = await stateOf(room.roomId);
    expect(reveal.phase).toBe("reveal");
    expect(reveal.chooser_player_id).toBe(room.chooser.player_id);
  });

  it("проигравший гонку получает won=false, а не ошибку", async () => {
    const room = await table();
    const [sodja, mira] = room.others;
    const results = await Promise.all([
      rpc(anon, "buzz", {
        p_code: room.code,
        p_player_token: sodja.player_token,
      }),
      rpc(anon, "buzz", {
        p_code: room.code,
        p_player_token: mira.player_token,
      }),
    ]);
    expect(results.every((result) => result.ok)).toBe(true);
    expect(results.filter((result) => result.won)).toHaveLength(1);
  });
});
