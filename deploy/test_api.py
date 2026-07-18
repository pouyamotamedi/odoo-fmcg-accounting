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
try:
    resp = urllib.request.urlopen(req)
    result = json.loads(resp.read())
    print("STATUS:", resp.status)
    print("UID:", result.get('result', {}).get('uid'))
    print("SESSION:", resp.headers.get('Set-Cookie', '')[:80])
    
    # Now test a read with the session
    session_cookie = resp.headers.get('Set-Cookie', '').split(';')[0]
    
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
    
    req2 = urllib.request.Request('http://localhost:8069/web/dataset/call_kw', data=data2, headers={
        'Content-Type': 'application/json',
        'Cookie': session_cookie
    })
    resp2 = urllib.request.urlopen(req2)
    result2 = json.loads(resp2.read())
    if 'error' in result2:
        print("ERROR:", result2['error'].get('message', ''))
        print("DATA:", result2['error'].get('data', {}).get('message', ''))
    else:
        print("PARTNERS:", result2.get('result', []))
except Exception as e:
    print("EXCEPTION:", e)
    import traceback
    traceback.print_exc()
