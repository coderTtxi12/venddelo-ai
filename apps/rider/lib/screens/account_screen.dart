import 'dart:async';

import 'package:flutter/material.dart';

import '../formatters.dart';
import '../friendly_error.dart';
import '../history_copy.dart';
import '../history_period.dart';
import '../models.dart';
import '../rider_controller.dart';
import '../theme/app_colors.dart';
import '../theme/app_theme.dart';
import '../widgets/rider_widgets.dart';

class AccountScreen extends StatefulWidget {
  const AccountScreen({super.key, required this.controller});

  final RiderController controller;

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
        _customStart = DateTime(
          picked.start.year,
          picked.start.month,
          picked.start.day,
        );
        _customEnd = DateTime(
          picked.end.year,
          picked.end.month,
          picked.end.day,
        );
      });
      await _load();
      return;
    }
    setState(() => _period = period);
    await _load();
  }

  void _openDetail(RiderHistoryItem item) {
    showModalBottomSheet<void>(
      context: context,
      showDragHandle: true,
      isScrollControlled: true,
      backgroundColor: AppColors.surface,
      barrierColor: const Color(0x99000000),
      shape: const RoundedRectangleBorder(
        borderRadius: BorderRadius.vertical(
          top: Radius.circular(AppTheme.cardRadius),
        ),
      ),
      builder: (context) => _HistoryDetailSheet(item: item),
    );
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: widget.controller,
      builder: (context, _) {
        final profile = widget.controller.profile;
        final page = _page;
        final empty = !_loading && _error == null && _items.isEmpty;
        final showRetry = _error != null;
        final showSkeleton = _loading && _items.isEmpty && _error == null;
        final showItems = _items.isNotEmpty && _error == null;
        final bodyCount = showRetry || empty || showSkeleton
            ? 1
            : (showItems ? _items.length : 0);
        const headerCount = 1;
        final footerCount = _loadingMore ? 1 : 0;
        final itemCount = headerCount + bodyCount + footerCount;

        return Scaffold(
          backgroundColor: AppColors.background,
          appBar: AppBar(
            title: const Text('Historial y ganancias'),
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
                  return _HistoryHeader(
                    earningsCents: page?.earningsCents ?? 0,
                    deliveredCount: page?.deliveredCount ?? 0,
                    cancelledCount: page?.cancelledCount ?? 0,
                    availableCents:
                        page?.creditAvailableCents ??
                        profile?.creditAvailableCents ??
                        0,
                    heldCents:
                        page?.creditHeldCents ?? profile?.creditHeldCents ?? 0,
                    limitCents: page?.creditLimitCents ?? 0,
                    holds: page?.activeHolds ?? const [],
                    period: _period,
                    customStart: _customStart,
                    customEnd: _customEnd,
                    metricsLoading: _loading && page == null,
                    onSelectPeriod: _selectPeriod,
                  );
                }
                if (_loadingMore && index == itemCount - 1) {
                  return const Padding(
                    padding: EdgeInsets.only(top: 16, bottom: 8),
                    child: Center(
                      child: SizedBox(
                        width: 22,
                        height: 22,
                        child: CircularProgressIndicator(strokeWidth: 2.4),
                      ),
                    ),
                  );
                }
                if (showRetry) {
                  return Padding(
                    padding: const EdgeInsets.only(top: 16),
                    child: _HistoryErrorState(
                      message: _error!,
                      onRetry: () => unawaited(_load()),
                    ),
                  );
                }
                if (showSkeleton) {
                  return const Padding(
                    padding: EdgeInsets.only(top: 8),
                    child: _HistoryListSkeleton(),
                  );
                }
                if (empty) {
                  return const Padding(
                    padding: EdgeInsets.only(top: 12),
                    child: _HistoryEmptyState(),
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
                  padding: EdgeInsets.only(top: index == 1 ? 0 : 10),
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

class _HistoryHeader extends StatelessWidget {
  const _HistoryHeader({
    required this.earningsCents,
    required this.deliveredCount,
    required this.cancelledCount,
    required this.availableCents,
    required this.heldCents,
    required this.limitCents,
    required this.holds,
    required this.period,
    required this.customStart,
    required this.customEnd,
    required this.metricsLoading,
    required this.onSelectPeriod,
  });

  final int earningsCents;
  final int deliveredCount;
  final int cancelledCount;
  final int availableCents;
  final int heldCents;
  final int limitCents;
  final List<RiderHistoryHold> holds;
  final HistoryPeriod period;
  final DateTime? customStart;
  final DateTime? customEnd;
  final bool metricsLoading;
  final Future<void> Function(HistoryPeriod period) onSelectPeriod;

  @override
  Widget build(BuildContext context) {
    final rangeLabel =
        period == HistoryPeriod.custom &&
            customStart != null &&
            customEnd != null
        ? '${formatDayMonth(customStart!)} – ${formatDayMonth(customEnd!)}'
        : historyPeriodTitle(period);

    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        _EarningsHero(
          earningsCents: earningsCents,
          rangeLabel: rangeLabel,
          summary: historyDeliverySummary(
            delivered: deliveredCount,
            cancelled: cancelledCount,
          ),
          loading: metricsLoading,
        ),
        const SizedBox(height: 12),
        _CreditCard(
          availableCents: availableCents,
          heldCents: heldCents,
          limitCents: limitCents,
          holds: holds,
        ),
        const SizedBox(height: 20),
        Semantics(
          label: 'Periodo del historial',
          child: SingleChildScrollView(
            scrollDirection: Axis.horizontal,
            child: Row(
              children: [
                _PeriodChip(
                  label: 'Hoy',
                  selected: period == HistoryPeriod.today,
                  onTap: () => unawaited(onSelectPeriod(HistoryPeriod.today)),
                ),
                const SizedBox(width: 8),
                _PeriodChip(
                  label: 'Semana',
                  selected: period == HistoryPeriod.week,
                  onTap: () => unawaited(onSelectPeriod(HistoryPeriod.week)),
                ),
                const SizedBox(width: 8),
                _PeriodChip(
                  label: 'Mes',
                  selected: period == HistoryPeriod.month,
                  onTap: () => unawaited(onSelectPeriod(HistoryPeriod.month)),
                ),
                const SizedBox(width: 8),
                _PeriodChip(
                  label: period == HistoryPeriod.custom ? rangeLabel : 'Rango',
                  selected: period == HistoryPeriod.custom,
                  onTap: () => unawaited(onSelectPeriod(HistoryPeriod.custom)),
                ),
              ],
            ),
          ),
        ),
        const SizedBox(height: 18),
        Text(
          'Entregas',
          style: Theme.of(context).textTheme.titleSmall
              ?.copyWith(fontWeight: FontWeight.w800),
        ),
        const SizedBox(height: 10),
      ],
    );
  }
}

class _EarningsHero extends StatelessWidget {
  const _EarningsHero({
    required this.earningsCents,
    required this.rangeLabel,
    required this.summary,
    required this.loading,
  });

  final int earningsCents;
  final String rangeLabel;
  final String summary;
  final bool loading;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(18, 18, 18, 18),
      decoration: BoxDecoration(
        color: AppColors.primary,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Ganancias · $rangeLabel',
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: Colors.white.withValues(alpha: 0.78),
              fontWeight: FontWeight.w600,
            ),
          ),
          const SizedBox(height: 8),
          if (loading)
            const _SkeletonLine(width: 148, height: 36, dark: true)
          else
            Text(
              formatMoneyCents(earningsCents),
              style: Theme.of(context).textTheme.headlineMedium?.copyWith(
                color: Colors.white,
                fontWeight: FontWeight.w800,
                fontFeatures: const [FontFeature.tabularFigures()],
              ),
            ),
          const SizedBox(height: 8),
          Text(
            summary,
            style: Theme.of(context).textTheme.bodyMedium?.copyWith(
              color: Colors.white.withValues(alpha: 0.78),
              fontWeight: FontWeight.w600,
            ),
          ),
        ],
      ),
    );
  }
}

