# Read first

Read `docs/PLAN.md` (research + owner decisions) and `docs/DESIGN.md` (what we build, build order)
before anything else. The owner said "ab banana start kar" on 2026-10-14: we are building, phase by
phase (DESIGN.md §7). Keep both files up to date; DESIGN.md changes first when a decision changes.

Rules that always hold: money in integer paise; the server decides prices (packages/core); "paid" only
after the gateway confirms server-to-server; a phone number alone reveals nothing (WhatsApp OTP);
every query filters by storeId; secrets encrypted, never in Git. Before every push: `npm run typecheck`
and `npm test` green (tests need PostgreSQL; see README).

The repo is PUBLIC: never put secrets, customer data, or screenshots with store / customer data in it.
