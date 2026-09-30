import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../state/mexy_store.dart';
import '../../theme/mexy_theme.dart';
import '../../widgets/mexy_widgets.dart';

class DeliveryScreen extends StatefulWidget {
  const DeliveryScreen({super.key});

  @override
  State<DeliveryScreen> createState() => _DeliveryScreenState();
}

class _DeliveryScreenState extends State<DeliveryScreen> {
  final _name = TextEditingController();
  final _phone = TextEditingController();
  final _address = TextEditingController();
  final _cash = TextEditingController();
  int _prep = 15;
  bool _history = false;
  bool _attempted = false;
  String? _formError;

  @override
  void initState() {
    super.initState();
    for (final controller in [_name, _phone, _address]) {
      controller.addListener(() {
        if (_attempted && mounted) setState(() {});
      });
    }
  }

  @override
  void dispose() {
    _name.dispose();
    _phone.dispose();
    _address.dispose();
    _cash.dispose();
    super.dispose();
  }

  void _submit() {
    final store = MexyScope.of(context);
    final phoneDigits = _phone.text.replaceAll(RegExp(r'\D'), '');
    final missing = <String>[];
    if (_name.text.trim().isEmpty) missing.add('el nombre');
    if (phoneDigits.length != 10) missing.add('el celular');
    if (_address.text.trim().length < 6) missing.add('la dirección');
    setState(() => _attempted = true);
    if (missing.isNotEmpty) {
      setState(() => _formError = 'Falta completar: ${missing.join(', ')}.');
      return;
    }
    final cashDigits = _cash.text.replaceAll(RegExp(r'[^\d.]'), '');
    final pesos = double.tryParse(cashDigits) ?? 0;
    final created = store.addDispatch(
      customerName: _name.text,
      phone: _phone.text.trim(),
      address: _address.text,
      prepMinutes: _prep,
      collectCents: (pesos * 100).round(),
    );
    if (created == null) return;
    _name.clear();
    _phone.clear();
    _address.clear();
    _cash.clear();
    setState(() {
      _formError = null;
      _attempted = false;
      _history = false;
    });
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text('Solicitud ${created.shortId} en busca de repartidor.')),
    );
  }

  @override
  Widget build(BuildContext context) {
    final store = MexyScope.of(context);
    final pad = context.pagePadding;
    if (!store.profile.deliveryEnabled) {
      return ListView(
        padding: EdgeInsets.fromLTRB(pad, MexySpace.lg, pad, MexySpace.xl),
        children: const [
          PageHeader(
            title: 'Envíos a domicilio',
            subtitle: 'La entrega está apagada para este restaurante.',
          ),
          SizedBox(height: MexySpace.lg),
          SectionCard(
            title: 'Sin reparto',
            hint: 'Activa entrega a domicilio en Ajustes para pedir repartidores.',
            child: SizedBox.shrink(),
          ),
        ],
      );
    }

    final form = _RequestForm(
      name: _name,
      phone: _phone,
      address: _address,
      cash: _cash,
      prep: _prep,
      attempted: _attempted,
      error: _formError,
      onPrep: (value) => setState(() => _prep = value),
      onSubmit: _submit,
    );
    final list = _RequestList(
      history: _history,
      onHistory: (value) => setState(() => _history = value),
    );

    return ListView(
      padding: EdgeInsets.fromLTRB(pad, MexySpace.lg, pad, MexySpace.xl),
      children: [
        const PageHeader(
          title: 'Envíos a domicilio',
          subtitle: 'Pide un repartidor y sigue las solicitudes activas.',
          trailing: LiveChip(
            label: 'En vivo',
            hint: 'Las solicitudes de este dispositivo se actualizan al instante',
          ),
        ),
        const SizedBox(height: MexySpace.lg),
        if (context.windowWidth >= 960)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(child: form),
              const SizedBox(width: MexySpace.lg),
              Expanded(child: list),
            ],
          )
        else ...[
          form,
          const SizedBox(height: MexySpace.md),
          list,
        ],
      ],
    );
  }
}

class _RequestForm extends StatelessWidget {
  const _RequestForm({
    required this.name,
    required this.phone,
    required this.address,
    required this.cash,
    required this.prep,
    required this.attempted,
    required this.error,
    required this.onPrep,
    required this.onSubmit,
  });

