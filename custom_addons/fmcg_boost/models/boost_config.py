import math

from odoo import _, api, fields, models
from odoo.exceptions import AccessError, ValidationError


_SELECTION_STATES = [
    ('inherit', 'Use global selection'),
    ('included', 'Included'),
    ('excluded', 'Excluded'),
]


class FmcgBoostConfig(models.Model):
    _name = 'fmcg.boost.config'
    _description = 'FMCG Boost Configuration'

    company_id = fields.Many2one(
        'res.company', required=True, default=lambda self: self.env.company,
        index=True, ondelete='cascade',
    )
    enabled = fields.Boolean(default=False)
    percent = fields.Float(default=0.0)
    all_products = fields.Boolean(default=True)
    revision = fields.Integer(default=1, readonly=True)
    product_ids = fields.One2many('fmcg.boost.product', 'config_id')

    _sql_constraints = [
        ('company_unique', 'UNIQUE(company_id)', 'Only one Boost configuration is allowed per company.'),
    ]

    @api.constrains('percent')
    def _check_percent(self):
        for record in self:
            if not math.isfinite(record.percent) or record.percent < -100:
                raise ValidationError(_('Boost percent must be finite and greater than or equal to -100.'))

    @api.model
    def _check_admin_access(self):
        if not (
            self.env.user.has_group('base.group_system')
            or self.env.user.has_group('account.group_account_manager')
        ):
            raise AccessError(_('Only administrators or accounting managers can change Boost settings.'))

    @api.model
    def _company_config(self, create=False):
        company = self.env.company
        config = self.sudo().search([('company_id', '=', company.id)], limit=1)
        if not config and create:
            config = self.sudo().create({'company_id': company.id})
        return config

    @api.model
    def _active_products(self):
        return self.env['product.product'].sudo().search([
            ('active', '=', True),
            ('type', '=', 'consu'),
            '|', ('company_id', '=', False), ('company_id', '=', self.env.company.id),
        ], order='display_name, id')

    @api.model
    def _active_plans(self):
        return self.env['fmcg.discount.category'].sudo().search([
            ('active', '=', True),
        ], order='sequence, name, id')

    @api.model
    def _original_price_maps(self, products, plans):
        regular = {product.id: product.list_price for product in products}
        plan_maps = {plan.id: {} for plan in plans}
        lines = self.env['fmcg.discount.line'].sudo().search([
            ('category_id', 'in', plans.ids),
            ('product_id', 'in', products.ids),
        ]) if plans and products else self.env['fmcg.discount.line']
        line_prices = {
            (line.category_id.id, line.product_id.id): line.discount_price
            for line in lines
        }
        for plan in plans:
            fixed_percent = plan.fixed_percent
            if plan.is_fixed_percent and (
                not math.isfinite(fixed_percent) or fixed_percent < 0 or fixed_percent > 100
            ):
                raise ValidationError(_(
                    'Fixed discount percent for "%s" must be between 0 and 100.'
                ) % plan.display_name)
            target = plan_maps[plan.id]
            for product in products:
                if plan.is_fixed_percent and fixed_percent > 0:
                    original = product.list_price * (1 - fixed_percent / 100)
                else:
                    original = line_prices.get((plan.id, product.id), product.list_price)
                target[product.id] = original
        return regular, plan_maps

    @api.model
    def _serialize(self, include_table):
        config = self._company_config(create=include_table)
        products = self._active_products()
        plans = self._active_plans()
        regular_original, plan_original = self._original_price_maps(products, plans)
        if not config:
            return {
                'enabled': False,
                'percent': 0.0,
                'all_products': True,
                'revision': 0,
                'regular_prices': regular_original,
                'plan_prices': plan_original,
                'plans': [],
                'products': [],
            }

        boost_products = self.env['fmcg.boost.product'].sudo().search([
            ('config_id', '=', config.id),
            ('product_id', 'in', products.ids),
        ])
        boost_by_product = {row.product_id.id: row for row in boost_products}
        plan_overrides = self.env['fmcg.boost.plan.override'].sudo().search([
            ('boost_product_id', 'in', boost_products.ids),
            ('category_id', 'in', plans.ids),
        ]) if boost_products and plans else self.env['fmcg.boost.plan.override']
        override_by_key = {
            (row.boost_product_id.product_id.id, row.category_id.id): row
            for row in plan_overrides
        }

        multiplier = 1 + config.percent / 100
        effective_regular = {}
        effective_plans = {plan.id: {} for plan in plans}
        table_products = []
        for product in products:
            boost_product = boost_by_product.get(product.id)
            state = boost_product.selected_state if boost_product else 'inherit'
            selected = (
                state == 'included'
                or (state == 'inherit' and config.all_products)
            ) and state != 'excluded'
            apply_boost = config.enabled and selected
            regular_override = (
                boost_product.regular_override_price
                if boost_product and boost_product.regular_has_override else None
            )
            regular_base = regular_override if regular_override is not None else regular_original[product.id]
            effective_regular[product.id] = (
                self.env.company.currency_id.round(max(0.0, regular_base * multiplier))
                if apply_boost else regular_original[product.id]
            )

            table_plan_prices = []
            for plan in plans:
                override = override_by_key.get((product.id, plan.id))
                override_price = override.override_price if override and override.has_override else None
                original = plan_original[plan.id][product.id]
                base = override_price if override_price is not None else original
                effective_plans[plan.id][product.id] = (
                    self.env.company.currency_id.round(max(0.0, base * multiplier))
                    if apply_boost else original
                )
                if include_table:
                    table_plan_prices.append({
                        'category_id': plan.id,
                        'original_price': original,
                        'override_price': override_price,
                    })

            if include_table:
                table_products.append({
                    'id': product.id,
                    'name': product.display_name,
                    'selected_state': state,
                    'selected': selected,
                    'regular_original_price': regular_original[product.id],
                    'regular_override_price': regular_override,
                    'plan_prices': table_plan_prices,
                })

        return {
            'enabled': config.enabled,
            'percent': config.percent,
            'all_products': config.all_products,
            'revision': config.revision,
            'regular_prices': effective_regular,
            'plan_prices': effective_plans,
            'plans': [{
                'id': plan.id,
                'name': plan.name,
                'is_fixed_percent': plan.is_fixed_percent,
                'fixed_percent': plan.fixed_percent,
            } for plan in plans] if include_table else [],
            'products': table_products,
        }

    @api.model
    def get_configuration(self):
        self._check_admin_access()
        return self._serialize(include_table=True)

    @api.model
    def get_pos_pricing(self):
        if not self.env.user.has_group('base.group_user'):
            raise AccessError(_('Only internal POS users can read Boost pricing.'))
        return self._serialize(include_table=False)

    @api.model
    def _number(self, value, label):
        if isinstance(value, bool) or not isinstance(value, (int, float)) or not math.isfinite(value):
            raise ValidationError(_('%s must be a finite number.') % label)
        return float(value)

    @api.model
    def save_configuration(self, values):
        self._check_admin_access()
        if not isinstance(values, dict):
            raise ValidationError(_('Boost configuration payload must be an object.'))
        allowed = {'revision', 'enabled', 'percent', 'all_products', 'products'}
        if set(values) - allowed:
            raise ValidationError(_('Boost configuration contains unsupported fields.'))
        if not isinstance(values.get('enabled'), bool) or not isinstance(values.get('all_products'), bool):
            raise ValidationError(_('Boost switches must be boolean values.'))
        percent = self._number(values.get('percent'), _('Boost percent'))
        if percent < -100:
            raise ValidationError(_('Boost percent must be greater than or equal to -100.'))
        rows = values.get('products')
        if not isinstance(rows, list):
            raise ValidationError(_('Boost products must be a list.'))

        config = self._company_config(create=True)
        self.env.cr.execute(
            'SELECT revision FROM fmcg_boost_config WHERE id = %s FOR UPDATE',
            [config.id],
        )
        locked_row = self.env.cr.fetchone()
        current_revision = locked_row[0] if locked_row else None
        revision = values.get('revision')
        if isinstance(revision, bool) or not isinstance(revision, int) or revision != current_revision:
            raise ValidationError(_('Boost settings changed elsewhere. Reload the page and try again.'))

        product_ids = []
        seen_products = set()
        for row in rows:
            if not isinstance(row, dict) or set(row) - {
                'product_id', 'selected_state', 'regular_override_price', 'plan_overrides'
            }:
                raise ValidationError(_('A Boost product row is invalid.'))
            product_id = row.get('product_id')
            if isinstance(product_id, bool) or not isinstance(product_id, int) or product_id in seen_products:
                raise ValidationError(_('Boost product IDs must be unique integers.'))
            seen_products.add(product_id)
            product_ids.append(product_id)

        products = self.env['product.product'].sudo().search([
            ('id', 'in', product_ids),
            ('active', '=', True),
            ('type', '=', 'consu'),
            '|', ('company_id', '=', False), ('company_id', '=', self.env.company.id),
        ])
        if set(products.ids) != set(product_ids):
            raise ValidationError(_('One or more Boost products are unavailable for this company.'))
        product_by_id = {product.id: product for product in products}
        plans = self._active_plans()
        plan_ids = set(plans.ids)

        config.sudo().write({
            'enabled': values['enabled'],
            'percent': percent,
            'all_products': values['all_products'],
            'revision': current_revision + 1,
        })
        existing_rows = self.env['fmcg.boost.product'].sudo().search([
            ('config_id', '=', config.id), ('product_id', 'in', product_ids),
        ])
        existing_by_product = {row.product_id.id: row for row in existing_rows}

        for row in rows:
            product_id = row['product_id']
            state = row.get('selected_state')
            if state not in dict(_SELECTION_STATES):
                raise ValidationError(_('Boost selection state is invalid.'))
            regular_override = row.get('regular_override_price')
            if regular_override is not None:
                regular_override = self._number(regular_override, _('Regular Boost override'))
                if regular_override < 0:
                    raise ValidationError(_('Boost override prices cannot be negative.'))
            overrides = row.get('plan_overrides')
            if not isinstance(overrides, list):
                raise ValidationError(_('Boost plan overrides must be a list.'))

            boost_product = existing_by_product.get(product_id)
            if not boost_product:
                boost_product = self.env['fmcg.boost.product'].sudo().create({
                    'config_id': config.id,
                    'product_id': product_by_id[product_id].id,
                    'selected_state': state,
                    'regular_has_override': regular_override is not None,
                    'regular_override_price': regular_override or 0.0,
                })
            else:
                boost_product.write({
                    'selected_state': state,
                    'regular_has_override': regular_override is not None,
                    'regular_override_price': regular_override or 0.0,
                })

            seen_plans = set()
            existing_overrides = self.env['fmcg.boost.plan.override'].sudo().search([
                ('boost_product_id', '=', boost_product.id),
                ('category_id', 'in', list(plan_ids)),
            ])
            existing_by_plan = {override.category_id.id: override for override in existing_overrides}
            for override_values in overrides:
                if not isinstance(override_values, dict) or set(override_values) != {'category_id', 'override_price'}:
                    raise ValidationError(_('A Boost plan override is invalid.'))
                category_id = override_values['category_id']
                if isinstance(category_id, bool) or not isinstance(category_id, int) or category_id in seen_plans:
                    raise ValidationError(_('Boost plan IDs must be unique integers.'))
                if category_id not in plan_ids:
                    raise ValidationError(_('A Boost plan is no longer active. Reload and try again.'))
                seen_plans.add(category_id)
                price = override_values['override_price']
                current = existing_by_plan.get(category_id)
                if price is None:
                    if current:
                        current.unlink()
                    continue
                price = self._number(price, _('Plan Boost override'))
                if price < 0:
                    raise ValidationError(_('Boost override prices cannot be negative.'))
                vals = {'has_override': True, 'override_price': price}
                if current:
                    current.write(vals)
                else:
                    self.env['fmcg.boost.plan.override'].sudo().create({
                        **vals,
                        'boost_product_id': boost_product.id,
                        'category_id': category_id,
                    })

            if state == 'inherit' and regular_override is None and not boost_product.plan_override_ids:
                boost_product.unlink()

        return self._serialize(include_table=True)


