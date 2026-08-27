import 'dart:io';

import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/app_build.dart';

void main() {
  test('riderClientFields reports Essentials-era build 2', () {
    expect(riderClientFields(), {
      'app_version': '1.0.1',
      'app_build_number': 2,
    });
    expect(
      riderLocationBody(latitude: 19.43, longitude: -99.13),
      containsPair('app_build_number', 2),
    );
    expect(riderOnlineBody(isOnline: true)['app_version'], '1.0.1');
  });

  test('app_build constants match pubspec version', () {
    final pubspec = File('pubspec.yaml').readAsStringSync();
    expect(
      pubspec,
      contains('version: $riderAppVersion+$riderAppBuildNumber'),
    );
  });
}
