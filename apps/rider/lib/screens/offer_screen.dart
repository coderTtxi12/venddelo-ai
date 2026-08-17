import 'dart:async';

import 'package:flutter/material.dart';

import '../countdown.dart';
import '../models.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import '../widgets/rider_widgets.dart';

class OfferScreen extends StatefulWidget {
  const OfferScreen({
    super.key,
    required this.offer,
    required this.onAccept,
    required this.onReject,
    this.errorMessage,
    this.busy = false,
  });

  final RiderOffer offer;
  final VoidCallback onAccept;
  final VoidCallback onReject;
  final String? errorMessage;
  final bool busy;

  @override
  State<OfferScreen> createState() => _OfferScreenState();
}

class _OfferScreenState extends State<OfferScreen> {
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
    if (remaining <= 10) {
      return AppColors.warningBright;
    }
    return AppColors.accent;
  }

  @override
  Widget build(BuildContext context) {
    final remaining = remainingSecondsFromExpiresAt(widget.offer.expiresAt);
    final collect = (widget.offer.collectCents / 100).toStringAsFixed(2);
    final countdownColor = _countdownColor(remaining);

    return Scaffold(
      backgroundColor: AppColors.background,
      body: SafeArea(
        child: RiderScreenPadding(
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Nueva oferta',
                style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                      color: AppColors.textSecondary,
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 12),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.symmetric(vertical: 20, horizontal: 16),
                decoration: BoxDecoration(
                  color: countdownColor.withValues(alpha: 0.1),
                  borderRadius: BorderRadius.circular(AppTheme.cardRadius),
                  border: Border.all(
                    color: countdownColor.withValues(alpha: 0.35),
                    width: 2,
                  ),
                ),
                child: Column(
                  children: [
                    Text(
                      remaining == 0 ? 'Expirada' : '$remaining',
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.displayLarge?.copyWith(
                            color: countdownColor,
                            fontSize: remaining == 0 ? 40 : 64,
                          ),
                    ),
                    if (remaining > 0)
                      Text(
                        'segundos',
                        style: Theme.of(context).textTheme.titleMedium?.copyWith(
                              color: countdownColor,
                              fontWeight: FontWeight.w600,
                            ),
                      ),
                  ],
                ),
              ),
              const SizedBox(height: 24),
              Expanded(
                child: SingleChildScrollView(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.stretch,
                    children: [
                      if (widget.offer.stops.length > 1)
                        ...widget.offer.stops.map(
                          (stop) => Padding(
                            padding: const EdgeInsets.only(bottom: 12),
                            child: Card(
                              child: Padding(
                                padding: const EdgeInsets.all(18),
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      stop.restaurantName,
                                      style: Theme.of(context).textTheme.titleLarge,
                                    ),
                                    const SizedBox(height: 8),
                                    Text(
                                      stop.dropoffAddress,
                                      style: Theme.of(context).textTheme.bodyLarge,
                                    ),
                                  ],
                                ),
                              ),
                            ),
                          ),
                        )
                      else
                        Card(
                          child: Padding(
                            padding: const EdgeInsets.all(18),
                            child: Column(
                              crossAxisAlignment: CrossAxisAlignment.start,
                              children: [
                                Text(
                                  widget.offer.restaurantName,
                                  style: Theme.of(context).textTheme.headlineSmall,
                                ),
                                const SizedBox(height: 10),
                                Text(
                                  widget.offer.dropoffAddress,
                                  style: Theme.of(context).textTheme.bodyLarge,
                                ),
                              ],
                            ),
                          ),
                        ),
                      const SizedBox(height: 16),
                      Card(
                        child: Padding(
                          padding: const EdgeInsets.all(18),
                          child: Column(
                            children: [
                              RiderMetaRow(
                                label: 'Cobrar',
                                value: '\$$collect',
                              ),
                              RiderMetaRow(
                                label: 'Pago',
                                value: _paymentLabel(widget.offer.paymentMethod),
                              ),
                              RiderMetaRow(
                                label: 'Paquetes',
                                value: '${widget.offer.packageCount}',
                              ),
                            ],
                          ),
                        ),
                      ),
                      if (widget.errorMessage != null &&
                          widget.errorMessage!.isNotEmpty) ...[
                        const SizedBox(height: 16),
                        RiderErrorBanner(message: widget.errorMessage!),
                      ],
                    ],
                  ),
                ),
              ),
              const SizedBox(height: 16),
              RiderPrimaryButton(
                label: 'Aceptar oferta',
                color: AppColors.successBright,
                onPressed: remaining == 0 || widget.busy ? null : widget.onAccept,
              ),
              const SizedBox(height: 12),
              RiderSecondaryButton(
                label: 'Rechazar',
                onPressed: widget.busy ? null : widget.onReject,
              ),
            ],
          ),
        ),
      ),
    );
  }
}

String _paymentLabel(String method) {
  switch (method) {
    case 'cash':
      return 'Efectivo';
    case 'transfer':
      return 'Transferencia';
    case 'card_terminal':
      return 'Terminal';
    default:
      return method;
  }
}
