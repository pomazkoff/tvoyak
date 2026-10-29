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
  reason?: string;
  version?: number;
};

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

describe.skipIf(!live)("защита ходов и выход из застреваний", () => {
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

  async function openRoom(mode: "human" | "bot", players = 2) {
    const created = await rpc(service, "create_room", { p_host_mode: mode });
    const code = created.code ?? "";
    const roomId = created.room_id ?? "";
    rooms.push(roomId);
    const seats: Rpc[] = [];
    for (let index = 0; index < players; index += 1) {
      seats.push(
        await rpc(anon, "join_room", {
          p_code: code,
          p_nickname: `Игрок ${index + 1}`,
          p_role: "player",
        }),
      );
    }
    const started = await rpc(service, "start_game", { p_code: code });
    expect(started.ok, started.error).toBe(true);
    const state = await stateOf(roomId);
    const chooser = seats.find(
      (seat) => seat.player_id === state.chooser_player_id,
    ) as Rpc;
    const others = seats.filter((seat) => seat !== chooser);
    return { code, roomId, seats, chooser, others };
  }

  async function stateOf(roomId: string) {
    const { data, error } = await service
      .from("game_states")
      .select(
        "phase, version, chooser_player_id, buzz_winner_player_id, current_question_id, deadline",
      )
      .eq("room_id", roomId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function cellId(roomId: string, special: "cat" | null) {
    const query = service
      .from("questions")
      .select("id")
      .eq("room_id", roomId)
      .eq("round", 1)
      .eq("status", "hidden");
    const { data } = await (
      special ? query.eq("special", special) : query.is("special", null)
    ).limit(1);
    return data?.[0]?.id as string;
  }

  it("anon не вызывает ходы ведущего и не видит эталон", async () => {
    const room = await openRoom("human");
    for (const [name, args] of [
      ["start_game", { p_code: room.code }],
      ["open_buzz", { p_code: room.code }],
      ["pass_question", { p_code: room.code }],
      ["continue_game", { p_code: room.code }],
      ["host_sheet", { p_code: room.code }],
      ["final_sheet", { p_code: room.code }],
      [
        "apply_verdict",
        { p_code: room.code, p_correct: true, p_method: "host" },
      ],
      [
        "begin_answer",
        {
          p_code: room.code,
          p_player_token: room.chooser.player_token,
          p_text: "x",
        },
      ],
    ] as const) {
      const { error } = await anon.rpc(name, args);
      expect(error?.code, name).toBe("42501");
    }
  });

  it("двойной ответ и двойной вердикт не задевают следующего игрока", async () => {
    const room = await openRoom("human", 3);
    const [second, third] = room.others;
    await rpc(anon, "pick_cell", {
      p_code: room.code,
      p_player_token: room.chooser.player_token,
      p_question_id: await cellId(room.roomId, null),
    });
    await rpc(service, "open_buzz", { p_code: room.code });
    await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: second.player_token,
    });
    await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: third.player_token,
    });
    const first = await rpc(service, "begin_answer", {
      p_code: room.code,
      p_player_token: second.player_token,
      p_text: "наугад",
    });
    expect(first.ok).toBe(true);
    const again = await rpc(service, "begin_answer", {
      p_code: room.code,
      p_player_token: second.player_token,
      p_text: "наугад",
    });
    expect(again.error).toBe("already_answered");

    const wrong = await rpc(service, "apply_verdict", {
      p_code: room.code,
      p_correct: false,
      p_method: "host",
      p_player_id: second.player_id,
    });
    expect(wrong.ok).toBe(true);
    const promoted = await stateOf(room.roomId);
    expect(promoted.phase).toBe("answering");
    expect(promoted.buzz_winner_player_id).toBe(third.player_id);

    const doubleClick = await rpc(service, "apply_verdict", {
      p_code: room.code,
      p_correct: false,
      p_method: "host",
      p_player_id: second.player_id,
    });
    expect(doubleClick.error).toBe("stale");
    const { data: scores } = await service
      .from("players")
      .select("id, score")
      .eq("room_id", room.roomId);
    expect(scores?.find((row) => row.id === third.player_id)?.score).toBe(0);
    expect((await stateOf(room.roomId)).buzz_winner_player_id).toBe(
      third.player_id,
    );
  });

  it("ушёл выбирающий — ход переходит другому игроку", async () => {
    const room = await openRoom("human", 3);
    const left = await rpc(anon, "leave_room", {
      p_code: room.code,
      p_player_token: room.chooser.player_token,
    });
    expect(left.ok).toBe(true);
    const state = await stateOf(room.roomId);
    expect(state.phase).toBe("board");
    expect(room.others.map((seat) => seat.player_id)).toContain(
      state.chooser_player_id,
    );
  });

  it("кот без адресата уходит другому игроку по сроку", async () => {
    const room = await openRoom("human");
    const picked = await rpc(anon, "pick_cell", {
      p_code: room.code,
      p_player_token: room.chooser.player_token,
      p_question_id: await cellId(room.roomId, "cat"),
    });
    expect(picked.ok).toBe(true);
    const catPick = await stateOf(room.roomId);
    expect(catPick.phase).toBe("cat_pick");
    expect(catPick.deadline).toBeTruthy();
    await service
      .from("game_states")
      .update({ deadline: new Date(Date.now() - 2000).toISOString() })
      .eq("room_id", room.roomId);
    const tick = await rpc(anon, "advance_clock", { p_code: room.code });
    expect(tick.reason).toBe("cat_timeout");
    const answering = await stateOf(room.roomId);
    expect(answering.phase).toBe("answering");
    const { data: question } = await service
      .from("questions")
      .select("assigned_player_id")
      .eq("id", catPick.current_question_id)
      .single();
    expect(question?.assigned_player_id).toBe(room.others[0].player_id);
  });

  it("бот сам открывает кнопку, если чтение зависло", async () => {
    const room = await openRoom("bot");
    await rpc(anon, "pick_cell", {
      p_code: room.code,
      p_player_token: room.chooser.player_token,
      p_question_id: await cellId(room.roomId, null),
    });
    const early = await rpc(anon, "advance_clock", { p_code: room.code });
    expect((await stateOf(room.roomId)).phase).toBe("question");
    expect(early.ok).toBe(true);
    await service
      .from("game_states")
      .update({ updated_at: new Date(Date.now() - 60000).toISOString() })
      .eq("room_id", room.roomId);
    const tick = await rpc(anon, "advance_clock", { p_code: room.code });
    expect(tick.reason).toBe("read_timeout");
    expect((await stateOf(room.roomId)).phase).toBe("buzzing");
  });
  it("финал у бота подводит сервер по сроку, даже без телевизора", async () => {
    const room = await openRoom("bot", 3);
    for (const seat of room.seats) {
      await service
        .from("players")
        .update({ score: 500 })
        .eq("id", seat.player_id);
    }
    // Поле сыграно: следующий шаг после вскрытия — ставки финала.
    await service
      .from("questions")
      .update({ status: "answered" })
      .eq("room_id", room.roomId);
    await service
      .from("game_states")
      .update({ round: 2, phase: "reveal", deadline: null })
      .eq("room_id", room.roomId);
    const toFinal = await rpc(service, "continue_game", { p_code: room.code });
    expect(toFinal.ok, toFinal.error).toBe(true);
    const { data: finalState } = await service
      .from("game_states")
      .select("phase, current_question_id")
      .eq("room_id", room.roomId)
      .single();
    expect(finalState?.phase).toBe("wager");
    const { data: secret } = await service
      .from("question_secrets")
      .select("answer")
      .eq("question_id", finalState?.current_question_id)
      .single();
    const [a, b, c] = room.seats;
    for (const [seat, wager] of [
      [a, 100],
      [b, 100],
      [c, 200],
    ] as const) {
      const placed = await rpc(anon, "place_wager", {
        p_code: room.code,
        p_player_token: seat.player_token,
        p_wager: wager,
      });
      expect(placed.ok, placed.error).toBe(true);
    }
    expect((await stateOf(room.roomId)).phase).toBe("final_answer");
    const right = await rpc(service, "begin_final_answer", {
      p_code: room.code,
      p_player_token: a.player_token,
      p_text: `  ${String(secret?.answer ?? "").toUpperCase()}!  `,
    });
    expect(right.ok, right.error).toBe(true);
    await rpc(service, "begin_final_answer", {
      p_code: room.code,
      p_player_token: b.player_token,
      p_text: "совсем не то",
    });
    // Срок ответа вышел, телевизора нет: часы телефонов переводят в judging.
    const past = new Date(Date.now() - 2000).toISOString();
    await service
      .from("game_states")
      .update({ deadline: past })
      .eq("room_id", room.roomId);
    const judged = await rpc(anon, "advance_clock", { p_code: room.code });
    expect(judged.reason).toBe("final_timeout");
    const judging = await stateOf(room.roomId);
    expect(judging.phase).toBe("judging");
    expect(judging.deadline).not.toBeNull();
    // Никто не подвёл итог — по сроку сервер делает это сам.
    await service
      .from("game_states")
      .update({ deadline: past })
      .eq("room_id", room.roomId);
    const settled = await rpc(anon, "advance_clock", { p_code: room.code });
    expect(settled.reason).toBe("final_auto");
    expect((await stateOf(room.roomId)).phase).toBe("finished");
    const { data: scores } = await service
      .from("players")
      .select("id, score")
      .eq("room_id", room.roomId);
    const scoreOf = (id?: string) =>
      scores?.find((row) => row.id === id)?.score;
    expect(scoreOf(a.player_id)).toBe(600);
    expect(scoreOf(b.player_id)).toBe(400);
    expect(scoreOf(c.player_id)).toBe(300);
  });
});
