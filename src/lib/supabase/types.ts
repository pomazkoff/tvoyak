export type HostMode = "human" | "bot";
export type PlayMode = "versus" | "together";
export type PlayerRole = "player" | "spectator";
export type RoomStatus = "lobby" | "round1" | "round2" | "final" | "finished";

export type RoomRow = {
  id: string;
  code: string;
  status: RoomStatus;
  host_mode: HostMode;
  host_starts_media: boolean;
  /** Ведущий ведёт с телефона — на большом экране панели «Ведущему» нет. */
  host_phone?: boolean;
  /** Читать вопрос вслух; null — по умолчанию режима (бот — да). */
  host_voice?: boolean | null;
  /** «Сюрпризы»: баффы и дебаффы на 2–3 клетках. null — выключены (старые комнаты). */
  surprises?: boolean | null;
  /**
   * versus — соревнуются. together — общий счёт.
   * Нет поля, пока на базу не накатили миграцию: для клиента это versus.
   */
  play_mode?: PlayMode | null;
  team_score?: number | null;
  team_streak?: number | null;
  team_best_streak?: number | null;
  team_correct?: number | null;
  team_played?: number | null;
  /** Рекорд компании до этой партии. null — сравнивать не с чем. */
  team_record?: number | null;
  created_at: string;
};

export type PlayerRow = {
  id: string;
  nickname: string;
  role: PlayerRole;
  score: number;
  joined_at: string;
  /** «Я не у экрана»: телефон показывает вопрос, картинки и медиа. */
  remote?: boolean;
};

export type RpcOk = {
  ok: true;
};

export type RpcFail = {
  ok: false;
  error: string;
  server_time?: string;
};

export type CreateRoomResult =
  | (RpcOk & {
      room_id: string;
      code: string;
      host_secret: string;
      host_mode: HostMode;
    })
  | RpcFail;

export type JoinRoomResult =
  | (RpcOk & {
      player_id: string;
      player_token: string;
      room_id: string;
      nickname: string;
      role: PlayerRole;
      version: number;
    })
  | RpcFail;

export type LeaveRoomResult = (RpcOk & { version: number }) | RpcFail;

export type BuzzResult =
  | (RpcOk & {
      won: boolean;
      buzz_id: string;
      server_time: string;
      version: number;
    })
  | RpcFail;
