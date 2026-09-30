import 'package:flutter/material.dart';
import 'package:flutter/services.dart';

import '../../platform/printer_channel.dart';
import '../../state/mexy_store.dart';
import '../../theme/mexy_theme.dart';
import '../../widgets/mexy_widgets.dart';

class PrinterScreen extends StatefulWidget {
  const PrinterScreen({super.key});

  @override
  State<PrinterScreen> createState() => _PrinterScreenState();
}

class _PrinterScreenState extends State<PrinterScreen> {
  PrinterCapabilities _caps = PrinterCapabilities.fallback;
  List<PrinterDevice> _found = const [];
  String? _status;
  String? _error;
  bool _busy = false;
  final _hostController = TextEditingController();
  final _brandController = TextEditingController();
  final _footerController = TextEditingController();
  var _seeded = false;

  @override
  void initState() {
    super.initState();
    _loadCapabilities();
  }

  @override
  void didChangeDependencies() {
    super.didChangeDependencies();
    if (_seeded) return;
    final ticket = MexyScope.of(context).ticket;
    _brandController.text = ticket.brandName;
    _footerController.text = ticket.footer;
    _seeded = true;
  }

  @override
  void dispose() {
    _hostController.dispose();
    _brandController.dispose();
    _footerController.dispose();
    super.dispose();
  }

  Future<void> _loadCapabilities() async {
    final caps = await PrinterChannel.capabilities();
    if (!mounted) return;
    setState(() => _caps = caps);
  }

  Future<void> _scanBluetooth() async {
    setState(() {
      _busy = true;
      _error = null;
      _status = null;
    });
    if (!_caps.bluetooth) {
      setState(() {
        _busy = false;
        _status = _caps.note;
        _found = const [];
      });
      return;
    }
    final granted = await PrinterChannel.requestBluetooth();
    if (!mounted) return;
    if (!granted) {
      setState(() {
        _busy = false;
        _error = 'Permite Bluetooth para ver impresoras vinculadas.';
      });
      return;
    }
    final scan = await PrinterChannel.bondedPrinters();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _found = scan.printers;
      _error = scan.needsPermission ? scan.message : null;
      _status = scan.printers.isEmpty ? scan.message : '${scan.printers.length} impresoras Bluetooth.';
    });
  }

  Future<void> _scanUsb() async {
    setState(() {
      _busy = true;
      _error = null;
    });
    if (!_caps.usb) {
      setState(() {
        _busy = false;
        _status = 'USB no está disponible en este equipo.';
        _found = const [];
      });
      return;
    }
    final scan = await PrinterChannel.usbPrinters();
    if (!mounted) return;
    setState(() {
      _busy = false;
      _found = scan.printers;
      _status = scan.message ??
          (scan.printers.isEmpty
              ? 'No hay dispositivos USB conectados.'
              : '${scan.printers.length} dispositivos USB.');
    });
  }

  void _useHost() {
    final host = _hostController.text.trim();
    if (!RegExp(r'^(\d{1,3}\.){3}\d{1,3}$').hasMatch(host)) {
      setState(() => _error = 'Escribe una IP válida, por ejemplo 192.168.1.50.');
      return;
    }
    MexyScope.of(context).selectPrinter(
      PrinterDevice(
        id: 'net-$host',
        name: host,
        kind: PrinterKind.network,
        detail: 'Puerto 9100',
      ),
    );
    setState(() {
      _error = null;
      _status = 'Predeterminada: $host por la red del local.';
    });
  }

  @override
  Widget build(BuildContext context) {
    final store = MexyScope.of(context);
    final ticket = store.ticket;
    final pad = context.pagePadding;
    final wide = context.windowWidth >= 960;
    final editor = _Editor(
      caps: _caps,
      found: _found,
      busy: _busy,
      status: _status,
      error: _error,
      hostController: _hostController,
      brandController: _brandController,
      footerController: _footerController,
      onBluetooth: _scanBluetooth,
      onUsb: _scanUsb,
      onUseHost: _useHost,
      onSelect: (device) {
        store.selectPrinter(device);
        setState(() => _status = 'Predeterminada: ${device.name}.');
      },
      onClear: () {
        store.selectPrinter(null);
        setState(() => _status = 'Sin impresora predeterminada.');
      },
      onPaper: (width) => store.updateTicket(ticket.copyWith(paperWidthMm: width)),
      onCopies: (copies) => store.updateTicket(ticket.copyWith(copies: copies)),
      onBrand: (value) => store.updateTicket(ticket.copyWith(brandName: value)),
      onFooter: (value) => store.updateTicket(ticket.copyWith(footer: value)),
      onToggle: (next) => store.updateTicket(next),
    );
    final preview = TicketPreview(profileName: store.profile.name, address: store.profile.address);

    return ListView(
      padding: EdgeInsets.fromLTRB(pad, MexySpace.lg, pad, MexySpace.xl),
      children: [
        PageHeader(
          title: 'Impresora',
          subtitle: 'Conecta la impresora de tickets y elige qué se imprime al confirmar.',
          trailing: _PrinterChip(device: store.printer),
        ),
        const SizedBox(height: MexySpace.lg),
        if (wide)
          Row(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Expanded(flex: 6, child: editor),
              const SizedBox(width: MexySpace.lg),
              Expanded(flex: 4, child: preview),
            ],
          )
        else ...[
          preview,
          const SizedBox(height: MexySpace.md),
          editor,
        ],
      ],
    );
  }
}

