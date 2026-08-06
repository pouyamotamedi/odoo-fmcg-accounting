"""Check seller groups and access rights on shop6"""
import xmlrpc.client

url = 'http://localhost:8077'
db = 'shop6'
common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid_admin = common.authenticate(db, 'admin', 'admin', {})
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# Get sara's groups
sara = models.execute_kw(db, uid_admin, 'admin', 'res.users', 'read', [[7]], {'fields': ['groups_id']})
print(f"Sara groups_id count: {len(sara[0]['groups_id'])}")

# Get group names
groups = models.execute_kw(db, uid_admin, 'admin', 'res.groups', 'search_read',
    [[['id', 'in', sara[0]['groups_id']]]], {'fields': ['full_name', 'name'], 'limit': 50})
print(f"\n=== Sara's groups ({len(groups)}) ===")
for g in groups:
    print(f"  {g['full_name']}")

# Compare with admin groups
admin_data = models.execute_kw(db, uid_admin, 'admin', 'res.users', 'read', [[2]], {'fields': ['groups_id']})
print(f"\nAdmin groups_id count: {len(admin_data[0]['groups_id'])}")

# Check what group provides product access
print("\n=== Checking product.product access rules ===")
access_rules = models.execute_kw(db, uid_admin, 'admin', 'ir.model.access', 'search_read',
    [[['model_id.model', '=', 'product.product']]], 
    {'fields': ['name', 'group_id', 'perm_read', 'perm_write'], 'limit': 10})
for a in access_rules:
    print(f"  {a['name']}: group={a['group_id']} read={a['perm_read']} write={a['perm_write']}")
