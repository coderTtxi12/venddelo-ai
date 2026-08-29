class DropoffLocationParts {
  const DropoffLocationParts({required this.address, required this.references});

  final String address;
  final String references;
}

class JobLocationNotice {
  const JobLocationNotice({required this.label, required this.value});

  final String label;
  final String value;

  @override
  bool operator ==(Object other) {
    return other is JobLocationNotice &&
        other.label == label &&
        other.value == value;
  }

  @override
  int get hashCode => Object.hash(label, value);
}

const _checkoutReferencesMarker = '\nReferencias:';
const _dispatchReferencesSeparator = ' · ';

DropoffLocationParts splitDropoffLocation(String raw) {
  final text = raw.trim();
  final checkoutIndex = text.indexOf(_checkoutReferencesMarker);
  if (checkoutIndex != -1) {
    return DropoffLocationParts(
      address: text.substring(0, checkoutIndex).trim(),
      references: text
          .substring(checkoutIndex + _checkoutReferencesMarker.length)
          .trim(),
    );
  }
  final separatorIndex = text.lastIndexOf(_dispatchReferencesSeparator);
  if (separatorIndex != -1) {
    return DropoffLocationParts(
      address: text.substring(0, separatorIndex).trim(),
      references: text
          .substring(separatorIndex + _dispatchReferencesSeparator.length)
          .trim(),
    );
  }
  return DropoffLocationParts(address: text, references: '');
}

List<JobLocationNotice> jobLocationNotices({
  required String dropoffAddress,
  required String? notes,
  required bool showDropoffReferences,
}) {
  final parts = splitDropoffLocation(dropoffAddress);
  final notices = <JobLocationNotice>[];
  if (showDropoffReferences && parts.references.isNotEmpty) {
    notices.add(
      JobLocationNotice(label: 'Referencias', value: parts.references),
    );
  }
  final trimmedNotes = notes?.trim() ?? '';
  if (trimmedNotes.isNotEmpty) {
    notices.add(
      JobLocationNotice(label: 'Notas del negocio', value: trimmedNotes),
    );
  }
  return notices;
}
