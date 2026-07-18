"""Fix Access Denied issue on Odoo 18 fresh install.
The problem: JSON-RPC /jsonrpc endpoint requires the password to match 
what's stored in res_users, not the 'admin' master password.
Let's check what's happening.
"""
import xmlrpc.client

url = 'http://localhost:8069'
db = 'smoke'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')

# Test with different passwords
for pwd in ['admin', 'odoo', '']:
    try:
        uid = common.authenticate(db, 'admin', pwd, {})
        if uid:
            print(f"XML-RPC auth OK with password: '{pwd}' -> UID={uid}")
    except Exception as e:
        print(f"XML-RPC auth FAILED with '{pwd}': {e}")

# Now check if password is actually 'admin' by trying to read
uid = common.authenticate(db, 'admin', 'admin', {})
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# Check admin's password hash type
try:
    result = models.execute_kw(db, uid, 'admin', 'res.users', 'read', [[uid]], {'fields': ['password', 'login']})
    print("Admin login:", result[0].get('login'))
except Exception as e:
    print("Read user error:", e)

# The issue might be that Odoo 18 JSON-RPC uses a different auth mechanism
# Let's try setting admin password explicitly
try:
    models.execute_kw(db, uid, 'admin', 'res.users', 'write', [[uid], {'password': 'admin'}])
    print("Password reset to 'admin' - try again!")
except Exception as e:
    print("Password reset error:", e)
