-- Tracks which families you have already sent their link to, so two people can split the sending without doubling up.
alter table public.invites add column if not exists sent_at timestamptz;
