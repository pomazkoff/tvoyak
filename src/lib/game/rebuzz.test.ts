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
  revealed?: boolean;
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

describe.skipIf(!live)("повторная кнопка после неверного ответа", () => {
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

  async function table() {
    const created = await rpc(service, "create_room", { p_host_mode: "bot" });
    expect(created.ok).toBe(true);
    const roomId = created.room_id ?? "";
    const code = created.code ?? "";
    rooms.push(roomId);
    const seats: Seat[] = [];
    for (const nickname of ["Сол", "Соджа", "Мира"]) {
      const joined = await rpc(anon, "join_room", {
        p_code: code,
        p_nickname: nickname,
        p_role: "player",
      });
      expect(joined.ok).toBe(true);
      seats.push(joined);
    }
    expect((await rpc(service, "start_game", { p_code: code })).ok).toBe(true);
    const { data: game, error } = await service
      .from("game_states")
      .select("chooser_player_id, phase")
      .eq("room_id", roomId)
      .single();
    if (error || !game) throw new Error(error?.message ?? "нет партии");
    const { data: cells, error: cellError } = await service
      .from("questions")
      .select("id, value")
      .eq("room_id", roomId)
      .eq("round", 1)
      .eq("status", "hidden")
      .is("special", null)
      .limit(1);
    if (cellError || !cells?.[0])
      throw new Error(cellError?.message ?? "нет клетки");
    return {
      code,
      roomId,
      seats,
      cell: cells[0],
      chooserId: game.chooser_player_id,
    };
  }

  async function stateOf(roomId: string) {
    const { data, error } = await service
      .from("game_states")
      .select(
        "phase, chooser_player_id, buzz_winner_player_id, revealed_answer, deadline",
      )
      .eq("room_id", roomId)
      .single();
    if (error || !data) throw new Error(error?.message ?? "нет состояния");
    return data;
  }

  async function scoresOf(roomId: string) {
    const { data, error } = await service
      .from("players")
      .select("id, score")
      .eq("room_id", roomId);
    if (error || !data) throw new Error(error?.message ?? "нет счёта");
    return data;
  }

  it("неверный ответ открывает кнопку следующему, верный меняет счёт и выбирающего", async () => {
    const room = await table();
    const sol =
      room.seats.find((seat) => seat.player_id === room.chooserId) ??
      room.seats[0];
    const rest = room.seats.filter((seat) => seat.player_id !== sol?.player_id);
    const sodja = rest[0];
    const mira = rest[1];
    await rpc(anon, "pick_cell", {
      p_code: room.code,
      p_player_token: sol?.player_token,
      p_question_id: room.cell.id,
    });
    await rpc(service, "open_buzz", { p_code: room.code });

    const first = await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: sol?.player_token,
    });
    expect(first.won).toBe(true);
    expect(
      (
        await rpc(service, "apply_verdict", {
          p_code: room.code,
          p_correct: false,
          p_method: "host",
        })
      ).revealed,
    ).toBe(false);
    const reopened = await stateOf(room.roomId);
    expect(reopened.phase).toBe("buzzing");
    expect(reopened.buzz_winner_player_id).toBeNull();

    const again = await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: sol?.player_token,
    });
    expect(again.ok).toBe(false);
    expect(again.error).toBe("already_buzzed");

    const second = await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: sodja?.player_token,
    });
    expect(second.ok).toBe(true);
    expect(second.won).toBe(true);
    expect(second.error).toBeUndefined();

    const right = await rpc(service, "apply_verdict", {
      p_code: room.code,
      p_correct: true,
      p_method: "host",
    });
    expect(right.ok).toBe(true);
    expect(right.revealed).toBe(true);
    const revealed = await stateOf(room.roomId);
    expect(revealed.phase).toBe("reveal");
    expect(revealed.chooser_player_id).toBe(sodja?.player_id);
    expect(revealed.buzz_winner_player_id).toBeNull();

    const scores = await scoresOf(room.roomId);
    expect(scores.find((row) => row.id === sol?.player_id)?.score).toBe(
      -room.cell.value,
    );
    expect(scores.find((row) => row.id === sodja?.player_id)?.score).toBe(
      room.cell.value,
    );
    expect(scores.find((row) => row.id === mira?.player_id)?.score).toBe(0);

    expect(
      (await rpc(service, "continue_game", { p_code: room.code })).ok,
    ).toBe(true);
    const board = await stateOf(room.roomId);
    expect(board.phase).toBe("board");
    expect(board.chooser_player_id).toBe(sodja?.player_id);
  });

  it("просроченный срок после неверного ответа не блокирует того, кто ещё не отвечал", async () => {
    const room = await table();
    const sol =
      room.seats.find((seat) => seat.player_id === room.chooserId) ??
      room.seats[0];
    const sodja = room.seats.find((seat) => seat.player_id !== sol?.player_id);
    await rpc(anon, "pick_cell", {
      p_code: room.code,
      p_player_token: sol?.player_token,
      p_question_id: room.cell.id,
    });
    await rpc(service, "open_buzz", { p_code: room.code });
    await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: sol?.player_token,
    });
    await rpc(service, "apply_verdict", {
      p_code: room.code,
      p_correct: false,
      p_method: "host",
    });
    const { error } = await service
      .from("game_states")
      .update({
        phase: "buzzing",
        buzz_winner_player_id: sol?.player_id,
        deadline: new Date(Date.now() - 5000).toISOString(),
      })
      .eq("room_id", room.roomId);
    if (error) throw new Error(error.message);

    const healed = await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: sodja?.player_token,
    });
    expect(healed.ok).toBe(true);
    expect(healed.won).toBe(true);
    const next = await stateOf(room.roomId);
    expect(next.phase).toBe("answering");
    expect(next.buzz_winner_player_id).toBe(sodja?.player_id);
  });
});
