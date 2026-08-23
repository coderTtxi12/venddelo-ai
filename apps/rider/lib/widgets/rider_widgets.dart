import 'package:flutter/material.dart';

import '../theme/app_colors.dart';
import '../theme/app_theme.dart';

class RiderScreenPadding extends StatelessWidget {
  const RiderScreenPadding({super.key, required this.child});

  final Widget child;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.all(AppTheme.screenPadding),
      child: child,
    );
  }
}

class RiderPrimaryButton extends StatelessWidget {
  const RiderPrimaryButton({
    super.key,
    required this.label,
    required this.onPressed,
    this.color,
  });

  final String label;
  final VoidCallback? onPressed;
  final Color? color;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: FilledButton(
        onPressed: onPressed,
        style: color == null
            ? null
            : FilledButton.styleFrom(
                backgroundColor: color,
                disabledBackgroundColor: color?.withValues(alpha: 0.45),
              ),
        child: Text(label),
      ),
    );
  }
}

class RiderSecondaryButton extends StatelessWidget {
  const RiderSecondaryButton({
    super.key,
    required this.label,
    required this.onPressed,
  });

  final String label;
  final VoidCallback? onPressed;

  @override
  Widget build(BuildContext context) {
    return SizedBox(
      width: double.infinity,
      child: OutlinedButton(onPressed: onPressed, child: Text(label)),
    );
  }
}

class RiderErrorBanner extends StatelessWidget {
  const RiderErrorBanner({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      liveRegion: true,
      child: Container(
        width: double.infinity,
        padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
        decoration: BoxDecoration(
          color: AppColors.danger.withValues(alpha: 0.08),
          borderRadius: BorderRadius.circular(AppTheme.buttonRadius),
          border: Border.all(color: AppColors.danger.withValues(alpha: 0.22)),
        ),
        child: Text(
          message,
          style: Theme.of(context).textTheme.bodyLarge
              ?.copyWith(color: AppColors.danger, fontWeight: FontWeight.w600),
        ),
      ),
    );
  }
}

class RiderInfoBanner extends StatelessWidget {
  const RiderInfoBanner({super.key, required this.message});

  final String message;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 14),
      decoration: BoxDecoration(
        color: AppColors.cta.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(AppTheme.buttonRadius),
        border: Border.all(color: AppColors.cta.withValues(alpha: 0.22)),
      ),
      child: Text(
        message,
        style: Theme.of(context).textTheme.bodyLarge
            ?.copyWith(color: AppColors.cta, fontWeight: FontWeight.w600),
      ),
    );
  }
}

class RiderOnlineToggle extends StatelessWidget {
  const RiderOnlineToggle({
    super.key,
    required this.isOnline,
    required this.enabled,
    required this.onChanged,
  });

  final bool isOnline;
  final bool enabled;
  final ValueChanged<bool> onChanged;

  @override
  Widget build(BuildContext context) {
    final statusColor = isOnline ? AppColors.online : AppColors.offline;
    final statusLabel = isOnline ? 'EN LÍNEA' : 'FUERA DE LÍNEA';

    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(AppTheme.cardRadius),
      child: InkWell(
        onTap: enabled ? () => onChanged(!isOnline) : null,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        child: Container(
          padding: const EdgeInsets.symmetric(horizontal: 18, vertical: 18),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(AppTheme.cardRadius),
            border: Border.all(color: AppColors.border),
          ),
          child: Row(
            children: [
              Container(
                width: 12,
                height: 12,
                decoration: BoxDecoration(
                  color: statusColor,
                  shape: BoxShape.circle,
                ),
              ),
              const SizedBox(width: 14),
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      statusLabel,
                      style: Theme.of(context).textTheme.titleMedium?.copyWith(
                        color: AppColors.textPrimary,
                        letterSpacing: 0.4,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      isOnline
                          ? 'Recibirás ofertas de entrega'
                          : 'Activa para empezar a recibir ofertas',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
              Switch(value: isOnline, onChanged: enabled ? onChanged : null),
            ],
          ),
        ),
      ),
    );
  }
}

class RiderStatusCard extends StatelessWidget {
  const RiderStatusCard({
    super.key,
    required this.title,
    required this.subtitle,
    this.leading,
  });

  final String title;
  final String subtitle;
  final Widget? leading;

  @override
  Widget build(BuildContext context) {
    return Card(
      child: Padding(
        padding: const EdgeInsets.all(20),
        child: Row(
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            if (leading != null) ...[leading!, const SizedBox(width: 16)],
            Expanded(
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Text(title, style: Theme.of(context).textTheme.titleLarge),
                  const SizedBox(height: 6),
                  Text(subtitle, style: Theme.of(context).textTheme.bodyLarge),
                ],
              ),
            ),
          ],
        ),
      ),
    );
  }
}

class RiderMetaRow extends StatelessWidget {
  const RiderMetaRow({
    super.key,
    required this.label,
    required this.value,
    this.emphasized = false,
    this.horizontalInset = 0,
  });

  final String label;
  final String value;
  final bool emphasized;
  final double horizontalInset;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final row = Row(
      crossAxisAlignment: emphasized
          ? CrossAxisAlignment.baseline
          : CrossAxisAlignment.start,
      textBaseline: TextBaseline.alphabetic,
      children: [
        SizedBox(
          width: 110,
          child: Text(
            label,
            style: textTheme.bodyMedium?.copyWith(
              fontWeight: FontWeight.w700,
              color: emphasized ? AppColors.textPrimary : AppColors.textMuted,
            ),
          ),
        ),
        Expanded(
          child: Text(
            value,
            style: (emphasized ? textTheme.titleLarge : textTheme.bodyLarge)
                ?.copyWith(
                  fontWeight: emphasized ? FontWeight.w800 : FontWeight.w600,
                  color: emphasized ? AppColors.cta : AppColors.textPrimary,
                  fontFeatures: emphasized
                      ? const [FontFeature.tabularFigures()]
                      : null,
                ),
          ),
        ),
      ],
    );

    if (!emphasized) {
      return Padding(
        padding: EdgeInsets.fromLTRB(horizontalInset, 0, horizontalInset, 8),
        child: row,
      );
    }

    return Padding(
      padding: const EdgeInsets.only(bottom: 8),
      child: ColoredBox(
        color: AppColors.cta.withValues(alpha: 0.07),
        child: Padding(
          padding: EdgeInsets.fromLTRB(horizontalInset, 8, horizontalInset, 8),
          child: row,
        ),
      ),
    );
  }
}
