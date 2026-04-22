-- Enable UUID extension
create extension if not exists "uuid-ossp";

-- =============================================
-- BODY MEASUREMENTS (FitDays scale data)
-- =============================================
create table if not exists body_measurements (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null,
  weight_kg numeric(5,2),
  body_fat_pct numeric(5,2),
  muscle_mass_kg numeric(5,2),
  water_pct numeric(5,2),
  bone_mass_kg numeric(5,2),
  bmi numeric(5,2),
  bmr integer,
  visceral_fat integer,
  metabolic_age integer,
  notes text,
  created_at timestamptz default now()
);

create index body_measurements_user_date_idx on body_measurements(user_id, date desc);

-- =============================================
-- WORKOUT PLANS
-- =============================================
create table if not exists workout_plans (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  is_active boolean default false,
  notes text,
  created_at timestamptz default now()
);

create table if not exists workout_plan_days (
  id uuid default uuid_generate_v4() primary key,
  plan_id uuid references workout_plans(id) on delete cascade not null,
  day_name text not null,
  day_order integer not null default 0
);

create table if not exists plan_exercises (
  id uuid default uuid_generate_v4() primary key,
  day_id uuid references workout_plan_days(id) on delete cascade not null,
  name text not null,
  sets integer not null default 3,
  reps text not null default '8-12',
  weight_kg numeric(6,2),
  notes text,
  "order" integer not null default 0
);

-- =============================================
-- WORKOUT SESSIONS
-- =============================================
create table if not exists workout_sessions (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null default current_date,
  plan_day_id uuid references workout_plan_days(id) on delete set null,
  overall_notes text,
  created_at timestamptz default now()
);

create index workout_sessions_user_date_idx on workout_sessions(user_id, date desc);

create table if not exists session_exercises (
  id uuid default uuid_generate_v4() primary key,
  session_id uuid references workout_sessions(id) on delete cascade not null,
  plan_exercise_id uuid references plan_exercises(id) on delete set null,
  sets_done integer,
  reps_done text,
  weight_kg numeric(6,2),
  notes text,
  rpe integer check (rpe >= 1 and rpe <= 10)
);

-- =============================================
-- DIET
-- =============================================
create table if not exists diet_plans (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  is_active boolean default false,
  calories integer,
  protein_g integer,
  carbs_g integer,
  fat_g integer,
  notes text,
  created_at timestamptz default now()
);

create table if not exists diet_logs (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null default current_date,
  calories integer,
  protein_g integer,
  carbs_g integer,
  fat_g integer,
  notes text,
  created_at timestamptz default now()
);

create index diet_logs_user_date_idx on diet_logs(user_id, date desc);

-- =============================================
-- AI CONVERSATIONS
-- =============================================
create table if not exists ai_conversations (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null unique,
  messages jsonb default '[]'::jsonb,
  updated_at timestamptz default now()
);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
alter table body_measurements enable row level security;
alter table workout_plans enable row level security;
alter table workout_plan_days enable row level security;
alter table plan_exercises enable row level security;
alter table workout_sessions enable row level security;
alter table session_exercises enable row level security;
alter table diet_plans enable row level security;
alter table diet_logs enable row level security;
alter table ai_conversations enable row level security;

-- body_measurements
create policy "Users can manage own body measurements"
  on body_measurements for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- workout_plans
create policy "Users can manage own workout plans"
  on workout_plans for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- workout_plan_days (via plan ownership)
create policy "Users can manage own workout plan days"
  on workout_plan_days for all
  using (exists (
    select 1 from workout_plans
    where workout_plans.id = workout_plan_days.plan_id
    and workout_plans.user_id = auth.uid()
  ));

-- plan_exercises (via day -> plan ownership)
create policy "Users can manage own plan exercises"
  on plan_exercises for all
  using (exists (
    select 1 from workout_plan_days
    join workout_plans on workout_plans.id = workout_plan_days.plan_id
    where workout_plan_days.id = plan_exercises.day_id
    and workout_plans.user_id = auth.uid()
  ));

-- workout_sessions
create policy "Users can manage own workout sessions"
  on workout_sessions for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- session_exercises (via session ownership)
create policy "Users can manage own session exercises"
  on session_exercises for all
  using (exists (
    select 1 from workout_sessions
    where workout_sessions.id = session_exercises.session_id
    and workout_sessions.user_id = auth.uid()
  ));

-- diet_plans
create policy "Users can manage own diet plans"
  on diet_plans for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- diet_logs
create policy "Users can manage own diet logs"
  on diet_logs for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

-- ai_conversations
create policy "Users can manage own ai conversations"
  on ai_conversations for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
