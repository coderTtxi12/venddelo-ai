import 'dart:async';

import 'package:flutter/material.dart';

import '../formatters.dart';
import '../friendly_error.dart';
import '../history_copy.dart';
import '../history_period.dart';
import '../maps/contact_links.dart';
import '../models.dart';
import '../rider_controller.dart';
import '../theme/app_colors.dart';
import '../widgets/rider_widgets.dart';

class AccountScreen extends StatefulWidget {
  const AccountScreen({
    super.key,
    required this.controller,
    required this.onSignOut,
  });

  final RiderController controller;
  final VoidCallback onSignOut;

  @override
  State<AccountScreen> createState() => _AccountScreenState();
}

class _AccountScreenState extends State<AccountScreen> {
  HistoryPeriod _period = HistoryPeriod.today;
  DateTime? _customStart;
  DateTime? _customEnd;
  RiderHistoryPage? _page;
  final List<RiderHistoryItem> _items = [];
  bool _loading = true;
  bool _loadingMore = false;
  String? _error;

  @override
  void initState() {
    super.initState();
    unawaited(_load());
  }

  HistoryDateRange get _range {
    return historyDateRange(
      _period,
      now: DateTime.now(),
      customStart: _customStart,
      customEnd: _customEnd,
    );
  }

  Future<void> _load({bool append = false}) async {
    if (append) {
      if (_loadingMore || !(_page?.hasMore ?? false)) return;
      setState(() => _loadingMore = true);
    } else {
      setState(() {
        _loading = true;
        _error = null;
      });
    }
    try {
      final range = _range;
      final page = await widget.controller.getHistory(
        start: formatHistoryQueryDate(range.start),
        end: formatHistoryQueryDate(range.end),
        offset: append ? _items.length : 0,
      );
      if (!mounted) return;
      setState(() {
        _page = page;
        if (append) {
          _items.addAll(page.items);
        } else {
          _items
            ..clear()
            ..addAll(page.items);
        }
        _loading = false;
        _loadingMore = false;
      });
    } catch (error) {
      if (!mounted) return;
      setState(() {
        _error = friendlyErrorMessage(error);
        _loading = false;
        _loadingMore = false;
      });
    }
  }

  Future<void> _selectPeriod(HistoryPeriod period) async {
    if (period == HistoryPeriod.custom) {
      final now = DateTime.now();
      final picked = await showDateRangePicker(
        context: context,
        firstDate: DateTime(now.year - 2),
        lastDate: DateTime(now.year, now.month, now.day),
        initialDateRange: DateTimeRange(
          start: _customStart ?? _range.start,
          end: _customEnd ?? _range.end,
        ),
        helpText: 'Rango',
        cancelText: 'Cancelar',
        confirmText: 'Aplicar',
      );
      if (picked == null) return;
      setState(() {
        _period = HistoryPeriod.custom;
        _customStart = DateTime(picked.start.year, picked.start.month, picked.start.day);
        _customEnd = DateTime(picked.end.year, picked.end.month, picked.end.day);
      });
      await _load();
      return;
    }
    setState(() => _period = period);
    await _load();
  }

  void _signOut() {
    Navigator.of(context).pop();
    widget.onSignOut();
  }

  void _openDetail(RiderHistoryItem item) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      builder: (context) => _HistoryDetailSheet(item: item),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        final profile = widget.controller.profile;
        final name = profile == null
            ? 'Cuenta'
            : '${profile.firstName} ${profile.lastName}'.trim();
        final page = _page;
        const headerCount = 1;
        final empty = !_loading && _error == null && _items.isEmpty;
        final itemCount = headerCount +
            (_error != null || empty || _loading && _items.isEmpty ? 1 : _items.length) +
            1;

