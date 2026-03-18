#!/usr/bin/env python3
"""
03-aggregate.py - Aggregate latency results from all regions and rank them.
Run locally after collecting all results_*.json files.

Usage:
    python3 03-aggregate.py                          # reads from ./results/
    python3 03-aggregate.py --dir /path/to/results   # custom directory
"""

import argparse
import csv
import json
import os
import sys
from pathlib import Path


# ── Display helpers ──────────────────────────────────────────────────────────

BOLD = "\033[1m"
CYAN = "\033[36m"
GREEN = "\033[32m"
YELLOW = "\033[33m"
RED = "\033[31m"
DIM = "\033[2m"
RESET = "\033[0m"


def fmt_ms(val, best_val=None) -> str:
    """Format a millisecond value, highlight if it's the best."""
    if val is None or val == "N/A":
        return f"{'N/A':>8}"
    s = f"{val:>8.2f}"
    if best_val is not None and val == best_val:
        return f"{GREEN}{BOLD}{s}{RESET}"
    return s


def print_table(headers: list[str], rows: list[list], best_cols: list[int] | None = None):
    """Print a formatted ASCII table with optional best-value highlighting."""
    # Compute column widths (strip ANSI for width calc)
    import re
    strip_ansi = lambda s: re.sub(r'\033\[[0-9;]*m', '', str(s))

    widths = [len(h) for h in headers]
    for row in rows:
        for i, cell in enumerate(row):
            widths[i] = max(widths[i], len(strip_ansi(str(cell))))

    # Header
    header_line = "  ".join(h.ljust(widths[i]) for i, h in enumerate(headers))
    print(f"  {BOLD}{header_line}{RESET}")
    print(f"  {'  '.join('-' * w for w in widths)}")

    # Rows
    for row in rows:
        cells = []
        for i, cell in enumerate(row):
            raw = strip_ansi(str(cell))
            padding = widths[i] - len(raw)
            cells.append(str(cell) + " " * max(0, padding))
        print(f"  {'  '.join(cells)}")


# ── Main ─────────────────────────────────────────────────────────────────────

def load_results(results_dir: str) -> list[dict]:
    """Load all results_*.json files from a directory."""
    results = []
    p = Path(results_dir)
    if not p.exists():
        print(f"{RED}Error: directory {results_dir} does not exist{RESET}")
        sys.exit(1)

    for f in sorted(p.glob("results_*.json")):
        try:
            with open(f) as fh:
                data = json.load(fh)
                data["_filename"] = f.name
                results.append(data)
        except (json.JSONDecodeError, IOError) as e:
            print(f"{YELLOW}Warning: skipping {f.name}: {e}{RESET}")

    if not results:
        print(f"{RED}Error: no results_*.json files found in {results_dir}{RESET}")
        sys.exit(1)

    return results


def get_metric(result: dict, target: str, metric: str, stat: str = "median_p50") -> float | None:
    """Extract a specific metric from a result dict."""
    try:
        return result["targets"][target][metric][stat]
    except (KeyError, TypeError):
        return None


