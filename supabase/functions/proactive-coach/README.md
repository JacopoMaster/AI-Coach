# Proactive Coach — Edge Function

Monitors user activity and sends a single, contextual push notification per
user per day when something looks off.

## Pipeline

1. **Active users** — every user with at least one row in `user_push_subscriptions`.
2. **Snapshot (48h)** — workouts, diet logs, nutrition entries, active
   mesocycle, pending check-ins, recent notifications (for 24h dedup).
3. **Detect** — priority-ordered detectors in `anomalies.ts`:
   `pending_checkin` → `missed_workout` → `calorie_deviation` → `inactive_streak`.
4. **Generate** — `claude-3-haiku-20240307` returns a ≤100-char Italian
   message. Hand-written fallbacks on API failure.
5. **Dispatch** — VAPID-signed push to every subscription. 404/410 prunes
   the dead endpoint.
6. **Log** — row in `proactive_notifications_log` for the in-app activity feed
   and next-run deduplication.

## Required env / secrets

Set these on the Supabase project (`Project Settings → Edge Functions → Secrets`):

| Variable                       | Value                                            |
| ------------------------------ | ------------------------------------------------ |
| `SUPABASE_URL`                 | Auto-injected                                    |
| `SUPABASE_SERVICE_ROLE_KEY`    | Auto-injected                                    |
| `ANTHROPIC_API_KEY`            | Anthropic key (Haiku usage)                      |
| `VAPID_SUBJECT`                | `mailto:you@domain.com`                          |
| `VAPID_PUBLIC_KEY`             | Base64url (generate below)                       |
| `VAPID_PRIVATE_KEY`            | Base64url (generate below)                       |
| `PROACTIVE_COACH_CRON_SECRET`  | Optional — only if you call the function from a non-service-role trigger |

Generate a VAPID key pair once:

```bash
npx web-push generate-vapid-keys
```

Mirror the **public** key in your Next.js env (so the client can subscribe):

```
NEXT_PUBLIC_VAPID_PUBLIC_KEY=<same public key>
```

## Deploy

```bash
supabase functions deploy proactive-coach
```

Then apply the migrations in order:

```bash
supabase db push
```

The `004_schedule_proactive_coach.sql` migration installs the pg_cron job.
Remember to set `app.settings.project_url` and `app.settings.service_role_key`
database-level GUCs first — the SQL file has the exact commands.

## Manual test

```bash
curl -X POST \
  -H "Authorization: Bearer $SUPABASE_SERVICE_ROLE_KEY" \
  https://<project-ref>.supabase.co/functions/v1/proactive-coach
```

Expected response:

```json
{ "scanned": 12, "notified": 3, "breakdown": { "missed_workout": 2, "pending_checkin": 1 } }
```
