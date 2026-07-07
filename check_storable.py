#!/usr/bin/env python3
"""Check which products are already storable"""
import xmlrpc.client

url = 'http://localhost:8069'
db = 'fmcg_shop'
username = 'admin'
password = 'admin'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, username, password, {})
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

products = models.execute_kw(db, uid, password, 'product.template', 'search_read',
    [[['type', '=', 'consu']]],
    {'fields': ['id', 'name', 'is_storable', 'type']})

for p in products:
    status = 'STORABLE' if p['is_storable'] else 'CONSUMABLE'
    print(f"  [{status}] {p['name']}")
