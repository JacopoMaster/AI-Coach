-- =============================================
-- FOODS (database alimenti per-user)
-- =============================================
create table if not exists foods (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  name text not null,
  calories_per_100g numeric(7,2) not null default 0,
  proteins_per_100g numeric(6,2) not null default 0,
  carbs_per_100g numeric(6,2) not null default 0,
  fats_per_100g numeric(6,2) not null default 0,
  created_at timestamptz default now()
);

create index if not exists foods_user_name_idx on foods(user_id, name);

-- =============================================
-- NUTRITION ENTRIES (voci singole giornaliere)
-- =============================================
create table if not exists nutrition_entries (
  id uuid default uuid_generate_v4() primary key,
  user_id uuid references auth.users(id) on delete cascade not null,
  date date not null default current_date,
  -- Riferimento opzionale al database alimenti
  food_id uuid references foods(id) on delete set null,
  grams numeric(7,2),
  -- Valori calcolati/inseriti (sempre presenti)
  name text not null,
  calories numeric(7,2) not null default 0,
  proteins numeric(6,2) not null default 0,
  carbs numeric(6,2) not null default 0,
  fats numeric(6,2) not null default 0,
  created_at timestamptz default now()
);

create index if not exists nutrition_entries_user_date_idx on nutrition_entries(user_id, date desc);

-- =============================================
-- ROW LEVEL SECURITY
-- =============================================
alter table foods enable row level security;
alter table nutrition_entries enable row level security;

drop policy if exists "Users can manage own foods" on foods;
create policy "Users can manage own foods"
  on foods for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);

drop policy if exists "Users can manage own nutrition entries" on nutrition_entries;
create policy "Users can manage own nutrition entries"
  on nutrition_entries for all
  using (auth.uid() = user_id)
  with check (auth.uid() = user_id);
