import http.cookiejar
import urllib.request
import json

cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

# Authenticate
data = json.dumps({"jsonrpc": "2.0", "id": 1, "method": "call", "params": {"db": "smoke", "login": "admin", "password": "admin"}}).encode()
req = urllib.request.Request('http://localhost:8069/web/session/authenticate', data=data, headers={'Content-Type': 'application/json'})
resp = opener.open(req)
result = json.loads(resp.read())
print("UID:", result.get('result', {}).get('uid'))

# Try /web/dataset/search_read
data2 = json.dumps({"jsonrpc": "2.0", "id": 2, "method": "call", "params": {"model": "res.partner", "fields": ["name"], "domain": [], "limit": 3}}).encode()
req2 = urllib.request.Request('http://localhost:8069/web/dataset/search_read', data=data2, headers={'Content-Type': 'application/json'})
try:
    resp2 = opener.open(req2)
    result2 = json.loads(resp2.read())
    if 'error' in result2:
        print("search_read ERROR:", result2['error'].get('data', {}).get('name', ''))
    else:
        print("search_read OK:", result2.get('result', {}).get('records', result2.get('result', []))[:2])
except Exception as e:
    print("EX:", e)

# Try call_kw with correct format (Odoo 18 requires model and method in URL)
data3 = json.dumps({"jsonrpc": "2.0", "id": 3, "method": "call", "params": {"model": "res.partner", "method": "search_read", "args": [[]], "kwargs": {"fields": ["name"], "limit": 3}}}).encode()
req3 = urllib.request.Request('http://localhost:8069/web/dataset/call_kw/res.partner/search_read', data=data3, headers={'Content-Type': 'application/json'})
try:
    resp3 = opener.open(req3)
    result3 = json.loads(resp3.read())
    if 'error' in result3:
        print("call_kw ERROR:", result3['error'].get('data', {}).get('name', ''))
    else:
        print("call_kw OK:", result3.get('result', [])[:2])
except Exception as e:
    print("EX call_kw:", e)

# Try /jsonrpc (the endpoint our frontend actually uses)
data4 = json.dumps({"jsonrpc": "2.0", "id": 4, "method": "call", "params": {"service": "object", "method": "execute_kw", "args": ["smoke", 2, "admin", "res.partner", "search_read", [[]], {"fields": ["name"], "limit": 3}]}}).encode()
req4 = urllib.request.Request('http://localhost:8069/jsonrpc', data=data4, headers={'Content-Type': 'application/json'})
try:
    resp4 = opener.open(req4)
    result4 = json.loads(resp4.read())
    if 'error' in result4:
        print("jsonrpc ERROR:", result4['error'].get('data', {}).get('name', ''))
    else:
        print("jsonrpc OK:", result4.get('result', [])[:2])
except Exception as e:
    print("EX jsonrpc:", e)
