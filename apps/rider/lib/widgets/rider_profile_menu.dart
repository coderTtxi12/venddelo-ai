import 'package:flutter/material.dart';

import '../formatters.dart';
import '../rider_display.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import 'rider_slide_to_confirm.dart';
import 'rider_widgets.dart';

Future<void> showRiderProfileMenu({
  required BuildContext context,
  required String name,
  required bool isOnline,
  int? creditAvailableCents,
  String? photoUrl,
  String? plate,
  String? motorcycleBrand,
  String? motorcycleColor,
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
        photoUrl: photoUrl,
        plate: plate,
        motorcycleBrand: motorcycleBrand,
        motorcycleColor: motorcycleColor,
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
    this.photoUrl,
    this.plate,
    this.motorcycleBrand,
    this.motorcycleColor,
    required this.onOpenAccount,
    required this.onSignOut,
  });

  final String name;
  final bool isOnline;
  final int? creditAvailableCents;
  final String? photoUrl;
  final String? plate;
  final String? motorcycleBrand;
  final String? motorcycleColor;
  final VoidCallback onOpenAccount;
  final VoidCallback onSignOut;

  @override
  Widget build(BuildContext context) {
    final textTheme = Theme.of(context).textTheme;
    final credit = creditAvailableCents;
    final vehicle = _vehicleLine(motorcycleBrand, motorcycleColor);
    final plateLabel = (plate ?? '').trim();

    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(24, 4, 24, 20),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.stretch,
          children: [
            _ProfileAvatar(name: name, photoUrl: photoUrl, size: 72),
            const SizedBox(height: 14),
            Text(
              name.isEmpty ? 'Repartidor' : name,
              textAlign: TextAlign.center,
              maxLines: 1,
              overflow: TextOverflow.ellipsis,
              style: textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
                letterSpacing: -0.4,
                color: AppColors.textPrimary,
              ),
            ),
            const SizedBox(height: 8),
            _OnlineStatus(isOnline: isOnline),
            if (vehicle.isNotEmpty) ...[
              const SizedBox(height: 14),
              _VehicleLine(text: vehicle, color: motorcycleColor),
            ],
            if (plateLabel.isNotEmpty) ...[
              const SizedBox(height: 6),
              Text(
                'Placas $plateLabel',
                textAlign: TextAlign.center,
                style: textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                  letterSpacing: 0.6,
                  color: AppColors.textPrimary,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
              ),
            ],
            if (credit != null) ...[
              const SizedBox(height: 8),
              Text(
                'Crédito ${formatMoneyCents(credit)}',
                textAlign: TextAlign.center,
                style: textTheme.bodyMedium?.copyWith(
                  color: AppColors.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
              ),
            ],
            const SizedBox(height: 22),
            RiderPrimaryButton(
              label: 'Historial y ganancias',
              onPressed: onOpenAccount,
            ),
            const SizedBox(height: 14),
            RiderSlideToConfirm(
              label: 'Desliza para cerrar sesión',
              compact: true,
              onConfirmed: onSignOut,
            ),
          ],
        ),
      ),
    );
  }
}

class _ProfileAvatar extends StatefulWidget {
  const _ProfileAvatar({
    required this.name,
    required this.size,
    this.photoUrl,
  });

  final String name;
  final double size;
  final String? photoUrl;

  @override
  State<_ProfileAvatar> createState() => _ProfileAvatarState();
}

class _ProfileAvatarState extends State<_ProfileAvatar> {
  var _broken = false;

  @override
  void didUpdateWidget(covariant _ProfileAvatar oldWidget) {
    super.didUpdateWidget(oldWidget);
    if (oldWidget.photoUrl != widget.photoUrl) {
      _broken = false;
    }
  }

  @override
  Widget build(BuildContext context) {
    final url = widget.photoUrl;
    final initial = _profileInitial(widget.name);
    final showPhoto = url != null && url.isNotEmpty && !_broken;

    return Align(
      alignment: Alignment.center,
      child: Semantics(
        image: showPhoto,
        label: showPhoto ? 'Foto de ${widget.name}' : 'Sin foto de perfil',
        child: Container(
          width: widget.size,
          height: widget.size,
          alignment: Alignment.center,
          decoration: BoxDecoration(
            color: AppColors.cta.withValues(alpha: 0.12),
            shape: BoxShape.circle,
            border: Border.all(color: AppColors.border),
          ),
          clipBehavior: Clip.antiAlias,
          child: showPhoto
              ? Image.network(
                  url,
                  width: widget.size,
                  height: widget.size,
                  fit: BoxFit.cover,
                  semanticLabel: 'Foto de ${widget.name}',
                  errorBuilder: (context, error, stackTrace) {
                    WidgetsBinding.instance.addPostFrameCallback((_) {
                      if (mounted && !_broken) {
                        setState(() => _broken = true);
                      }
                    });
                    return _Initials(initial: initial);
                  },
                )
              : _Initials(initial: initial),
        ),
      ),
    );
  }
}

class _Initials extends StatelessWidget {
  const _Initials({required this.initial});

  final String initial;

  @override
  Widget build(BuildContext context) {
    return Text(
      initial,
      style: Theme.of(context).textTheme.headlineSmall?.copyWith(
            color: AppColors.cta,
            fontWeight: FontWeight.w800,
          ),
    );
  }
}

class _OnlineStatus extends StatelessWidget {
  const _OnlineStatus({required this.isOnline});

  final bool isOnline;

  @override
  Widget build(BuildContext context) {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        Container(
          width: 8,
          height: 8,
          decoration: BoxDecoration(
            color: isOnline ? AppColors.online : AppColors.offline,
            shape: BoxShape.circle,
          ),
        ),
        const SizedBox(width: 6),
        Text(
          isOnline ? 'En línea' : 'Desconectado',
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                fontWeight: FontWeight.w600,
                color: isOnline ? AppColors.success : AppColors.textMuted,
              ),
        ),
      ],
    );
  }
}

class _VehicleLine extends StatelessWidget {
  const _VehicleLine({required this.text, this.color});

  final String text;
  final String? color;

  @override
  Widget build(BuildContext context) {
    final colorLabel = (color ?? '').trim();
    final hex = colorLabel.isEmpty ? null : motorcycleColorHex(colorLabel);
    return Wrap(
      alignment: WrapAlignment.center,
      crossAxisAlignment: WrapCrossAlignment.center,
      spacing: 6,
      children: [
        Text(
          text,
          textAlign: TextAlign.center,
          style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                color: AppColors.textSecondary,
                fontWeight: FontWeight.w500,
              ),
        ),
        if (hex != null)
          Container(
            width: 10,
            height: 10,
            decoration: BoxDecoration(
              color: _parseHex(hex),
              shape: BoxShape.circle,
              border: Border.all(color: AppColors.border),
            ),
          ),
      ],
    );
  }
}

String _vehicleLine(String? brand, String? color) {
  final parts = <String>[vehicleTypeLabel()];
  final brandLabel = (brand ?? '').trim();
  final colorLabel = (color ?? '').trim();
  if (brandLabel.isNotEmpty) parts.add(brandLabel);
  if (colorLabel.isNotEmpty) parts.add(colorLabel);
  return parts.join(' · ');
}

Color _parseHex(String hex) {
  final value = hex.replaceFirst('#', '');
  return Color(int.parse('FF$value', radix: 16));
}

String _profileInitial(String name) {
  final trimmed = name.trim();
  if (trimmed.isEmpty) return 'R';
  return trimmed.characters.first.toUpperCase();
}