class _CreditCard extends StatelessWidget {
  const _CreditCard({
    required this.availableCents,
    required this.heldCents,
    required this.limitCents,
    required this.holds,
  });

  final int availableCents;
  final int heldCents;
  final int limitCents;
  final List<RiderHistoryHold> holds;

  @override
  Widget build(BuildContext context) {
    final usedRatio = limitCents <= 0
        ? 0.0
        : (heldCents / limitCents).clamp(0.0, 1.0).toDouble();

    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(16, 16, 16, 14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Text(
            'Crédito',
            style: Theme.of(context).textTheme.bodySmall?.copyWith(
              fontWeight: FontWeight.w700,
              color: AppColors.textMuted,
              letterSpacing: 0.3,
            ),
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              Expanded(
                child: _CreditStat(
                  label: 'Disponible',
                  value: formatMoneyCents(availableCents),
                  emphasis: true,
                ),
              ),
              Expanded(
                child: _CreditStat(
                  label: 'En hold',
                  value: formatMoneyCents(heldCents),
                ),
              ),
              if (limitCents > 0)
                Expanded(
                  child: _CreditStat(
                    label: 'Límite',
                    value: formatMoneyCents(limitCents),
                  ),
                ),
            ],
          ),
          if (limitCents > 0) ...[
            const SizedBox(height: 12),
            ClipRRect(
              borderRadius: BorderRadius.circular(999),
              child: LinearProgressIndicator(
                value: usedRatio,
                minHeight: 8,
                backgroundColor: AppColors.border,
                color: heldCents > 0 ? AppColors.warningBright : AppColors.cta,
              ),
            ),
          ],
          if (holds.isNotEmpty) ...[
            const SizedBox(height: 14),
            Text(
              'Holds activos',
              style: Theme.of(context).textTheme.titleSmall
                  ?.copyWith(fontWeight: FontWeight.w700),
            ),
            const SizedBox(height: 8),
            for (final hold in holds)
              Padding(
                padding: const EdgeInsets.only(bottom: 8),
                child: Row(
                  children: [
                    Container(
                      width: 36,
                      height: 36,
                      decoration: BoxDecoration(
                        color: AppColors.warning.withValues(alpha: 0.12),
                        borderRadius: BorderRadius.circular(10),
                      ),
                      child: const Icon(
                        Icons.pause_rounded,
                        color: AppColors.warning,
                        size: 20,
                      ),
                    ),
                    const SizedBox(width: 10),
                    Expanded(
                      child: Column(
                        crossAxisAlignment: CrossAxisAlignment.start,
                        children: [
                          Text(
                            hold.restaurantName,
                            maxLines: 1,
                            overflow: TextOverflow.ellipsis,
                            style: Theme.of(context).textTheme.bodyLarge
                                ?.copyWith(fontWeight: FontWeight.w700),
                          ),
                          if (formatShortId(hold.shortId).isNotEmpty)
                            Text(
                              formatShortId(hold.shortId),
                              style: Theme.of(context).textTheme.bodySmall,
                            ),
                        ],
                      ),
                    ),
                    Text(
                      formatMoneyCents(hold.amountCents),
                      style: Theme.of(context).textTheme.titleSmall?.copyWith(
                        fontWeight: FontWeight.w800,
                        fontFeatures: const [FontFeature.tabularFigures()],
                      ),
                    ),
                  ],
                ),
              ),
          ],
        ],
      ),
    );
  }
}

