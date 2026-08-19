enum HistoryPeriod { today, week, month, custom }

class HistoryDateRange {
  const HistoryDateRange({required this.start, required this.end});
  final DateTime start;
  final DateTime end;
}

DateTime _dateOnly(DateTime value) => DateTime(value.year, value.month, value.day);

HistoryDateRange historyDateRange(
  HistoryPeriod period, {
  required DateTime now,
  DateTime? customStart,
  DateTime? customEnd,
}) {
  final day = _dateOnly(now);
  switch (period) {
    case HistoryPeriod.today:
      return HistoryDateRange(start: day, end: day);
    case HistoryPeriod.week:
      final monday = day.subtract(Duration(days: day.weekday - DateTime.monday));
      final sunday = monday.add(const Duration(days: 6));
      return HistoryDateRange(start: monday, end: sunday);
    case HistoryPeriod.month:
      final start = DateTime(day.year, day.month, 1);
      final end = DateTime(day.year, day.month + 1, 0);
      return HistoryDateRange(start: start, end: end);
    case HistoryPeriod.custom:
      return HistoryDateRange(
        start: _dateOnly(customStart ?? day),
        end: _dateOnly(customEnd ?? day),
      );
  }
}

String formatHistoryQueryDate(DateTime value) {
  final y = value.year.toString().padLeft(4, '0');
  final m = value.month.toString().padLeft(2, '0');
  final d = value.day.toString().padLeft(2, '0');
  return '$y-$m-$d';
}