  final TextEditingController name;
  final TextEditingController phone;
  final TextEditingController address;
  final TextEditingController cash;
  final int prep;
  final bool attempted;
  final String? error;
  final ValueChanged<int> onPrep;
  final VoidCallback onSubmit;

  @override
  Widget build(BuildContext context) {
    final phoneDigits = phone.text.replaceAll(RegExp(r'\D'), '');
    return SectionCard(
      title: 'Nuevo envío',
      hint: 'Nombre, celular y dirección del cliente.',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          TextField(
            controller: name,
            textCapitalization: TextCapitalization.words,
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(
              labelText: 'Nombre del cliente',
              errorText: attempted && name.text.trim().isEmpty ? 'Escribe el nombre.' : null,
            ),
          ),
          const SizedBox(height: MexySpace.md),
          TextField(
            controller: phone,
            keyboardType: TextInputType.phone,
            textInputAction: TextInputAction.next,
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9 +\-]'))],
            decoration: InputDecoration(
              labelText: 'Celular',
              hintText: '33 0000 0000',
              errorText: attempted && phoneDigits.length != 10
                  ? 'Usa 10 dígitos.'
                  : null,
            ),
          ),
          const SizedBox(height: MexySpace.md),
          TextField(
            controller: address,
            textCapitalization: TextCapitalization.sentences,
            textInputAction: TextInputAction.next,
            decoration: InputDecoration(
              labelText: 'Dirección',
              errorText: attempted && address.text.trim().length < 6
                  ? 'Escribe la calle y el número.'
                  : null,
            ),
          ),
          const SizedBox(height: MexySpace.md),
          Text('Tiempo de preparación', style: Theme.of(context).textTheme.bodySmall),
          const SizedBox(height: MexySpace.sm),
          Wrap(
            spacing: MexySpace.sm,
            runSpacing: MexySpace.sm,
            children: [
              for (final minutes in const [10, 15, 20, 30])
                ChoiceChip(
                  label: Text('$minutes min'),
                  selected: prep == minutes,
                  onSelected: (_) => onPrep(minutes),
                  visualDensity: VisualDensity.standard,
                  materialTapTargetSize: MaterialTapTargetSize.padded,
                ),
            ],
          ),
          const SizedBox(height: MexySpace.md),
          TextField(
            controller: cash,
            keyboardType: const TextInputType.numberWithOptions(decimal: true),
            inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
            decoration: const InputDecoration(
              labelText: 'Efectivo por cobrar (opcional)',
              hintText: '0.00',
              prefixText: '\$ ',
            ),
          ),
          if (error != null) ...[
            const SizedBox(height: MexySpace.md),
            Text(error!, style: TextStyle(color: Theme.of(context).colorScheme.error)),
          ],
          const SizedBox(height: MexySpace.lg),
          SizedBox(
            width: double.infinity,
            child: FilledButton.icon(
              onPressed: onSubmit,
              icon: const Icon(Icons.delivery_dining_outlined, size: 18),
              label: const Text('Solicitar repartidor'),
            ),
          ),
        ],
      ),
    );
  }
}

class _RequestList extends StatelessWidget {
  const _RequestList({required this.history, required this.onHistory});

  final bool history;
  final ValueChanged<bool> onHistory;

  @override
  Widget build(BuildContext context) {
    final store = MexyScope.of(context);
    final rows = store.requests.where((item) => item.isHistory == history).toList();
    return SectionCard(
      title: history ? 'Historial' : 'Activos',
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          SegmentedButton<bool>(
            segments: const [
              ButtonSegment(value: false, label: Text('Activos')),
              ButtonSegment(value: true, label: Text('Historial')),
            ],
            selected: {history},
            onSelectionChanged: (value) => onHistory(value.first),
          ),
          const SizedBox(height: MexySpace.md),
          if (rows.isEmpty)
            Text(
              history ? 'Todavía no hay envíos cerrados.' : 'No hay envíos activos.',
              style: Theme.of(context).textTheme.bodySmall,
            )
          else
            for (final request in rows) ...[
              _DispatchCard(request: request),
              const SizedBox(height: MexySpace.sm),
            ],
        ],
      ),
    );
  }
}

