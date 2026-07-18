import http.cookiejar
import urllib.request
import json

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

data = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "call", "params": {"db": "smoke", "login": "admin", "password": "admin"}}).encode()
req = urllib.request.Request('http://localhost:8069/web/session/authenticate', data=data, headers={'Content-Type': 'application/json'})
resp = opener.open(req)
result = json.loads(resp.read())
print("UID:", result.get('result', {}).get('uid'))

# Try call_kw and get FULL error
data2 = json.dumps({"jsonrpc": "2.0", "id": 2, "method": "call", "params": {"model": "res.partner", "method": "search_read", "args": [[]], "kwargs": {"fields": ["name"], "limit": 2}}}).encode()
req2 = urllib.request.Request('http://localhost:8069/web/dataset/call_kw', data=data2, headers={'Content-Type': 'application/json'})
try:
    resp2 = opener.open(req2)
    body = resp2.read().decode()
except urllib.error.HTTPError as e:
    body = e.read().decode()
    
result2 = json.loads(body)
if 'error' in result2:
    print("FULL TRACEBACK:")
    print(result2['error'].get('data', {}).get('debug', 'no debug'))
else:
    print("SUCCESS:", result2.get('result', [])[:2])
