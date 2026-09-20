const jobOverlayPrefKey = 'job_overlay_enabled';

class JobOverlayDecision {
  const JobOverlayDecision({
    required this.enabledInSettings,
    required this.hasActiveJob,
    required this.appInBackground,
    required this.overlayPermissionGranted,
    required this.dismissedThisJob,
  });

  final bool enabledInSettings;
  final bool hasActiveJob;
  final bool appInBackground;
  final bool overlayPermissionGranted;
  final bool dismissedThisJob;

  JobOverlayDecision copyWith({
    bool? enabledInSettings,
    bool? hasActiveJob,
    bool? appInBackground,
    bool? overlayPermissionGranted,
    bool? dismissedThisJob,
  }) {
    return JobOverlayDecision(
      enabledInSettings: enabledInSettings ?? this.enabledInSettings,
      hasActiveJob: hasActiveJob ?? this.hasActiveJob,
      appInBackground: appInBackground ?? this.appInBackground,
      overlayPermissionGranted:
          overlayPermissionGranted ?? this.overlayPermissionGranted,
      dismissedThisJob: dismissedThisJob ?? this.dismissedThisJob,
    );
  }
}

bool isActiveDeliveryJob(String status) {
  return status == 'assigned' ||
      status == 'picked_up' ||
      status == 'in_transit';
}

bool jobOverlayEnabledFromStored(bool? stored) => stored ?? true;

String jobOverlaySignature(Iterable<String> ids) {
  final sorted = ids.toList()..sort();
  return sorted.join(',');
}

bool isOverlayDismissed({
  required String? dismissedSignature,
  required String currentSignature,
}) {
  return dismissedSignature != null && dismissedSignature == currentSignature;
}

bool shouldShowJobOverlay(JobOverlayDecision decision) {
  return decision.enabledInSettings &&
      decision.hasActiveJob &&
      decision.appInBackground &&
      decision.overlayPermissionGranted &&
      !decision.dismissedThisJob;
}
