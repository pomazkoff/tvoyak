import { readFileSync } from "node:fs";
import { createClient } from "@supabase/supabase-js";

loadEnv(".env.local");

const url = process.env.SUPABASE_URL;
const anonKey = process.env.SUPABASE_ANON_KEY;
const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!url || !anonKey || !serviceKey) {
  console.error(
    "В .env.local нужны SUPABASE_URL, SUPABASE_ANON_KEY и SUPABASE_SERVICE_ROLE_KEY.",
  );
  process.exit(1);
}

const service = createClient(url, serviceKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
const anon = createClient(url, anonKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});

let roomId = null;

try {
  const created = await rpc(service, "create_room", { p_host_mode: "human" });
  assert(created.ok === true, "комната не создалась");
  roomId = created.room_id;
  const code = created.code;
  console.log(`Комната ${code}`);

  const players = [];
  for (let index = 1; index <= 10; index += 1) {
    const joined = await rpc(anon, "join_room", {
      p_code: code,
      p_nickname: `Игрок ${index}`,
      p_role: "player",
    });
    assert(
      joined.ok === true,
      `игрок ${index} не вошёл: ${joined.error ?? ""}`,
    );
    players.push(joined);
  }

  const extra = await rpc(anon, "join_room", {
    p_code: code,
    p_nickname: "Лишний",
    p_role: "player",
  });
  assert(
    extra.ok === false && extra.error === "room_full",
    "одиннадцатый игрок должен получить отказ",
  );

  const spectator = await rpc(anon, "join_room", {
    p_code: code,
    p_nickname: "Зритель",
    p_role: "spectator",
  });
  assert(spectator.ok === true, "зритель не вошёл");

  const spectatorBuzz = await rpc(anon, "buzz", {
    p_code: code,
    p_player_token: spectator.player_token,
  });
  assert(
    spectatorBuzz.ok === false &&
      spectatorBuzz.error === "spectators_cannot_buzz",
    "зритель не должен отвечать",
  );

  const early = await rpc(anon, "buzz", {
    p_code: code,
    p_player_token: players[0].player_token,
  });
  assert(
    early.ok === false && early.error === "no_active_question",
    "без вопроса кнопка должна молчать",
  );
  assert(
    typeof early.server_time === "string",
    "в ответе нет серверного времени",
  );
  assert(
    Math.abs(Date.now() - Date.parse(early.server_time)) < 60_000,
    "server_time не похоже на время базы",
  );

  const listed = await anon
    .from("players")
    .select("id, nickname, role, score, joined_at")
    .eq("room_id", roomId)
    .order("joined_at", { ascending: true });
  assert(!listed.error, `список игроков: ${listed.error?.message ?? ""}`);
  assert(
    listed.data.length === 11,
    `в лобби ${listed.data?.length ?? 0} человек, ждали 11`,
  );
  assert(
    listed.data.filter((row) => row.role === "player").length === 10,
    "за столом должно быть 10 игроков",
  );
  assert(
    !listed.data.some((row) => "token_hash" in row),
    "в списке игроков виден секрет",
  );

  const room = await anon.from("rooms").select("*").eq("id", roomId).single();
  assert(!room.error, "комнату не прочитать");
  assert(!("host_secret_hash" in room.data), "хеш ведущего попал в выдачу");

  const hiddenSecrets = await anon
    .from("room_secrets")
    .select("room_id")
    .limit(5);
  assert(
    !hiddenSecrets.data || hiddenSecrets.data.length === 0,
    "секреты комнаты читаются с anon",
  );

  const question = await service
    .from("questions")
    .insert({
      room_id: roomId,
      round: 1,
      category: "Проверка",
      value: 100,
      prompt: "Столица России?",
      answer: "Москва",
      row_index: 0,
      col_index: 0,
    })
    .select("id")
    .single();
  assert(
    !question.error && question.data?.id,
    `вопрос не записался: ${question.error?.message ?? ""}`,
  );

  const leaked = await anon
    .from("questions")
    .select("id, prompt, answer")
    .eq("id", question.data.id);
  assert(
    Boolean(leaked.error) ||
      !leaked.data?.some((row) => "answer" in row && row.answer),
    "anon видит эталон ответа",
  );
  const visible = await anon
    .from("questions")
    .select("id, prompt, category, value")
    .eq("id", question.data.id)
    .single();
  assert(
    visible.data?.prompt === "Столица России?",
    "формулировку вопроса не видно",
  );

  const opened = await service
    .from("game_states")
    .update({
      phase: "buzzing",
      round: 1,
      current_question_id: question.data.id,
    })
    .eq("room_id", roomId);
  assert(!opened.error, `не открылся вопрос: ${opened.error?.message ?? ""}`);

  const clientA = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const clientB = createClient(url, anonKey, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  const [left, right] = await Promise.all([
    rpc(clientA, "buzz", {
      p_code: code,
      p_player_token: players[0].player_token,
    }),
    rpc(clientB, "buzz", {
      p_code: code,
      p_player_token: players[1].player_token,
    }),
  ]);
  assert(
    left.ok === true && right.ok === true,
    "одно из нажатий не записалось",
  );
  assert(left.won !== right.won, "победитель должен быть ровно один");
  const winner = left.won
    ? { buzz: left, player: players[0] }
    : { buzz: right, player: players[1] };
  const loser = left.won ? right : left;
  assert(
    Date.parse(winner.buzz.server_time) <= Date.parse(loser.server_time),
    "победитель не первый по серверному времени",
  );

  const state = await service
    .from("game_states")
    .select("phase, buzz_winner_player_id")
    .eq("room_id", roomId)
    .single();
  assert(state.data?.phase === "answering", "после нажатия фаза не answering");
  assert(
    state.data?.buzz_winner_player_id === winner.player.player_id,
    "в состоянии не тот победитель",
  );

  const buzzes = await service
    .from("buzzes")
    .select("player_id, is_first, server_time")
    .eq("question_id", question.data.id);
  assert(
    buzzes.data?.filter((row) => row.is_first).length === 1,
    "метка первого нажатия не одна",
  );

  await expectRealtimeJoin(anon, roomId, code);

  console.log(
    "Лобби, отказ 11-му игроку и buzz по серверному времени проверены.",
  );
} catch (error) {
  console.error(error instanceof Error ? error.message : error);
  process.exitCode = 1;
} finally {
  if (roomId && process.exitCode !== 1) {
    await service.from("rooms").delete().eq("id", roomId);
  }
}

function loadEnv(path) {
  const text = readFileSync(path, "utf8");
  for (const line of text.split("\n")) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith("#")) continue;
    const separator = trimmed.indexOf("=");
    if (separator === -1) continue;
    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();
    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }
    if (process.env[key] === undefined) process.env[key] = value;
  }
}

