import 'package:shared_preferences/shared_preferences.dart';

class SelectedRouteStore {
  SelectedRouteStore({
    Map<String, int>? memory,
    this.readInt,
    this.writeInt,
    this.removeInt,
  }) : _memory = memory ?? <String, int>{};

  final Map<String, int> _memory;
  final Future<int?> Function(String key)? readInt;
  final Future<void> Function(String key, int value)? writeInt;
  final Future<void> Function(String key)? removeInt;

  static const keyPrefix = 'rider.selected_route.';

  static String jobKey(String jobId, String status) => '$jobId:$status';

  int peek(String jobKey) => _memory[jobKey] ?? 0;

  Future<int> load(String jobKey) async {
    if (_memory.containsKey(jobKey)) {
      return _memory[jobKey]!;
    }
    final stored = readInt != null
        ? await readInt!(prefKey(jobKey))
        : (await SharedPreferences.getInstance()).getInt(prefKey(jobKey));
    final value = stored ?? 0;
    _memory[jobKey] = value;
    return value;
  }

  Future<void> save(String jobKey, int index) async {
    _memory[jobKey] = index;
    if (writeInt != null) {
      await writeInt!(prefKey(jobKey), index);
      return;
    }
    await (await SharedPreferences.getInstance()).setInt(prefKey(jobKey), index);
  }

  Future<void> clear(String jobKey) async {
    _memory.remove(jobKey);
    if (removeInt != null) {
      await removeInt!(prefKey(jobKey));
      return;
    }
    await (await SharedPreferences.getInstance()).remove(prefKey(jobKey));
  }

  static String prefKey(String jobKey) => '$keyPrefix$jobKey';
}

int clampSelectedRoute(int index, int routeCount) {
  if (routeCount <= 0) {
    return 0;
  }
  if (index < 0) {
    return 0;
  }
  if (index >= routeCount) {
    return routeCount - 1;
  }
  return index;
}

final selectedRouteStore = SelectedRouteStore();