class _PrinterChip extends StatelessWidget {
  const _PrinterChip({required this.device});

  final PrinterDevice? device;

  @override
  Widget build(BuildContext context) {
    final scheme = Theme.of(context).colorScheme;
    final connected = device != null;
    return Semantics(
      label: connected
          ? 'Impresora predeterminada ${device!.name}'
          : 'Sin impresora predeterminada',
      child: Container(
        constraints: const BoxConstraints(minHeight: 48),
        padding: const EdgeInsets.symmetric(horizontal: 14, vertical: 10),
        decoration: BoxDecoration(
          color: connected ? scheme.primaryContainer : scheme.surface,
          borderRadius: BorderRadius.circular(12),
          border: Border.all(color: connected ? scheme.primary : scheme.outlineVariant),
        ),
        child: Column(
          crossAxisAlignment: CrossAxisAlignment.start,
          mainAxisSize: MainAxisSize.min,
          children: [
            Text(
              'Impresora predeterminada',
              style: Theme.of(context).textTheme.bodySmall,
            ),
            Text(
              device?.name ?? 'Ninguna conectada',
              style: Theme.of(context).textTheme.titleMedium,
            ),
          ],
        ),
      ),
    );
  }
}

class _Editor extends StatelessWidget {
  const _Editor({
    required this.caps,
    required this.found,
    required this.busy,
    required this.status,
    required this.error,
    required this.hostController,
    required this.brandController,
    required this.footerController,
    required this.onBluetooth,
    required this.onUsb,
    required this.onUseHost,
    required this.onSelect,
    required this.onClear,
    required this.onPaper,
    required this.onCopies,
    required this.onBrand,
    required this.onFooter,
    required this.onToggle,
  });

  final PrinterCapabilities caps;
  final List<PrinterDevice> found;
  final bool busy;
  final String? status;
  final String? error;
  final TextEditingController hostController;
  final TextEditingController brandController;
  final TextEditingController footerController;
  final VoidCallback onBluetooth;
  final VoidCallback onUsb;
  final VoidCallback onUseHost;
  final ValueChanged<PrinterDevice> onSelect;
  final VoidCallback onClear;
  final ValueChanged<int> onPaper;
  final ValueChanged<int> onCopies;
  final ValueChanged<String> onBrand;
  final ValueChanged<String> onFooter;
  final ValueChanged<TicketSettings> onToggle;

