import Flutter
import GoogleMaps
import UIKit
import UserNotifications
import flutter_foreground_task

@main
@objc class AppDelegate: FlutterAppDelegate, FlutterImplicitEngineDelegate {
  override func application(
    _ application: UIApplication,
    didFinishLaunchingWithOptions launchOptions: [UIApplication.LaunchOptionsKey: Any]?
  ) -> Bool {
    if let mapsKey = Bundle.main.object(forInfoDictionaryKey: "GMSApiKey") as? String,
       !mapsKey.isEmpty,
       !mapsKey.hasPrefix("$(") {
      GMSServices.provideAPIKey(mapsKey)
    }
    SwiftFlutterForegroundTaskPlugin.setPluginRegistrantCallback { registry in
      GeneratedPluginRegistrant.register(with: registry)
    }
    if #available(iOS 10.0, *) {
      UNUserNotificationCenter.current().delegate = self as UNUserNotificationCenterDelegate
    }
    return super.application(application, didFinishLaunchingWithOptions: launchOptions)
  }

  func didInitializeImplicitFlutterEngine(_ engineBridge: FlutterImplicitEngineBridge) {
    GeneratedPluginRegistrant.register(with: engineBridge.pluginRegistry)
  }
}
