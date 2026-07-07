#!/usr/bin/env python3
"""List all journals"""
import xmlrpc.client

url = 'http://localhost:8069'
db = 'fmcg_shop'
username = 'admin'
password = 'admin'

common = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/common')
uid = common.authenticate(db, username, password, {})
models = xmlrpc.client.ServerProxy(f'{url}/xmlrpc/2/object')

journals = models.execute_kw(db, uid, password, 'account.journal', 'search_read', [[]], {'fields': ['name', 'type', 'code'], 'limit': 50})
for j in journals:
    print(f"  id={j['id']} | type={j['type']} | code={j['code']} | name={j['name']}")
