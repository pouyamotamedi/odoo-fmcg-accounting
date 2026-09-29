#!/usr/bin/env python3
"""Post-deploy health check for the Next.js -> Odoo JSON-RPC chain."""

import argparse
import http.cookiejar
import json
import sys
import urllib.error
import urllib.request


def rpc(opener, url, params):
    request = urllib.request.Request(
        url,
        data=json.dumps({"jsonrpc": "2.0", "id": 1, "method": "call", "params": params}).encode(),
        headers={"Content-Type": "application/json"},
    )
    try:
        with opener.open(request, timeout=30) as response:
            payload = json.loads(response.read())
    except urllib.error.HTTPError as error:
        body = error.read().decode(errors="replace")[:500]
        raise RuntimeError(f"HTTP {error.code} from {url}: {body}") from error
    if payload.get("error"):
        details = payload["error"].get("data", {}).get("message") or payload["error"].get("message")
        raise RuntimeError(f"RPC error from {url}: {details}")
    return payload.get("result")


def main():
    parser = argparse.ArgumentParser()
    parser.add_argument("--base-url", required=True)
    parser.add_argument("--database", required=True)
    parser.add_argument("--login", default="admin")
    parser.add_argument("--password", default="admin")
    args = parser.parse_args()

    base = args.base_url.rstrip("/")
    opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(http.cookiejar.CookieJar()))
    session = rpc(opener, f"{base}/web/session/authenticate", {
        "db": args.database, "login": args.login, "password": args.password,
    })
    if not session or not session.get("uid"):
        raise RuntimeError("Authentication returned no user ID")

    partners = rpc(opener, f"{base}/web/dataset/call_kw", {
        "model": "res.partner", "method": "search_read", "args": [[]],
        "kwargs": {"fields": ["name"], "limit": 1},
    })
    dashboard = rpc(opener, f"{base}/web/dataset/call_kw", {
        "model": "fmcg.incentive.period", "method": "current_dashboard", "args": [], "kwargs": {},
    })
    if not isinstance(partners, list) or not dashboard or not dashboard.get("period"):
        raise RuntimeError("Dashboard or incentive payload is incomplete")
    print(f"RPC verification OK: uid={session['uid']}, period={dashboard['period']['name']}")


if __name__ == "__main__":
    try:
        main()
    except Exception as error:
        print(f"RPC verification FAILED: {error}", file=sys.stderr)
        raise SystemExit(1)