class _DispatchCard extends StatelessWidget {
  const _DispatchCard({required this.request});

  final DispatchRequest request;

  @override
  Widget build(BuildContext context) {
    final theme = Theme.of(context);
    final tone = dispatchTone(context, request.status);
    final scheme = theme.colorScheme;
    return Container(
      width: double.infinity,
      padding: const EdgeInsets.all(12),
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: scheme.outlineVariant),
      ),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              Text(request.shortId, style: theme.textTheme.titleMedium),
              const SizedBox(width: 8),
              StatusPill(
                label: dispatchLabel(request.status),
                background: tone.background,
                foreground: tone.foreground,
              ),
              const Spacer(),
              Text(
                '${request.prepMinutes} min',
                style: theme.textTheme.bodySmall,
              ),
            ],
          ),
          const SizedBox(height: 6),
          Text(request.customerName),
          Text(request.address, style: theme.textTheme.bodySmall),
          if (request.collectCents > 0)
            Text(
              request.cashConfirmed
                  ? 'Efectivo confirmado · ${formatPesos(request.collectCents)}'
                  : 'Por cobrar ${formatPesos(request.collectCents)}',
              style: theme.textTheme.bodySmall,
            ),
          if (!request.isHistory) ...[
            const SizedBox(height: MexySpace.sm),
            Wrap(
              spacing: MexySpace.sm,
              runSpacing: MexySpace.sm,
              children: [
                OutlinedButton(
                  onPressed: () => _cancel(context),
                  child: const Text('Cancelar envío'),
                ),
                if (request.collectCents > 0 && !request.cashConfirmed)
                  FilledButton(
                    onPressed: () => _cash(context),
                    child: const Text('Ya me pagó'),
                  ),
              ],
            ),
          ],
        ],
      ),
    );
  }

  Future<void> _cancel(BuildContext context) async {
    final first = await _step(
      context,
      title: '¿Cancelar el envío ${request.shortId}?',
      body: 'Se detendrá la búsqueda de repartidor. Esta acción no se puede deshacer.',
      confirm: 'Continuar',
      cancel: 'No, conservar',
      danger: true,
    );
    if (first != true || !context.mounted) return;
    final second = await _step(
      context,
      title: 'Confirma la cancelación',
      body: 'Vas a cancelar ${request.shortId} de ${request.customerName}.',
      confirm: 'Sí, cancelar envío',
      cancel: 'Volver',
      danger: true,
    );
    if (second == true && context.mounted) {
      MexyScope.of(context).cancelDispatch(request.id);
    }
  }

  Future<void> _cash(BuildContext context) async {
    final first = await _step(
      context,
      title: '¿El rider ya te pagó?',
      body: 'Confírmalo solo si ya recibiste el efectivo en el negocio.',
      confirm: 'Continuar',
      cancel: 'Todavía no',
      danger: false,
    );
    if (first != true || !context.mounted) return;
    final second = await _step(
      context,
      title: 'Confirma el pago',
      body:
          'Vas a marcar que ya te entregaron ${formatPesos(request.collectCents)} de ${request.shortId}.',
      confirm: 'Sí, ya me pagó',
      cancel: 'Volver',
      danger: false,
    );
    if (second == true && context.mounted) {
      MexyScope.of(context).confirmCash(request.id);
    }
  }

  Future<bool?> _step(
    BuildContext context, {
    required String title,
    required String body,
    required String confirm,
    required String cancel,
    required bool danger,
  }) {
    final scheme = Theme.of(context).colorScheme;
    return showDialog<bool>(
      context: context,
      builder: (context) {
        return AlertDialog(
          title: Text(title),
          content: Text(body),
          actions: [
            TextButton(
              onPressed: () => Navigator.pop(context, false),
              child: Text(cancel),
            ),
            FilledButton(
              style: danger
                  ? FilledButton.styleFrom(
                      backgroundColor: scheme.error,
                      foregroundColor: scheme.onError,
                    )
                  : null,
              onPressed: () => Navigator.pop(context, true),
              child: Text(confirm),
            ),
          ],
        );
      },
    );
  }
}
