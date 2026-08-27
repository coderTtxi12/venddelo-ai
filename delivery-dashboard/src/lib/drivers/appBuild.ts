/** Keep in sync with backend `RIDER_MIN_APP_BUILD` (default 2). */
export const RIDER_MIN_APP_BUILD = 2;

export function isCurrentRiderApp(buildNumber: number | null | undefined): boolean {
  return buildNumber != null && buildNumber >= RIDER_MIN_APP_BUILD;
}

export function riderAppTagLabel(
  appVersion: string | null | undefined,
  appBuildNumber: number | null | undefined,
): string {
  if (appBuildNumber == null) return 'App antigua';
  return `App ${appVersion ?? appBuildNumber}`;
}

export function riderAppTagTitle(
  appVersion: string | null | undefined,
  appBuildNumber: number | null | undefined,
): string {
  if (appBuildNumber == null) {
    return 'Sin versión reportada: APK anterior, no recibe pedidos nuevos';
  }
  if (!isCurrentRiderApp(appBuildNumber)) {
    return `Build ${appBuildNumber}${appVersion ? ` (${appVersion})` : ''}: APK anterior, no recibe pedidos nuevos`;
  }
  return `Build ${appBuildNumber}`;
}
