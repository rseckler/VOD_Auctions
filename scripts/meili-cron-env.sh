#!/usr/bin/env bash
# Loads env for Meili cron jobs. Sourced by cron lines.
set -a
# shellcheck disable=SC1091
. /root/VOD_Auctions/scripts/.env
. /root/VOD_Auctions/.env.meili
# meilisearch_sync.py expects SUPABASE_DB_URL; scripts/.env uses DATABASE_URL.
SUPABASE_DB_URL="$DATABASE_URL"
set +a
