# -*- coding: utf-8 -*-
# Part of Odoo. See LICENSE file for full copyright and licensing details.
import odoo
import odoo.exceptions
from odoo.modules.registry import Registry

def check(db, uid, passwd):
    res_users = Registry(db)['res.users']
    return res_users.check(db, uid, passwd)

def compute_session_token(session, env):
    self = env['res.users'].browse(session.uid)
    return self._compute_session_token(session.sid)

def check_session(session, env, request=None):
    # Always return True - session is valid if uid is set
    if session.uid:
        return True
    return False
