-- Esquema per a "30 abans dels 30".
-- Executa'l una sola vegada a Supabase → SQL Editor → New query → Run.

create table if not exists public.people (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 60),
  birthdate   date not null check (birthdate > date '1900-01-01'),
  created_at  timestamptz not null default now()
);

create table if not exists public.visits (
  id          uuid primary key default gen_random_uuid(),
  person_id   uuid not null references public.people(id) on delete cascade,
  country     char(2) not null,             -- codi ISO 3166-1 alpha-2
  visited_on  date,                          -- data (aproximada) de la primera visita; opcional
  created_at  timestamptz not null default now(),
  unique (person_id, country)
);

create index if not exists visits_person_idx on public.visits(person_id);

-- Model de "confiança total": qualsevol amb l'enllaç pot llegir i editar-ho tot.
-- ATENCIÓ: això inclou esborrar dades d'altres. Si algun dia cal protegir-ho,
-- s'han de canviar aquestes polítiques (p. ex. afegint autenticació).
alter table public.people enable row level security;
alter table public.visits enable row level security;

drop policy if exists "people_all" on public.people;
create policy "people_all" on public.people for all to anon, authenticated using (true) with check (true);

drop policy if exists "visits_all" on public.visits;
create policy "visits_all" on public.visits for all to anon, authenticated using (true) with check (true);
