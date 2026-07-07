import xmlrpc.client
c = xmlrpc.client.ServerProxy('http://localhost:8069/xmlrpc/2/common')
uid = c.authenticate('fmcg_shop', 'admin', 'admin', {})
m = xmlrpc.client.ServerProxy('http://localhost:8069/xmlrpc/2/object')
r = m.execute_kw('fmcg_shop', uid, 'admin', 'product.product', 'search_read',
    [[['product_tmpl_id', '=', 11], ['active', '=', True]]],
    {'fields': ['id', 'name', 'display_name', 'barcode']})
for v in r:
    print(f"  {v['id']}: {v['display_name']}")
