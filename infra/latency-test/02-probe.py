#!/usr/bin/env python3
"""
02-probe.py - Comprehensive latency probe for Polymarket & Kalshi APIs.
Run on each AWS VM. Zero external dependencies (stdlib only).

Usage:
    python3 02-probe.py                      # auto-detects region from instance metadata
    python3 02-probe.py --region us-east-1   # manual region override

Output: results_{region}_{timestamp}.json in the current directory.
"""

import argparse
import http.client
import json
import os
import platform
import socket
import ssl
import statistics
import subprocess
import sys
import time
from datetime import datetime, timezone

# ── Targets ──────────────────────────────────────────────────────────────────

TARGETS = {
    "polymarket": {
        "host": "gamma-api.polymarket.com",
        "port": 443,
        "path": "/markets?limit=1&active=true&closed=false",
    },
    "kalshi": {
        "host": "api.elections.kalshi.com",
        "port": 443,
        "path": "/trade-api/v2/markets?limit=1&status=open",
    },
}

# ── Config ───────────────────────────────────────────────────────────────────

WARMUP_REQUESTS = 3
COLD_SAMPLES = 20
WARM_SAMPLES = 30
INTER_REQUEST_DELAY_S = 0.2  # 200ms between requests
CONNECT_TIMEOUT_S = 10

# ── Helpers ──────────────────────────────────────────────────────────────────

def ms(ns: int) -> float:
    """Convert nanoseconds to milliseconds, rounded to 3 decimal places."""
    return round(ns / 1_000_000, 3)


def compute_stats(samples_ms: list[float]) -> dict:
    """Compute statistical summary of a list of millisecond measurements."""
    if not samples_ms:
        return {}
    s = sorted(samples_ms)
    n = len(s)
    return {
        "min": round(s[0], 3),
        "max": round(s[-1], 3),
        "mean": round(statistics.mean(s), 3),
        "median_p50": round(statistics.median(s), 3),
        "p90": round(s[int(n * 0.9)] if n > 1 else s[0], 3),
        "p95": round(s[int(n * 0.95)] if n > 1 else s[0], 3),
        "p99": round(s[int(n * 0.99)] if n > 1 else s[0], 3),
        "stddev": round(statistics.stdev(s), 3) if n > 1 else 0.0,
        "samples": n,
        "raw": [round(x, 3) for x in samples_ms],
    }


def detect_region() -> str:
    """Try to detect AWS region from instance metadata (IMDSv2)."""
    try:
        # Get token
        import urllib.request
        req = urllib.request.Request(
            "http://169.254.169.254/latest/api/token",
            method="PUT",
            headers={"X-aws-ec2-metadata-token-ttl-seconds": "21600"},
        )
        with urllib.request.urlopen(req, timeout=2) as resp:
            token = resp.read().decode()

        # Get AZ
        req2 = urllib.request.Request(
            "http://169.254.169.254/latest/meta-data/placement/availability-zone",
            headers={"X-aws-ec2-metadata-token": token},
        )
        with urllib.request.urlopen(req2, timeout=2) as resp:
            az = resp.read().decode().strip()
        # Strip the trailing letter (e.g., us-east-1a -> us-east-1)
        return az[:-1] if az and az[-1].isalpha() else az
    except Exception:
        return "unknown"


def detect_instance_type() -> str:
    """Try to detect instance type from metadata."""
    try:
        import urllib.request
        req = urllib.request.Request(
            "http://169.254.169.254/latest/api/token",
            method="PUT",
            headers={"X-aws-ec2-metadata-token-ttl-seconds": "21600"},
        )
        with urllib.request.urlopen(req, timeout=2) as resp:
            token = resp.read().decode()

        req2 = urllib.request.Request(
            "http://169.254.169.254/latest/meta-data/instance-type",
            headers={"X-aws-ec2-metadata-token": token},
        )
        with urllib.request.urlopen(req2, timeout=2) as resp:
            return resp.read().decode().strip()
    except Exception:
        return "unknown"


