import 'config.dart';

const _namedMotorcycleColors = <String, String>{
  'rojo': '#DC2626',
  'azul': '#1D4ED8',
  'negro': '#111827',
  'blanco': '#F8FAFC',
  'gris': '#64748B',
  'verde': '#15803D',
  'amarillo': '#CA8A04',
  'naranja': '#EA580C',
  'plata': '#94A3B8',
  'cafe': '#92400E',
  'café': '#92400E',
  'morado': '#7C3AED',
};

final _hexColor = RegExp(r'^#[0-9a-fA-F]{6}$');

String motorcycleColorHex(String value, {String fallback = '#2563EB'}) {
  final trimmed = value.trim();
  if (_hexColor.hasMatch(trimmed)) {
    return trimmed.toUpperCase();
  }
  return _namedMotorcycleColors[trimmed.toLowerCase()] ?? fallback;
}

String? riderPhotoUrl(String? path) {
  if (path == null) return null;
  final trimmed = path.trim();
  if (trimmed.isEmpty) return null;
  if (trimmed.startsWith('http://') ||
      trimmed.startsWith('https://') ||
      trimmed.startsWith('blob:') ||
      trimmed.startsWith('data:')) {
    return trimmed;
  }
  final base = AppConfig.supabaseUrl.replaceAll(RegExp(r'/+$'), '');
  if (base.isEmpty) return null;
  final normalized = trimmed.replaceFirst(RegExp(r'^/+'), '');
  return '$base/storage/v1/object/public/assets/$normalized';
}

String vehicleTypeLabel([String type = 'moto']) {
  return type == 'moto' ? 'Moto' : type;
}
