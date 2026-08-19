import 'package:flutter/material.dart';

import '../formatters.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

Future<void> showRiderProfileMenu({
  required BuildContext context,
  required String name,
  required bool isOnline,
  int? creditAvailableCents,
  required VoidCallback onOpenAccount,
  required VoidCallback onSignOut,
}) {
  return showModalBottomSheet<void>(
    context: context,
    isScrollControlled: true,
    backgroundColor: AppColors.surface,
    barrierColor: const Color(0x99000000),
    showDragHandle: true,
    shape: const RoundedRectangleBorder(
      borderRadius: BorderRadius.vertical(
        top: Radius.circular(AppTheme.cardRadius),
      ),
    ),
    builder: (sheetContext) {
      return RiderProfileMenuSheet(
        name: name,
        isOnline: isOnline,
        creditAvailableCents: creditAvailableCents,
        onOpenAccount: () {
          Navigator.of(sheetContext).pop();
          onOpenAccount();
        },
        onSignOut: () {
          Navigator.of(sheetContext).pop();
          onSignOut();
        },
      );
    },
  );
}

class RiderProfileMenuSheet extends StatelessWidget {
  const RiderProfileMenuSheet({
    super.key,
    required this.name,
    required this.isOnline,
    this.creditAvailableCents,
    required this.onOpenAccount,
    required this.onSignOut,
  });

  final String name;
  final bool isOnline;
  final int? creditAvailableCents;
  final VoidCallback onOpenAccount;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final credit = creditAvailableCents;

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 4, 20, 16),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            Row(
              children: [
                _ProfileAvatar(name: name, size: 56),
                const SizedBox(width: 14),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        name.isEmpty ? 'Repartidor' : name,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: textTheme.titleMedium?.copyWith(
                          fontWeight: FontWeight.w800,
                          color: AppColors.textPrimary,
                        ),
                      ),
                      const SizedBox(height: 6),
                      _OnlineBadge(isOnline: isOnline),
                    ],
                  ),
                ),
              ],
            ),
            if (credit != null) ...[
              const SizedBox(height: 16),
              Container(
                padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 12),
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(14),
                  border: Border.all(color: AppColors.border),
                ),
                child: Row(
                  children: [
                    Text(
                      'Crédito disponible',
                      style: textTheme.bodyMedium?.copyWith(
                        color: AppColors.textSecondary,
                        fontWeight: FontWeight.w600,
                      ),
                    ),
                    const Spacer(),
                    Text(
                      formatMoneyCents(credit),
                      style: textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
              ),
            ],
            const SizedBox(height: 18),
            Text(
              'Opciones',
              style: textTheme.bodySmall?.copyWith(
                fontWeight: FontWeight.w700,
                color: AppColors.textMuted,
                letterSpacing: 0.4,
              ),
            ),
            const SizedBox(height: 10),
            _ProfileMenuTile(
              icon: Icons.receipt_long_rounded,
              title: 'Historial y ganancias',
              subtitle: 'Entregas, crédito y holds',
              onTap: onOpenAccount,
            ),
            const SizedBox(height: 8),
            const Divider(),
            const SizedBox(height: 8),
            _ProfileMenuTile(
              icon: Icons.logout_rounded,
              title: 'Cerrar sesión',
              subtitle: 'Salir de esta cuenta',
              destructive: true,
              onTap: onSignOut,
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileAvatar extends StatelessWidget {
  const _ProfileAvatar({required this.name, required this.size});

  final String name;
  final double size;

  @override
  Widget build(BuildContext context) {
    final initial = _profileInitial(name);
    return Container(
      width: size,
      height: size,
      alignment: Alignment.center,
      decoration: BoxDecoration(
        color: AppColors.cta.withValues(alpha: 0.12),
        shape: BoxShape.circle,
        border: Border.all(color: AppColors.border),
      ),
      child: Text(
        initial,
        style: Theme.of(context).textTheme.titleLarge?.copyWith(
              color: AppColors.cta,
              fontWeight: FontWeight.w800,
            ),
      ),
    );
  }
}

class _OnlineBadge extends StatelessWidget {
  const _OnlineBadge({required this.isOnline});

  final bool isOnline;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 10, vertical: 4),
      decoration: BoxDecoration(
        color: isOnline
            ? AppColors.online.withValues(alpha: 0.12)
            : AppColors.border,
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        isOnline ? 'En línea' : 'Desconectado',
        style: Theme.of(context).textTheme.labelLarge?.copyWith(
              fontSize: 13,
              fontWeight: FontWeight.w700,
              color: isOnline ? AppColors.success : AppColors.textMuted,
            ),
      ),
    );
  }
}

class _ProfileMenuTile extends StatelessWidget {
  const _ProfileMenuTile({
    required this.icon,
    required this.title,
    required this.subtitle,
    required this.onTap,
    this.destructive = false,
  });

  final IconData icon;
  final String title;
  final String subtitle;
  final VoidCallback onTap;
  final bool destructive;

  @override
  Widget build(BuildContext context) {
    final accent = destructive ? AppColors.danger : AppColors.cta;
    return Semantics(
      button: true,
      label: '$title. $subtitle',
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            constraints: const BoxConstraints(minHeight: 64),
            padding: const EdgeInsets.fromLTRB(12, 12, 10, 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(
                color: destructive
                    ? AppColors.danger.withValues(alpha: 0.22)
                    : AppColors.border,
              ),
            ),
            child: Row(
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: accent.withValues(alpha: 0.1),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(icon, color: accent, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        title,
                        style: Theme.of(context).textTheme.titleSmall?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: destructive
                                  ? AppColors.danger
                                  : AppColors.textPrimary,
                            ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        subtitle,
                        style: Theme.of(context).textTheme.bodySmall?.copyWith(
                              color: AppColors.textSecondary,
                            ),
                      ),
                    ],
                  ),
                ),
                Icon(
                  Icons.chevron_right_rounded,
                  color: destructive ? AppColors.danger : AppColors.textMuted,
                  size: 24,
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

String _profileInitial(String name) {
  final trimmed = name.trim();
  if (trimmed.isEmpty) return 'R';
  return trimmed.characters.first.toUpperCase();
}
