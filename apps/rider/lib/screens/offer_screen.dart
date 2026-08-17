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
  });

  final RiderOffer offer;
  final VoidCallback onAccept;
  final VoidCallback onReject;

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
              Text(
                widget.offer.restaurantName,
                style: Theme.of(context).textTheme.titleLarge,
              ),
              const SizedBox(height: 8),
              Text(widget.offer.dropoffAddress),
              const SizedBox(height: 8),
              Text('Cobrar: \$$collect · ${_paymentLabel(widget.offer.paymentMethod)}'),
              Text('Paquetes: ${widget.offer.packageCount}'),
              const Spacer(),
              FilledButton(
                onPressed: remaining == 0 ? null : widget.onAccept,
                child: const Text('Aceptar'),
              ),
              const SizedBox(height: 12),
              OutlinedButton(
                onPressed: widget.onReject,
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
