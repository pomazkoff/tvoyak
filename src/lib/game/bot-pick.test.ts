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
  host_secret?: string;
  cat?: boolean;
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

describe.skipIf(!live)("ход в режиме бота", () => {
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

  async function botTable() {
    const created = await rpc(service, "create_room", { p_host_mode: "bot" });
    expect(created.ok).toBe(true);
    const roomId = created.room_id ?? "";
    const code = created.code ?? "";
    rooms.push(roomId);
    const sol = await rpc(anon, "join_room", {
      p_code: code,
      p_nickname: "Сол",
      p_role: "player",
    });
    const mira = await rpc(anon, "join_room", {
      p_code: code,
      p_nickname: "Мира",
      p_role: "player",
    });
    expect(sol.ok && mira.ok).toBe(true);
    const started = await rpc(service, "start_game", { p_code: code });
    expect(started.ok, started.error).toBe(true);
    const { data, error } = await service
      .from("game_states")
      .select("phase, chooser_player_id, current_question_id")
      .eq("room_id", roomId)
      .single();
    if (error || !data) throw new Error(error?.message ?? "нет партии");
    const chooser = data.chooser_player_id === sol.player_id ? sol : mira;
    const other = chooser.player_id === sol.player_id ? mira : sol;
    const { data: cells, error: cellError } = await service
      .from("questions")
      .select("id, special")
      .eq("room_id", roomId)
      .eq("round", 1)
      .eq("status", "hidden")
      .limit(2);
    if (cellError || !cells || cells.length < 2) {
      throw new Error(cellError?.message ?? "нет клеток");
    }
    return { code, roomId, chooser, other, cells, phase: data.phase };
  }

  it("клетку открывает выбирающий, чужой ход возвращает ошибку, телевизор ведущего может открыть запасную", async () => {
    const room = await botTable();
    expect(room.phase).toBe("board");

    const refused = await rpc(anon, "pick_cell", {
      p_code: room.code,
      p_player_token: room.other.player_token,
      p_question_id: room.cells[0].id,
    });
    expect(refused.ok).toBe(false);
    expect(refused.error).toBe("not_chooser");

    const picked = await rpc(anon, "pick_cell", {
      p_code: room.code,
      p_player_token: room.chooser.player_token,
      p_question_id: room.cells[0].id,
    });
    expect(picked.ok).toBe(true);
    expect(picked.cat).toBe(room.cells[0].special === "cat");

    const { data: afterPick } = await service
      .from("game_states")
      .select("phase, current_question_id")
      .eq("room_id", room.roomId)
      .single();
    expect(afterPick?.current_question_id).toBe(room.cells[0].id);
    expect(["question", "cat_pick"]).toContain(afterPick?.phase);

    const late = await rpc(service, "host_pick_cell", {
      p_code: room.code,
      p_question_id: room.cells[1].id,
    });
    expect(late.ok).toBe(false);
    expect(late.error).toBe("bad_phase");

    const fallback = await botTable();
    const { error: denied } = await anon.rpc("host_pick_cell", {
      p_code: fallback.code,
      p_question_id: fallback.cells[0].id,
    });
    expect(denied).toBeTruthy();

    const opened = await rpc(service, "host_pick_cell", {
      p_code: fallback.code,
      p_question_id: fallback.cells[0].id,
    });
    expect(opened.ok).toBe(true);
    const { data: afterHost } = await service
      .from("game_states")
      .select("phase, current_question_id")
      .eq("room_id", fallback.roomId)
      .single();
    expect(afterHost?.current_question_id).toBe(fallback.cells[0].id);
    expect(["question", "cat_pick"]).toContain(afterHost?.phase);
  });
});
