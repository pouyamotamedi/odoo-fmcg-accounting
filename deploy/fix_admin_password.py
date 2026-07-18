"""Fix admin password for Odoo 18 fresh database.
In Odoo 18, session-based call_kw checks password hash differently.
We need to ensure password is properly hashed with passlib.
"""
import xmlrpc.client

url = 'http://localhost:8069'
db = 'smoke'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, 'admin', 'admin', {})
print(f"Current UID: {uid}")

models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# Force password reset through Odoo's proper mechanism
# This ensures the password hash is stored correctly for session auth
try:
    models.execute_kw(db, uid, 'admin', 'res.users', 'write', [[uid], {'password': 'admin123'}])
    print("Password changed to 'admin123'")
    models.execute_kw(db, uid, 'admin', 'res.users', 'write', [[uid], {'password': 'admin'}])
    print("Password changed back to 'admin'")
except Exception as e:
    print(f"Error: {e}")
    # Alternative: direct SQL
    print("Trying direct approach...")
    try:
        from passlib.context import CryptContext
        ctx = CryptContext(schemes=['pbkdf2_sha512'])
        hashed = ctx.hash('admin')
        print(f"Generated hash: {hashed[:50]}...")
        # Can't do SQL from here, but the XML-RPC write should work
    except:
        pass

# Verify
uid2 = common.authenticate(db, 'admin', 'admin', {})
print(f"Verify UID: {uid2}")
