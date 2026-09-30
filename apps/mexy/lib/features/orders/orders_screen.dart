import 'package:flutter/material.dart';

import '../../state/mexy_store.dart';
import '../../theme/mexy_theme.dart';
import '../../widgets/mexy_widgets.dart';
import 'order_detail.dart';

class OrdersScreen extends StatefulWidget {
  const OrdersScreen({super.key});

  @override
  State<OrdersScreen> createState() => _OrdersScreenState();
}

class _OrdersScreenState extends State<OrdersScreen> {
  OrderFilter _filter = OrderFilter.news;
  String? _selectedId;

  @override
  Widget build(BuildContext context) {
    final store = MexyScope.of(context);
    final split = context.isExpanded;
    final list = _OrderList(
      filter: _filter,
      now: DateTime.now(),
      selectedId: split ? _selectedId : null,
      onFilter: (filter) => setState(() => _filter = filter),
      onOpen: (order) {
        if (split) {
          setState(() => _selectedId = order.id);
          return;
        }
        Navigator.of(context).push(
          MaterialPageRoute<void>(
            builder: (_) => OrderDetailPage(orderId: order.id),
          ),
        );
      },
    );

    if (!split) return list;

    final selected = _selectedId == null ? null : store.orderById(_selectedId!);
    return Row(
      children: [
        Expanded(flex: 5, child: list),
        VerticalDivider(width: 1, color: Theme.of(context).colorScheme.outlineVariant),
        Expanded(
          flex: 6,
          child: OrderDetailView(order: selected),
        ),
      ],
    );
  }
}

class _OrderList extends StatelessWidget {
  const _OrderList({
    required this.filter,
    required this.now,
    required this.selectedId,
    required this.onFilter,
    required this.onOpen,
  });

  final OrderFilter filter;
  final DateTime now;
  final String? selectedId;
  final ValueChanged<OrderFilter> onFilter;
  final ValueChanged<KitchenOrder> onOpen;

  @override
  Widget build(BuildContext context) {
    final store = MexyScope.of(context);
    final theme = Theme.of(context);
    final pad = context.pagePadding;
    final visible = store.orders.where((order) => matchesFilter(order.status, filter)).toList();

    return ListView(
      padding: EdgeInsets.fromLTRB(pad, MexySpace.lg, pad, MexySpace.xl),
      children: [
        PageHeader(
          title: 'Órdenes',
          subtitle: '${store.profile.name} · la cocina se actualiza en este dispositivo',
          trailing: const LiveChip(
            label: 'En vivo',
            hint: 'Los pedidos de demostración están listos para operar',
          ),
        ),
        const SizedBox(height: MexySpace.lg),
        Wrap(
          spacing: MexySpace.sm,
          runSpacing: MexySpace.sm,
          children: [
            for (final option in OrderFilter.values)
              _FilterChip(
                label: option.label,
                count: store.countFor(option),
                selected: option == filter,
                emphasized: option == OrderFilter.news,
                onTap: () => onFilter(option),
              ),
          ],
        ),
        const SizedBox(height: MexySpace.lg),
        if (visible.isEmpty)
          Padding(
            padding: const EdgeInsets.symmetric(vertical: MexySpace.xl),
            child: Text(
              'No hay pedidos en ${filter.label.toLowerCase()}.',
              style: theme.textTheme.bodyMedium,
            ),
          )
        else
          for (final order in visible) ...[
            _OrderCard(
              order: order,
              now: now,
              selected: order.id == selectedId,
              onTap: () => onOpen(order),
            ),
            const SizedBox(height: MexySpace.sm),
          ],
      ],
    );
  }
}

class _FilterChip extends StatelessWidget {
  const _FilterChip({
    required this.label,
    required this.count,
    required this.selected,
    required this.emphasized,
    required this.onTap,
  });

  final String label;
  final int count;
  final bool selected;
  final bool emphasized;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final background = selected ? scheme.primary : scheme.surface;
    final foreground = selected ? scheme.onPrimary : scheme.onSurface;
    final border = selected ? scheme.primary : scheme.outlineVariant;
    return Material(
      color: background,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(999),
        side: BorderSide(color: emphasized && !selected ? scheme.primary : border),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(999),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
            child: Row(
              mainAxisSize: MainAxisSize.min,
              children: [
                Text(
                  label,
                  style: TextStyle(
                    color: foreground,
                    fontWeight: FontWeight.w600,
                    fontSize: 14,
                  ),
                ),
                const SizedBox(width: 8),
                Text(
                  '$count',
                  style: TextStyle(
                    color: foreground.withValues(alpha: 0.85),
                    fontWeight: FontWeight.w700,
                    fontSize: 13,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _OrderCard extends StatelessWidget {
  const _OrderCard({
    required this.order,
    required this.now,
    required this.selected,
    required this.onTap,
  });

  final KitchenOrder order;
  final DateTime now;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final meta = orderStatusMeta[order.status]!;
    final tone = orderTone(context, order.status);
    final preview = order.items
        .take(2)
        .map((item) => '${item.quantity}× ${item.name}')
        .join(' · ');
    final extra = order.items.length > 2 ? ' +${order.items.length - 2}' : '';

    return Material(
      color: scheme.surface,
      shape: RoundedRectangleBorder(
        borderRadius: BorderRadius.circular(12),
        side: BorderSide(
          color: selected ? scheme.primary : scheme.outlineVariant,
          width: selected ? 1.5 : 1,
        ),
      ),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(12),
        child: ConstrainedBox(
          constraints: const BoxConstraints(minHeight: 48),
          child: Padding(
            padding: const EdgeInsets.all(14),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Text('#${order.displayId}', style: theme.textTheme.titleMedium),
                    const Spacer(),
                    Text(formatElapsed(order.createdAt, now), style: theme.textTheme.bodySmall),
                  ],
                ),
                const SizedBox(height: MexySpace.sm),
                Wrap(
                  spacing: 8,
                  runSpacing: 8,
                  crossAxisAlignment: WrapCrossAlignment.center,
                  children: [
                    Text(order.customerName, style: theme.textTheme.bodyMedium),
                    StatusPill(
                      label: meta.shortLabel,
                      background: tone.background,
                      foreground: tone.foreground,
                    ),
                    Text(
                      order.type == OrderType.delivery ? 'Envío' : 'Para llevar',
                      style: theme.textTheme.bodySmall,
                    ),
                  ],
                ),
                const SizedBox(height: MexySpace.sm),
                Text(
                  '${order.itemCount == 1 ? '1 artículo' : '${order.itemCount} artículos'} · ${formatPesos(order.totalCents)} · $preview$extra',
                  style: theme.textTheme.bodySmall,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}
