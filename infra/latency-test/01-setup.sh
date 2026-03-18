#!/usr/bin/env bash
# 01-setup.sh - Prepare a fresh AWS VM for latency testing
# Run this after SSH-ing into each EC2 instance.
set -euo pipefail

echo "[+] Detecting package manager..."

if command -v dnf &>/dev/null; then
    # Amazon Linux 2023
    echo "[+] Using dnf (Amazon Linux 2023)"
    sudo dnf install -y python3 mtr traceroute jq 2>/dev/null || {
        echo "[!] dnf install failed, trying yum..."
        sudo yum install -y python3 mtr traceroute jq
    }
elif command -v yum &>/dev/null; then
    # Amazon Linux 2
    echo "[+] Using yum (Amazon Linux 2)"
    sudo yum install -y python3 mtr traceroute jq
elif command -v apt-get &>/dev/null; then
    # Ubuntu / Debian
    echo "[+] Using apt-get (Ubuntu/Debian)"
    sudo apt-get update -qq
    sudo apt-get install -y python3 mtr-tiny traceroute jq
else
    echo "[!] Unknown package manager. Install python3, mtr, traceroute, jq manually."
    exit 1
fi

echo ""
echo "[+] Verifying installations..."
python3 --version
mtr --version 2>/dev/null | head -1 || echo "mtr installed"
traceroute --version 2>/dev/null | head -1 || echo "traceroute installed"
jq --version 2>/dev/null || echo "jq installed"

echo ""
echo "[+] Setup complete. Ready to run 02-probe.py"
