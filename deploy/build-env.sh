#!/usr/bin/env bash
# Prints the part of the server's .env that `next build` needs, for the GitHub
# runner that builds the site (.github/workflows/deploy-server.yml). Run on the
# server, so the filtering happens before anything leaves it.
#
# An ALLOWLIST, decided with the user on 2026-11-20 (只给数据库钥匙和公开配置):
# the build prerenders pages from Supabase, and without the read key it falls
# back to bundled mock tenders, so SUPABASE_SERVICE_ROLE_KEY goes; NEXT_PUBLIC_*
# are inlined into the browser bundle and public anyway; the rest is non-secret
# configuration a static page renders (prices, wire terms, seller and legal
# details, site verification). Payments, email, AI, the GitHub token and
# CRON_SECRET never leave the server — and a key added to .env later stays
# behind by default, because it is not on this list.
set -euo pipefail

grep -E '^(NEXT_PUBLIC_[A-Z0-9_]+|SUPABASE_SERVICE_ROLE_KEY|APP_URL|DEPLOYMENT_ENV|STRIPE_PRICE_[A-Z0-9_]+|BANK_TRANSFER_DAYS_UNTIL_DUE|INTERNATIONAL_WIRE_ENABLED|USD_MXN_BANK_TRANSFER_RATE|LEGAL_OPERATOR_[A-Z0-9_]+|INVOICE_SELLER_[A-Z0-9_]+|[A-Z]+_SITE_VERIFICATION)=' /srv/latintender/shared/.env || true
