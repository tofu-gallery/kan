-- Tofu: the two Kan tables that upstream leaves without row level security become reachable through the Supabase
-- Data API once Tofu runs the app (Tofu publishes NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY, and
-- grants the anon and authenticated roles on new tables in public). Upstream locks its other 29 tables by enabling
-- RLS with no policies; do the same for these two.
ALTER TABLE public.workspace_slugs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.user_board_favorites ENABLE ROW LEVEL SECURITY;
