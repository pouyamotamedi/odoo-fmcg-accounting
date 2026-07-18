"""Test if Next.js rewrite proxy to Odoo works correctly"""
import http.cookiejar
import urllib.request
import json

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

# Test via Next.js rewrite (port 3000 /api/ -> Odoo 8069)
print("Testing via Next.js proxy (localhost:3000/api/)...")

# Authenticate
data = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "call", "params": {"db": "smoke", "login": "admin", "password": "admin"}}).encode()
req = urllib.request.Request('http://localhost:3000/api/web/session/authenticate', data=data, headers={'Content-Type': 'application/json'})
try:
    resp = opener.open(req)
    result = json.loads(resp.read())
    print("  Auth UID:", result.get('result', {}).get('uid'))
    print("  Cookies:", [(c.name, c.value[:30]) for c in cj])
except Exception as e:
    print("  Auth FAILED:", e)
    exit()

# Now try call_kw
data2 = json.dumps({"jsonrpc": "2.0", "id": 2, "method": "call", "params": {"model": "res.partner", "method": "search_read", "args": [[]], "kwargs": {"fields": ["name"], "limit": 2}}}).encode()
req2 = urllib.request.Request('http://localhost:3000/api/web/dataset/call_kw', data=data2, headers={'Content-Type': 'application/json'})
try:
    resp2 = opener.open(req2)
    result2 = json.loads(resp2.read())
    if 'error' in result2:
        print("  call_kw ERROR:", result2['error'].get('data', {}).get('name', result2['error'].get('message', '')))
    else:
        print("  call_kw OK:", result2.get('result', [])[:2])
except urllib.error.HTTPError as e:
    body = e.read().decode()[:200]
    print(f"  call_kw HTTP {e.code}:", body)
except Exception as e:
    print("  call_kw EX:", e)