class _CreditStat extends StatelessWidget {
  const _CreditStat({
    required this.label,
    required this.value,
    this.emphasis = false,
  });

  final String label;
  final String value;
  final bool emphasis;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(
          label,
          style: Theme.of(context).textTheme.bodySmall?.copyWith(
            color: AppColors.textSecondary,
            fontWeight: FontWeight.w600,
          ),
        ),
        const SizedBox(height: 4),
        FittedBox(
          fit: BoxFit.scaleDown,
          alignment: Alignment.centerLeft,
          child: Text(
            value,
            style: Theme.of(context).textTheme.titleSmall?.copyWith(
              fontWeight: FontWeight.w800,
              color: emphasis ? AppColors.cta : AppColors.textPrimary,
              fontFeatures: const [FontFeature.tabularFigures()],
            ),
          ),
        ),
      ],
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
            constraints: const BoxConstraints(minHeight: 48, minWidth: 56),
            padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 10),
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
    final statusColor = delivered ? AppColors.success : AppColors.textMuted;
    final icon = delivered ? Icons.check_rounded : Icons.close_rounded;

    return Semantics(
      button: true,
      label:
          '${item.restaurantName}. ${historyStatusLabel(item.status)}. ${formatMoneyCents(item.quotedFeeCents)}',
      child: Material(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        child: InkWell(
          onTap: onTap,
          borderRadius: BorderRadius.circular(16),
          child: Container(
            constraints: const BoxConstraints(minHeight: 72),
            padding: const EdgeInsets.fromLTRB(12, 12, 8, 12),
            decoration: BoxDecoration(
              borderRadius: BorderRadius.circular(16),
              border: Border.all(color: AppColors.border),
            ),
            child: Row(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Container(
                  width: 44,
                  height: 44,
                  decoration: BoxDecoration(
                    color: statusColor.withValues(alpha: 0.12),
                    borderRadius: BorderRadius.circular(14),
                  ),
                  child: Icon(icon, color: statusColor, size: 22),
                ),
                const SizedBox(width: 12),
                Expanded(
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Row(
                        children: [
                          if (shortId.isNotEmpty) ...[
                            Text(
                              shortId,
                              style: Theme.of(context).textTheme.labelLarge
                                  ?.copyWith(fontWeight: FontWeight.w800),
                            ),
                            const SizedBox(width: 8),
                          ],
                          Expanded(
                            child: Text(
                              formatClosedAtLocal(item.closedAt),
                              textAlign: TextAlign.right,
                              style: Theme.of(context).textTheme.labelMedium
                                  ?.copyWith(color: AppColors.textMuted),
                            ),
                          ),
                        ],
                      ),
                      const SizedBox(height: 4),
                      Text(
                        item.restaurantName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleSmall
                            ?.copyWith(fontWeight: FontWeight.w700),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        item.dropoffAddress,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.bodyMedium
                            ?.copyWith(color: AppColors.textSecondary),
                      ),
                      const SizedBox(height: 10),
                      Wrap(
                        spacing: 8,
                        runSpacing: 6,
                        crossAxisAlignment: WrapCrossAlignment.center,
                        children: [
                          Text(
                            formatMoneyCents(item.quotedFeeCents),
                            style: Theme.of(context).textTheme.titleSmall
                                ?.copyWith(
                                  fontWeight: FontWeight.w800,
                                  fontFeatures: const [
                                    FontFeature.tabularFigures(),
                                  ],
                                ),
                          ),
                          _StatusPill(
                            label: historyStatusLabel(item.status),
                            color: statusColor,
                          ),
                          if (item.paymentMethod.isNotEmpty)
                            _StatusPill(
                              label: paymentLabel(item.paymentMethod),
                              color: AppColors.textSecondary,
                            ),
                        ],
                      ),
                    ],
                  ),
                ),
                const Padding(
                  padding: EdgeInsets.only(top: 10),
                  child: Icon(
                    Icons.chevron_right_rounded,
                    color: AppColors.textMuted,
                    size: 22,
                  ),
                ),
              ],
            ),
          ),
        ),
      ),
    );
  }
}

