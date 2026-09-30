import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../state/owner_store.dart';
import '../../theme/mexy_theme.dart';
import '../../widgets/mexy_widgets.dart';

class SettingsScreen extends StatefulWidget {
  const SettingsScreen({super.key});

  @override
  State<SettingsScreen> createState() => _SettingsScreenState();
}

class _SettingsScreenState extends State<SettingsScreen> {
  late final TextEditingController _name;
  late final TextEditingController _subdomain;
  late final TextEditingController _description;
  late final TextEditingController _whatsapp;
  late final TextEditingController _address;
  late final TextEditingController _invite;
  late bool _takeout;
  late bool _delivery;
  late PaymentChoices _payments;
  late List<DayHours> _hours;
  var _touched = false;
  String? _saveError;

  @override
  void initState() {
    super.initState();
    _name = TextEditingController();
    _subdomain = TextEditingController();
    _description = TextEditingController();
    _whatsapp = TextEditingController();
    _address = TextEditingController();
    _invite = TextEditingController();
    _takeout = true;
    _delivery = true;
    _payments = const PaymentChoices();
    _hours = const [];
  }

  var _loaded = false;
  var _closing = false;

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_loaded) return;
    final profile = OwnerScope.of(context).profile;
    _name.text = profile.name;
    _subdomain.text = profile.subdomain;
    _description.text = profile.description;
    _whatsapp.text = profile.whatsapp;
    _address.text = profile.address;
    _takeout = profile.takeoutEnabled;
    _delivery = profile.deliveryEnabled;
    _payments = profile.payments;
    _hours = profile.hours.map((day) => day.copyWith()).toList();
    _loaded = true;
    for (final controller in [_name, _subdomain, _description, _whatsapp, _address]) {
      controller.addListener(() {
        if (_closing || !mounted) return;
        setState(() => _saveError = null);
      });
    }
  }

  @override
  void dispose() {
    _closing = true;
    _name.dispose();
    _subdomain.dispose();
    _description.dispose();
    _whatsapp.dispose();
    _address.dispose();
    _invite.dispose();
    super.dispose();
  }

  bool get _dirty {
    if (!_loaded) return false;
    final profile = OwnerScope.of(context).profile;
    if (_name.text.trim() != profile.name) return true;
    if (_subdomain.text.trim() != profile.subdomain) return true;
    if (_description.text.trim() != profile.description) return true;
    if (_whatsapp.text.trim() != profile.whatsapp) return true;
    if (_address.text.trim() != profile.address) return true;
    if (_takeout != profile.takeoutEnabled || _delivery != profile.deliveryEnabled) {
      return true;
    }
    if (_payments.takeoutCash != profile.payments.takeoutCash ||
        _payments.takeoutTransfer != profile.payments.takeoutTransfer ||
        _payments.takeoutCard != profile.payments.takeoutCard ||
        _payments.deliveryCash != profile.payments.deliveryCash ||
        _payments.deliveryTransfer != profile.payments.deliveryTransfer ||
        _payments.deliveryCard != profile.payments.deliveryCard) {
      return true;
    }
    for (var i = 0; i < _hours.length; i++) {
      final next = _hours[i];
      final saved = profile.hours[i];
      if (next.open != saved.open ||
          next.openMinutes != saved.openMinutes ||
          next.closeMinutes != saved.closeMinutes) {
        return true;
      }
    }
    return false;
  }

  void _save() {
    setState(() => _touched = true);
    final subdomainError = validateSubdomain(_subdomain.text);
    final whatsappError = validateWhatsapp(_whatsapp.text);
    if (_name.text.trim().isEmpty || subdomainError != null || whatsappError != null) {
      setState(() => _saveError = 'Revisa nombre, subdominio y WhatsApp.');
      return;
    }
    final store = OwnerScope.of(context);
    store.saveProfile(
      store.profile.copyWith(
        name: _name.text.trim(),
        subdomain: _subdomain.text.trim().toLowerCase(),
        description: _description.text.trim(),
        whatsapp: _whatsapp.text.replaceAll(RegExp(r'\D'), ''),
        address: _address.text.trim(),
        takeoutEnabled: _takeout,
        deliveryEnabled: _delivery,
        payments: _payments,
        hours: _hours,
      ),
    );
    setState(() => _saveError = null);
    ScaffoldMessenger.of(context).showSnackBar(
      const SnackBar(content: Text('Configuración guardada en este dispositivo.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final store = OwnerScope.of(context);
    final pad = context.pagePadding;
    final scheme = Theme.of(context).colorScheme;
    final subdomainError = _touched ? validateSubdomain(_subdomain.text) : null;
    final whatsappError = _touched ? validateWhatsapp(_whatsapp.text) : null;
    final subdomain = _subdomain.text.trim().toLowerCase();
    final wide = context.windowWidth >= 960;

    final identity = SectionCard(
      title: 'Identidad',
      hint: 'Nombre, subdominio y descripción del menú digital.',
      child: Column(
        children: [
          TextField(
            controller: _name,
            textCapitalization: TextCapitalization.words,
            decoration: InputDecoration(
              labelText: 'Nombre del restaurante',
              errorText: _touched && _name.text.trim().isEmpty ? 'Escribe el nombre.' : null,
            ),
          ),
          const SizedBox(height: MexySpace.md),
          TextField(
            controller: _subdomain,
            autocorrect: false,
            decoration: InputDecoration(
              labelText: 'Subdominio del menú',
              errorText: subdomainError,
              helperText: subdomainError == null && subdomain.isNotEmpty
                  ? '$subdomain.mxy.mx'
                  : 'Solo minúsculas, números y guiones.',
            ),
            inputFormatters: [
              FilteringTextInputFormatter.allow(RegExp(r'[a-zA-Z0-9-]')),
            ],
          ),
          const SizedBox(height: MexySpace.md),
          TextField(
            controller: _description,
            minLines: 2,
            maxLines: 4,
            textCapitalization: TextCapitalization.sentences,
            decoration: const InputDecoration(labelText: 'Descripción'),
          ),
        ],
      ),
    );

    final whatsapp = SectionCard(
      title: 'WhatsApp de pedidos',
      hint: 'El número que recibe los pedidos del menú.',
      child: TextField(
        controller: _whatsapp,
        keyboardType: TextInputType.phone,
        decoration: InputDecoration(
          labelText: 'Número de WhatsApp',
          prefixText: '+52 ',
          errorText: whatsappError,
        ),
        inputFormatters: [FilteringTextInputFormatter.digitsOnly],
      ),
    );

    final services = SectionCard(
      title: 'Tipos de servicio',
      hint: 'Qué puede pedir un cliente en el menú.',
      child: Column(
        children: [
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Entrega a domicilio'),
            subtitle: const Text('Muestra envíos y permite pedir repartidor.'),
            value: _delivery,
            onChanged: (value) => setState(() => _delivery = value),
          ),
          SwitchListTile(
            contentPadding: EdgeInsets.zero,
            title: const Text('Recoger en local'),
            value: _takeout,
            onChanged: (value) => setState(() => _takeout = value),
          ),
        ],
      ),
    );

    final payments = SectionCard(
      title: 'Métodos de pago',
      hint: 'Efectivo, transferencia y terminal, por tipo de servicio.',
      child: Column(
        children: [
          _PaymentGroup(
            title: 'Recoger en local',
            cash: _payments.takeoutCash,
            transfer: _payments.takeoutTransfer,
            card: _payments.takeoutCard,
            onCash: (value) => setState(() => _payments = _payments.copyWith(takeoutCash: value)),
            onTransfer: (value) =>
                setState(() => _payments = _payments.copyWith(takeoutTransfer: value)),
            onCard: (value) => setState(() => _payments = _payments.copyWith(takeoutCard: value)),
          ),
          const SizedBox(height: MexySpace.md),
          _PaymentGroup(
            title: 'Entrega a domicilio',
            cash: _payments.deliveryCash,
            transfer: _payments.deliveryTransfer,
            card: _payments.deliveryCard,
            onCash: (value) => setState(() => _payments = _payments.copyWith(deliveryCash: value)),
            onTransfer: (value) =>
                setState(() => _payments = _payments.copyWith(deliveryTransfer: value)),
            onCard: (value) => setState(() => _payments = _payments.copyWith(deliveryCard: value)),
          ),
        ],
      ),
    );

    final location = SectionCard(
      title: 'Ubicación',
      hint: 'La dirección del local. El mapa en vivo se conectará después, sin webview.',
      child: TextField(
        controller: _address,
        textCapitalization: TextCapitalization.sentences,
        minLines: 2,
        maxLines: 3,
        decoration: const InputDecoration(labelText: 'Dirección'),
      ),
    );

    final hours = SectionCard(
      title: 'Horario de recolección',
      hint: 'El horario de reparto lo define el proveedor de entrega.',
      child: Column(
        children: [
          for (var i = 0; i < _hours.length; i++)
            _HourRow(
              day: _hours[i],
              onChanged: (next) {
                setState(() {
                  _hours = [
                    for (var j = 0; j < _hours.length; j++) j == i ? next : _hours[j],
                  ];
                });
              },
            ),
        ],
      ),
    );

    final staff = SectionCard(
      title: 'Administradores',
      hint: 'Personas que pueden operar este restaurante.',
      child: Column(
        children: [
          for (final member in store.profile.staff) ...[
            ListTile(
              contentPadding: EdgeInsets.zero,
              minVerticalPadding: 8,
              title: Text(member.name),
              subtitle: Text('${member.email} · ${member.role}'),
              trailing: member.id == 'owner'
                  ? null
                  : IconButton(
                      tooltip: 'Quitar a ${member.name}',
                      onPressed: () => store.removeStaff(member.id),
                      icon: const Icon(Icons.close),
                    ),
            ),
          ],
          const SizedBox(height: MexySpace.sm),
          LayoutBuilder(
            builder: (context, constraints) {
              final field = TextField(
                controller: _invite,
                keyboardType: TextInputType.emailAddress,
                autocorrect: false,
                decoration: const InputDecoration(
                  labelText: 'Correo del admin',
                  hintText: 'cocina@restaurante.mx',
                ),
                onSubmitted: (_) => _inviteStaff(store),
              );
              final button = FilledButton(
                onPressed: () => _inviteStaff(store),
                child: const Text('Invitar'),
              );
              if (constraints.maxWidth < 460) {
                return Column(
                  crossAxisAlignment: CrossAxisAlignment.stretch,
                  children: [
                    field,
                    const SizedBox(height: MexySpace.sm),
                    button,
                  ],
                );
              }
              return Row(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: [
                  Expanded(child: field),
                  const SizedBox(width: MexySpace.sm),
                  button,
                ],
              );
            },
          ),
        ],
      ),
    );

    final left = [identity, whatsapp, location];
    final right = [services, payments, staff];

    return Column(
      children: [
        Expanded(
          child: ListView(
            key: const Key('settings-scroll'),
            padding: EdgeInsets.fromLTRB(pad, MexySpace.lg, pad, MexySpace.lg),
            children: [
              const PageHeader(
                title: 'Configuración',
                subtitle:
                    'Identidad, WhatsApp, servicios, pagos, ubicación y horario.',
              ),
              const SizedBox(height: MexySpace.lg),
              if (!wide) ...[
                identity,
                const SizedBox(height: MexySpace.md),
                whatsapp,
                const SizedBox(height: MexySpace.md),
                services,
                const SizedBox(height: MexySpace.md),
                payments,
                const SizedBox(height: MexySpace.md),
                location,
                const SizedBox(height: MexySpace.md),
                staff,
              ] else
                Row(
                  crossAxisAlignment: CrossAxisAlignment.start,
                  children: [
                    Expanded(child: _stack(left)),
                    const SizedBox(width: MexySpace.md),
                    Expanded(child: _stack(right)),
                  ],
                ),
              const SizedBox(height: MexySpace.md),
              hours,
              if (_saveError != null) ...[
                const SizedBox(height: MexySpace.md),
                Text(_saveError!, style: TextStyle(color: scheme.error)),
              ],
            ],
          ),
        ),
        Material(
          color: scheme.surface,
          child: SafeArea(
            top: false,
            child: Padding(
              padding: EdgeInsets.fromLTRB(pad, 12, pad, 12),
              child: Row(
                children: [
                  Expanded(
                    child: Text(
                      _dirty ? 'Hay cambios sin guardar' : 'Todo guardado',
                      style: Theme.of(context).textTheme.bodyMedium,
                    ),
                  ),
                  const SizedBox(width: MexySpace.md),
                  FilledButton(
                    onPressed: _dirty ? _save : null,
                    child: const Text('Guardar configuración'),
                  ),
                ],
              ),
            ),
          ),
        ),
      ],
    );
  }

  Widget _stack(List<Widget> children) {
    return Column(
      children: [
        for (var i = 0; i < children.length; i++) ...[
          if (i > 0) const SizedBox(height: MexySpace.md),
          children[i],
        ],
      ],
    );
  }

  void _inviteStaff(OwnerStore store) {
    final email = _invite.text.trim().toLowerCase();
    if (!email.contains('@') || !email.contains('.')) {
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Escribe un correo válido.')),
      );
      return;
    }
    store.inviteStaff(email);
    _invite.clear();
  }
}

