/// Keep in sync with pubspec.yaml `version: x.y.z+build`.
const riderAppVersion = '1.0.2';
const riderAppBuildNumber = 3;

Map<String, Object> riderClientFields() {
  return {
    'app_version': riderAppVersion,
    'app_build_number': riderAppBuildNumber,
  };
}

Map<String, Object> riderLocationBody({
  required double latitude,
  required double longitude,
}) {
  return {
    'latitude': latitude,
    'longitude': longitude,
    ...riderClientFields(),
  };
}

Map<String, Object> riderOnlineBody({required bool isOnline}) {
  return {
    'is_online': isOnline,
    ...riderClientFields(),
  };
}

Map<String, String> riderMeQuery() {
  return {
    'app_version': riderAppVersion,
    'app_build_number': '$riderAppBuildNumber',
  };
}
