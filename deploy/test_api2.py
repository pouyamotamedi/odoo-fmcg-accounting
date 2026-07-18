import urllib.request
import json

# Test authenticate
data = json.dumps({
    "jsonrpc": "2.0",
    "id": 1,
    "method": "call",
    "params": {
        "db": "smoke",
        "login": "admin",
        "password": "admin"
    }
}).encode()

req = urllib.request.Request('http://localhost:8069/web/session/authenticate', data=data, headers={'Content-Type': 'application/json'})
resp = urllib.request.urlopen(req)
result = json.loads(resp.read())
print("UID:", result.get('result', {}).get('uid'))

session_cookie = resp.headers.get('Set-Cookie', '').split(';')[0]
print("Cookie:", session_cookie)

# Test with /jsonrpc (XML-RPC style) - this works per earlier test
# Now test /web/dataset/call_kw with proper model/method/args/kwargs
data2 = json.dumps({
    "jsonrpc": "2.0",
    "id": 2,
    "method": "call",
    "params": {
        "model": "res.partner",
        "method": "search_read",
        "args": [[['id', '>', 0]]],
        "kwargs": {
            "fields": ["name"],
            "limit": 3,
            "context": {"lang": "fa_IR"}
        }
    }
}).encode()

# Try /web/dataset/call_kw/res.partner/search_read (full path)
req2 = urllib.request.Request(
    'http://localhost:8069/web/dataset/call_kw/res.partner/search_read',
    data=data2,
    headers={
        'Content-Type': 'application/json',
        'Cookie': session_cookie
    }
)
try:
    resp2 = urllib.request.urlopen(req2)
    result2 = json.loads(resp2.read())
    if 'error' in result2:
        print("ERROR:", result2['error'].get('data', {}).get('message', result2['error'].get('message', '')))
    else:
        print("OK:", result2.get('result', [])[:2])
except Exception as e:
    print("EX:", e)
