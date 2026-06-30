from odoo import fields, models


class ResUsers(models.Model):
    _inherit = 'res.users'

    fmcg_can_process_sales = fields.Boolean(
        string='Can Process Sales',
        default=True,
        help='Allow this operator to process sales in POS',
    )
    fmcg_can_issue_refunds = fields.Boolean(
        string='Can Issue Refunds',
        default=False,
        help='Allow this operator to issue refunds',
    )
    fmcg_can_modify_inventory = fields.Boolean(
        string='Can Modify Inventory',
        default=False,
        help='Allow this operator to modify stock levels and record adjustments',
    )
    fmcg_can_view_reports = fields.Boolean(
        string='Can View Reports',
        default=False,
        help='Allow this operator to access and generate reports',
    )
    fmcg_use_persian_locale = fields.Boolean(
        string='Use Persian Locale',
        default=True,
        help='Display interface in Persian with RTL layout for this user',
    )