def main():
    parser = argparse.ArgumentParser(description="Aggregate latency test results")
    parser.add_argument("--dir", type=str, default="./results", help="Directory containing results_*.json files")
    args = parser.parse_args()

    results = load_results(args.dir)
    targets = ["polymarket", "kalshi"]
    metrics = [
        ("dns", "DNS"),
        ("tcp_connect", "TCP"),
        ("tls_handshake", "TLS"),
        ("ttfb_cold", "TTFB Cold"),
        ("ttfb_warm", "TTFB Warm"),
        ("total_cold", "Total Cold"),
        ("total_warm", "Total Warm"),
    ]

    print(f"\n{'='*80}")
    print(f"  {BOLD}{CYAN}LATENCY TEST RESULTS - {len(results)} Regions{RESET}")
    print(f"{'='*80}")

    # ── Per-target tables ──
    for target in targets:
        target_label = target.upper()
        host = results[0]["targets"].get(target, {}).get("host", "?")
        print(f"\n  {BOLD}{CYAN}--- {target_label} ({host}) ---{RESET}\n")

        # Show resolved IPs and cert info
        for r in results:
            t = r["targets"].get(target, {})
            ip = t.get("resolved_ip", "?")
            cert_cn = t.get("tls_cert", {}).get("subject_cn", "?")
            issuer = t.get("tls_cert", {}).get("issuer_cn", "?")
            status = t.get("http_status", "?")
            print(f"  {DIM}{r['region']:15s} -> {ip:16s}  cert={cert_cn}  issuer={issuer}  HTTP {status}{RESET}")
        print()

        # Build comparison table
        headers = ["Region"] + [m[1] + " p50" for m in metrics] + [m[1] + " p95" for m in metrics[:5]]

        # Find best (lowest) value for each column
        all_vals = {}  # col_idx -> list of values
        for col_idx, (metric_key, _) in enumerate(metrics):
            vals = []
            for r in results:
                v = get_metric(r, target, metric_key, "median_p50")
                vals.append(v)
            all_vals[col_idx + 1] = vals  # +1 for region column

        for col_idx, (metric_key, _) in enumerate(metrics[:5]):
            vals = []
            for r in results:
                v = get_metric(r, target, metric_key, "p95")
                vals.append(v)
            all_vals[len(metrics) + col_idx + 1] = vals

        # Find minimum per column
        best_per_col = {}
        for col_idx, vals in all_vals.items():
            numeric = [v for v in vals if v is not None]
            best_per_col[col_idx] = min(numeric) if numeric else None

        rows = []
        for i, r in enumerate(results):
            row = [r["region"]]
            # p50 values
            for col_idx, (metric_key, _) in enumerate(metrics):
                v = get_metric(r, target, metric_key, "median_p50")
                best = best_per_col.get(col_idx + 1)
                row.append(fmt_ms(v, best))
            # p95 values
            for col_idx, (metric_key, _) in enumerate(metrics[:5]):
                v = get_metric(r, target, metric_key, "p95")
                best = best_per_col.get(len(metrics) + col_idx + 1)
                row.append(fmt_ms(v, best))
            rows.append(row)

        print_table(headers, rows)

    # ── Composite ranking ──
    print(f"\n  {BOLD}{CYAN}--- COMPOSITE RANKING ---{RESET}\n")

    scores = []
    for r in results:
        poly_warm = get_metric(r, "polymarket", "ttfb_warm", "median_p50")
        kalshi_warm = get_metric(r, "kalshi", "ttfb_warm", "median_p50")
        poly_cold_p99 = get_metric(r, "polymarket", "total_cold", "p99")
        kalshi_cold_p99 = get_metric(r, "kalshi", "total_cold", "p99")

        composite = None
        if poly_warm is not None and kalshi_warm is not None:
            composite = 0.5 * poly_warm + 0.5 * kalshi_warm

        worst_case = None
        if poly_cold_p99 is not None and kalshi_cold_p99 is not None:
            worst_case = 0.5 * poly_cold_p99 + 0.5 * kalshi_cold_p99

        scores.append({
            "region": r["region"],
            "poly_warm_p50": poly_warm,
            "kalshi_warm_p50": kalshi_warm,
            "composite": composite,
            "poly_cold_p99": poly_cold_p99,
            "kalshi_cold_p99": kalshi_cold_p99,
            "worst_case": worst_case,
        })

    # Sort by composite score
    scores.sort(key=lambda s: s["composite"] if s["composite"] is not None else float("inf"))

    headers = ["Rank", "Region", "Poly Warm p50", "Kalshi Warm p50", "Composite", "Worst Case (p99)"]
    rows = []
    for i, s in enumerate(scores):
        rank = f"#{i+1}"
        if i == 0:
            rank = f"{GREEN}{BOLD}#{i+1} *{RESET}"
        rows.append([
            rank,
            s["region"],
            fmt_ms(s["poly_warm_p50"], scores[0]["poly_warm_p50"] if scores else None),
            fmt_ms(s["kalshi_warm_p50"], scores[0]["kalshi_warm_p50"] if scores else None),
            fmt_ms(s["composite"], scores[0]["composite"] if scores else None),
            fmt_ms(s["worst_case"], scores[0]["worst_case"] if scores else None),
        ])

    print_table(headers, rows)

    # ── Recommendation ──
    if scores and scores[0]["composite"] is not None:
        winner = scores[0]
        print(f"\n  {BOLD}{GREEN}RECOMMENDATION: Deploy to {winner['region']}{RESET}")
        print(f"  Composite warm TTFB: {winner['composite']:.2f}ms")
        print(f"  (Polymarket={winner['poly_warm_p50']:.2f}ms + Kalshi={winner['kalshi_warm_p50']:.2f}ms) / 2")

        if len(scores) > 1 and scores[1]["composite"] is not None:
            diff = scores[1]["composite"] - winner["composite"]
            runner = scores[1]
            print(f"\n  Runner-up: {runner['region']} (composite={runner['composite']:.2f}ms, +{diff:.2f}ms)")
            if diff < 5:
                print(f"  {YELLOW}Note: Top 2 regions are within 5ms. Consider re-running with more samples.{RESET}")

    # ── MTR summary ──
    print(f"\n  {BOLD}{CYAN}--- NETWORK PATH SUMMARY ---{RESET}\n")
    for r in results:
        print(f"  {BOLD}{r['region']}{RESET}")
        for target in targets:
            mtr_data = r["targets"].get(target, {}).get("mtr")
            if mtr_data and "report" in mtr_data:
                hubs = mtr_data["report"].get("hubs", [])
                total_hops = len(hubs)
                if hubs:
                    last = hubs[-1]
                    last_avg = last.get("Avg", "?")
                    last_loss = last.get("Loss%", 0)
                    print(f"    {target:12s}: {total_hops} hops, final avg={last_avg}ms, loss={last_loss}%")
                else:
                    print(f"    {target:12s}: mtr data present but no hubs")
            elif mtr_data and "traceroute_raw" in mtr_data:
                lines = mtr_data["traceroute_raw"].strip().split("\n")
                print(f"    {target:12s}: traceroute {len(lines)} lines (raw)")
            else:
                print(f"    {target:12s}: no trace data")
        print()

    # ── CSV export ──
    csv_path = os.path.join(args.dir, "summary.csv")
    try:
        with open(csv_path, "w", newline="") as f:
            writer = csv.writer(f)
            header = ["region", "target", "dns_p50", "tcp_p50", "tls_p50",
                       "ttfb_cold_p50", "ttfb_warm_p50", "total_cold_p50", "total_warm_p50",
                       "ttfb_cold_p95", "ttfb_warm_p95", "total_cold_p95", "total_warm_p95",
                       "ttfb_cold_p99", "ttfb_warm_p99"]
            writer.writerow(header)
            for r in results:
                for target in targets:
                    row = [r["region"], target]
                    for metric_key in ["dns", "tcp_connect", "tls_handshake",
                                       "ttfb_cold", "ttfb_warm", "total_cold", "total_warm"]:
                        row.append(get_metric(r, target, metric_key, "median_p50"))
                    for metric_key in ["ttfb_cold", "ttfb_warm", "total_cold", "total_warm"]:
                        row.append(get_metric(r, target, metric_key, "p95"))
                    for metric_key in ["ttfb_cold", "ttfb_warm"]:
                        row.append(get_metric(r, target, metric_key, "p99"))
                    writer.writerow(row)
        print(f"  {DIM}CSV exported to: {csv_path}{RESET}")
    except IOError as e:
        print(f"  {YELLOW}Warning: could not write CSV: {e}{RESET}")

    print()


if __name__ == "__main__":
    main()
