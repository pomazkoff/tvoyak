export type HostMode = "human" | "bot";
export type PlayerRole = "player" | "spectator";
export type RoomStatus = "lobby" | "round1" | "round2" | "final" | "finished";

export type RoomRow = {
  id: string;
  code: string;
  status: RoomStatus;
  host_mode: HostMode;
  created_at: string;
};

export type PlayerRow = {
  id: string;
  nickname: string;
  role: PlayerRole;
  score: number;
  joined_at: string;
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
