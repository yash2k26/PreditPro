#!/usr/bin/env bash
# 00-recon.sh - Local reconnaissance: discover where Polymarket & Kalshi servers live
# Run this on your Mac BEFORE renting any VMs.
set -euo pipefail

POLY_HOST="gamma-api.polymarket.com"
KALSHI_HOST="api.elections.kalshi.com"

BOLD="\033[1m"
CYAN="\033[36m"
GREEN="\033[32m"
YELLOW="\033[33m"
RESET="\033[0m"

section() { echo -e "\n${BOLD}${CYAN}=== $1 ===${RESET}\n"; }
info() { echo -e "${GREEN}[+]${RESET} $1"; }
warn() { echo -e "${YELLOW}[!]${RESET} $1"; }

section "DNS Resolution"

for host in "$POLY_HOST" "$KALSHI_HOST"; do
    info "Resolving $host"
    echo "--- dig output ---"
    dig +short "$host" 2>/dev/null || echo "(dig failed)"
    echo ""

    # Get all A records
    ips=$(dig +short "$host" 2>/dev/null | grep -E '^[0-9]+\.' || true)
    if [ -z "$ips" ]; then
        # Try CNAME chain
        warn "No direct A record, checking CNAME chain..."
        dig +trace "$host" 2>/dev/null | tail -20 || true
    fi
    echo ""
done

section "HTTP Header Inspection (CDN Detection)"

for host in "$POLY_HOST" "$KALSHI_HOST"; do
    if [ "$host" = "$POLY_HOST" ]; then
        url="https://${host}/markets?limit=1&active=true&closed=false"
        label="Polymarket"
    else
        url="https://${host}/trade-api/v2/markets?limit=1&status=open"
        label="Kalshi"
    fi

    info "$label - $url"
    echo "--- Response Headers ---"
    curl -sI -m 10 "$url" 2>/dev/null | grep -iE '^(server|cf-ray|cf-cache|x-served-by|x-cache|via|x-amz|x-vercel|x-powered|alt-svc|content-type|date|HTTP)' || echo "(curl failed)"
    echo ""
done

section "IP Geolocation"

for host in "$POLY_HOST" "$KALSHI_HOST"; do
    ips=$(dig +short "$host" 2>/dev/null | grep -E '^[0-9]+\.' | head -3 || true)
    if [ -z "$ips" ]; then
        warn "No IPs resolved for $host"
        continue
    fi

    for ip in $ips; do
        info "$host -> $ip"
        # Use ip-api.com (free, no key, 45 req/min)
        geo=$(curl -s -m 5 "http://ip-api.com/json/${ip}?fields=status,country,regionName,city,isp,org,as,query" 2>/dev/null || echo '{}')
        if command -v jq &>/dev/null; then
            echo "$geo" | jq -r '"  Country:  \(.country)\n  Region:   \(.regionName)\n  City:     \(.city)\n  ISP:      \(.isp)\n  Org:      \(.org)\n  AS:       \(.as)"' 2>/dev/null || echo "  $geo"
        else
            echo "  $geo"
        fi
        echo ""
        # Rate limit courtesy
        sleep 1
    done
done

section "Traceroute (first 15 hops)"

for host in "$POLY_HOST" "$KALSHI_HOST"; do
    info "Traceroute to $host"
    # Use -m 15 to limit hops, -w 2 for 2s timeout per hop
    if command -v traceroute &>/dev/null; then
        traceroute -m 15 -w 2 "$host" 2>/dev/null || warn "traceroute failed for $host"
    else
        warn "traceroute not found, skipping"
    fi
    echo ""
done

section "Summary"

echo -e "Review the output above to determine:"
echo -e "  1. Whether each API is behind a CDN (look for cf-ray = Cloudflare)"
echo -e "  2. The approximate geographic location of origin servers"
echo -e "  3. The ISP/hosting provider (AWS, GCP, Cloudflare, etc.)"
echo -e ""
echo -e "Then proceed to launch VMs in the planned AWS regions."
