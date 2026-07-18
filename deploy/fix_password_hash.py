"""Fix admin password hash in Odoo 18.
The issue: after --stop-after-init, password may be stored as plaintext.
We need Odoo to properly hash it via its own ORM.
"""
import xmlrpc.client

url = 'http://localhost:8069'
db = 'smoke'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')

# First, authenticate with current password
for pwd in ['admin', 'admin123']:
    uid = common.authenticate(db, 'admin', pwd, {})
    if uid:
        print(f"Authenticated with password: '{pwd}'")
        break

if not uid:
    print("Cannot authenticate! Try resetting via shell.")
    exit(1)

models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# Use Odoo's proper password change mechanism via action_reset_password context
# Or simply use the change_password wizard
try:
    # Method 1: Direct write (triggers proper hashing in Odoo ORM)
    models.execute_kw(db, uid, pwd, 'res.users', 'write', [[uid], {'password': 'admin'}])
    print("Password set to 'admin' via ORM write")
except Exception as e:
    print(f"ORM write failed: {e}")
    
    # Method 2: Use shell command to set password
    import subprocess
    result = subprocess.run([
        'sudo', '-u', 'odoo', 'python3', '/opt/fmcg/odoo/odoo-bin', 
        'shell', '-c', '/etc/odoo-smoke.conf', '-d', db,
        '--no-http'
    ], input=b"env['res.users'].browse(2).password = 'admin'\nenv.cr.commit()\n", 
    capture_output=True, timeout=30)
    print("Shell result:", result.stdout.decode()[-200:] if result.stdout else result.stderr.decode()[-200:])

# Verify
uid2 = common.authenticate(db, 'admin', 'admin', {})
print(f"Final verify: UID={uid2}")
