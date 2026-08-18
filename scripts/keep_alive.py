#!/usr/bin/env python3
"""
Pestneer Backend Keep-Alive Script
Pings both /api/health and the root URL every 10 minutes to prevent Render spin down.
"""

import os
import sys
import time
import urllib.request
import urllib.error
from datetime import datetime

TARGET_URLS = [
    os.environ.get("KEEP_ALIVE_URL", "https://pesneer.onrender.com/api/health"),
    "https://pesneer.onrender.com",
]
INTERVAL_SECONDS = int(os.environ.get("KEEP_ALIVE_INTERVAL", 10 * 60))  # Default 10 minutes


def ping_url(url: str):
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    req = urllib.request.Request(
        url,
        headers={
            "User-Agent": "PestneerKeepAlive/1.0",
            "Accept": "*/*",
        },
    )
    try:
        start = time.time()
        with urllib.request.urlopen(req, timeout=30) as response:
            duration = (time.time() - start) * 1000
            status_code = response.getcode()
            print(f"[{now_str}] [SUCCESS] {url} -> HTTP {status_code} ({duration:.0f}ms)")
            return True
    except urllib.error.HTTPError as e:
        print(f"[{now_str}] [HTTP_ERROR] {url} -> Status {e.code}: {e.reason}")
        return False
    except urllib.error.URLError as e:
        print(f"[{now_str}] [CONNECTION_ERROR] {url} -> {e.reason}")
        return False
    except Exception as e:
        print(f"[{now_str}] [ERROR] {url} -> {e}")
        return False


def ping_all():
    for url in TARGET_URLS:
        ping_url(url)


def main():
    print(f"=== Pestneer Keep-Alive Service ===")
    print(f"Targets  : {', '.join(TARGET_URLS)}")
    print(f"Interval : {INTERVAL_SECONDS // 60} minutes ({INTERVAL_SECONDS}s)")
    print("Press Ctrl+C to stop.\n")

    # Initial ping
    ping_all()

    while True:
        try:
            time.sleep(INTERVAL_SECONDS)
            ping_all()
        except KeyboardInterrupt:
            print("\nKeep-alive service stopped by user.")
            sys.exit(0)


if __name__ == "__main__":
    main()
