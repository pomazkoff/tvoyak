import { SHARE_FORMATS, type ShareFormat } from "./goals";
import { UTM_FIELDS, type UtmRecord, type UtmTouch } from "./utm";

const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export type AnalyticsInput = {
  role?: unknown;
  host_type?: unknown;
  play_mode?: unknown;
  room_id?: unknown;
  count?: unknown;
  tariff?: unknown;
  format?: unknown;
};

export type GoalParams = Record<string, string | number>;

function touchFlat(
  prefix: string,
  touch: UtmTouch | undefined,
  out: GoalParams,
) {
  if (!touch) return;
  for (const field of UTM_FIELDS) {
    const value = touch[field];
    if (value) out[`${prefix}${field}`] = value;
  }
}

/** Только безопасные поля. Имя, почта, телефон и прочий мусор отбрасываются. */
export function goalParams(
  input: Record<string, unknown> | undefined,
  utm: UtmRecord,
): GoalParams {
  const out: GoalParams = {};
  if (input) {
    if (input.role === "host" || input.role === "player") out.role = input.role;
    if (input.host_type === "bot" || input.host_type === "human") {
      out.host_type = input.host_type;
    }
    if (input.play_mode === "versus" || input.play_mode === "together") {
      out.play_mode = input.play_mode;
    }
    if (typeof input.room_id === "string" && UUID.test(input.room_id)) {
      out.room_id = input.room_id;
    }
    if (
      typeof input.count === "number" &&
      Number.isInteger(input.count) &&
      input.count >= 0 &&
      input.count <= 50
    ) {
      out.count = input.count;
    }
    if (input.tariff === 99 || input.tariff === 499) out.tariff = input.tariff;
    if (
      typeof input.format === "string" &&
      (SHARE_FORMATS as readonly string[]).includes(input.format)
    ) {
      out.format = input.format as ShareFormat;
    }
  }
  touchFlat("utm_first_", utm.first, out);
  touchFlat("utm_", utm.last, out);
  return out;
}

export function isUuid(value: unknown): value is string {
  return typeof value === "string" && UUID.test(value);
}
