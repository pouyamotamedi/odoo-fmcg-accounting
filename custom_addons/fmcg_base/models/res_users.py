from odoo import api, fields, models


class ResUsers(models.Model):
    _inherit = 'res.users'

    fmcg_is_seller = fields.Boolean(
        string='Is Seller (POS-only)',
        default=False,
        help='This user is a seller with POS-only access',
    )
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

    @api.model
    def fmcg_create_seller(self, name=False, login=False, password=False, phone=False):
        """Create a seller user with POS-only (limited) access.

        The seller is added to the internal user group plus POS/Inventory/Sales
        groups so they can read products, stock levels, and process sales.
        Accepts both positional and keyword arguments for JSON-RPC compatibility.
        """
        if not name or not login or not password:
            raise models.ValidationError(
                "Name, login and password are required to create a seller."
            )
        # Required groups for POS seller
        group_ids = []
        group_refs = [
            'base.group_user',           # Internal User (base access)
            'point_of_sale.group_pos_user',  # POS User (product/sale access)
            'stock.group_stock_user',    # Inventory User (stock.move read)
            'account.group_account_invoice',  # Invoicing (create invoices)
            'sales_team.group_sale_salesman',  # Sales User (partner/customer access)
        ]
        for ref in group_refs:
            try:
                group = self.env.ref(ref)
                group_ids.append(group.id)
            except Exception:
                pass

        vals = {
            'name': name,
            'login': login,
            'password': password,
            'phone': phone,
            'fmcg_is_seller': True,
            'fmcg_can_process_sales': True,
            'fmcg_can_issue_refunds': False,
            'fmcg_can_modify_inventory': False,
            'fmcg_can_view_reports': False,
            'groups_id': [(6, 0, group_ids)],
        }
        user = self.sudo().create(vals)
        return {'id': user.id, 'login': user.login, 'name': user.name}