class _StatusPill extends StatelessWidget {
  const _StatusPill({required this.label, required this.color});

  final String label;
  final Color color;

  @override
  Widget build(BuildContext context) {
    return Container(
      padding: const EdgeInsets.symmetric(horizontal: 8, vertical: 3),
      decoration: BoxDecoration(
        color: color.withValues(alpha: 0.12),
        borderRadius: BorderRadius.circular(999),
      ),
      child: Text(
        label,
        style: Theme.of(context).textTheme.labelMedium
            ?.copyWith(fontWeight: FontWeight.w700, color: color),
      ),
    );
  }
}

class _HistoryEmptyState extends StatelessWidget {
  const _HistoryEmptyState();

  @override
  Widget build(BuildContext context) {
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.fromLTRB(20, 28, 20, 28),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(AppTheme.cardRadius),
        border: Border.all(color: AppColors.border),
      ),
      child: Column(
        children: [
          Container(
            width: 56,
            height: 56,
            decoration: BoxDecoration(
              color: AppColors.cta.withValues(alpha: 0.1),
              borderRadius: BorderRadius.circular(16),
            ),
            child: const Icon(
              Icons.receipt_long_rounded,
              color: AppColors.cta,
              size: 28,
            ),
          ),
          const SizedBox(height: 14),
          Text(
            historyEmptyMessage,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.titleSmall
                ?.copyWith(fontWeight: FontWeight.w700),
          ),
          const SizedBox(height: 6),
          Text(
            historyEmptyHint,
            textAlign: TextAlign.center,
            style: Theme.of(context).textTheme.bodyMedium,
          ),
        ],
      ),
    );
  }
}

class _HistoryErrorState extends StatelessWidget {
  const _HistoryErrorState({required this.message, required this.onRetry});

  final String message;
  final VoidCallback onRetry;

  @override
  Widget build(BuildContext context) {
    return Column(
      children: [
        RiderErrorBanner(message: message),
        const SizedBox(height: 12),
        SizedBox(
          width: double.infinity,
          child: OutlinedButton(
            onPressed: onRetry,
            child: const Text('Reintentar'),
          ),
        ),
      ],
    );
  }
}

class _HistoryListSkeleton extends StatelessWidget {
  const _HistoryListSkeleton();

  @override
  Widget build(BuildContext context) {
    return Column(
      children: const [
        _SkeletonCard(),
        SizedBox(height: 10),
        _SkeletonCard(),
        SizedBox(height: 10),
        _SkeletonCard(),
      ],
    );
  }
}

class _SkeletonCard extends StatelessWidget {
  const _SkeletonCard();