class _PaymentGroup extends StatelessWidget {
  const _PaymentGroup({
    required this.title,
    required this.cash,
    required this.transfer,
    required this.card,
    required this.onCash,
    required this.onTransfer,
    required this.onCard,
  });

  final String title;
  final bool cash;
  final bool transfer;
  final bool card;
  final ValueChanged<bool> onCash;
  final ValueChanged<bool> onTransfer;
  final ValueChanged<bool> onCard;

  @override
  Widget build(BuildContext context) {
    return Column(
      crossAxisAlignment: CrossAxisAlignment.start,
      children: [
        Text(title, style: Theme.of(context).textTheme.titleMedium),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Efectivo'),
          value: cash,
          onChanged: onCash,
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Transferencia'),
          value: transfer,
          onChanged: onTransfer,
        ),
        SwitchListTile(
          contentPadding: EdgeInsets.zero,
          title: const Text('Terminal'),
          value: card,
          onChanged: onCard,
        ),
      ],
    );
  }
}

class _HourRow extends StatelessWidget {
  const _HourRow({required this.day, required this.onChanged});

  final DayHours day;
  final ValueChanged<DayHours> onChanged;

  @override
  Widget build(BuildContext context) {
    return Padding(
      padding: const EdgeInsets.symmetric(vertical: 4),
      child: LayoutBuilder(
        builder: (context, constraints) {
          final stacked = constraints.maxWidth < 520;
          final label = SizedBox(
            width: stacked ? null : 110,
            child: Text(day.label, style: Theme.of(context).textTheme.titleMedium),
          );
          final toggle = Switch(
            value: day.open,
            onChanged: (value) => onChanged(day.copyWith(open: value)),
          );
          final times = day.open
              ? Wrap(
                  spacing: MexySpace.sm,
                  runSpacing: MexySpace.sm,
                  children: [
                    _TimeButton(
                      label: formatClock(day.openMinutes),
                      onTap: () => _pick(context, day.openMinutes, (minutes) {
                        onChanged(day.copyWith(openMinutes: minutes));
                      }),
                    ),
                    _TimeButton(
                      label: formatClock(day.closeMinutes),
                      onTap: () => _pick(context, day.closeMinutes, (minutes) {
                        onChanged(day.copyWith(closeMinutes: minutes));
                      }),
                    ),
                  ],
                )
              : Text('Cerrado', style: Theme.of(context).textTheme.bodySmall);
          if (stacked) {
            return Column(
              crossAxisAlignment: CrossAxisAlignment.start,
              children: [
                Row(
                  children: [
                    Expanded(child: label),
                    Semantics(label: '${day.label} abierto', child: toggle),
                  ],
                ),
                times,
              ],
            );
          }
          return Row(
            children: [
              label,
              Semantics(label: '${day.label} abierto', child: toggle),
              const SizedBox(width: MexySpace.sm),
              Expanded(child: times),
            ],
          );
        },
      ),
    );
  }

  Future<void> _pick(
    BuildContext context,
    int current,
    ValueChanged<int> onPicked,
  ) async {
    final picked = await showTimePicker(
      context: context,
      initialTime: TimeOfDay(hour: current ~/ 60, minute: current % 60),
    );
    if (picked == null) return;
    onPicked(picked.hour * 60 + picked.minute);
  }
}

class _TimeButton extends StatelessWidget {
  const _TimeButton({required this.label, required this.onTap});

  final String label;
  final VoidCallback onTap;

  @override
  Widget build(BuildContext context) {
    return OutlinedButton(onPressed: onTap, child: Text(label));
  }
}