        return Scaffold(
          backgroundColor: AppColors.background,
          appBar: AppBar(
            title: const Text('Cuenta'),
            backgroundColor: AppColors.surface,
            surfaceTintColor: Colors.transparent,
          ),
          body: RefreshIndicator(
            onRefresh: _load,
            color: AppColors.accent,
            child: ListView.builder(
              padding: const EdgeInsets.fromLTRB(20, 16, 20, 32),
              itemCount: itemCount,
              itemBuilder: (context, index) {
                if (index == 0) {
                  return _AccountHeader(
                    name: name,
                    isOnline: profile?.isOnline ?? false,
                    earningsCents: page?.earningsCents ?? 0,
                    availableCents: page?.creditAvailableCents ??
                        profile?.creditAvailableCents ??
                        0,
                    heldCents: page?.creditHeldCents ?? profile?.creditHeldCents ?? 0,
                    holds: page?.activeHolds ?? const [],
                    period: _period,
                    onSelectPeriod: _selectPeriod,
                  );
                }
                if (index == itemCount - 1) {
                  return Padding(
                    padding: const EdgeInsets.only(top: 28),
                    child: TextButton(
                      onPressed: _signOut,
                      style: TextButton.styleFrom(
                        foregroundColor: AppColors.danger,
                        minimumSize: const Size.fromHeight(48),
                      ),
                      child: const Text('Cerrar sesión'),
                    ),
                  );
                }
                if (_error != null) {
                  return Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: RiderErrorBanner(message: _error!),
                  );
                }
                if (_loading && _items.isEmpty) {
                  return const Padding(
                    padding: EdgeInsets.only(top: 32),
                    child: Center(child: CircularProgressIndicator()),
                  );
                }
                if (empty) {
                  return Padding(
                    padding: const EdgeInsets.only(top: 28),
                    child: Text(
                      historyEmptyMessage,
                      textAlign: TextAlign.center,
                      style: Theme.of(context).textTheme.bodyLarge?.copyWith(
                            color: AppColors.textSecondary,
                          ),
                    ),
                  );
                }
                final item = _items[index - headerCount];
                if (index - headerCount == _items.length - 1 &&
                    (page?.hasMore ?? false) &&
                    !_loadingMore) {
                  WidgetsBinding.instance.addPostFrameCallback((_) {
                    unawaited(_load(append: true));
                  });
                }
                return Padding(
                  padding: const EdgeInsets.only(top: 10),
                  child: _HistoryCard(
                    key: ValueKey(item.id),
                    item: item,
                    onTap: () => _openDetail(item),
                  ),
                );
              },
            ),
          ),
        );
      },
    );
  }
}

class _AccountHeader extends StatelessWidget {
  const _AccountHeader({
    required this.name,
    required this.isOnline,
    required this.earningsCents,
    required this.availableCents,
    required this.heldCents,
    required this.holds,
    required this.period,
    required this.onSelectPeriod,
  });

