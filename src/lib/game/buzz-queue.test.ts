import { existsSync, readFileSync } from "node:fs";
import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { afterEach, describe, expect, it } from "vitest";
import { scoreboardPlayers } from "@/lib/game/scoreboard";

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
  promoted?: boolean;
  phase?: string;
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

function secondsAhead(deadline: string | null) {
  expect(deadline).toBeTruthy();
  return (new Date(deadline ?? 0).getTime() - Date.now()) / 1000;
}

describe.skipIf(!live)("очередь кнопки и финал", () => {
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

  async function openRoom() {
    const created = await rpc(service, "create_room", { p_host_mode: "human" });
    expect(created.ok).toBe(true);
    const roomId = created.room_id ?? "";
    const code = created.code ?? "";
    rooms.push(roomId);
    const anya = await rpc(anon, "join_room", {
      p_code: code,
      p_nickname: "Аня",
      p_role: "player",
    });
    const borya = await rpc(anon, "join_room", {
      p_code: code,
      p_nickname: "Боря",
      p_role: "player",
    });
    const watcher = await rpc(anon, "join_room", {
      p_code: code,
      p_nickname: "Зритель",
      p_role: "spectator",
    });
    expect(anya.ok && borya.ok && watcher.ok).toBe(true);
    const started = await rpc(service, "start_game", { p_code: code });
    expect(started.ok, started.error).toBe(true);
    return {
      roomId,
      code,
      anya,
      borya,
      watcher,
    };
  }

  async function stateOf(roomId: string) {
    const { data, error } = await service
      .from("game_states")
      .select(
        "phase, round, chooser_player_id, buzz_winner_player_id, current_question_id, deadline, revealed_answer",
      )
      .eq("room_id", roomId)
      .single();
    if (error) throw new Error(error.message);
    return data;
  }

  async function cell(
    roomId: string,
    special: "cat" | null,
  ): Promise<{ id: string; value: number }> {
    const query = service
      .from("questions")
      .select("id, value, special")
      .eq("room_id", roomId)
      .eq("round", 1)
      .eq("status", "hidden");
    const { data, error } = await (
      special ? query.eq("special", special) : query.is("special", null)
    ).limit(1);
    if (error || !data?.[0]) throw new Error(error?.message ?? "нет клетки");
    return data[0];
  }

  async function expire(roomId: string) {
    const { error } = await service
      .from("game_states")
      .update({ deadline: new Date(Date.now() - 5000).toISOString() })
      .eq("room_id", roomId);
    if (error) throw new Error(error.message);
  }

  it("после неверного ответа отдаёт ход тому, кто нажал вторым", async () => {
    const room = await openRoom();
    const game = await stateOf(room.roomId);
    const chooser =
      game.chooser_player_id === room.anya.player_id ? room.anya : room.borya;
    const other =
      chooser.player_id === room.anya.player_id ? room.borya : room.anya;
    const picked = await cell(room.roomId, null);
    expect(
      (
        await rpc(anon, "pick_cell", {
          p_code: room.code,
          p_player_token: chooser.player_token,
          p_question_id: picked.id,
        })
      ).ok,
    ).toBe(true);
    expect((await rpc(service, "open_buzz", { p_code: room.code })).ok).toBe(
      true,
    );
    const buzzing = await stateOf(room.roomId);
    expect(secondsAhead(buzzing.deadline)).toBeGreaterThan(12);
    expect(secondsAhead(buzzing.deadline)).toBeLessThan(16);

    const first = await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: chooser.player_token,
    });
    const second = await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: other.player_token,
    });
    expect(first.won).toBe(true);
    expect(second.won).toBe(false);
    const answering = await stateOf(room.roomId);
    expect(secondsAhead(answering.deadline)).toBeGreaterThan(17);
    expect(secondsAhead(answering.deadline)).toBeLessThan(21);

    const verdict = await rpc(service, "apply_verdict", {
      p_code: room.code,
      p_correct: false,
      p_method: "host",
    });
    expect(verdict.ok).toBe(true);
    expect(verdict.revealed).toBe(false);
    expect(verdict.promoted).toBe(true);
    const promoted = await stateOf(room.roomId);
    expect(promoted.phase).toBe("answering");
    expect(promoted.buzz_winner_player_id).toBe(other.player_id);
    expect(promoted.revealed_answer).toBeNull();
    expect(secondsAhead(promoted.deadline)).toBeGreaterThan(17);

    const turn = await rpc(service, "begin_answer", {
      p_code: room.code,
      p_player_token: other.player_token,
      p_text: "нет",
    });
    expect(turn.ok).toBe(true);
    const closed = await rpc(service, "apply_verdict", {
      p_code: room.code,
      p_correct: false,
      p_method: "host",
    });
    expect(closed.revealed).toBe(true);
    expect((await stateOf(room.roomId)).phase).toBe("reveal");
  });

  it("по таймауту ответа передаёт ход следующему в очереди", async () => {
    const room = await openRoom();
    const game = await stateOf(room.roomId);
    const chooser =
      game.chooser_player_id === room.anya.player_id ? room.anya : room.borya;
    const other =
      chooser.player_id === room.anya.player_id ? room.borya : room.anya;
    const picked = await cell(room.roomId, null);
    await rpc(anon, "pick_cell", {
      p_code: room.code,
      p_player_token: chooser.player_token,
      p_question_id: picked.id,
    });
    await rpc(service, "open_buzz", { p_code: room.code });
    await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: chooser.player_token,
    });
    await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: other.player_token,
    });
    await expire(room.roomId);
    const advanced = await rpc(anon, "advance_clock", { p_code: room.code });
    expect(advanced.ok).toBe(true);
    const next = await stateOf(room.roomId);
    expect(next.phase).toBe("answering");
    expect(next.buzz_winner_player_id).toBe(other.player_id);
    expect(next.revealed_answer).toBeNull();
    const { data: scores } = await service
      .from("players")
      .select("id, score")
      .eq("room_id", room.roomId);
    expect(scores?.find((row) => row.id === chooser.player_id)?.score).toBe(
      -picked.value,
    );
    expect(scores?.find((row) => row.id === other.player_id)?.score).toBe(0);
  });

  it("без очереди снова открывает кнопку, а пустое окно просто вскрывает ответ", async () => {
    const room = await openRoom();
    const game = await stateOf(room.roomId);
    const chooser =
      game.chooser_player_id === room.anya.player_id ? room.anya : room.borya;
    const other =
      chooser.player_id === room.anya.player_id ? room.borya : room.anya;
    const picked = await cell(room.roomId, null);
    await rpc(anon, "pick_cell", {
      p_code: room.code,
      p_player_token: chooser.player_token,
      p_question_id: picked.id,
    });
    await rpc(service, "open_buzz", { p_code: room.code });
    await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: chooser.player_token,
    });
    const wrong = await rpc(service, "apply_verdict", {
      p_code: room.code,
      p_correct: false,
      p_method: "host",
    });
    expect(wrong.revealed).toBe(false);
    expect(wrong.promoted).toBe(false);
    const reopened = await stateOf(room.roomId);
    expect(reopened.phase).toBe("buzzing");
    expect(reopened.buzz_winner_player_id).toBeNull();
    expect(secondsAhead(reopened.deadline)).toBeGreaterThan(12);
    const again = await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: chooser.player_token,
    });
    expect(again.ok).toBe(false);
    expect(again.error).toBe("already_buzzed");
    const late = await rpc(anon, "buzz", {
      p_code: room.code,
      p_player_token: other.player_token,
    });
    expect(late.won).toBe(true);

    const quiet = await cell(room.roomId, null);
    await rpc(service, "apply_verdict", {
      p_code: room.code,
      p_correct: true,
      p_method: "host",
    });
    await rpc(service, "continue_game", { p_code: room.code });
    const board = await stateOf(room.roomId);
    const quietChooser =
      board.chooser_player_id === room.anya.player_id ? room.anya : room.borya;
    await rpc(anon, "pick_cell", {
      p_code: room.code,
      p_player_token: quietChooser.player_token,
      p_question_id: quiet.id,
    });
    await rpc(service, "open_buzz", { p_code: room.code });
    const before = await service
      .from("players")
      .select("score")
      .eq("room_id", room.roomId);
    await expire(room.roomId);
    await rpc(anon, "advance_clock", { p_code: room.code });
    const revealed = await stateOf(room.roomId);
    expect(revealed.phase).toBe("reveal");
    expect(revealed.revealed_answer).toBeTruthy();
    const after = await service
      .from("players")
      .select("score")
      .eq("room_id", room.roomId);
    expect(after.data?.map((row) => row.score).sort()).toEqual(
      before.data?.map((row) => row.score).sort(),
    );
  });

  it("у кота таймаут 25 секунд и сразу вскрывает ответ", async () => {
    const room = await openRoom();
    const game = await stateOf(room.roomId);
    const chooser =
      game.chooser_player_id === room.anya.player_id ? room.anya : room.borya;
    const other =
      chooser.player_id === room.anya.player_id ? room.borya : room.anya;
    const cat = await cell(room.roomId, "cat");
    await rpc(anon, "pick_cell", {
      p_code: room.code,
      p_player_token: chooser.player_token,
      p_question_id: cat.id,
    });
    const assigned = await rpc(anon, "assign_cat", {
      p_code: room.code,
      p_player_token: chooser.player_token,
      p_target_id: other.player_id,
    });
    expect(assigned.ok, assigned.error).toBe(true);
    const answering = await stateOf(room.roomId);
    expect(answering.phase).toBe("answering");
    expect(secondsAhead(answering.deadline)).toBeGreaterThan(22);
    expect(secondsAhead(answering.deadline)).toBeLessThan(26);
    await expire(room.roomId);
    await rpc(anon, "advance_clock", { p_code: room.code });
    const revealed = await stateOf(room.roomId);
    expect(revealed.phase).toBe("reveal");
    const { data: score } = await service
      .from("players")
      .select("score")
      .eq("id", other.player_id)
      .single();
    expect(score?.score).toBe(-cat.value);
  });

  it("финал: тайные ставки, таймауты и зритель вне счёта", async () => {
    const room = await openRoom();
    const { data: people, error: peopleError } = await anon
      .from("players")
      .select("id, nickname, role, score")
      .eq("room_id", room.roomId);
    expect(peopleError).toBeNull();
    expect(people?.some((person) => person.role === "spectator")).toBe(true);
    expect(
      scoreboardPlayers(people ?? []).some(
        (person) => person.nickname === "Зритель",
      ),
    ).toBe(false);

    await service
      .from("questions")
      .update({ status: "answered" })
      .eq("room_id", room.roomId)
      .in("round", [1, 2]);
    await service
      .from("players")
      .update({ score: 300 })
      .eq("id", room.anya.player_id);
    await service
      .from("players")
      .update({ score: 0 })
      .eq("id", room.borya.player_id);
    await service
      .from("players")
      .update({ score: 80 })
      .eq("id", room.watcher.player_id);
    await service
      .from("game_states")
      .update({
        phase: "reveal",
        round: 2,
        current_question_id: null,
        revealed_answer: null,
        buzz_winner_player_id: null,
        deadline: null,
      })
      .eq("room_id", room.roomId);

    const continued = await rpc(service, "continue_game", {
      p_code: room.code,
    });
    expect(continued.phase).toBe("wager");
    const wager = await stateOf(room.roomId);
    expect(wager.round).toBe(3);
    expect(secondsAhead(wager.deadline)).toBeGreaterThan(55);
    expect(secondsAhead(wager.deadline)).toBeLessThan(62);
    const hidden = await anon
      .from("question_board")
      .select("prompt, revealed_answer")
      .eq("id", wager.current_question_id)
      .single();
    expect(hidden.data?.prompt).toBeNull();
    expect(hidden.data?.revealed_answer).toBeNull();

    expect(
      (
        await rpc(anon, "place_wager", {
          p_code: room.code,
          p_player_token: room.watcher.player_token,
          p_wager: 10,
        })
      ).error,
    ).toBe("not_eligible");
    expect(
      (
        await rpc(anon, "place_wager", {
          p_code: room.code,
          p_player_token: room.borya.player_token,
          p_wager: 0,
        })
      ).error,
    ).toBe("not_eligible");

    await expire(room.roomId);
    await rpc(anon, "advance_clock", { p_code: room.code });
    const missed = await service
      .from("answers")
      .select("player_id, wager")
      .eq("question_id", wager.current_question_id);
    expect(
      missed.data?.find((row) => row.player_id === room.anya.player_id)?.wager,
    ).toBe(0);
    expect(
      missed.data?.some((row) => row.player_id === room.watcher.player_id),
    ).toBe(false);

    const { error: leaked } = await anon
      .from("answers")
      .select("wager")
      .eq("question_id", wager.current_question_id);
    expect(leaked).toBeTruthy();

    const final = await stateOf(room.roomId);
    expect(final.phase).toBe("final_answer");
    expect(secondsAhead(final.deadline)).toBeGreaterThan(40);
    expect(secondsAhead(final.deadline)).toBeLessThan(47);
    const shown = await anon
      .from("question_board")
      .select("prompt, revealed_answer")
      .eq("id", final.current_question_id)
      .single();
    expect(shown.data?.prompt).toBeTruthy();
    expect(shown.data?.revealed_answer).toBeNull();

    await service
      .from("answers")
      .update({ wager: 100 })
      .eq("question_id", final.current_question_id)
      .eq("player_id", room.anya.player_id);
    const written = await rpc(service, "begin_final_answer", {
      p_code: room.code,
      p_player_token: room.anya.player_token,
      p_text: "мимо",
    });
    expect(written.ok, written.error).toBe(true);
    const judging = await stateOf(room.roomId);
    expect(judging.phase).toBe("judging");
    const settled = await rpc(service, "apply_final", {
      p_code: room.code,
      p_rows: [
        {
          player_id: room.anya.player_id,
          correct: false,
          method: "host",
        },
      ],
    });
    expect(settled.ok, settled.error).toBe(true);
    const done = await stateOf(room.roomId);
    expect(done.phase).toBe("finished");
    expect(done.revealed_answer).toBeTruthy();
    const { data: anya } = await service
      .from("players")
      .select("score")
      .eq("id", room.anya.player_id)
      .single();
    expect(anya?.score).toBe(200);
    const published = await anon
      .from("question_board")
      .select("revealed_answer")
      .eq("id", done.current_question_id)
      .single();
    expect(published.data?.revealed_answer).toBe(done.revealed_answer);
  });
});