# ── Measurement Functions ────────────────────────────────────────────────────

def measure_dns(host: str) -> tuple[float, str]:
    """Measure DNS resolution time. Returns (ms, resolved_ip)."""
    t0 = time.perf_counter_ns()
    addrs = socket.getaddrinfo(host, 443, socket.AF_INET, socket.SOCK_STREAM)
    t1 = time.perf_counter_ns()
    ip = addrs[0][4][0] if addrs else "unknown"
    return ms(t1 - t0), ip


def measure_tcp_connect(ip: str, port: int) -> float:
    """Measure TCP connect time to an IP. Returns ms."""
    t0 = time.perf_counter_ns()
    sock = socket.create_connection((ip, port), timeout=CONNECT_TIMEOUT_S)
    t1 = time.perf_counter_ns()
    sock.close()
    return ms(t1 - t0)


def measure_tls_handshake(ip: str, port: int, hostname: str) -> tuple[float, dict]:
    """Measure TLS handshake time. Returns (ms, cert_info)."""
    sock = socket.create_connection((ip, port), timeout=CONNECT_TIMEOUT_S)
    ctx = ssl.create_default_context()

    t0 = time.perf_counter_ns()
    ssock = ctx.wrap_socket(sock, server_hostname=hostname)
    t1 = time.perf_counter_ns()

    cert = ssock.getpeercert()
    cert_info = {
        "subject_cn": dict(x[0] for x in cert.get("subject", ((("?", "?"),),)))
        .get("commonName", "?"),
        "issuer_cn": dict(x[0] for x in cert.get("issuer", ((("?", "?"),),)))
        .get("commonName", "?"),
    }
    ssock.close()
    return ms(t1 - t0), cert_info


def measure_cold_request(host: str, port: int, path: str) -> dict:
    """
    Full cold request: new TCP+TLS connection, send HTTP GET, measure TTFB and total.
    Returns dict with dns_ms, tcp_ms, tls_ms, ttfb_ms, total_ms.
    """
    # DNS
    t0 = time.perf_counter_ns()
    addrs = socket.getaddrinfo(host, port, socket.AF_INET, socket.SOCK_STREAM)
    t_dns = time.perf_counter_ns()
    ip = addrs[0][4][0]

    # TCP connect
    sock = socket.create_connection((ip, port), timeout=CONNECT_TIMEOUT_S)
    t_tcp = time.perf_counter_ns()

    # TLS handshake
    ctx = ssl.create_default_context()
    ssock = ctx.wrap_socket(sock, server_hostname=host)
    t_tls = time.perf_counter_ns()

    # Send request
    request = (
        f"GET {path} HTTP/1.1\r\n"
        f"Host: {host}\r\n"
        f"User-Agent: latency-probe/1.0\r\n"
        f"Accept: application/json\r\n"
        f"Connection: close\r\n"
        f"\r\n"
    )
    ssock.sendall(request.encode())

    # Read first byte (TTFB)
    first_byte = ssock.recv(1)
    t_ttfb = time.perf_counter_ns()

    # Read rest of response
    chunks = [first_byte]
    while True:
        chunk = ssock.recv(65536)
        if not chunk:
            break
        chunks.append(chunk)
    t_done = time.perf_counter_ns()

    ssock.close()

    response = b"".join(chunks)
    # Parse status code from first line
    first_line = response.split(b"\r\n", 1)[0].decode(errors="replace")
    status = int(first_line.split(" ")[1]) if len(first_line.split(" ")) > 1 else 0

    return {
        "dns_ms": ms(t_dns - t0),
        "tcp_ms": ms(t_tcp - t_dns),
        "tls_ms": ms(t_tls - t_tcp),
        "ttfb_ms": ms(t_ttfb - t_tls),
        "total_ms": ms(t_done - t0),
        "status": status,
        "response_bytes": len(response),
    }


