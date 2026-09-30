import 'package:flutter/material.dart';

import '../state/mexy_store.dart';
import '../theme/mexy_theme.dart';

class SectionCard extends StatelessWidget {
  const SectionCard({
    required this.title,
    required this.child,
    this.hint,
    super.key,
  });

  final String title;
  final String? hint;
  final Widget child;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(MexySpace.lg),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(title, style: theme.textTheme.titleMedium),
            if (hint != null) ...[
              const SizedBox(height: MexySpace.xs),
              Text(hint!, style: theme.textTheme.bodySmall),
            ],
            const SizedBox(height: MexySpace.md),
            child,
          ],
        ),
      ),
    );
  }
}

class PageHeader extends StatelessWidget {
  const PageHeader({
    required this.title,
    required this.subtitle,
    this.trailing,
    super.key,
  });

  final String title;
  final String subtitle;
  final Widget? trailing;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final titleStyle = context.isShort
        ? theme.textTheme.titleLarge
        : theme.textTheme.headlineMedium;
    final copy = Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: titleStyle),
        const SizedBox(height: MexySpace.xs),
        Text(subtitle, style: theme.textTheme.bodySmall),
      ],
    );
    if (trailing == null) return copy;
    return LayoutBuilder(
      builder: (context, constraints) {
        final stacked = constraints.maxWidth < 520;
        if (stacked) {
          return Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              copy,
              const SizedBox(height: MexySpace.md),
              trailing!,
            ],
          );
        }
        return Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Expanded(child: copy),
            const SizedBox(width: MexySpace.md),
            trailing!,
          ],
        );
      },
    );
  }
}

class LiveChip extends StatelessWidget {
  const LiveChip({required this.label, required this.hint, super.key});

  final String label;
  final String hint;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    return Semantics(
      label: '$label. $hint',
      child: Container(
        constraints: const BoxConstraints(minHeight: 40),
        padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 8),
        decoration: BoxDecoration(
          color: scheme.primaryContainer,
          borderRadius: BorderRadius.circular(999),
        ),
        child: Row(
          mainAxisSize: MainAxisSize.min,
          children: [
            Container(
              width: 8,
              height: 8,
              decoration: BoxDecoration(
                color: scheme.primary,
                shape: BoxShape.circle,
              ),
            ),
            const SizedBox(width: 8),
            Text(
              label,
              style: TextStyle(
                color: scheme.onPrimaryContainer,
                fontWeight: FontWeight.w700,
                fontSize: 13,
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class StatusPill extends StatelessWidget {
  const StatusPill({
    required this.label,
    required this.background,
    required this.foreground,
    super.key,
  });

  final String label;
  final Color background;
  final Color foreground;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 4),
      decoration: BoxDecoration(
        color: background,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: TextStyle(
          color: foreground,
          fontSize: 12,
          fontWeight: FontWeight.w700,
          height: 1.2,
        ),
      ),
    );
  }
}

({Color background, Color foreground}) orderTone(BuildContext context, OrderStatus status) {
  final dark = Theme.of(context).brightness == Brightness.dark;
  switch (status) {
    case OrderStatus.pending:
      return dark
          ? (background: const Color(0xFF451A03), foreground: const Color(0xFFFCD34D))
          : (background: const Color(0xFFFEF3C7), foreground: const Color(0xFF92400E));
    case OrderStatus.confirmed:
      return dark
          ? (background: const Color(0xFF1E1B4B), foreground: const Color(0xFFC7D2FE))
          : (background: const Color(0xFFE0E7FF), foreground: const Color(0xFF3730A3));
    case OrderStatus.preparing:
      return dark
          ? (background: const Color(0xFF172554), foreground: const Color(0xFFBFDBFE))
          : (background: const Color(0xFFDBEAFE), foreground: const Color(0xFF1E40AF));
    case OrderStatus.ready:
      return dark
          ? (background: const Color(0xFF022C22), foreground: const Color(0xFF6EE7B7))
          : (background: const Color(0xFFD1FAE5), foreground: const Color(0xFF065F46));
    case OrderStatus.delivered:
      return dark
          ? (background: const Color(0xFF334155), foreground: const Color(0xFFE2E8F0))
          : (background: const Color(0xFFE2E8F0), foreground: const Color(0xFF334155));
    case OrderStatus.cancelled:
      return dark
          ? (background: const Color(0xFF450A0A), foreground: const Color(0xFFFECACA))
          : (background: const Color(0xFFFEE2E2), foreground: const Color(0xFF991B1B));
  }
}

({Color background, Color foreground}) dispatchTone(
  BuildContext context,
  DispatchStatus status,
) {
  switch (status) {
    case DispatchStatus.searching:
      return orderTone(context, OrderStatus.pending);
    case DispatchStatus.assigned:
      return orderTone(context, OrderStatus.confirmed);
    case DispatchStatus.enRoute:
      return orderTone(context, OrderStatus.preparing);
    case DispatchStatus.delivered:
      return orderTone(context, OrderStatus.ready);
    case DispatchStatus.cancelled:
      return orderTone(context, OrderStatus.cancelled);
  }
}

String dispatchLabel(DispatchStatus status) {
  switch (status) {
    case DispatchStatus.searching:
      return 'Buscando';
    case DispatchStatus.assigned:
      return 'Asignado';
    case DispatchStatus.enRoute:
      return 'En camino';
    case DispatchStatus.delivered:
      return 'Entregado';
    case DispatchStatus.cancelled:
      return 'Cancelado';
  }
}
