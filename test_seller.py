"""Check seller user access on shop6"""
import xmlrpc.client

url = 'http://localhost:8077'
db = 'shop6'
common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')

# First login as admin to see users
uid_admin = common.authenticate(db, 'admin', 'admin', {})
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

# List all users
users = models.execute_kw(db, uid_admin, 'admin', 'res.users', 'search_read',
    [[['active', '=', True]]], {'fields': ['login', 'name', 'groups_id', 'company_id', 'company_ids'], 'limit': 10})
print("=== Users ===")
for u in users:
    print(f"  id={u['id']} login={u['login']} name={u['name']} company_id={u['company_id']} company_ids={u['company_ids']}")

# Check companies
companies = models.execute_kw(db, uid_admin, 'admin', 'res.company', 'search_read',
    [[]], {'fields': ['id', 'name'], 'limit': 5})
print(f"\n=== Companies ===")
for c in companies:
    print(f"  id={c['id']} name={c['name']}")

# Now try to login as seller (find seller username first)
seller_users = [u for u in users if u['login'] != 'admin' and u['id'] != 1]
if seller_users:
    seller = seller_users[0]
    print(f"\n=== Testing seller: {seller['login']} ===")
    # Try authenticating as seller
    try:
        uid_seller = common.authenticate(db, seller['login'], 'admin', {})
        if not uid_seller:
            uid_seller = common.authenticate(db, seller['login'], '1234', {})
        if not uid_seller:
            uid_seller = common.authenticate(db, seller['login'], seller['login'], {})
        print(f"  Seller UID: {uid_seller}")
        if uid_seller:
            # Check what products seller sees
            products = models.execute_kw(db, uid_seller, 'admin', 'product.product', 'search_read',
                [[]], {'fields': ['name', 'list_price'], 'limit': 5})
            print(f"  Products visible to seller: {len(products)}")
            for p in products:
                print(f"    {p['name']} - {p['list_price']}")
    except Exception as e:
        print(f"  Seller auth error: {e}")
else:
    print("\n  No seller users found!")

# Check what products admin sees
products_admin = models.execute_kw(db, uid_admin, 'admin', 'product.product', 'search_read',
    [[]], {'fields': ['name', 'list_price'], 'limit': 5})
print(f"\n=== Products visible to admin: {len(products_admin)} ===")
for p in products_admin:
    print(f"  {p['name']} - {p['list_price']}")
