-- Ходы ведущего и проверка ответа идут только через API Next.js с ключом
-- service_role (после проверки host_secret). Раньше их мог вызвать любой
-- браузер с anon-ключом: начать чужую партию, засчитать себе ответ
-- (apply_verdict), прочитать эталон (host_sheet, final_sheet, begin_answer).
revoke execute on function public.start_game(text) from public, anon, authenticated;
revoke execute on function public.open_buzz(text) from public, anon, authenticated;
revoke execute on function public.pass_question(text) from public, anon, authenticated;
revoke execute on function public.continue_game(text) from public, anon, authenticated;
revoke execute on function public.apply_verdict(text, boolean, text) from public, anon, authenticated;
revoke execute on function public.apply_final(text, jsonb) from public, anon, authenticated;
revoke execute on function public.mark_final_suggestions(text, jsonb) from public, anon, authenticated;
revoke execute on function public.note_suggestion(text, boolean, text) from public, anon, authenticated;
revoke execute on function public.final_sheet(text) from public, anon, authenticated;
revoke execute on function public.host_sheet(text) from public, anon, authenticated;
revoke execute on function public.set_host_starts_media(text, boolean) from public, anon, authenticated;
revoke execute on function public.begin_answer(text, text, text) from public, anon, authenticated;
revoke execute on function public.begin_final_answer(text, text, text) from public, anon, authenticated;

grant execute on function public.start_game(text) to service_role;
grant execute on function public.open_buzz(text) to service_role;
grant execute on function public.pass_question(text) to service_role;
grant execute on function public.continue_game(text) to service_role;
grant execute on function public.apply_verdict(text, boolean, text) to service_role;
grant execute on function public.apply_final(text, jsonb) to service_role;
grant execute on function public.mark_final_suggestions(text, jsonb) to service_role;
grant execute on function public.note_suggestion(text, boolean, text) to service_role;
grant execute on function public.final_sheet(text) to service_role;
grant execute on function public.host_sheet(text) to service_role;
grant execute on function public.set_host_starts_media(text, boolean) to service_role;
grant execute on function public.begin_answer(text, text, text) to service_role;
grant execute on function public.begin_final_answer(text, text, text) to service_role;

notify pgrst, 'reload schema';
