import urllib.request, json, http.cookiejar, time

port = 3001  # shop1 frontend port
cj = http.cookiejar.CookieJar()
opener = urllib.request.build_opener(urllib.request.HTTPCookieProcessor(cj))

# Auth
t0 = time.time()
data = json.dumps({"jsonrpc":"2.0","id":1,"method":"call","params":{"db":"shop1","login":"admin","password":"admin"}}).encode()
req = urllib.request.Request(f'http://localhost:{port}/api/web/session/authenticate', data=data, headers={'Content-Type':'application/json'})
opener.open(req)
t1 = time.time()
print(f"Auth: {t1-t0:.2f}s")

# Products WITHOUT image
data2 = json.dumps({"jsonrpc":"2.0","id":2,"method":"call","params":{"model":"product.product","method":"search_read","args":[[["type","=","consu"]]],"kwargs":{"fields":["name","list_price","standard_price","qty_available","barcode"],"limit":100}}}).encode()
req2 = urllib.request.Request(f'http://localhost:{port}/api/web/dataset/call_kw', data=data2, headers={'Content-Type':'application/json'})
resp2 = opener.open(req2)
result2 = json.loads(resp2.read())
t2 = time.time()
count = len(result2.get('result', []))
print(f"Products (no image): {t2-t1:.2f}s - {count} items")

# Products WITH image_128
data3 = json.dumps({"jsonrpc":"2.0","id":3,"method":"call","params":{"model":"product.product","method":"search_read","args":[[["type","=","consu"]]],"kwargs":{"fields":["name","list_price","image_128"],"limit":100}}}).encode()
req3 = urllib.request.Request(f'http://localhost:{port}/api/web/dataset/call_kw', data=data3, headers={'Content-Type':'application/json'})
resp3 = opener.open(req3)
result3 = json.loads(resp3.read())
t3 = time.time()
print(f"Products (with image_128): {t3-t2:.2f}s - {len(result3.get('result',[]))} items")

# Products WITH image_512
data4 = json.dumps({"jsonrpc":"2.0","id":4,"method":"call","params":{"model":"product.product","method":"search_read","args":[[["type","=","consu"]]],"kwargs":{"fields":["name","list_price","image_512"],"limit":100}}}).encode()
req4 = urllib.request.Request(f'http://localhost:{port}/api/web/dataset/call_kw', data=data4, headers={'Content-Type':'application/json'})
resp4 = opener.open(req4)
result4 = json.loads(resp4.read())
t4 = time.time()
print(f"Products (with image_512): {t4-t3:.2f}s - {len(result4.get('result',[]))} items")

print(f"\nTotal: {t4-t0:.2f}s")
