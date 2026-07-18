import xmlrpc.client

url = 'http://localhost:8069'
db = 'smoke'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, 'admin', 'admin', {})
print('UID:', uid)

models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# Check admin user groups
groups = models.execute_kw(db, uid, 'admin', 'res.users', 'read', [[uid]], {'fields': ['groups_id', 'share']})
print('Admin share:', groups[0].get('share'))
print('Groups count:', len(groups[0].get('groups_id', [])))

# Check if admin has base.group_system (administrator)
admin_groups = models.execute_kw(db, uid, 'admin', 'res.groups', 'search_read', 
    [[['users', 'in', [uid]], ['category_id.name', 'ilike', 'admin']]], 
    {'fields': ['name', 'full_name']})
print('Admin groups:', [(g['name'], g.get('full_name', '')) for g in admin_groups[:5]])

# Try to give admin ALL access
try:
    # Find group_system
    system_group = models.execute_kw(db, uid, 'admin', 'res.groups', 'search', [[['category_id.name', '=', 'Administration'], ['name', 'ilike', 'Settings']]])
    print('Settings group:', system_group)
    if system_group:
        models.execute_kw(db, uid, 'admin', 'res.users', 'write', [[uid], {'groups_id': [(4, system_group[0])]}])
        print('Added admin to Settings group')
except Exception as e:
    print('Error adding group:', e)
