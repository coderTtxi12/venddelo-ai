export function riderApkReadOnlyHint(): string {
  return 'Solo lectura. Pide al propietario que suba o cambie el APK.';
}

export function riderApkEmptyHint(): string {
  return 'Aún no hay un APK publicado. Los riders no tendrán enlace de descarga.';
}

export function riderApkOwnerHint(): string {
  return 'Arrastra el APK, elige un archivo o pega una URL https. Ese enlace es el que recibe la app si hay que forzar actualización.';
}

export function riderApkOwnerHintTouch(): string {
  return 'Elige el APK o pega una URL https. Ese enlace es el que recibe la app si hay que forzar actualización.';
}

export function riderApkDropIdleHint(): string {
  return 'Arrastra el APK aquí o elige un archivo';
}

export function riderApkDropIdleHintTouch(): string {
  return 'Toca para elegir el APK';
}

export function riderApkDropActiveHint(): string {
  return 'Suelta para subir el APK';
}

export function riderApkDropDetailHint(): string {
  return 'Haz clic o suelta un archivo .apk · Máximo 80 MB';
}

export function riderApkDropDetailHintTouch(): string {
  return 'Elige un archivo .apk · Máximo 80 MB';
}

export function riderApkDropRejectHint(): string {
  return 'Solo se aceptan archivos .apk.';
}

export function riderApkUploadProgressPercent(loaded: number, total: number): number {
  if (total <= 0) return 0;
  return Math.max(0, Math.min(100, Math.round((loaded / total) * 100)));
}

export function riderApkUploadProgressLabel(loaded: number, total: number): string {
  if (total <= 0) return 'Subiendo…';
  const percent = riderApkUploadProgressPercent(loaded, total);
  return `${formatMegaBytes(loaded)} de ${formatMegaBytes(total)} · ${percent}%`;
}

function formatMegaBytes(bytes: number): string {
  const mega = bytes / (1024 * 1024);
  const digits = mega >= 10 ? 0 : 1;
  return `${mega.toFixed(digits)} MB`;
}

export type RiderApkFileLike = {
  name: string;
  type?: string;
};

export function isRiderApkFile(file: RiderApkFileLike): boolean {
  const name = file.name.trim().toLowerCase();
  const type = (file.type ?? '').trim().toLowerCase();
  return name.endsWith('.apk') || type === 'application/vnd.android.package-archive';
}

export function pickDroppedApkFile<T extends RiderApkFileLike>(
  files: ArrayLike<T> | Iterable<T>,
): T | null {
  for (const file of Array.from(files as ArrayLike<T>)) {
    if (isRiderApkFile(file)) return file;
  }
  return null;
}