  @override
  Widget build(BuildContext context) {
    final store = MexyScope.of(context);
    final ticket = store.ticket;
    final theme = Theme.of(context);
    return Column(
      children: [
        SectionCard(
          title: 'Impresora de tickets',
          hint: caps.note,
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Wrap(
                spacing: MexySpace.sm,
                runSpacing: MexySpace.sm,
                children: [
                  OutlinedButton.icon(
                    onPressed: busy ? null : onBluetooth,
                    icon: const Icon(Icons.bluetooth, size: 18),
                    label: Text(caps.bluetooth ? 'Bluetooth vinculadas' : 'Bluetooth no disponible'),
                  ),
                  OutlinedButton.icon(
                    onPressed: busy || !caps.usb ? null : onUsb,
                    icon: const Icon(Icons.usb, size: 18),
                    label: Text(caps.usb ? 'Buscar USB' : 'USB no disponible'),
                  ),
                  if (store.printer != null)
                    TextButton(onPressed: onClear, child: const Text('Quitar predeterminada')),
                ],
              ),
              if (found.isNotEmpty) ...[
                const SizedBox(height: MexySpace.md),
                for (final device in found)
                  ListTile(
                    contentPadding: EdgeInsets.zero,
                    minVerticalPadding: 12,
                    leading: Icon(
                      device.kind == PrinterKind.usb ? Icons.usb : Icons.bluetooth,
                    ),
                    title: Text(device.name),
                    subtitle: Text(device.kindLabel),
                    trailing: store.printer?.id == device.id
                        ? const Icon(Icons.check_circle)
                        : const Icon(Icons.chevron_right),
                    onTap: () => onSelect(device),
                  ),
              ],
              const SizedBox(height: MexySpace.md),
              Text('Impresora de red', style: theme.textTheme.titleMedium),
              const SizedBox(height: MexySpace.sm),
              LayoutBuilder(
                builder: (context, constraints) {
                  final stacked = constraints.maxWidth < 460;
                  final field = TextField(
                    controller: hostController,
                    keyboardType: TextInputType.number,
                    inputFormatters: [FilteringTextInputFormatter.allow(RegExp(r'[0-9.]'))],
                    decoration: const InputDecoration(
                      labelText: 'IP de la impresora',
                      hintText: '192.168.1.50',
                    ),
                    onSubmitted: (_) => onUseHost(),
                  );
                  final button = FilledButton(
                    onPressed: onUseHost,
                    child: const Text('Usar esta IP'),
                  );
                  if (stacked) {
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
              if (status != null) ...[
                const SizedBox(height: MexySpace.md),
                Text(status!, style: theme.textTheme.bodySmall),
              ],
              if (error != null) ...[
                const SizedBox(height: MexySpace.sm),
                Text(error!, style: TextStyle(color: theme.colorScheme.error)),
              ],
              const SizedBox(height: MexySpace.md),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Imprimir al confirmar pedido para llevar'),
                subtitle: Text(
                  store.printer == null
                      ? 'Primero elige una impresora predeterminada.'
                      : 'Los envíos se imprimen cuando pides el ticket o el repartidor.',
                ),
                value: ticket.autoPrint && store.printer != null,
                onChanged: store.printer == null
                    ? null
                    : (value) => onToggle(ticket.copyWith(autoPrint: value)),
              ),
            ],
          ),
        ),
        const SizedBox(height: MexySpace.md),
        SectionCard(
          title: 'Diseño del ticket',
          hint: 'La vista del ticket usa estos datos.',
          child: Column(
            crossAxisAlignment: CrossAxisAlignment.start,
            children: [
              Text('Ancho del papel', style: theme.textTheme.bodySmall),
              const SizedBox(height: MexySpace.sm),
              SegmentedButton<int>(
                segments: const [
                  ButtonSegment(value: 58, label: Text('58 mm')),
                  ButtonSegment(value: 80, label: Text('80 mm')),
                ],
                selected: {ticket.paperWidthMm},
                onSelectionChanged: (value) => onPaper(value.first),
              ),
              const SizedBox(height: MexySpace.md),
              Text('Copias', style: theme.textTheme.bodySmall),
              const SizedBox(height: MexySpace.sm),
              SegmentedButton<int>(
                segments: const [
                  ButtonSegment(value: 1, label: Text('1')),
                  ButtonSegment(value: 2, label: Text('2')),
                  ButtonSegment(value: 3, label: Text('3')),
                ],
                selected: {ticket.copies},
                onSelectionChanged: (value) => onCopies(value.first),
              ),
              const SizedBox(height: MexySpace.md),
              TextField(
                controller: brandController,
                decoration: const InputDecoration(labelText: 'Nombre en el ticket'),
                onChanged: onBrand,
              ),
              const SizedBox(height: MexySpace.md),
              TextField(
                controller: footerController,
                decoration: const InputDecoration(labelText: 'Pie del ticket'),
                onChanged: onFooter,
              ),
              const SizedBox(height: MexySpace.sm),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Dirección del local'),
                value: ticket.showAddress,
                onChanged: (value) => onToggle(ticket.copyWith(showAddress: value)),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Nombre del cliente'),
                value: ticket.showCustomer,
                onChanged: (value) => onToggle(ticket.copyWith(showCustomer: value)),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Artículos'),
                value: ticket.showItems,
                onChanged: (value) => onToggle(ticket.copyWith(showItems: value)),
              ),
              SwitchListTile(
                contentPadding: EdgeInsets.zero,
                title: const Text('Total'),
                value: ticket.showTotal,
                onChanged: (value) => onToggle(ticket.copyWith(showTotal: value)),
              ),
            ],
          ),
        ),
      ],
    );
  }
}

