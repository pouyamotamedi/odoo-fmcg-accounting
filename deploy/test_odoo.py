import xmlrpc.client
common = xmlrpc.client.ServerProxy('http://localhost:8069/xmlrpc/2/common')
uid = common.authenticate('smoke', 'admin', 'admin', {})
print('UID:', uid)
if uid:
    models = xmlrpc.client.ServerProxy('http://localhost:8069/xmlrpc/2/object')
    result = models.execute_kw('smoke', uid, 'admin', 'res.partner', 'search_count', [[]])
    print('Partners:', result)
else:
    print('AUTH FAILED')