  @override
  Widget build(BuildContext context) {
    return Container(
      height: 92,
      padding: const EdgeInsets.all(14),
      decoration: BoxDecoration(
        color: AppColors.surface,
        borderRadius: BorderRadius.circular(16),
        border: Border.all(color: AppColors.border),
      ),
      child: const Row(
        children: [
          _SkeletonLine(width: 44, height: 44, rounded: 14),
          SizedBox(width: 12),
          Expanded(
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              mainAxisAlignment: MainAxisAlignment.center,
              children: [
                _SkeletonLine(width: 88, height: 12),
                SizedBox(height: 10),
                _SkeletonLine(width: 160, height: 14),
                SizedBox(height: 8),
                _SkeletonLine(width: 120, height: 12),
              ],
            ),
          ),
        ],
      ),
    );
  }
}

class _SkeletonLine extends StatelessWidget {
  const _SkeletonLine({
    required this.width,
    required this.height,
    this.rounded = 8,
    this.dark = false,
  });

  final double width;
  final double height;
  final double rounded;
  final bool dark;

  @override
  Widget build(BuildContext context) {
    return Container(
      width: width,
      height: height,
      decoration: BoxDecoration(
        color: dark ? Colors.white.withValues(alpha: 0.18) : AppColors.border,
        borderRadius: BorderRadius.circular(rounded),
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
    final delivered = item.status == 'delivered';
    final statusColor = delivered ? AppColors.success : AppColors.textMuted;
    final maxHeight = MediaQuery.sizeOf(context).height * 0.86;

    return SafeArea(
      child: ConstrainedBox(
        constraints: BoxConstraints(maxHeight: maxHeight),
        child: SingleChildScrollView(
          padding: const EdgeInsets.fromLTRB(20, 0, 20, 28),
          child: Column(
            mainAxisSize: MainAxisSize.min,
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Row(
                children: [
                  Expanded(
                    child: Text(
                      formatShortId(item.shortId).isEmpty
                          ? item.restaurantName
                          : '${formatShortId(item.shortId)} · ${item.restaurantName}',
                      style: Theme.of(context).textTheme.titleLarge
                          ?.copyWith(fontWeight: FontWeight.w800),
                    ),
                  ),
                ],
              ),
              const SizedBox(height: 8),
              Wrap(
                spacing: 8,
                runSpacing: 8,
                children: [
                  _StatusPill(
                    label: historyStatusLabel(item.status),
                    color: statusColor,
                  ),
                  if (item.paymentMethod.isNotEmpty)
                    _StatusPill(
                      label: paymentLabel(item.paymentMethod),
                      color: AppColors.textSecondary,
                    ),
                ],
              ),
              const SizedBox(height: 16),
              Container(
                width: double.infinity,
                padding: const EdgeInsets.fromLTRB(16, 14, 16, 14),
                decoration: BoxDecoration(
                  color: AppColors.background,
                  borderRadius: BorderRadius.circular(16),
                  border: Border.all(color: AppColors.border),
                ),
                child: Column(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Text(
                      'Envío',
                      style: Theme.of(context).textTheme.bodySmall?.copyWith(
                        fontWeight: FontWeight.w700,
                        color: AppColors.textMuted,
                      ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      formatMoneyCents(item.quotedFeeCents),
                      style: Theme.of(context).textTheme.headlineSmall
                          ?.copyWith(
                            fontWeight: FontWeight.w800,
                            fontFeatures: const [FontFeature.tabularFigures()],
                          ),
                    ),
                    const SizedBox(height: 4),
                    Text(
                      formatClosedAtLocal(item.closedAt),
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ],
                ),
              ),
              const SizedBox(height: 18),
              if (item.customerName != null &&
                  item.customerName!.trim().isNotEmpty)
                RiderMetaRow(label: 'Cliente', value: item.customerName!),
              if (phone != null && phone.isNotEmpty)
                RiderMetaRow(
                  label: 'Teléfono',
                  value: historyMaskedPhone(phone),
                ),
              RiderMetaRow(
                label: 'Entrega',
                value: historyMaskedDropoff(item.dropoffAddress),
              ),
              if (showsRiderCustomerCollect(
                item.paymentMethod,
                item.collectCents,
              ))
                RiderMetaRow(
                  label: 'Cobrar',
                  value: formatMoneyCents(
                    customerTotalCents(item.collectCents, item.quotedFeeCents),
                  ),
                ),
              if (item.cashDenominationCents != null)
                RiderMetaRow(
                  label: 'Billete',
                  value: formatMoneyCents(item.cashDenominationCents!),
                ),
              if (showsRiderCashCollect(
                    item.paymentMethod,
                    item.collectCents,
                  ) &&
                  item.collectCents > 0)
                RiderMetaRow(
                  label: 'Restaurante',
                  value: formatMoneyCents(item.collectCents),
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
      ),
    );
  }
}