def measure_warm_requests(host: str, port: int, path: str, count: int) -> list[dict]:
    """
    Warm (keep-alive) requests: reuse a single HTTP connection.
    Returns list of {ttfb_ms, total_ms} for each request.
    """
    results = []
    conn = http.client.HTTPSConnection(host, port, timeout=CONNECT_TIMEOUT_S)
    conn.connect()

    for i in range(count):
        t0 = time.perf_counter_ns()
        conn.request("GET", path, headers={
            "User-Agent": "latency-probe/1.0",
            "Accept": "application/json",
            "Connection": "keep-alive",
        })
        resp = conn.getresponse()
        # Read first chunk as proxy for TTFB
        t_headers = time.perf_counter_ns()
        body = resp.read()
        t_done = time.perf_counter_ns()

        results.append({
            "ttfb_ms": ms(t_headers - t0),
            "total_ms": ms(t_done - t0),
            "status": resp.status,
            "response_bytes": len(body),
        })

        if i < count - 1:
            time.sleep(INTER_REQUEST_DELAY_S)

    conn.close()
    return results


# ── MTR Trace ────────────────────────────────────────────────────────────────

def run_mtr(host: str) -> dict | None:
    """Run mtr and return parsed JSON output."""
    try:
        result = subprocess.run(
            ["mtr", "--report", "--report-cycles", "10", "--json", host],
            capture_output=True, text=True, timeout=60,
        )
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout)
    except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError):
        pass

    # Fallback: basic traceroute
    try:
        result = subprocess.run(
            ["traceroute", "-n", "-m", "15", "-w", "2", host],
            capture_output=True, text=True, timeout=30,
        )
        if result.returncode == 0:
            return {"traceroute_raw": result.stdout}
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass

    return None


# ── Main Probe ───────────────────────────────────────────────────────────────

def probe_target(name: str, target: dict) -> dict:
    """Run all measurements against a single target."""
    host = target["host"]
    port = target["port"]
    path = target["path"]

    print(f"\n  Probing {name} ({host})...")

    # ── Warmup ──
    print(f"    Warmup ({WARMUP_REQUESTS} requests)...", end=" ", flush=True)
    for _ in range(WARMUP_REQUESTS):
        try:
            conn = http.client.HTTPSConnection(host, port, timeout=CONNECT_TIMEOUT_S)
            conn.request("GET", path, headers={"User-Agent": "latency-probe/1.0"})
            resp = conn.getresponse()
            resp.read()
            conn.close()
        except Exception:
            pass
        time.sleep(0.1)
    print("done")

    # ── DNS samples ──
    print(f"    DNS resolution ({COLD_SAMPLES} samples)...", end=" ", flush=True)
    dns_samples = []
    resolved_ip = "unknown"
    for _ in range(COLD_SAMPLES):
        try:
            t, ip = measure_dns(host)
            dns_samples.append(t)
            resolved_ip = ip
        except Exception as e:
            print(f"\n      DNS error: {e}")
        time.sleep(0.05)
    print("done")

    # ── TCP connect samples ──
    print(f"    TCP connect ({COLD_SAMPLES} samples)...", end=" ", flush=True)
    tcp_samples = []
    for _ in range(COLD_SAMPLES):
        try:
            tcp_samples.append(measure_tcp_connect(resolved_ip, port))
        except Exception as e:
            print(f"\n      TCP error: {e}")
        time.sleep(0.05)
    print("done")

    # ── TLS handshake samples ──
    print(f"    TLS handshake ({COLD_SAMPLES} samples)...", end=" ", flush=True)
    tls_samples = []
    cert_info = {}
    for _ in range(COLD_SAMPLES):
        try:
            t, ci = measure_tls_handshake(resolved_ip, port, host)
            tls_samples.append(t)
            cert_info = ci
        except Exception as e:
            print(f"\n      TLS error: {e}")
        time.sleep(0.05)
    print("done")

    # ── Cold request samples ──
    print(f"    Cold requests ({COLD_SAMPLES} samples)...", end=" ", flush=True)
    cold_ttfb = []
    cold_total = []
    last_status = 0
    last_response_bytes = 0
    for _ in range(COLD_SAMPLES):
        try:
            r = measure_cold_request(host, port, path)
            cold_ttfb.append(r["ttfb_ms"])
            cold_total.append(r["total_ms"])
            last_status = r["status"]
            last_response_bytes = r["response_bytes"]
        except Exception as e:
            print(f"\n      Cold request error: {e}")
        time.sleep(INTER_REQUEST_DELAY_S)
    print("done")

    # ── Warm request samples ──
    print(f"    Warm requests ({WARM_SAMPLES} samples)...", end=" ", flush=True)
    try:
        warm_results = measure_warm_requests(host, port, path, WARM_SAMPLES)
        warm_ttfb = [r["ttfb_ms"] for r in warm_results]
        warm_total = [r["total_ms"] for r in warm_results]
        if warm_results:
            last_status = warm_results[-1]["status"]
    except Exception as e:
        print(f"\n      Warm request error: {e}")
        warm_ttfb = []
        warm_total = []
    print("done")

    # ── MTR trace ──
    print(f"    MTR trace...", end=" ", flush=True)
    mtr_data = run_mtr(host)
    print("done")

    return {
        "host": host,
        "path": path,
        "resolved_ip": resolved_ip,
        "tls_cert": cert_info,
        "http_status": last_status,
        "response_bytes": last_response_bytes,
        "dns": compute_stats(dns_samples),
        "tcp_connect": compute_stats(tcp_samples),
        "tls_handshake": compute_stats(tls_samples),
        "ttfb_cold": compute_stats(cold_ttfb),
        "ttfb_warm": compute_stats(warm_ttfb),
        "total_cold": compute_stats(cold_total),
        "total_warm": compute_stats(warm_total),
        "mtr": mtr_data,
    }


