from datetime import datetime, time, timedelta
from zoneinfo import ZoneInfo

from odoo import api, fields, models, _
from odoo.exceptions import UserError, ValidationError

TEHRAN = ZoneInfo('Asia/Tehran')
WEEKDAY_SELECTION = [
    ('0', 'دوشنبه'), ('1', 'سه‌شنبه'), ('2', 'چهارشنبه'),
    ('3', 'پنجشنبه'), ('4', 'جمعه'), ('5', 'شنبه'), ('6', 'یکشنبه'),
]
SHIFT_SELECTION = [('morning', 'صبح'), ('evening', 'عصر')]


def tehran_now():
    return datetime.now(TEHRAN)


def tehran_today():
    return tehran_now().date()


def utc_naive_to_tehran(value):
    if not value:
        return None
    if isinstance(value, str):
        value = fields.Datetime.from_string(value)
    return value.replace(tzinfo=ZoneInfo('UTC')).astimezone(TEHRAN)


def float_to_time(value):
    hours = int(value)
    minutes = int(round((value - hours) * 60))
    if minutes == 60:
        hours += 1
        minutes = 0
    return time(hour=hours % 24, minute=minutes)


class FmcgIncentivePolicy(models.Model):
    _name = 'fmcg.incentive.policy'
    _description = 'Sales Incentive Policy'
    _order = 'active desc, id desc'

    name = fields.Char(required=True, default='سیاست پورسانت هابل')
    company_id = fields.Many2one('res.company', required=True, default=lambda self: self.env.company, index=True)
    currency_id = fields.Many2one(related='company_id.currency_id', readonly=True)
    active = fields.Boolean(default=True)
    monthly_target = fields.Monetary(required=True, default=650000000, currency_field='currency_id')
    morning_start = fields.Float(required=True, default=8.0)
    morning_end = fields.Float(required=True, default=15.0)
    evening_start = fields.Float(required=True, default=15.0)
    evening_end = fields.Float(required=True, default=23.9833)
    hubbleium_90 = fields.Integer(default=20)
    hubbleium_100 = fields.Integer(default=40)
    hubbleium_110 = fields.Integer(default=60)
    hubbleium_team_day = fields.Integer(default=30)
    hubbleium_personal_best = fields.Integer(default=25)
    hubbleium_consistency = fields.Integer(default=100)
    consistency_threshold = fields.Float(default=90.0)
    weight_ids = fields.One2many('fmcg.incentive.weight', 'policy_id', copy=True)
    tier_ids = fields.One2many('fmcg.incentive.tier', 'policy_id', copy=True)

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        for record in records:
            if not record.weight_ids:
                record._create_default_weights()
            if not record.tier_ids:
                record._create_default_tiers()
        return records

    def write(self, vals):
        if vals.get('active'):
            self.env['fmcg.incentive.policy'].search([
                ('company_id', 'in', self.mapped('company_id').ids),
                ('id', 'not in', self.ids), ('active', '=', True),
            ]).write({'active': False})
        result = super().write(vals)
        self._recompute_open_periods()
        return result

    @api.constrains('monthly_target', 'morning_start', 'morning_end', 'evening_start', 'evening_end')
    def _check_values(self):
        for record in self:
            if record.monthly_target <= 0:
                raise ValidationError(_('Monthly target must be positive.'))
            values = [record.morning_start, record.morning_end, record.evening_start, record.evening_end]
            if any(value < 0 or value >= 24 for value in values):
                raise ValidationError(_('Shift hours must be between 00:00 and 23:59.'))
            if record.morning_start >= record.morning_end or record.evening_start >= record.evening_end:
                raise ValidationError(_('Shift start must be before shift end.'))

    def _create_default_weights(self):
        self.ensure_one()
        vals = []
        for weekday, _label in WEEKDAY_SELECTION:
            for shift_type, _shift_label in SHIFT_SELECTION:
                vals.append({'policy_id': self.id, 'weekday': weekday, 'shift_type': shift_type, 'weight': 1.0})
        self.env['fmcg.incentive.weight'].create(vals)

    def _create_default_tiers(self):
        self.ensure_one()
        self.env['fmcg.incentive.tier'].create([
            {'policy_id': self.id, 'from_percent': 0, 'to_percent': 20, 'rate': 5, 'sequence': 10},
            {'policy_id': self.id, 'from_percent': 20, 'to_percent': 50, 'rate': 10, 'sequence': 20},
            {'policy_id': self.id, 'from_percent': 50, 'to_percent': 0, 'rate': 15, 'sequence': 30},
        ])

    def _recompute_open_periods(self):
        periods = self.env['fmcg.incentive.period'].search([
            ('policy_id', 'in', self.ids), ('state', '=', 'open')
        ])
        periods.recompute()

    @api.model
    def get_active_policy(self):
        policy = self.search([('company_id', '=', self.env.company.id), ('active', '=', True)], limit=1)
        if not policy:
            policy = self.create({'name': 'سیاست پورسانت هابل', 'company_id': self.env.company.id})
        return policy.read([
            'name', 'monthly_target', 'morning_start', 'morning_end', 'evening_start', 'evening_end',
            'hubbleium_90', 'hubbleium_100', 'hubbleium_110', 'hubbleium_team_day',
            'hubbleium_personal_best', 'hubbleium_consistency', 'consistency_threshold',
        ])[0]

    @api.model
    def save_configuration(self, values):
        if not self.env.user.has_group('fmcg_sales_incentive.group_incentive_manager'):
            raise UserError(_('Only incentive managers can change these settings.'))
        policy = self.search([('company_id', '=', self.env.company.id), ('active', '=', True)], limit=1)
        if not policy:
            policy = self.create({'name': 'سیاست پورسانت هابل', 'company_id': self.env.company.id})
        allowed = {
            'monthly_target', 'morning_start', 'morning_end', 'evening_start', 'evening_end',
            'hubbleium_90', 'hubbleium_100', 'hubbleium_110', 'hubbleium_team_day',
            'hubbleium_personal_best', 'hubbleium_consistency', 'consistency_threshold',
        }
        policy.write({key: values[key] for key in allowed if key in values})
        if 'weights' in values:
            for row in values['weights']:
                weight = policy.weight_ids.filtered(
                    lambda item: item.weekday == str(row['weekday']) and item.shift_type == row['shift_type']
                )
                if weight:
                    weight.write({'weight': float(row['weight'])})
        if 'tiers' in values:
            policy.tier_ids.unlink()
            self.env['fmcg.incentive.tier'].create([{
                'policy_id': policy.id,
                'from_percent': float(row['from_percent']),
                'to_percent': float(row.get('to_percent') or 0),
                'rate': float(row['rate']),
                'sequence': index * 10,
            } for index, row in enumerate(values['tiers'], start=1)])
        policy._recompute_open_periods()
        return True

    @api.model
    def get_configuration(self):
        policy_data = self.get_active_policy()
        policy = self.browse(policy_data['id'])
        policy_data['weights'] = policy.weight_ids.sorted(lambda row: (int(row.weekday), row.shift_type)).read([
            'weekday', 'shift_type', 'weight'
        ])
        policy_data['tiers'] = policy.tier_ids.sorted('sequence').read([
            'from_percent', 'to_percent', 'rate', 'sequence'
        ])
        policy_data['timezone'] = 'Asia/Tehran'
        return policy_data


