const MESSAGES: Record<string, string> = {
  room_not_found: "Комната не найдена. Проверьте код.",
  room_full: "За столом уже 10 игроков. Можно войти зрителем.",
  spectators_full: "Зрителей уже слишком много.",
  bad_nickname: "Имя — от 1 до 24 символов.",
  bad_role: "Выберите: игрок или зритель.",
  room_finished: "Эта комната уже закрыта.",
  spectators_cannot_buzz: "Зрители не отвечают.",
  no_active_question: "Вопрос ещё не открыт.",
  too_late: "Кто-то нажал раньше.",
  already_buzzed: "Вы уже нажимали на этот вопрос.",
  player_not_found: "Сессия не найдена. Войдите снова.",
  bad_host_mode: "Неизвестный режим ведущего.",
  not_configured:
    "Сервер не видит ключи Supabase. Проверьте .env.local и перезапустите dev-сервер.",
  create_failed: "Не удалось создать комнату.",
  network: "Нет связи с комнатой.",
};

export function messageFor(code: string | undefined): string {
  if (!code) return "Не получилось. Попробуйте ещё раз.";
  return MESSAGES[code] ?? "Не получилось. Попробуйте ещё раз.";
}