async function rpc(client, name, args) {
  const { data, error } = await client.rpc(name, args);
  if (error) {
    throw new Error(`${name}: ${error.message}`);
  }
  return data;
}

function assert(condition, message) {
  if (!condition) throw new Error(message);
}

function expectRealtimeJoin(client, room, code) {
  return new Promise((resolve, reject) => {
    const timer = setTimeout(() => {
      void client.removeChannel(channel);
      reject(new Error("Realtime не прислал нового игрока"));
    }, 15_000);

    const channel = client
      .channel(`verify-${room}`)
      .on(
        "postgres_changes",
        {
          event: "INSERT",
          schema: "public",
          table: "players",
          filter: `room_id=eq.${room}`,
        },
        (payload) => {
          if (payload.new?.nickname !== "Эфир") return;
          clearTimeout(timer);
          void client.removeChannel(channel);
          resolve();
        },
      )
      .subscribe((status) => {
        if (status === "SUBSCRIBED") {
          void rpc(client, "join_room", {
            p_code: code,
            p_nickname: "Эфир",
            p_role: "spectator",
          }).catch((error) => {
            clearTimeout(timer);
            reject(error);
          });
        }
        if (status === "CHANNEL_ERROR" || status === "TIMED_OUT") {
          clearTimeout(timer);
          reject(new Error(`Realtime: ${status}`));
        }
      });
  });
}
