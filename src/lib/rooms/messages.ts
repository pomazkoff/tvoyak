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
  need_players: "Нужно минимум два игрока.",
  too_many_players: "За столом больше десяти игроков.",
  already_started: "Партия уже идёт.",
  bank_too_small: "В базе мало вопросов для поля.",
  not_chooser: "Сейчас выбирает другой игрок.",
  bad_cell: "Эта ячейка уже недоступна.",
  cat_needs_other: "Кота отдают другому игроку.",
  cat_no_buzz: "На «кота в мешке» отвечает один игрок.",
  bad_phase: "Сейчас этот ход не принимается.",
  not_your_turn: "Сейчас отвечает другой игрок.",
  bad_wager: "Ставка от нуля до ваших очков.",
  not_eligible: "В финал выходят только игроки с очками больше нуля.",
  need_wager: "Сначала сделайте ставку.",
  not_host: "Это может сделать только ведущий этой комнаты.",
  judging: "Ответ у ведущего.",
};

export function messageFor(code: string | undefined): string {
  if (!code) return "Не получилось. Попробуйте ещё раз.";
  return MESSAGES[code] ?? "Не получилось. Попробуйте ещё раз.";
}