class FmcgBoostProduct(models.Model):
    _name = 'fmcg.boost.product'
    _description = 'FMCG Boost Product Setting'

    config_id = fields.Many2one('fmcg.boost.config', required=True, ondelete='cascade', index=True)
    company_id = fields.Many2one(related='config_id.company_id', store=True, index=True)
    product_id = fields.Many2one('product.product', required=True, ondelete='cascade', index=True)
    selected_state = fields.Selection(_SELECTION_STATES, required=True, default='inherit')
    regular_has_override = fields.Boolean(default=False)
    regular_override_price = fields.Float(default=0.0)
    plan_override_ids = fields.One2many('fmcg.boost.plan.override', 'boost_product_id')

    _sql_constraints = [
        ('config_product_unique', 'UNIQUE(config_id, product_id)', 'Each product can appear once in a Boost configuration.'),
    ]

    @api.constrains('regular_override_price', 'regular_has_override')
    def _check_regular_override(self):
        for record in self:
            if record.regular_has_override and (
                not math.isfinite(record.regular_override_price) or record.regular_override_price < 0
            ):
                raise ValidationError(_('Regular Boost override must be finite and non-negative.'))


class FmcgBoostPlanOverride(models.Model):
    _name = 'fmcg.boost.plan.override'
    _description = 'FMCG Boost Plan Price Override'

    boost_product_id = fields.Many2one('fmcg.boost.product', required=True, ondelete='cascade', index=True)
    company_id = fields.Many2one(related='boost_product_id.company_id', store=True, index=True)
    category_id = fields.Many2one('fmcg.discount.category', required=True, ondelete='cascade', index=True)
    has_override = fields.Boolean(default=True)
    override_price = fields.Float(default=0.0)

    _sql_constraints = [
        ('product_category_unique', 'UNIQUE(boost_product_id, category_id)', 'Each Boost plan override must be unique.'),
    ]

    @api.constrains('override_price', 'has_override')
    def _check_override(self):
        for record in self:
            if record.has_override and (
                not math.isfinite(record.override_price) or record.override_price < 0
            ):
                raise ValidationError(_('Boost plan override must be finite and non-negative.'))