  final String name;
  final bool isOnline;
  final int earningsCents;
  final int availableCents;
  final int heldCents;
  final List<RiderHistoryHold> holds;
  final HistoryPeriod period;
  final Future<void> Function(HistoryPeriod period) onSelectPeriod;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          name,
          style: Theme.of(context).textTheme.headlineSmall?.copyWith(
                fontWeight: FontWeight.w800,
                color: AppColors.textPrimary,
              ),
        ),
        const SizedBox(height: 8),
        Container(
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
                  fontWeight: FontWeight.w700,
                  color: isOnline ? AppColors.success : AppColors.textMuted,
                ),
          ),
        ),
        const SizedBox(height: 20),
        Row(
          children: [
            Expanded(
              child: _MetricTile(label: 'Ganancias', value: formatMoneyCents(earningsCents)),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _MetricTile(
                label: 'Disponible',
                value: formatMoneyCents(availableCents),
              ),
            ),
            const SizedBox(width: 8),
            Expanded(
              child: _MetricTile(label: 'En hold', value: formatMoneyCents(heldCents)),
            ),
          ],
        ),
        if (holds.isNotEmpty) ...[
          const SizedBox(height: 16),
          Text(
            'Holds activos',
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
                  fontWeight: FontWeight.w700,
                ),
          ),
          const SizedBox(height: 8),
          for (final hold in holds)
            Padding(
              padding: const EdgeInsets.only(bottom: 6),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      hold.restaurantName,
                      maxLines: 1,
                      overflow: TextOverflow.ellipsis,
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ),
                  Text(
                    formatMoneyCents(hold.amountCents),
                    style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                          fontWeight: FontWeight.w700,
                        ),
                  ),
                ],
              ),
            ),
        ],
        const SizedBox(height: 20),
        Semantics(
          label: 'Periodo del historial',
          child: Wrap(
            spacing: 8,
            runSpacing: 8,
            children: [
              _PeriodChip(
                label: 'Hoy',
                selected: period == HistoryPeriod.today,
                onTap: () => unawaited(onSelectPeriod(HistoryPeriod.today)),
              ),
              _PeriodChip(
                label: 'Semana',
                selected: period == HistoryPeriod.week,
                onTap: () => unawaited(onSelectPeriod(HistoryPeriod.week)),
              ),
              _PeriodChip(
                label: 'Mes',
                selected: period == HistoryPeriod.month,
                onTap: () => unawaited(onSelectPeriod(HistoryPeriod.month)),
              ),
              _PeriodChip(
                label: 'Rango',
                selected: period == HistoryPeriod.custom,
                onTap: () => unawaited(onSelectPeriod(HistoryPeriod.custom)),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class _MetricTile extends StatelessWidget {
  const _MetricTile({required this.label, required this.value});

  final String label;
  final String value;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.fromLTRB(12, 12, 12, 14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            label,
            style: Theme.of(context).textTheme.labelMedium?.copyWith(
                  color: AppColors.textSecondary,
                  fontWeight: FontWeight.w600,
                ),
          ),
          const SizedBox(height: 6),
          Text(
            value,
            style: Theme.of(context).textTheme.titleMedium?.copyWith(
                  fontWeight: FontWeight.w800,
                  fontFeatures: const [FontFeature.tabularFigures()],
                ),
          ),
        ],
      ),
    );
  }
}

class _PeriodChip extends StatelessWidget {
  const _PeriodChip({
    required this.label,
    required this.selected,
    required this.onTap,
  });

  final String label;
  final bool selected;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return Semantics(
      button: true,
      selected: selected,
      label: label,
      child: Material(
        color: selected ? AppColors.accent : AppColors.surface,
        borderRadius: BorderRadius.circular(999),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(999),
          child: Container(
            constraints: const BoxConstraints(minHeight: 40, minWidth: 48),
            padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 8),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(999),
              border: Border.all(
                color: selected ? AppColors.accent : AppColors.border,
              ),
            ),
            alignment: Alignment.center,
            child: Text(
              label,
              style: Theme.of(context).textTheme.labelLarge?.copyWith(
                    fontWeight: FontWeight.w700,
                    color: selected ? Colors.white : AppColors.textSecondary,
                  ),
            ),
          ),
        ),
      ),
    );
  }
}

class _HistoryCard extends StatelessWidget {
  const _HistoryCard({super.key, required this.item, required this.onTap});

  final RiderHistoryItem item;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    final delivered = item.status == 'delivered';
    final shortId = formatShortId(item.shortId);
    return Material(
      color: AppColors.surface,
      borderRadius: BorderRadius.circular(16),
      child: InkWell(
        onTap: onTap,
        borderRadius: BorderRadius.circular(16),
        child: Container(
          padding: const EdgeInsets.fromLTRB(14, 12, 14, 12),
          decoration: BoxDecoration(
            borderRadius: BorderRadius.circular(16),
            border: Border.all(color: AppColors.border),
          ),
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  if (shortId.isNotEmpty)
                    Text(
                      shortId,
                      style: Theme.of(context).textTheme.labelLarge?.copyWith(
                            fontWeight: FontWeight.w800,
                          ),
                    ),
                  const Spacer(),
                  Text(
                    formatClosedAtLocal(item.closedAt),
                    style: Theme.of(context).textTheme.labelMedium?.copyWith(
                          color: AppColors.textMuted,
                        ),
                  ),
                ],
              ),
              const SizedBox(height: 6),
              Text(
                item.restaurantName,
                style: Theme.of(context).textTheme.titleSmall?.copyWith(
                      fontWeight: FontWeight.w700,
                    ),
              ),
              const SizedBox(height: 2),
              Text(
                item.dropoffAddress,
                maxLines: 1,
                overflow: TextOverflow.ellipsis,
                style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                      color: AppColors.textSecondary,
                    ),
              ),
              const SizedBox(height: 10),
              Row(
                children: [
                  Text(
                    formatMoneyCents(item.quotedFeeCents),
                    style: Theme.of(context).textTheme.titleSmall?.copyWith(
                          fontWeight: FontWeight.w800,
                        ),
                  ),
                  const Spacer(),
                  Text(
                    historyStatusLabel(item.status),
                    style: Theme.of(context).textTheme.labelLarge?.copyWith(
                          fontWeight: FontWeight.w700,
                          color: delivered ? AppColors.success : AppColors.textMuted,
                        ),
                  ),
                ],
              ),
            ],
          ),
        ),
      ),
    );
  }
}

