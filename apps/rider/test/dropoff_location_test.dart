import 'package:flutter_test/flutter_test.dart';
import 'package:mexy_rider/dropoff_location.dart';

void main() {
  test('splitDropoffLocation keeps a plain street', () {
    final parts = splitDropoffLocation('Calle Reforma 100');
    expect(parts.address, 'Calle Reforma 100');
    expect(parts.references, '');
  });

  test('splitDropoffLocation reads checkout referencias', () {
    final parts = splitDropoffLocation(
      'Calle Reforma 100\nReferencias: puerta azul',
    );
    expect(parts.address, 'Calle Reforma 100');
    expect(parts.references, 'puerta azul');
  });

  test('splitDropoffLocation reads dispatch middle-dot references', () {
    final parts = splitDropoffLocation(
      'Calle Reforma 100 · portón negro, 2o piso',
    );
    expect(parts.address, 'Calle Reforma 100');
    expect(parts.references, 'portón negro, 2o piso');
  });

  test('jobLocationNotices puts delivery references above business notes', () {
    final notices = jobLocationNotices(
      dropoffAddress: 'Calle 1 · timbre 4',
      notes: 'Sin salsa',
      showDropoffReferences: true,
    );
    expect(notices.map((item) => item.label).toList(), [
      'Referencias',
      'Notas del negocio',
    ]);
    expect(notices.map((item) => item.value).toList(), [
      'timbre 4',
      'Sin salsa',
    ]);
  });

  test('jobLocationNotices omits references when the dropoff has none', () {
    final notices = jobLocationNotices(
      dropoffAddress: 'Calle 1',
      notes: 'Sin salsa',
      showDropoffReferences: true,
    );
    expect(notices, [
      const JobLocationNotice(label: 'Notas del negocio', value: 'Sin salsa'),
    ]);
  });

  test(
    'jobLocationNotices keeps references when there are no business notes',
    () {
      final notices = jobLocationNotices(
        dropoffAddress: 'Calle 1 · casa verde',
        notes: '   ',
        showDropoffReferences: true,
      );
      expect(notices, [
        const JobLocationNotice(label: 'Referencias', value: 'casa verde'),
      ]);
    },
  );

  test('jobLocationNotices hides customer references while going to the restaurant', () {
    final notices = jobLocationNotices(
      dropoffAddress: 'Calle 1 · timbre 4',
      notes: 'Sin salsa',
      showDropoffReferences: false,
    );
    expect(notices, [
      const JobLocationNotice(label: 'Notas del negocio', value: 'Sin salsa'),
    ]);
  });
}
