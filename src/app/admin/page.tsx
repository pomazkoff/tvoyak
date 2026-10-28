import { cookies } from "next/headers";
import { Suspense } from "react";
import { AdminLogin } from "@/components/admin-login";
import { Shell } from "@/components/shell";
import { getServiceSupabase } from "@/lib/supabase/admin";

export default function AdminPage() {
  return (
    <Suspense
      fallback={
        <Shell>
          <p className="text-muted">Открываем пачки…</p>
        </Shell>
      }
    >
      <AdminBody />
    </Suspense>
  );
}

async function AdminBody() {
  if (!process.env.ADMIN_TOKEN) {
    return (
      <Shell width="max-w-xl">
        <p>Задайте ADMIN_TOKEN в окружении сервера.</p>
      </Shell>
    );
  }
  const jar = await cookies();
  if (jar.get("tvoyak_admin")?.value !== process.env.ADMIN_TOKEN) {
    return (
      <Shell width="max-w-xl">
        <AdminLogin />
      </Shell>
    );
  }

  const supabase = getServiceSupabase();
  const { data: packs } = await supabase
    .from("question_packs")
    .select("id, status, source_notes, error, created_at")
    .order("created_at", { ascending: false })
    .limit(20);
  const ids = (packs ?? []).map((pack) => pack.id as string);
  const { data: items } = ids.length
    ? await supabase
        .from("pack_items")
        .select(
          "id, pack_id, category, prompt, answer, value, status, agent_mark",
        )
        .in("pack_id", ids)
    : { data: [] };

  return (
    <Shell width="max-w-3xl">
      <h1 className="text-3xl font-semibold">Пачки вопросов</h1>
      <div className="mt-6 grid gap-4">
        {(packs ?? []).map((pack) => {
          const rows = (items ?? []).filter((item) => item.pack_id === pack.id);
          return (
            <article
              key={pack.id as string}
              className="border border-line bg-panel p-4"
            >
              <p className="text-sm text-gold">
                {pack.status as string}
                {pack.error ? ` · ${pack.error as string}` : ""}
              </p>
              <p className="mt-1 text-sm text-muted">
                {pack.source_notes as string}
              </p>
              <ul className="mt-3 grid gap-2">
                {rows.map((item) => (
                  <li key={item.id as string} className="text-sm">
                    <span className="text-muted">
                      {item.value as number} · {item.status as string}
                    </span>{" "}
                    {item.prompt as string}
                    {item.agent_mark ? ` · ${item.agent_mark as string}` : ""}
                  </li>
                ))}
              </ul>
              {pack.status === "ready" ? (
                <ApproveButton packId={pack.id as string} />
              ) : null}
            </article>
          );
        })}
        {(packs ?? []).length === 0 ? (
          <p className="text-muted">Пачек пока нет.</p>
        ) : null}
      </div>
    </Shell>
  );
}

function ApproveButton({ packId }: { packId: string }) {
  return (
    <form className="mt-3">
      <input type="hidden" name="packId" value={packId} />
      <button
        formAction={approve}
        className="h-10 bg-gold px-4 text-sm font-semibold text-navy"
      >
        Принять в пул
      </button>
    </form>
  );
}

async function approve(formData: FormData) {
  "use server";
  const packId = String(formData.get("packId") ?? "");
  const jar = await cookies();
  if (
    !process.env.ADMIN_TOKEN ||
    jar.get("tvoyak_admin")?.value !== process.env.ADMIN_TOKEN
  )
    return;
  const { approvePack } = await import("@/lib/packs/pipeline");
  await approvePack(packId);
}
