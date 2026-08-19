import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/history_period.dart';

void main() {
  final now = DateTime(2026, 8, 18, 15, 30); // Tuesday

  test('today range is that calendar day', () {
    final range = historyDateRange(HistoryPeriod.today, now: now);
    expect(range.start, DateTime(2026, 8, 18));
    expect(range.end, DateTime(2026, 8, 18));
  });

  test('week range is Monday through Sunday containing now', () {
    final range = historyDateRange(HistoryPeriod.week, now: now);
    expect(range.start, DateTime(2026, 8, 17));
    expect(range.end, DateTime(2026, 8, 23));
  });

  test('month range is first through last day of month', () {
    final range = historyDateRange(HistoryPeriod.month, now: now);
    expect(range.start, DateTime(2026, 8, 1));
    expect(range.end, DateTime(2026, 8, 31));
  });

  test('custom uses inclusive start and end dates', () {
    final range = historyDateRange(
      HistoryPeriod.custom,
      now: now,
      customStart: DateTime(2026, 8, 1),
      customEnd: DateTime(2026, 8, 10),
    );
    expect(range.start, DateTime(2026, 8, 1));
    expect(range.end, DateTime(2026, 8, 10));
  });
}
