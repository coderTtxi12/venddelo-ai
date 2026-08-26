import 'dart:async';

import 'package:flutter/material.dart';
import 'package:smooth_sheets/smooth_sheets.dart';

import '../countdown.dart';
import '../formatters.dart';
import '../models.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import 'rider_slide_to_confirm.dart';
import 'rider_widgets.dart';

class OfferDetailsSheet extends StatefulWidget {
  const OfferDetailsSheet({
    super.key,
    required this.offer,
    required this.onAccept,
    this.onExpired,
    this.errorMessage,
    this.busy = false,
  });

  final RiderOffer offer;
  final VoidCallback onAccept;
  final VoidCallback? onExpired;
  final String? errorMessage;
  final bool busy;

  @override
  State<OfferDetailsSheet> createState() => _OfferDetailsSheetState();
}

class _OfferDetailsSheetState extends State<OfferDetailsSheet> {
  Timer? _ticker;

  @override
  void initState() {
    super.initState();
    _ticker = Timer.periodic(const Duration(seconds: 1), (_) {
      if (mounted) {
        setState(() {});
      }
    });
  }

  @override
  void dispose() {
    _ticker?.cancel();
    super.dispose();
  }

  Color _countdownColor(int remaining) {
    if (remaining == 0) {
      return AppColors.danger;
    }
    return AppColors.cta;
  }

  @override
  Widget build(BuildContext context) {
    final offer = widget.offer;
    final remaining = remainingSecondsFromExpiresAt(offer.expiresAt);
    final countdownColor = _countdownColor(remaining);
    final stops = offer.stops.isEmpty
        ? [
            RiderOfferStop(
              restaurantName: offer.restaurantName,
              dropoffAddress: offer.dropoffAddress,
              shortId: offer.shortId,
            ),
          ]
        : offer.stops;
    final canAccept = remaining > 0 && !widget.busy;

    return SheetContentScaffold(
      backgroundColor: Colors.transparent,
      bottomBarVisibility: const BottomBarVisibility.always(
        ignoreBottomInset: true,
      ),
      bottomBar: Material(
        color: AppColors.surface,
        child: SafeArea(
          top: false,
          child: Padding(
            padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
            child: Column(
              mainAxisSize: MainAxisSize.min,
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                if (widget.errorMessage != null &&
                    widget.errorMessage!.isNotEmpty) ...[
                  RiderErrorBanner(message: widget.errorMessage!),
                  const SizedBox(height: 10),
                ],
                RiderSlideToConfirm(
                  label: 'Desliza para aceptar',
                  color: AppColors.cta,
                  busy: widget.busy,
                  onConfirmed: canAccept ? widget.onAccept : null,
                ),
              ],
            ),
          ),
        ),
      ),
      body: ListView(
        physics: const AlwaysScrollableScrollPhysics(),
        padding: const EdgeInsets.fromLTRB(20, 10, 20, 12),
        children: [
          Center(
            child: Container(
              width: 44,
              height: 5,
              margin: const EdgeInsets.only(bottom: 14),
              decoration: BoxDecoration(
                color: AppColors.border,
                borderRadius: BorderRadius.circular(99),
              ),
            ),
          ),
          Row(
            children: [
              Expanded(
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Nueva oferta',
                      style: Theme.of(context).textTheme.headlineSmall,
                    ),
                    if (formatShortId(offer.shortId).isNotEmpty)
                      Text(
                        formatShortId(offer.shortId),
                        style: Theme.of(context).textTheme.titleMedium
                            ?.copyWith(
                              color: AppColors.cta,
                              fontWeight: FontWeight.w800,
                              letterSpacing: 0.6,
                            ),
                      ),
                  ],
                ),
              ),
              Container(
                padding: const EdgeInsets.symmetric(
                  horizontal: 12,
                  vertical: 8,
                ),
                decoration: BoxDecoration(
                  color: countdownColor.withValues(alpha: 0.12),
                  borderRadius: BorderRadius.circular(999),
                  border: Border.all(
                    color: countdownColor.withValues(alpha: 0.28),
                  ),
                ),
                child: Text(
                  remaining == 0 ? 'Expirada' : '${remaining}s',
                  style: Theme.of(context).textTheme.titleSmall?.copyWith(
                    color: countdownColor,
                    fontWeight: FontWeight.w800,
                  ),
                ),
              ),
            ],
          ),
          const SizedBox(height: 16),
          _PayoutHero(
            feeLabel: formatMoneyCents(offer.quotedFeeCents),
            distanceLabel: formatDistanceMeters(offer.distanceMeters),
            collectLabel:
                showsRiderCustomerCollect(
                  offer.paymentMethod,
                  offer.collectCents,
                )
                ? formatMoneyCents(
                    customerTotalCents(
                      offer.collectCents,
                      offer.quotedFeeCents,
                    ),
                  )
                : null,
            restaurantPayLabel:
                showsRiderCashCollect(offer.paymentMethod, offer.collectCents)
                ? formatMoneyCents(offer.collectCents)
                : null,
          ),
          const SizedBox(height: 16),
          for (final stop in stops)
            Padding(
              padding: const EdgeInsets.only(bottom: 12),
              child: _StopCard(stop: stop),
            ),
          RiderMetaRow(label: 'Pago', value: paymentLabel(offer.paymentMethod)),
          RiderMetaRow(label: 'Paquetes', value: '${offer.packageCount}'),
        ],
      ),
    );
  }
}

