#!/usr/bin/env python3
"""
Pestneer Backend Keep-Alive Script
Pings the Render.com backend every 10 minutes to prevent cold-start spin down.
"""

import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime

TARGET_URL = os.environ.get("KEEP_ALIVE_URL", "https://pesneer.onrender.com/api/health")
INTERVAL_SECONDS = int(os.environ.get("KEEP_ALIVE_INTERVAL", 10 * 60))  # Default 10 minutes


def ping():
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    req = urllib.request.Request(
        TARGET_URL,
        headers={
            "User-Agent": "PestneerKeepAlive/1.0",
            "Accept": "application/json",
        },
    )
    try:
        start = time.time()
        with urllib.request.urlopen(req, timeout=30) as response:
            duration = (time.time() - start) * 1000
            status_code = response.getcode()
            body = response.read().decode("utf-8", errors="replace")
            print(f"[{now_str}] [SUCCESS] HTTP {status_code} ({duration:.0f}ms) -> {body.strip()}")
            return True
    except urllib.error.HTTPError as e:
        print(f"[{now_str}] [HTTP_ERROR] Status {e.code}: {e.reason}")
        return False
    except urllib.error.URLError as e:
        print(f"[{now_str}] [CONNECTION_ERROR] {e.reason}")
        return False
    except Exception as e:
        print(f"[{now_str}] [ERROR] {e}")
        return False


def main():
    print(f"=== Pestneer Keep-Alive Service ===")
    print(f"Target URL: {TARGET_URL}")
    print(f"Interval  : {INTERVAL_SECONDS // 60} minutes ({INTERVAL_SECONDS}s)")
    print("Press Ctrl+C to stop.\n")

    # Initial ping
    ping()

    while True:
        try:
            time.sleep(INTERVAL_SECONDS)
            ping()
        except KeyboardInterrupt:
            print("\nKeep-alive service stopped by user.")
            sys.exit(0)


if __name__ == "__main__":
    main()