def main():
    parser = argparse.ArgumentParser(description="Latency probe for prediction market APIs")
    parser.add_argument("--region", type=str, default=None, help="AWS region (auto-detected if omitted)")
    args = parser.parse_args()

    region = args.region or detect_region()
    instance_type = detect_instance_type()
    timestamp = datetime.now(timezone.utc).strftime("%Y%m%dT%H%M%SZ")

    print(f"{'='*60}")
    print(f"  Latency Probe")
    print(f"  Region:    {region}")
    print(f"  Instance:  {instance_type}")
    print(f"  Kernel:    {platform.release()}")
    print(f"  Python:    {platform.python_version()}")
    print(f"  Time:      {timestamp}")
    print(f"  Targets:   {', '.join(TARGETS.keys())}")
    print(f"  Samples:   {COLD_SAMPLES} cold + {WARM_SAMPLES} warm per target")
    print(f"{'='*60}")

    results = {
        "region": region,
        "instance_type": instance_type,
        "timestamp": timestamp,
        "kernel": platform.release(),
        "python_version": platform.python_version(),
        "config": {
            "warmup_requests": WARMUP_REQUESTS,
            "cold_samples": COLD_SAMPLES,
            "warm_samples": WARM_SAMPLES,
            "inter_request_delay_s": INTER_REQUEST_DELAY_S,
        },
        "targets": {},
    }

    for name, target in TARGETS.items():
        results["targets"][name] = probe_target(name, target)

    # ── Write output ──
    filename = f"results_{region}_{timestamp}.json"
    with open(filename, "w") as f:
        json.dump(results, f, indent=2)

    print(f"\n{'='*60}")
    print(f"  Results written to: {filename}")
    print(f"{'='*60}")

    # ── Quick summary ──
    print(f"\n  Quick Summary:")
    for name in TARGETS:
        t = results["targets"][name]
        warm_p50 = t["ttfb_warm"].get("median_p50", "N/A")
        cold_p50 = t["ttfb_cold"].get("median_p50", "N/A")
        tcp_p50 = t["tcp_connect"].get("median_p50", "N/A")
        print(f"    {name:12s}  TCP={tcp_p50}ms  TTFB(cold)={cold_p50}ms  TTFB(warm)={warm_p50}ms")

    print()


if __name__ == "__main__":
    main()
