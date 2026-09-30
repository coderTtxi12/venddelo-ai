import 'package:flutter/material.dart';

import '../../state/mexy_store.dart';
import '../../theme/mexy_theme.dart';
import '../../widgets/mexy_widgets.dart';

class OrderDetailView extends StatelessWidget {
  const OrderDetailView({
    required this.order,
    this.showBack = false,
    this.onBack,
    super.key,
  });

  final KitchenOrder? order;
  final bool showBack;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    final current = order;
    if (current == null) {
      return const _EmptyDetail();
    }
    return _OrderBody(order: current, showBack: showBack, onBack: onBack);
  }
}

class OrderDetailPage extends StatelessWidget {
  const OrderDetailPage({required this.orderId, super.key});

  final String orderId;

  @override
  Widget build(BuildContext context) {
    final order = MexyScope.of(context).orderById(orderId);
    return Scaffold(
      body: SafeArea(
        child: OrderDetailView(
          order: order,
          showBack: true,
          onBack: () => Navigator.of(context).pop(),
        ),
      ),
    );
  }
}

class _EmptyDetail extends StatelessWidget {
  const _EmptyDetail();

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Center(
      child: Padding(
        padding: const EdgeInsets.all(MexySpace.xl),
        child: ConstrainedBox(
          constraints: const BoxConstraints(maxWidth: 360),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            children: [
              Icon(
                Icons.receipt_long_outlined,
                size: 36,
                color: theme.colorScheme.onSurfaceVariant,
              ),
              const SizedBox(height: MexySpace.md),
              Text(
                'Selecciona un pedido',
                style: theme.textTheme.titleMedium,
                textAlign: TextAlign.center,
              ),
              const SizedBox(height: MexySpace.xs),
              Text(
                'Toca un ticket para ver cliente, artículos, dirección y total.',
                style: theme.textTheme.bodySmall,
                textAlign: TextAlign.center,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _OrderBody extends StatelessWidget {
  const _OrderBody({
    required this.order,
    required this.showBack,
    this.onBack,
  });

  final KitchenOrder order;
  final bool showBack;
  final VoidCallback? onBack;

  @override
  Widget build(BuildContext context) {
    final store = MexyScope.of(context);
    final theme = Theme.of(context);
    final scheme = theme.colorScheme;
    final meta = orderStatusMeta[order.status]!;
    final tone = orderTone(context, order.status);
    final pad = context.pagePadding;

    return Column(
      children: [
        Expanded(
          child: ListView(
            padding: EdgeInsets.fromLTRB(pad, MexySpace.lg, pad, MexySpace.lg),
            children: [
              Row(
                children: [
                  if (showBack)
                    Padding(
                      padding: const EdgeInsets.only(right: 4),
                      child: IconButton(
                        tooltip: 'Volver a la lista',
                        onPressed: onBack,
                        icon: const Icon(Icons.arrow_back),
                      ),
                    ),
                  Expanded(
                    child: Text(
                      'Pedido #${order.displayId}',
                      style: context.isShort
                          ? theme.textTheme.titleLarge
                          : theme.textTheme.headlineMedium,
                    ),
                  ),
                  StatusPill(
                    label: meta.shortLabel,
                    background: tone.background,
                    foreground: tone.foreground,
                  ),
                ],
              ),
              const SizedBox(height: MexySpace.sm),
              Text(
                '${formatElapsed(order.createdAt, DateTime.now())} · ${order.paymentLabel}',
                style: theme.textTheme.bodySmall,
              ),
              const SizedBox(height: MexySpace.lg),
              SectionCard(
                title: order.customerName,
                hint: order.phone,
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    _MetaRow(
                      icon: order.type == OrderType.delivery
                          ? Icons.delivery_dining_outlined
                          : Icons.storefront_outlined,
                      label: order.type == OrderType.delivery
                          ? 'Envío a domicilio'
                          : 'Recoger en local',
                    ),
                    if (order.address != null) ...[
                      const SizedBox(height: MexySpace.sm),
                      _MetaRow(
                        icon: Icons.place_outlined,
                        label: order.address!,
                      ),
                    ],
                    if (order.note != null) ...[
                      const SizedBox(height: MexySpace.sm),
                      Text(order.note!, style: theme.textTheme.bodyMedium),
                    ],
                  ],
                ),
              ),
              const SizedBox(height: MexySpace.md),
              SectionCard(
                title: order.itemCount == 1 ? '1 artículo' : '${order.itemCount} artículos',
                child: Column(
                  children: [
                    for (var i = 0; i < order.items.length; i++) ...[
                      if (i > 0) const Divider(height: 20),
                      _ItemRow(item: order.items[i]),
                    ],
                    const Divider(height: 24),
                    Row(
                      children: [
                        Text('Total', style: theme.textTheme.titleMedium),
                        const Spacer(),
                        Text(
                          formatPesos(order.totalCents),
                          style: theme.textTheme.titleMedium,
                        ),
                      ],
                    ),
                  ],
                ),
              ),
            ],
          ),
        ),
        Material(
          color: scheme.surface,
          child: SafeArea(
            top: false,
            child: Padding(
              padding: EdgeInsets.fromLTRB(pad, 12, pad, 12),
              child: Row(
                children: [
                  if (canCancelOrder(order.status))
                    Expanded(
                      child: OutlinedButton(
                        onPressed: () => _cancel(context, store, order),
                        child: const Text('Cancelar'),
                      ),
                    ),
                  if (canCancelOrder(order.status)) const SizedBox(width: MexySpace.sm),
                  Expanded(
                    child: OutlinedButton.icon(
                      onPressed: () => _print(context, store, order),
                      icon: const Icon(Icons.print_outlined, size: 18),
                      label: const Text('Ticket'),
                    ),
                  ),
                  if (meta.nextAction != null) ...[
                    const SizedBox(width: MexySpace.sm),
                    Expanded(
                      flex: 2,
                      child: FilledButton(
                        onPressed: () {
                          final message = store.advance(order.id);
                          if (message != null && context.mounted) {
                            ScaffoldMessenger.of(context).showSnackBar(
                              SnackBar(content: Text(message)),
                            );
                          }
                        },
                        child: Text(meta.nextAction!),
                      ),
                    ),
                  ],
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Future<void> _cancel(BuildContext context, MexyStore store, KitchenOrder order) async {
    final scheme = Theme.of(context).colorScheme;
    final confirmed = await showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text('¿Cancelar el pedido #${order.displayId}?'),
          content: Text(
            'Se cancelará el pedido de ${order.customerName}. Esta acción no se puede deshacer.',
          ),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: const Text('Conservar'),
            ),
            FilledButton(
              style: FilledButton.styleFrom(backgroundColor: scheme.error, foregroundColor: scheme.onError),
              onPressed: () => Navigator.pop(context, true),
              child: const Text('Cancelar pedido'),
            ),
          ],
        );
      },
    );
    if (confirmed == true && context.mounted) store.cancelOrder(order.id);
  }

  void _print(BuildContext context, MexyStore store, KitchenOrder order) {
    final printer = store.printer;
    final message = printer == null
        ? 'Elige una impresora en Impresora para enviar el ticket.'
        : 'Ticket #${order.displayId} enviado a ${printer.name}.';
    ScaffoldMessenger.of(context).showSnackBar(SnackBar(content: Text(message)));
  }
}

class _MetaRow extends StatelessWidget {
  const _MetaRow({required this.icon, required this.label});

  final IconData icon;
  final String label;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 18, color: Theme.of(context).colorScheme.onSurfaceVariant),
        const SizedBox(width: 8),
        Expanded(child: Text(label)),
      ],
    );
  }
}

class _ItemRow extends StatelessWidget {
  const _ItemRow({required this.item});

  final OrderItem item;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          '${item.quantity}×',
          style: theme.textTheme.titleMedium?.copyWith(
            color: theme.colorScheme.primary,
          ),
        ),
        const SizedBox(width: 8),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(item.name, style: theme.textTheme.titleMedium),
              if (item.options.isNotEmpty)
                Text(item.options.join(' · '), style: theme.textTheme.bodySmall),
            ],
          ),
        ),
        const SizedBox(width: 8),
        Text(formatPesos(item.lineCents), style: theme.textTheme.bodyMedium),
      ],
    );
  }
}
