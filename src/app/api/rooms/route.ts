import { saveUtm } from "@/lib/analytics/persist";
import { sanitizeUtm } from "@/lib/analytics/utm";
import { paywallEnabled } from "@/lib/billing/config";
import { isDeviceId } from "@/lib/billing/products";
import { checkAccess, ipHash, userFromRequest } from "@/lib/billing/server";
import { loadThemeCatalog } from "@/lib/game/theme-catalog";
import { inspectBoard, parseThemeBoard } from "@/lib/game/themes";
import { isCompanyId } from "@/lib/rooms/company";
import { getServiceSupabase } from "@/lib/supabase/admin";
import { hostLabelFromUser } from "@/lib/share/host-label";
import { parsePlayMode } from "@/lib/game/together";
import type {
  CreateRoomResult,
  HostMode,
  PlayMode,
} from "@/lib/supabase/types";

export async function POST(request: Request) {
  let hostMode: HostMode = "human";
  let playMode: PlayMode = "versus";
  let company: string | null = null;
  let device: string | null = null;
  // null — автоподбор при старте, как раньше. Массив — закреплённые 12 тем.
  let board: string[] | null = null;
  let utmRaw: unknown;
  try {
    const body = (await request.json()) as {
      hostMode?: unknown;
      playMode?: unknown;
      companyId?: unknown;
      deviceId?: unknown;
      categories?: unknown;
      utm?: unknown;
    };
    utmRaw = body?.utm;
    device = isDeviceId(body?.deviceId) ? body.deviceId : null;
    company = isCompanyId(body?.companyId) ? body.companyId : null;
    if (body?.hostMode === "bot") hostMode = "bot";
    else if (body?.hostMode === undefined || body.hostMode === "human")
      hostMode = "human";
    else return Response.json({ error: "bad_host_mode" }, { status: 400 });
    const parsedPlay = parsePlayMode(body?.playMode);
    if (!parsedPlay) {
      return Response.json({ error: "bad_play_mode" }, { status: 400 });
    }
    playMode = parsedPlay;
    if (body?.categories !== undefined && body.categories !== null) {
      const parsed = parseThemeBoard(body.categories);
      if (!parsed)
        return Response.json({ error: "bad_themes" }, { status: 400 });
      board = parsed;
    }
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }
  const utm = sanitizeUtm(utmRaw);

  try {
    const supabase = getServiceSupabase();
    // Оплата ведущего: пускаем создать комнату, только если играть есть чем
    // (бесплатная, кредит или безлимит). Списание — на старте партии.
    // Имя читаем и без оплаты: оно нужно подписи на финале.
    const paywall = paywallEnabled();
    const user = await userFromRequest(supabase, request);
    const ip = paywall ? ipHash(request) : null;
    if (paywall) {
      const access = await checkAccess(supabase, {
        user,
        deviceId: device,
        ipHash: ip,
      });
      if (!access.ok) {
        return Response.json({ error: access.error }, { status: 402 });
      }
    }
    if (board) {
      const catalog = await loadThemeCatalog(supabase, company);
      const { problem } = inspectBoard(board, catalog);
      if (problem) {
        return Response.json(
          { error: problem.error, themes: problem.themes },
          { status: 400 },
        );
      }
    }
    const { data, error } = await supabase.rpc("create_room", {
      p_host_mode: hostMode,
    });
    if (error || !data) {
      console.error("create_room", error?.code ?? "empty");
      return Response.json({ error: "create_failed" }, { status: 502 });
    }

    const result = data as CreateRoomResult;
    if (!result.ok) {
      return Response.json({ error: result.error }, { status: 400 });
    }

    if (result.room_id) {
      // Новые комнаты — со «Сюрпризами» (в лобби можно выключить). Старые
      // комнаты (null) живут без них. «Вместе» без сюрпризов: баффы
      // перекладывают личные очки, а здесь счёт общий.
      const patch: { surprises: boolean; play_mode?: PlayMode } = {
        surprises: playMode !== "together",
      };
      if (playMode === "together") patch.play_mode = "together";
      const { error: surpriseError } = await supabase
        .from("rooms")
        .update(patch)
        .eq("id", result.room_id);
      if (surpriseError) {
        console.error("room_surprises", surpriseError.code);
        if (playMode === "together") {
          const { error: dropError } = await supabase
            .from("rooms")
            .delete()
            .eq("id", result.room_id);
          if (dropError)
            console.error("room_together_rollback", dropError.code);
          return Response.json(
            { error: "together_unavailable" },
            { status: 503 },
          );
        }
      }
    }

    if (paywall && result.room_id) {
      const { error: billingError } = await supabase
        .from("room_billing")
        .insert({
          room_id: result.room_id,
          user_id: user?.id ?? null,
          device_id: device,
          ip_hash: ip,
        });
      if (billingError) console.error("room_billing", billingError.code);
    }

    if (result.room_id && company) {
      // Не критично: без компании игра просто не учитывает прошлые вопросы.
      const { error: companyError } = await supabase
        .from("room_secrets")
        .update({ company_id: company })
        .eq("room_id", result.room_id);
      if (companyError) console.error("room_company", companyError.code);
    }

    if (board && result.room_id) {
      const { error: boardError } = await supabase
        .from("room_secrets")
        .update({ board_categories: board })
        .eq("room_id", result.room_id);
      if (boardError) {
        console.error("room_themes", boardError.code);
        const { error: dropError } = await supabase
          .from("rooms")
          .delete()
          .eq("id", result.room_id);
        if (dropError) console.error("room_themes_rollback", dropError.code);
        return Response.json({ error: "themes_unavailable" }, { status: 502 });
      }
    }

    if (result.room_id) {
      await saveUtm(supabase, "rooms", result.room_id, utm);
    }

    const label = hostLabelFromUser(user);
    if (label && result.room_id) {
      const { error: labelError } = await supabase
        .from("rooms")
        .update({ host_label: label })
        .eq("id", result.room_id);
      // Колонки может ещё не быть: комната уже создана, подпись не обязательна.
      if (labelError) console.error("host_label", labelError.code);
    }

    return Response.json({
      code: result.code,
      hostSecret: result.host_secret,
      roomId: result.room_id,
      hostMode: result.host_mode,
      playMode,
      ...(board ? { themes: board } : {}),
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : "";
    if (message.includes("SUPABASE_URL")) {
      return Response.json({ error: "not_configured" }, { status: 500 });
    }
    console.error("create_room_threw");
    return Response.json({ error: "create_failed" }, { status: 502 });
  }
}