class FmcgIncentiveWeight(models.Model):
    _name = 'fmcg.incentive.weight'
    _description = 'Shift Target Weight'
    _order = 'weekday, shift_type'

    policy_id = fields.Many2one('fmcg.incentive.policy', required=True, ondelete='cascade', index=True)
    weekday = fields.Selection(WEEKDAY_SELECTION, required=True)
    shift_type = fields.Selection(SHIFT_SELECTION, required=True)
    weight = fields.Float(required=True, default=1.0)

    _sql_constraints = [
        ('policy_day_shift_unique', 'unique(policy_id, weekday, shift_type)', 'Each policy can have one weight per day and shift.'),
        ('weight_non_negative', 'check(weight >= 0)', 'Weight cannot be negative.'),
    ]

    def write(self, vals):
        result = super().write(vals)
        if not self.env.context.get('skip_policy_recompute'):
            self.mapped('policy_id')._recompute_open_periods()
        return result


class FmcgIncentiveTier(models.Model):
    _name = 'fmcg.incentive.tier'
    _description = 'Commission Tier'
    _order = 'sequence, from_percent'

    policy_id = fields.Many2one('fmcg.incentive.policy', required=True, ondelete='cascade', index=True)
    sequence = fields.Integer(default=10)
    from_percent = fields.Float(required=True)
    to_percent = fields.Float(help='Zero means no upper limit.')
    rate = fields.Float(required=True, help='Percentage of gross profit in this band.')

    @api.constrains('from_percent', 'to_percent', 'rate')
    def _check_tier(self):
        for record in self:
            if record.from_percent < 0 or record.rate < 0:
                raise ValidationError(_('Tier values cannot be negative.'))
            if record.to_percent and record.to_percent <= record.from_percent:
                raise ValidationError(_('Tier upper limit must be greater than lower limit.'))

    def write(self, vals):
        result = super().write(vals)
        if not self.env.context.get('skip_policy_recompute'):
            self.mapped('policy_id')._recompute_open_periods()
        return result


