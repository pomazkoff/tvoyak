"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";

export function AdminLogin({ title = "Пачки" }: { title?: string }) {
  const router = useRouter();
  const [token, setToken] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function submit(event: FormEvent) {
    event.preventDefault();
    setError(null);
    const response = await fetch("/api/admin/login", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ token }),
    });
    if (!response.ok) {
      setError("Неверный токен.");
      return;
    }
    router.refresh();
  }

  return (
    <form onSubmit={(event) => void submit(event)} className="grid gap-3">
      <h1 className="text-3xl font-semibold">{title}</h1>
      <label htmlFor="admin-token" className="text-sm text-muted">
        Токен администратора
      </label>
      <input
        id="admin-token"
        type="password"
        value={token}
        onChange={(event) => setToken(event.target.value)}
        className="field"
      />
      {error ? <p className="text-sm text-danger">{error}</p> : null}
      <button type="submit" className="h-12 bg-gold font-semibold text-navy">
        Войти
      </button>
    </form>
  );
}
