import http.cookiejar
import urllib.request
import json

# Use cookie jar to properly manage session
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

# Step 1: Authenticate
data = json.dumps({
    "jsonrpc": "2.0",
    "id": 1,
    "method": "call",
    "params": {"db": "smoke", "login": "admin", "password": "admin"}
}).encode()

req = urllib.request.Request('http://localhost:8069/web/session/authenticate', data=data, headers={'Content-Type': 'application/json'})
resp = opener.open(req)
result = json.loads(resp.read())
uid = result.get('result', {}).get('uid')
print("UID:", uid)
print("Cookies:", [(c.name, c.value[:20]) for c in cj])

# Step 2: Call with same session (cookies auto-sent)
data2 = json.dumps({
    "jsonrpc": "2.0",
    "id": 2,
    "method": "call",
    "params": {
        "model": "res.partner",
        "method": "search_read",
        "args": [[]],
        "kwargs": {"fields": ["name"], "limit": 3}
    }
}).encode()

req2 = urllib.request.Request('http://localhost:8069/web/dataset/call_kw/res.partner/search_read', data=data2, headers={'Content-Type': 'application/json'})
resp2 = opener.open(req2)
result2 = json.loads(resp2.read())
if 'error' in result2:
    print("ERROR:", result2['error'].get('data', {}).get('message', ''))
    print("FULL:", json.dumps(result2['error'], indent=2)[:500])
else:
    print("SUCCESS:", result2.get('result', [])[:2])