class FmcgIncentiveShift(models.Model):
    _name = 'fmcg.incentive.shift'
    _description = 'Seller Shift'
    _order = 'shift_date desc, shift_type'

    shift_date = fields.Date(required=True, index=True, default=tehran_today)
    shift_type = fields.Selection(SHIFT_SELECTION, required=True, index=True)
    seller_id = fields.Many2one('res.users', required=True, index=True, domain=[('share', '=', False)])
    policy_id = fields.Many2one('fmcg.incentive.policy', required=True, default=lambda self: self.env['fmcg.incentive.policy'].search([('company_id', '=', self.env.company.id), ('active', '=', True)], limit=1))
    company_id = fields.Many2one(related='policy_id.company_id', store=True, index=True)
    currency_id = fields.Many2one(related='company_id.currency_id')
    weight = fields.Float(readonly=True)
    target_amount = fields.Monetary(currency_field='currency_id', readonly=True)
    actual_sales = fields.Monetary(currency_field='currency_id', readonly=True)
    achievement_percent = fields.Float(readonly=True)
    hubbleium_awarded = fields.Integer(readonly=True)
    note = fields.Char()

    _sql_constraints = [
        ('date_shift_unique', 'unique(company_id, shift_date, shift_type)', 'Only one seller can be responsible for each shift.'),
    ]

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        records._recompute_related()
        return records

    def write(self, vals):
        result = super().write(vals)
        if not self.env.context.get('skip_shift_recompute'):
            self._recompute_related()
        return result

    def unlink(self):
        periods = self._periods()
        result = super().unlink()
        periods.recompute()
        return result

    def _periods(self):
        result = self.env['fmcg.incentive.period']
        for shift in self:
            result |= self.env['fmcg.incentive.period'].get_or_create_for_date(shift.shift_date, shift.policy_id)
        return result

    def _recompute_related(self):
        self._periods().recompute()

    @api.model
    def swap_sellers(self, first_shift_id, second_shift_id):
        if not self.env.user.has_group('fmcg_sales_incentive.group_incentive_manager'):
            raise UserError(_('Only incentive managers can swap shifts.'))
        first = self.browse(first_shift_id).exists()
        second = self.browse(second_shift_id).exists()
        if not first or not second:
            raise UserError(_('Both shifts are required.'))
        first_seller, second_seller = first.seller_id, second.seller_id
        first.with_context(skip_shift_recompute=True).write({'seller_id': second_seller.id})
        second.with_context(skip_shift_recompute=True).write({'seller_id': first_seller.id})
        (first._periods() | second._periods()).recompute()
        return True