class _PayoutHero extends StatelessWidget {
  const _PayoutHero({
    required this.feeLabel,
    required this.distanceLabel,
    this.collectLabel,
    this.restaurantPayLabel,
  });

  final String feeLabel;
  final String distanceLabel;
  final String? collectLabel;
  final String? restaurantPayLabel;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
      decoration: BoxDecoration(
        color: AppColors.cta.withValues(alpha: 0.08),
        borderRadius: BorderRadius.circular(20),
        border: Border.all(color: AppColors.cta.withValues(alpha: 0.18)),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Costo de envío',
            style: Theme.of(context).textTheme.bodySmall
                ?.copyWith(color: AppColors.cta, fontWeight: FontWeight.w700),
          ),
          Text(
            feeLabel,
            style: Theme.of(context).textTheme.headlineMedium
                ?.copyWith(color: AppColors.cta),
          ),
          const SizedBox(height: 12),
          Row(
            children: [
              _MiniStat(
                icon: Icons.straighten_rounded,
                label: 'Distancia',
                value: distanceLabel,
              ),
              if (restaurantPayLabel != null) ...[
                const SizedBox(width: 10),
                _MiniStat(
                  icon: Icons.storefront_rounded,
                  label: 'Restaurante',
                  value: restaurantPayLabel!,
                ),
              ],
            ],
          ),
          if (collectLabel != null) ...[
            const SizedBox(height: 10),
            _MiniStat(
              icon: Icons.payments_rounded,
              label: 'Cobrar',
              value: collectLabel!,
              expanded: false,
            ),
          ],
        ],
      ),
    );
  }
}

class _MiniStat extends StatelessWidget {
  const _MiniStat({
    required this.icon,
    required this.label,
    required this.value,
    this.expanded = true,
  });

  final IconData icon;
  final String label;
  final String value;
  final bool expanded;

  @override
  Widget build(BuildContext context) {
    final card = Container(
      padding: const EdgeInsets.symmetric(horizontal: 12, vertical: 10),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(14),
      ),
      child: Row(
        children: [
          Icon(icon, size: 18, color: AppColors.textPrimary),
          const SizedBox(width: 8),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Text(
                  value,
                  maxLines: 1,
                  overflow: TextOverflow.ellipsis,
                  style: Theme.of(context).textTheme.titleSmall,
                ),
                Text(label, style: Theme.of(context).textTheme.bodySmall),
              ],
            ),
          ),
        ],
      ),
    );
    if (!expanded) {
      return card;
    }
    return Expanded(child: card);
  }
}

class _StopCard extends StatelessWidget {
  const _StopCard({required this.stop});

  final RiderOfferStop stop;

  @override
  Widget build(BuildContext context) {
    final distance = formatDistanceMeters(stop.distanceMeters);
    return Container(
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        border: Border.all(color: AppColors.border),
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
      ),
      child: Column(
        children: [
          _PointRow(
            icon: Icons.storefront_rounded,
            title: formatShortId(stop.shortId).isEmpty
                ? 'Recoger'
                : 'Recoger ${formatShortId(stop.shortId)}',
            value: stop.restaurantName,
          ),
          Padding(
            padding: const EdgeInsets.fromLTRB(13, 6, 0, 6),
            child: Row(
              children: [
                Container(width: 2, height: 18, color: AppColors.border),
                const SizedBox(width: 18),
                if (stop.distanceMeters != null)
                  Text(
                    distance,
                    style: Theme.of(context).textTheme.bodySmall
                        ?.copyWith(fontWeight: FontWeight.w700),
                  ),
              ],
            ),
          ),
          _PointRow(
            icon: Icons.flag_rounded,
            title: 'Entregar',
            value: stop.dropoffAddress,
          ),
        ],
      ),
    );
  }
}

class _PointRow extends StatelessWidget {
  const _PointRow({
    required this.icon,
    required this.title,
    required this.value,
  });

  final IconData icon;
  final String title;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Row(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Icon(icon, size: 26, color: AppColors.textPrimary),
        const SizedBox(width: 10),
        Expanded(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text(
                title,
                style: Theme.of(context).textTheme.bodySmall
                    ?.copyWith(fontWeight: FontWeight.w700),
              ),
              Text(value, style: Theme.of(context).textTheme.bodyLarge),
            ],
          ),
        ),
      ],
    );
  }
}
