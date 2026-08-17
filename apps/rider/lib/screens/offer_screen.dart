import 'dart:async';

import 'package:flutter/material.dart';

import '../countdown.dart';
import '../models.dart';

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

  @override
  Widget build(BuildContext context) {
    final remaining = remainingSecondsFromExpiresAt(widget.offer.expiresAt);
    final collect = (widget.offer.collectCents / 100).toStringAsFixed(2);
    return Scaffold(
      backgroundColor: Theme.of(context).colorScheme.surface,
      body: SafeArea(
        child: Padding(
          padding: const EdgeInsets.all(24),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.stretch,
            children: [
              Text(
                'Nueva oferta',
                style: Theme.of(context).textTheme.headlineSmall,
              ),
              const SizedBox(height: 8),
              Text(
                remaining == 0 ? 'Expirada' : '$remaining s',
                style: Theme.of(context).textTheme.displaySmall,
              ),
              const SizedBox(height: 24),
              if (widget.offer.stops.length > 1)
                ...widget.offer.stops.map(
                  (stop) => Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          stop.restaurantName,
                          style: Theme.of(context).textTheme.titleLarge,
                        ),
                        const SizedBox(height: 4),
                        Text(stop.dropoffAddress),
                      ],
                    ),
                  ),
                )
              else ...[
                Text(
                  widget.offer.restaurantName,
                  style: Theme.of(context).textTheme.titleLarge,
                ),
                const SizedBox(height: 8),
                Text(widget.offer.dropoffAddress),
              ],
              const SizedBox(height: 8),
              Text('Cobrar: \$$collect · ${_paymentLabel(widget.offer.paymentMethod)}'),
              Text('Paquetes: ${widget.offer.packageCount}'),
              if (widget.errorMessage != null && widget.errorMessage!.isNotEmpty) ...[
                const SizedBox(height: 16),
                Semantics(
                  liveRegion: true,
                  child: Text(
                    widget.errorMessage!,
                    style: TextStyle(color: Theme.of(context).colorScheme.error),
                  ),
                ),
              ],
              const Spacer(),
              FilledButton(
                onPressed: remaining == 0 || widget.busy ? null : widget.onAccept,
                child: const Text('Aceptar'),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: widget.busy ? null : widget.onReject,
                child: const Text('Rechazar'),
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