class FmcgIncentivePeriod(models.Model):
    _name = 'fmcg.incentive.period'
    _description = 'Monthly Incentive Period'
    _order = 'date_from desc'

    name = fields.Char(required=True)
    date_from = fields.Date(required=True, index=True)
    date_to = fields.Date(required=True, index=True)
    policy_id = fields.Many2one('fmcg.incentive.policy', required=True, index=True)
    company_id = fields.Many2one(related='policy_id.company_id', store=True, index=True)
    currency_id = fields.Many2one(related='company_id.currency_id')
    target_amount = fields.Monetary(currency_field='currency_id', readonly=True)
    total_sales = fields.Monetary(currency_field='currency_id', readonly=True)
    excess_percent = fields.Float(readonly=True)
    gross_profit_above_target = fields.Monetary(currency_field='currency_id', readonly=True)
    commission_pool = fields.Monetary(currency_field='currency_id', readonly=True)
    manual_commission_total = fields.Monetary(currency_field='currency_id', readonly=True)
    state = fields.Selection([('open', 'باز'), ('approved', 'تأییدشده')], default='open', required=True)
    result_ids = fields.One2many('fmcg.incentive.result', 'period_id')

    _sql_constraints = [('company_period_unique', 'unique(company_id, date_from, date_to)', 'The monthly period already exists.')]

    @api.model
    def _tehran_jalali_bounds(self, reference_date):
        if isinstance(reference_date, str):
            reference_date = fields.Date.from_string(reference_date)

        def gregorian_to_jalali(gy, gm, gd):
            gdm = [0, 31, 59, 90, 120, 151, 181, 212, 243, 273, 304, 334]
            gy2 = gy + 1 if gm > 2 else gy
            days = 355666 + 365 * gy + (gy2 + 3) // 4 - (gy2 + 99) // 100 + (gy2 + 399) // 400 + gd + gdm[gm - 1]
            jy = -1595 + 33 * (days // 12053)
            days %= 12053
            jy += 4 * (days // 1461)
            days %= 1461
            if days > 365:
                jy += (days - 1) // 365
                days = (days - 1) % 365
            if days < 186:
                jm, jd = 1 + days // 31, 1 + days % 31
            else:
                jm, jd = 7 + (days - 186) // 30, 1 + (days - 186) % 30
            return jy, jm, jd

        def jalali_to_gregorian(jy, jm, jd):
            jy += 1595
            days = -355668 + 365 * jy + (jy // 33) * 8 + ((jy % 33) + 3) // 4 + jd
            days += (jm - 1) * 31 if jm < 7 else (jm - 7) * 30 + 186
            gy = 400 * (days // 146097)
            days %= 146097
            if days > 36524:
                days -= 1
                gy += 100 * (days // 36524)
                days %= 36524
                if days >= 365:
                    days += 1
            gy += 4 * (days // 1461)
            days %= 1461
            if days > 365:
                gy += (days - 1) // 365
                days = (days - 1) % 365
            gd = days + 1
            leap = gy % 4 == 0 and (gy % 100 != 0 or gy % 400 == 0)
            month_days = [0, 31, 29 if leap else 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31]
            gm = 1
            while gm <= 12 and gd > month_days[gm]:
                gd -= month_days[gm]
                gm += 1
            return fields.Date.to_date(f'{gy:04d}-{gm:02d}-{gd:02d}')

        jy, jm, _jd = gregorian_to_jalali(reference_date.year, reference_date.month, reference_date.day)
        first = jalali_to_gregorian(jy, jm, 1)
        next_jy, next_jm = (jy + 1, 1) if jm == 12 else (jy, jm + 1)
        next_first = jalali_to_gregorian(next_jy, next_jm, 1)
        return first, next_first - timedelta(days=1), f'{jy:04d}/{jm:02d}'

    @api.model
    def get_or_create_for_date(self, reference_date=None, policy=None):
        reference_date = fields.Date.to_date(reference_date or tehran_today())
        policy = policy or self.env['fmcg.incentive.policy'].search([
            ('company_id', '=', self.env.company.id), ('active', '=', True)
        ], limit=1)
        if not policy:
            policy = self.env['fmcg.incentive.policy'].create({'name': 'سیاست پورسانت هابل'})
        date_from, date_to, label = self._tehran_jalali_bounds(reference_date)
        period = self.search([
            ('company_id', '=', policy.company_id.id), ('date_from', '=', date_from), ('date_to', '=', date_to)
        ], limit=1)
        if not period:
            period = self.create({
                'name': label, 'date_from': date_from, 'date_to': date_to,
                'policy_id': policy.id, 'target_amount': policy.monthly_target,
            })
        return period

    @api.model
    def current_dashboard(self):
        period = self.get_or_create_for_date()
        period.recompute()
        seller_result = period.result_ids.filtered(lambda row: row.seller_id == self.env.user)[:1]
        wallet = self.env['fmcg.hubbleium.wallet'].get_wallet(self.env.user)
        shifts = self.env['fmcg.incentive.shift'].search([
            ('seller_id', '=', self.env.user.id), ('shift_date', '>=', period.date_from), ('shift_date', '<=', period.date_to)
        ], order='shift_date, shift_type')
        return {
            'period': period.read(['name', 'date_from', 'date_to', 'target_amount', 'total_sales', 'excess_percent', 'commission_pool', 'state'])[0],
            'result': seller_result.read(['personal_target', 'actual_sales', 'achievement_percent', 'eligible', 'commission_amount', 'manual_commission', 'final_commission'])[0] if seller_result else False,
            'wallet': wallet.read(['balance'])[0],
            'shifts': shifts.read(['shift_date', 'shift_type', 'target_amount', 'actual_sales', 'achievement_percent', 'hubbleium_awarded']),
            'rewards': self.env['fmcg.reward'].search([('active', '=', True), '|', ('stock_qty', '>', 0), ('unlimited_stock', '=', True)]).read(['name', 'cost', 'stock_qty', 'unlimited_stock']),
        }

    def _sales_for_period(self):
        return self.env['account.move'].search([
            ('company_id', '=', self.company_id.id), ('move_type', '=', 'out_invoice'), ('state', '=', 'posted'),
            ('fmcg_sale_tehran_date', '>=', self.date_from), ('fmcg_sale_tehran_date', '<=', self.date_to),
        ])

    def _gross_profit(self, moves):
        return sum(max(line.fmcg_gross_profit, 0) for line in moves.invoice_line_ids.filtered(lambda line: line.display_type == 'product'))

    def _calculate_pool(self, moves):
        if self.total_sales <= self.target_amount or not moves:
            return 0, 0
        sorted_moves = moves.sorted(lambda move: (move.fmcg_sale_datetime or move.create_date, move.id))
        running = 0.0
        profit_above = 0.0
        tier_profit = {}
        for move in sorted_moves:
            sale = move.amount_untaxed
            if sale <= 0:
                continue
            previous = running
            running += sale
            if running <= self.target_amount:
                continue
            eligible_sale = sale if previous >= self.target_amount else running - self.target_amount
            move_profit = self._gross_profit(move)
            eligible_profit = move_profit * min(max(eligible_sale / sale, 0), 1)
            midpoint_excess = max(((max(previous, self.target_amount) + running) / self.target_amount - 1) * 100, 0)
            tier = self.policy_id.tier_ids.filtered(
                lambda row: midpoint_excess >= row.from_percent and (not row.to_percent or midpoint_excess < row.to_percent)
            )[:1]
            if tier:
                tier_profit[tier.id] = tier_profit.get(tier.id, 0) + eligible_profit
                profit_above += eligible_profit
        pool = sum(profit * self.policy_id.tier_ids.browse(tier_id).rate / 100 for tier_id, profit in tier_profit.items())
        return profit_above, pool

    def recompute(self):
        for period in self:
            if period.state != 'open':
                continue
            shifts = self.env['fmcg.incentive.shift'].search([
                ('company_id', '=', period.company_id.id), ('shift_date', '>=', period.date_from), ('shift_date', '<=', period.date_to)
            ])
            weight_map = {(row.weekday, row.shift_type): row.weight for row in period.policy_id.weight_ids}
            total_weight = sum(weight_map.get((str(shift.shift_date.weekday()), shift.shift_type), 0) for shift in shifts)
            for shift in shifts:
                weight = weight_map.get((str(shift.shift_date.weekday()), shift.shift_type), 0)
                target = period.policy_id.monthly_target * weight / total_weight if total_weight else 0
                moves = self.env['account.move'].search([
                    ('company_id', '=', period.company_id.id), ('move_type', '=', 'out_invoice'), ('state', '=', 'posted'),
                    ('fmcg_sale_tehran_date', '=', shift.shift_date), ('fmcg_sale_shift_type', '=', shift.shift_type),
                ])
                moves.write({'fmcg_shift_id': shift.id, 'fmcg_seller_id': shift.seller_id.id})
                actual = sum(moves.mapped('amount_untaxed'))
                percent = actual / target * 100 if target else 0
                shift.with_context(skip_shift_recompute=True).write({
                    'weight': weight, 'target_amount': target, 'actual_sales': actual,
                    'achievement_percent': percent,
                })
            moves = period._sales_for_period()
            total_sales = sum(moves.mapped('amount_untaxed'))
            period.total_sales = total_sales
            period.target_amount = period.policy_id.monthly_target
            period.excess_percent = max(total_sales / period.target_amount * 100 - 100, 0) if period.target_amount else 0
            period.gross_profit_above_target, period.commission_pool = period._calculate_pool(moves)
            period.manual_commission_total = sum(self.env['fmcg.incentive.adjustment'].search([
                ('period_id', '=', period.id), ('adjustment_type', '=', 'commission')
            ]).mapped('amount'))
            sellers = shifts.mapped('seller_id')
            for seller in sellers:
                seller_shifts = shifts.filtered(lambda shift: shift.seller_id == seller)
                personal_target = sum(seller_shifts.mapped('target_amount'))
                seller_sales = sum(seller_shifts.mapped('actual_sales'))
                achievement = seller_sales / personal_target * 100 if personal_target else 0
                result = self.env['fmcg.incentive.result'].search([
                    ('period_id', '=', period.id), ('seller_id', '=', seller.id)
                ], limit=1)
                values = {
                    'period_id': period.id, 'seller_id': seller.id, 'personal_target': personal_target,
                    'actual_sales': seller_sales, 'achievement_percent': achievement, 'eligible': achievement >= 100,
                }
                if result:
                    result.write(values)
                else:
                    result = self.env['fmcg.incentive.result'].create(values)
            eligible_results = period.result_ids.filtered('eligible')
            eligible_sales = sum(eligible_results.mapped('actual_sales'))
            for result in period.result_ids:
                commission = period.commission_pool * result.actual_sales / eligible_sales if result.eligible and eligible_sales else 0
                manual = sum(self.env['fmcg.incentive.adjustment'].search([
                    ('period_id', '=', period.id), ('seller_id', '=', result.seller_id.id),
                    ('adjustment_type', '=', 'commission')
                ]).mapped('amount'))
                result.write({'commission_amount': commission, 'manual_commission': manual, 'final_commission': commission + manual})
            period._sync_hubbleium(shifts)
        return True

    def _sync_hubbleium(self, shifts):
        Ledger = self.env['fmcg.hubbleium.ledger']
        for shift in shifts:
            points = 0
            if shift.achievement_percent >= 110:
                points = self.policy_id.hubbleium_110
            elif shift.achievement_percent >= 100:
                points = self.policy_id.hubbleium_100
            elif shift.achievement_percent >= 90:
                points = self.policy_id.hubbleium_90
            key = f'shift:{shift.id}'
            entry = Ledger.search([('source_key', '=', key)], limit=1)
            if points and not entry:
                Ledger.create({
                    'seller_id': shift.seller_id.id, 'amount': points, 'reason': f'تحقق هدف شیفت {shift.shift_date}',
                    'source_key': key, 'shift_id': shift.id,
                })
                shift.with_context(skip_shift_recompute=True).hubbleium_awarded = points
            elif entry and (entry.seller_id != shift.seller_id or entry.amount != points):
                entry.write({'seller_id': shift.seller_id.id, 'amount': points})
                shift.with_context(skip_shift_recompute=True).hubbleium_awarded = points

    def action_approve(self):
        self.recompute()
        self.write({'state': 'approved'})


class FmcgIncentiveResult(models.Model):
    _name = 'fmcg.incentive.result'
    _description = 'Seller Monthly Incentive Result'
    _order = 'achievement_percent desc'

    period_id = fields.Many2one('fmcg.incentive.period', required=True, ondelete='cascade', index=True)
    seller_id = fields.Many2one('res.users', required=True, index=True)
    currency_id = fields.Many2one(related='period_id.currency_id')
    personal_target = fields.Monetary(currency_field='currency_id', readonly=True)
    actual_sales = fields.Monetary(currency_field='currency_id', readonly=True)
    achievement_percent = fields.Float(readonly=True)
    eligible = fields.Boolean(readonly=True)
    commission_amount = fields.Monetary(currency_field='currency_id', readonly=True)
    manual_commission = fields.Monetary(currency_field='currency_id', readonly=True)
    final_commission = fields.Monetary(currency_field='currency_id', readonly=True)

    _sql_constraints = [('period_seller_unique', 'unique(period_id, seller_id)', 'A seller can have one result per period.')]


class FmcgIncentiveAdjustment(models.Model):
    _name = 'fmcg.incentive.adjustment'
    _description = 'Manual Incentive Adjustment'
    _order = 'create_date desc'

    seller_id = fields.Many2one('res.users', required=True, index=True)
    period_id = fields.Many2one('fmcg.incentive.period', required=True, index=True)
    adjustment_type = fields.Selection([('commission', 'پورسانت'), ('hubbleium', 'هابلیوم')], required=True)
    amount = fields.Float(required=True, help='Use a negative value to reduce the balance.')
    reason = fields.Char(required=True)
    created_by = fields.Many2one('res.users', default=lambda self: self.env.user, readonly=True)

    @api.model_create_multi
    def create(self, vals_list):
        if not self.env.user.has_group('fmcg_sales_incentive.group_incentive_manager'):
            raise UserError(_('Only incentive managers can create adjustments.'))
        records = super().create(vals_list)
        for record in records:
            if record.adjustment_type == 'hubbleium':
                self.env['fmcg.hubbleium.ledger'].create({
                    'seller_id': record.seller_id.id, 'amount': int(record.amount),
                    'reason': record.reason, 'adjustment_id': record.id,
                    'source_key': f'adjustment:{record.id}',
                })
            else:
                record.period_id.recompute()
        return records


class FmcgHubbleiumWallet(models.Model):
    _name = 'fmcg.hubbleium.wallet'
    _description = 'Hubbleium Wallet'

    seller_id = fields.Many2one('res.users', required=True, index=True)
    balance = fields.Integer(compute='_compute_balance')

    _sql_constraints = [('seller_unique', 'unique(seller_id)', 'Each seller can have one Hubbleium wallet.')]

    def _compute_balance(self):
        for wallet in self:
            wallet.balance = sum(self.env['fmcg.hubbleium.ledger'].search([
                ('seller_id', '=', wallet.seller_id.id)
            ]).mapped('amount'))

    @api.model
    def get_wallet(self, seller=None):
        seller = seller or self.env.user
        wallet = self.search([('seller_id', '=', seller.id)], limit=1)
        return wallet or self.sudo().create({'seller_id': seller.id})


class FmcgHubbleiumLedger(models.Model):
    _name = 'fmcg.hubbleium.ledger'
    _description = 'Hubbleium Ledger'
    _order = 'create_date desc, id desc'

    seller_id = fields.Many2one('res.users', required=True, index=True)
    amount = fields.Integer(required=True)
    reason = fields.Char(required=True)
    source_key = fields.Char(index=True, copy=False)
    shift_id = fields.Many2one('fmcg.incentive.shift', ondelete='set null')
    adjustment_id = fields.Many2one('fmcg.incentive.adjustment', ondelete='set null')
    redemption_id = fields.Many2one('fmcg.reward.redemption', ondelete='set null')

    _sql_constraints = [('source_key_unique', 'unique(source_key)', 'This Hubbleium event was already recorded.')]

    @api.model_create_multi
    def create(self, vals_list):
        records = super().create(vals_list)
        sellers = records.mapped('seller_id')
        for seller in sellers:
            self.env['fmcg.hubbleium.wallet'].get_wallet(seller)
        return records


class FmcgReward(models.Model):
    _name = 'fmcg.reward'
    _description = 'Hubbleium Reward'
    _order = 'cost, name'

    name = fields.Char(required=True)
    description = fields.Text()
    cost = fields.Integer(required=True)
    stock_qty = fields.Integer(default=0)
    unlimited_stock = fields.Boolean(default=False)
    active = fields.Boolean(default=True)

    @api.constrains('cost', 'stock_qty')
    def _check_reward(self):
        for reward in self:
            if reward.cost <= 0 or reward.stock_qty < 0:
                raise ValidationError(_('Reward cost must be positive and stock cannot be negative.'))


class FmcgRewardRedemption(models.Model):
    _name = 'fmcg.reward.redemption'
    _description = 'Reward Redemption'
    _order = 'create_date desc'

    seller_id = fields.Many2one('res.users', required=True, default=lambda self: self.env.user, index=True)
    reward_id = fields.Many2one('fmcg.reward', required=True)
    cost = fields.Integer(related='reward_id.cost', store=True)
    state = fields.Selection([('pending', 'در انتظار'), ('approved', 'تأییدشده'), ('rejected', 'ردشده')], default='pending')
    note = fields.Char()

    @api.model_create_multi
    def create(self, vals_list):
        for vals in vals_list:
            if not self.env.user.has_group('fmcg_sales_incentive.group_incentive_manager'):
                vals['seller_id'] = self.env.user.id
            reward = self.env['fmcg.reward'].browse(vals.get('reward_id'))
            wallet = self.env['fmcg.hubbleium.wallet'].get_wallet(self.env['res.users'].browse(vals.get('seller_id', self.env.user.id)))
            if wallet.balance < reward.cost:
                raise UserError(_('Hubbleium balance is not sufficient.'))
        return super().create(vals_list)

    def action_approve(self):
        if not self.env.user.has_group('fmcg_sales_incentive.group_incentive_manager'):
            raise UserError(_('Only incentive managers can approve rewards.'))
        for redemption in self.filtered(lambda item: item.state == 'pending'):
            wallet = self.env['fmcg.hubbleium.wallet'].get_wallet(redemption.seller_id)
            if wallet.balance < redemption.cost:
                raise UserError(_('Hubbleium balance is not sufficient.'))
            if not redemption.reward_id.unlimited_stock and redemption.reward_id.stock_qty <= 0:
                raise UserError(_('Reward is out of stock.'))
            self.env['fmcg.hubbleium.ledger'].create({
                'seller_id': redemption.seller_id.id, 'amount': -redemption.cost,
                'reason': f'دریافت جایزه: {redemption.reward_id.name}',
                'source_key': f'redemption:{redemption.id}', 'redemption_id': redemption.id,
            })
            if not redemption.reward_id.unlimited_stock:
                redemption.reward_id.stock_qty -= 1
            redemption.state = 'approved'

    def action_reject(self):
        self.write({'state': 'rejected'})
