from odoo import api, fields, models


class FmcgSyncLog(models.Model):
    _name = 'fmcg.sync.log'
    _description = 'Offline Sync Log'
    _order = 'sync_date desc, id desc'

    name = fields.Char(
        string='Reference',
        required=True,
    )
    sync_date = fields.Datetime(
        string='Sync Date',
        default=fields.Datetime.now,
    )
    record_model = fields.Char(
        string='Model',
        help='The Odoo model that was synced (e.g., pos.order)',
    )
    record_id = fields.Integer(
        string='Record ID',
    )
    operation = fields.Selection(
        selection=[
            ('create', 'Create'),
            ('update', 'Update'),
            ('delete', 'Delete'),
        ],
        string='Operation',
    )
    state = fields.Selection(
        selection=[
            ('pending', 'Pending'),
            ('synced', 'Synced'),
            ('conflict', 'Conflict'),
            ('failed', 'Failed'),
        ],
        string='Status',
        default='pending',
    )
    retry_count = fields.Integer(
        string='Retry Count',
        default=0,
    )
    error_message = fields.Text(
        string='Error Message',
    )
    local_data = fields.Text(
        string='Local Data (JSON)',
        help='The transaction data stored locally during offline period',
    )
    server_data = fields.Text(
        string='Server Data (JSON)',
        help='The server-side data at time of conflict (for conflict resolution)',
    )
    resolved_by = fields.Many2one(
        'res.users',
        string='Resolved By',
    )
    resolution_date = fields.Datetime(
        string='Resolution Date',
    )
    resolution_action = fields.Selection(
        selection=[
            ('keep_local', 'Keep Local Version'),
            ('keep_server', 'Keep Server Version'),
            ('merge', 'Manual Merge'),
        ],
        string='Resolution',
    )

    def action_resolve_keep_local(self):
        """Resolve conflict by keeping local version."""
        self.ensure_one()
        self.write({
            'state': 'synced',
            'resolved_by': self.env.user.id,
            'resolution_date': fields.Datetime.now(),
            'resolution_action': 'keep_local',
        })

    def action_resolve_keep_server(self):
        """Resolve conflict by keeping server version."""
        self.ensure_one()
        self.write({
            'state': 'synced',
            'resolved_by': self.env.user.id,
            'resolution_date': fields.Datetime.now(),
            'resolution_action': 'keep_server',
        })

    def action_retry_sync(self):
        """Retry syncing a failed record."""
        self.ensure_one()
        if self.retry_count >= 3:
            self.write({
                'state': 'failed',
                'error_message': 'Maximum retry attempts (3) exceeded.',
            })
            return
        self.write({
            'retry_count': self.retry_count + 1,
            'state': 'pending',
        })