class _HistoryDetailSheet extends StatelessWidget {
  const _HistoryDetailSheet({required this.item});

  final RiderHistoryItem item;

  @override
  Widget build(BuildContext context) {
    final phone = item.customerPhone?.trim();
    return SafeArea(
      child: Padding(
        padding: const EdgeInsets.fromLTRB(20, 0, 20, 24),
        child: Column(
          mainAxisSize: MainAxisSize.min,
          crossAxisAlignment: CrossAxisAlignment.start,
          children: [
            Text(
              formatShortId(item.shortId).isEmpty
                  ? item.restaurantName
                  : '${formatShortId(item.shortId)} · ${item.restaurantName}',
              style: Theme.of(context).textTheme.titleLarge?.copyWith(
                    fontWeight: FontWeight.w800,
                  ),
            ),
            const SizedBox(height: 4),
            Text(
              historyStatusLabel(item.status),
              style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                    color: item.status == 'delivered'
                        ? AppColors.success
                        : AppColors.textMuted,
                    fontWeight: FontWeight.w700,
                  ),
            ),
            const SizedBox(height: 16),
            if (item.customerName != null && item.customerName!.trim().isNotEmpty)
              RiderMetaRow(label: 'Cliente', value: item.customerName!),
            if (phone != null && phone.isNotEmpty)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    SizedBox(
                      width: 110,
                      child: Text(
                        'Teléfono',
                        style: Theme.of(context).textTheme.bodyMedium?.copyWith(
                              fontWeight: FontWeight.w700,
                              color: AppColors.textMuted,
                            ),
                      ),
                    ),
                    Expanded(
                      child: Align(
                        alignment: Alignment.centerLeft,
                        child: TextButton(
                          onPressed: () => unawaited(openPhoneCall(phone)),
                          style: TextButton.styleFrom(
                            padding: EdgeInsets.zero,
                            minimumSize: const Size(48, 40),
                            alignment: Alignment.centerLeft,
                            foregroundColor: AppColors.accent,
                          ),
                          child: Text(phone),
                        ),
                      ),
                    ),
                  ],
                ),
              ),
            RiderMetaRow(label: 'Entrega', value: item.dropoffAddress),
            RiderMetaRow(label: 'Pago', value: paymentLabel(item.paymentMethod)),
            if (item.paymentMethod != 'transfer')
              RiderMetaRow(label: 'Cobrar', value: formatMoneyCents(item.collectCents)),
            if (item.cashDenominationCents != null)
              RiderMetaRow(
                label: 'Billete',
                value: formatMoneyCents(item.cashDenominationCents!),
              ),
            RiderMetaRow(
              label: 'Envío',
              value: formatMoneyCents(item.quotedFeeCents),
            ),
            RiderMetaRow(
              label: 'Paquetes',
              value:
                  '${packageCountLabel(item.packageCount)} · ${packageSizeLabel(item.packageSize)}',
            ),
            if (item.notes != null && item.notes!.trim().isNotEmpty)
              RiderMetaRow(label: 'Notas', value: item.notes!),
            if (item.creditHoldCents > 0)
              RiderMetaRow(
                label: 'Hold',
                value: formatMoneyCents(item.creditHoldCents),
              ),
          ],
        ),
      ),
    );
  }
}
