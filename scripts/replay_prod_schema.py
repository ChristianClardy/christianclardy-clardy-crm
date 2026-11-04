#!/usr/bin/env python3
"""Emit SQL that recreates the public schema from scripts/fixtures/prod-public-schema.json.

The snapshot has column types, functions signatures, RLS policies, and trigger
names. It does not include defaults, primary keys, or enum labels, so:
  - USER-DEFINED columns become text (enums are not in the snapshot)
  - ARRAY becomes text[]
  - NOT NULL columns other than id get a stand-in default so partial inserts work
  - a uuid column named id is the primary key
  - policies are replayed; functions they call are stubbed
"""

import json
from collections import defaultdict
from pathlib import Path

ROOT = Path(__file__).resolve().parent
SCHEMA_PATH = ROOT / "fixtures" / "prod-public-schema.json"

DEFAULTS = {
    "text": "''",
    "boolean": "false",
    "integer": "0",
    "numeric": "0",
    "jsonb": "'{}'::jsonb",
    "timestamp with time zone": "now()",
    "timestamp without time zone": "now()",
    "time without time zone": "'00:00'::time",
    "date": "'2000-01-01'::date",
    "uuid": "gen_random_uuid()",
    "text[]": "'{}'::text[]",
}


def sql_type(raw):
    if raw == "USER-DEFINED":
        return "text"
    if raw == "ARRAY":
        return "text[]"
    return raw


def main():
    schema = json.loads(SCHEMA_PATH.read_text())
    by_table = defaultdict(list)
    for col in schema["columns"]:
        by_table[col["t"]].append(col)

    lines = []
    w = lines.append
    w("-- Generated from scripts/fixtures/prod-public-schema.json")
    w("CREATE EXTENSION IF NOT EXISTS pgcrypto;")
    w("""
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'authenticated') THEN
    CREATE ROLE authenticated NOINHERIT;
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'anon') THEN
    CREATE ROLE anon NOINHERIT;
  END IF;
END $$;
GRANT USAGE ON SCHEMA public TO authenticated, anon;
""")
    w("""
CREATE SCHEMA IF NOT EXISTS auth;
CREATE TABLE IF NOT EXISTS auth.users (
  id uuid PRIMARY KEY,
  email text
);
CREATE OR REPLACE FUNCTION auth.uid() RETURNS uuid
LANGUAGE sql STABLE AS $$
  SELECT coalesce(
    nullif(current_setting('request.jwt.claim.sub', true), ''),
    (nullif(current_setting('request.jwt.claims', true), '')::jsonb ->> 'sub')
  )::uuid;
$$;
""")
    # Stubs for functions the production policies call. The migration does not
    # replace these. is_staff matches the test's organization_members rows.
    w("""
CREATE OR REPLACE FUNCTION public.staff_org_id() RETURNS uuid
LANGUAGE sql IMMUTABLE AS $$ SELECT '2c9485d2-9b17-48d4-bea7-72770c1e9eb9'::uuid $$;

CREATE OR REPLACE FUNCTION public.get_my_org_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT public.staff_org_id() $$;

CREATE OR REPLACE FUNCTION public.pm_can_access_project(pid uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.sub_can_access_project(pid uuid) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT false $$;

CREATE OR REPLACE FUNCTION public.portal_sub_id() RETURNS uuid
LANGUAGE sql STABLE AS $$ SELECT NULL::uuid $$;

CREATE OR REPLACE FUNCTION public.block_viewer_writes() RETURNS trigger
LANGUAGE plpgsql AS $$ BEGIN RETURN NULL; END $$;
""")

    for table, cols in by_table.items():
        parts = []
        names = [c["c"] for c in cols]
        for col in cols:
            typ = sql_type(col["type"])
            piece = f"{quote_ident(col['c'])} {typ}"
            if col["c"] == "id" and typ == "uuid":
                piece += " PRIMARY KEY DEFAULT gen_random_uuid()"
            elif col["null"] == "NO":
                piece += " NOT NULL"
                default = DEFAULTS.get(typ)
                if default and not (col["c"] == "id"):
                    piece += f" DEFAULT {default}"
            parts.append(piece)
        # Portal tables are keyed by user_id in production.
        if "id" not in names and "user_id" in names:
            parts.append("PRIMARY KEY (user_id)")
        w(f"CREATE TABLE public.{quote_ident(table)} (\n  " + ",\n  ".join(parts) + "\n);")

    w("""
CREATE OR REPLACE FUNCTION public.is_staff() RETURNS boolean
LANGUAGE sql STABLE SECURITY DEFINER SET search_path = public AS $$
  SELECT EXISTS (
    SELECT 1 FROM organization_members
    WHERE user_id = auth.uid() AND COALESCE(status, 'active') = 'active'
  );
$$;

CREATE OR REPLACE FUNCTION public.can_access_module(p_module text) RETURNS boolean
LANGUAGE sql STABLE AS $$ SELECT public.is_staff() $$;
""")

    # Replay policies so the migration lands on top of the real rules.
    tables_with_policies = sorted({p["t"] for p in schema["policies"]})
    for table in tables_with_policies:
        w(f"ALTER TABLE public.{quote_ident(table)} ENABLE ROW LEVEL SECURITY;")

    seen = set()
    for pol in schema["policies"]:
        key = (pol["t"], pol["name"], pol["cmd"])
        if key in seen:
            continue
        seen.add(key)
        permissive = "RESTRICTIVE" if pol["permissive"] == "RESTRICTIVE" else "PERMISSIVE"
        role = "authenticated" if pol["name"] in ("authenticated_full_access", "staff_read") else "public"
        using = pol.get("qual")
        check = pol.get("check")
        stmt = (
            f"CREATE POLICY {quote_ident(pol['name'])} ON public.{quote_ident(pol['t'])} "
            f"AS {permissive} FOR {pol['cmd']} TO {role}"
        )
        if using:
            stmt += f" USING ({using})"
        if check:
            stmt += f" WITH CHECK ({check})"
        elif pol["cmd"] in ("INSERT",) and not check:
            # INSERT policies need a check expression. Production omitted it
            # only when the dump stored it separately; skip if truly absent.
            stmt += " WITH CHECK (true)"
        w(stmt + ";")

    w("GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public TO authenticated;")
    w("GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO authenticated;")
    print("\n".join(lines))


def quote_ident(name):
    return '"' + name.replace('"', '""') + '"'


if __name__ == "__main__":
    main()
