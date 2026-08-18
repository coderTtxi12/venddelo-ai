import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/maps/selected_route_store.dart';

void main() {
  test('clampSelectedRoute keeps a valid alternative index', () {
    expect(clampSelectedRoute(2, 3), 2);
    expect(clampSelectedRoute(0, 3), 0);
    expect(clampSelectedRoute(9, 3), 2);
    expect(clampSelectedRoute(-1, 3), 0);
    expect(clampSelectedRoute(1, 0), 0);
  });

  test('store remembers the chosen route across load after save', () async {
    final persisted = <String, int>{};
    final store = SelectedRouteStore(
      readInt: (key) async => persisted[key],
      writeInt: (key, value) async => persisted[key] = value,
    );
    final jobKey = SelectedRouteStore.jobKey('job-1', 'assigned');

    await store.save(jobKey, 2);
    expect(store.peek(jobKey), 2);

    final restored = SelectedRouteStore(
      readInt: (key) async => persisted[key],
      writeInt: (key, value) async => persisted[key] = value,
    );
    expect(await restored.load(jobKey), 2);
    expect(restored.peek(jobKey), 2);
  });
}
