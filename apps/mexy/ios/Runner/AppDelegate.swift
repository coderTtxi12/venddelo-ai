import Flutter
import UIKit

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
    if let registrar = engineBridge.pluginRegistry.registrar(forPlugin: "PrinterBridge") {
      PrinterBridge.register(with: registrar)
    }
  }
}

private final class PrinterBridge: NSObject, FlutterPlugin {
  private static var retained: PrinterBridge?

  static func register(with registrar: FlutterPluginRegistrar) {
    let channel = FlutterMethodChannel(
      name: "com.mexy.printer",
      binaryMessenger: registrar.messenger()
    )
    let instance = PrinterBridge()
    retained = instance
    registrar.addMethodCallDelegate(instance, channel: channel)
  }

  func handle(_ call: FlutterMethodCall, result: @escaping FlutterResult) {
    switch call.method {
    case "capabilities":
      result([
        "platform": "ios",
        "bluetooth": false,
        "usb": false,
        "network": true,
        "note": "En iPhone e iPad la impresora se elige por IP en la red del local, o con AirPrint desde el sistema."
      ])
    case "requestBluetooth":
      result(false)
    case "bondedPrinters":
      result([
        "printers": [],
        "needsPermission": false,
        "message": "iOS no lista impresoras Bluetooth clásicas. Escribe la IP de la impresora."
      ])
    case "usbPrinters":
      result([
        "printers": [],
        "needsPermission": false,
        "message": "USB de impresora no está disponible en iPhone o iPad."
      ])
    default:
      result(FlutterMethodNotImplemented)
    }
  }
}
