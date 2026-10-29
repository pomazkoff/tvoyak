import { isCompanyId } from "@/lib/rooms/company";
import { getServiceSupabase } from "@/lib/supabase/admin";
import type { CreateRoomResult, HostMode } from "@/lib/supabase/types";

export async function POST(request: Request) {
  let hostMode: HostMode = "human";
  let company: string | null = null;
  try {
    const body = (await request.json()) as {
      hostMode?: unknown;
      companyId?: unknown;
    };
    company = isCompanyId(body?.companyId) ? body.companyId : null;
    if (body?.hostMode === "bot") hostMode = "bot";
    else if (body?.hostMode === undefined || body.hostMode === "human")
      hostMode = "human";
    else return Response.json({ error: "bad_host_mode" }, { status: 400 });
  } catch {
    return Response.json({ error: "invalid_json" }, { status: 400 });
  }

  try {
    const supabase = getServiceSupabase();
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
      // Не критично: без компании игра просто не учитывает прошлые вопросы,
      // без флага — не берёт картиночные задания (их рисует только этот клиент).
      const pictures = process.env.PICTURE_TASKS !== "0";
      const update: Record<string, unknown> = { picture_tasks: pictures };
      if (company) update.company_id = company;
      const { error: companyError } = await supabase
        .from("room_secrets")
        .update(update)
        .eq("room_id", result.room_id);
      if (companyError) console.error("room_company", companyError.code);
    }

    return Response.json({
      code: result.code,
      hostSecret: result.host_secret,
      roomId: result.room_id,
      hostMode: result.host_mode,
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
