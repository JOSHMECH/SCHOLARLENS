-- ═══════════════════════════════════════════════════════════
--  ScholarLens — Supabase Database Schema
--  Run this in your Supabase project's SQL Editor
-- ═══════════════════════════════════════════════════════════

-- ── Enable UUID extension ──────────────────────────────────
CREATE EXTENSION IF NOT EXISTS "pgcrypto";

-- ── users (managed by Supabase Auth — auto-created) ────────
-- Supabase creates auth.users automatically.
-- We add a profiles table for extra user data.

CREATE TABLE IF NOT EXISTS public.profiles (
    id         UUID PRIMARY KEY REFERENCES auth.users(id) ON DELETE CASCADE,
    email      TEXT,
    full_name  TEXT,
    created_at TIMESTAMPTZ DEFAULT NOW()
);

ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own profile"
    ON public.profiles FOR SELECT
    USING (auth.uid() = id);

CREATE POLICY "Users can update own profile"
    ON public.profiles FOR UPDATE
    USING (auth.uid() = id);

-- Auto-create profile on signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS TRIGGER AS $$
BEGIN
    INSERT INTO public.profiles (id, email, full_name)
    VALUES (
        NEW.id,
        NEW.email,
        NEW.raw_user_meta_data->>'full_name'
    );
    RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

DROP TRIGGER IF EXISTS on_auth_user_created ON auth.users;
CREATE TRIGGER on_auth_user_created
    AFTER INSERT ON auth.users
    FOR EACH ROW EXECUTE FUNCTION public.handle_new_user();


-- ── student_inputs ─────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.student_inputs (
    id           UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id      UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    current_cgpa NUMERIC(4,2) NOT NULL CHECK (current_cgpa >= 0 AND current_cgpa <= 5),
    target_cgpa  NUMERIC(4,2) NOT NULL CHECK (target_cgpa >= 0 AND target_cgpa <= 5),
    study_hours  NUMERIC(5,1) NOT NULL CHECK (study_hours >= 0),
    attendance   NUMERIC(5,1) NOT NULL CHECK (attendance >= 0 AND attendance <= 100),
    carry_overs  SMALLINT     NOT NULL CHECK (carry_overs >= 0),
    created_at   TIMESTAMPTZ  DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_student_inputs_user_id ON public.student_inputs(user_id);
CREATE INDEX IF NOT EXISTS idx_student_inputs_created ON public.student_inputs(created_at DESC);

ALTER TABLE public.student_inputs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own inputs"
    ON public.student_inputs FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select own inputs"
    ON public.student_inputs FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own inputs"
    ON public.student_inputs FOR DELETE
    USING (auth.uid() = user_id);


-- ── predictions ────────────────────────────────────────────
CREATE TABLE IF NOT EXISTS public.predictions (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id         UUID NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
    predicted_cgpa  NUMERIC(4,2) NOT NULL,
    recommendations JSONB,
    risk_level      TEXT CHECK (risk_level IN ('Low', 'Medium', 'High')),
    created_at      TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_predictions_user_id ON public.predictions(user_id);
CREATE INDEX IF NOT EXISTS idx_predictions_created  ON public.predictions(created_at DESC);

ALTER TABLE public.predictions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can insert own predictions"
    ON public.predictions FOR INSERT
    WITH CHECK (auth.uid() = user_id);

CREATE POLICY "Users can select own predictions"
    ON public.predictions FOR SELECT
    USING (auth.uid() = user_id);

CREATE POLICY "Users can delete own predictions"
    ON public.predictions FOR DELETE
    USING (auth.uid() = user_id);


-- ═══════════════════════════════════════════════════════════
--  USEFUL QUERIES (for reference)
-- ═══════════════════════════════════════════════════════════

-- Get a user's full prediction history
-- SELECT
--     p.id,
--     p.predicted_cgpa,
--     p.risk_level,
--     p.created_at,
--     si.current_cgpa,
--     si.target_cgpa,
--     si.study_hours,
--     si.attendance,
--     si.carry_overs
-- FROM public.predictions p
-- LEFT JOIN public.student_inputs si
--     ON si.user_id = p.user_id
--     AND si.created_at BETWEEN p.created_at - INTERVAL '5 seconds'
--                            AND p.created_at + INTERVAL '5 seconds'
-- WHERE p.user_id = '<your-user-uuid>'
-- ORDER BY p.created_at DESC;
