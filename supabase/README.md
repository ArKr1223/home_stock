# Supabase setup

1. Create a Supabase project and open **SQL Editor**.
2. Run `schema.sql` once. It creates the four application tables, indexes, RLS policies, atomic inventory functions, and the private `item-photos` bucket.
3. In **Authentication > URL Configuration**, add the local and deployed website URLs.
4. Copy `.env.example` to `.env.local` and fill in the project URL and publishable key. Never put a secret or service-role key in a `VITE_` variable.

The browser app uses email/password authentication. Each row has a `user_id`; RLS restricts every operation to `auth.uid() = user_id`.