class TicketPreview extends StatelessWidget {
  const TicketPreview({
    required this.profileName,
    required this.address,
    super.key,
  });

  final String profileName;
  final String address;

  @override
  Widget build(BuildContext context) {
    final ticket = MexyScope.of(context).ticket;
    final brand = ticket.brandName.trim().isEmpty ? profileName : ticket.brandName.trim();
    final sample = MexyScope.of(context).orders.first;
    final narrow = ticket.paperWidthMm == 58;
    return SectionCard(
      title: 'Vista del ticket',
      hint: '${ticket.paperWidthMm} mm · ${ticket.copies} ${ticket.copies == 1 ? 'copia' : 'copias'}',
      child: Center(
        child: AnimatedContainer(
          duration: MexyMotion.of(context, MexyMotion.reveal),
          curve: Curves.easeOut,
          width: narrow ? 220 : 280,
          padding: const EdgeInsets.symmetric(horizontal: 16, vertical: 18),
          decoration: BoxDecoration(
            color: MexyColors.ticketPaper,
            borderRadius: BorderRadius.circular(4),
            border: Border.all(color: const Color(0xFFE7E0D6)),
          ),
          child: DefaultTextStyle(
            style: const TextStyle(
              fontFamily: 'monospace',
              fontSize: 12,
              height: 1.35,
              color: MexyColors.ticketInk,
            ),
            child: Column(
              crossAxisAlignment: CrossAxisAlignment.stretch,
              children: [
                Text(
                  brand,
                  textAlign: TextAlign.center,
                  style: const TextStyle(fontWeight: FontWeight.w700, fontSize: 14),
                ),
                if (ticket.showAddress) ...[
                  const SizedBox(height: 4),
                  Text(address, textAlign: TextAlign.center),
                ],
                const SizedBox(height: 8),
                const Text('------------------------------', textAlign: TextAlign.center),
                Text('#${sample.displayId}  ${sample.type == OrderType.delivery ? 'ENVIO' : 'LOCAL'}'),
                if (ticket.showCustomer) Text(sample.customerName),
                if (ticket.showItems) ...[
                  const SizedBox(height: 8),
                  for (final item in sample.items)
                    Text('${item.quantity} ${item.name}  ${formatPesos(item.lineCents)}'),
                ],
                if (ticket.showTotal) ...[
                  const SizedBox(height: 8),
                  Text(
                    'TOTAL ${formatPesos(sample.totalCents)}',
                    style: const TextStyle(fontWeight: FontWeight.w700),
                  ),
                ],
                if (ticket.footer.trim().isNotEmpty) ...[
                  const SizedBox(height: 10),
                  Text(ticket.footer.trim(), textAlign: TextAlign.center),
                ],
              ],
            ),
          ),
        ),
      ),
    );
  }
}
