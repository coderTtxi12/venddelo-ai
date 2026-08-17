# mexy_rider

App Flutter de repartidores Mexy: Google + Supabase, **En línea**, GPS en segundo plano, ofertas y envío activo.

## Configuración

Copia `.env.example` a `.env` (no se commitea) con el mismo proyecto de Supabase que los dashboards:

```
SUPABASE_URL=
SUPABASE_ANON_KEY=
API_BASE_URL=http://localhost:8080/api/v1
GOOGLE_WEB_CLIENT_ID=
GOOGLE_IOS_CLIENT_ID=
```

En el emulador Android usa `http://10.0.2.2:8080/api/v1`.

Google Sign-In en iOS necesita el URL scheme del **reversed client id**. El placeholder en `ios/Flutter/Debug.xcconfig` y `Release.xcconfig` es `com.googleusercontent.apps.REPLACE_ME` (`CFBundleURLTypes` en `Info.plist`).

Si `GOOGLE_IOS_CLIENT_ID` es `123-abc.apps.googleusercontent.com`, pon:

```
GOOGLE_IOS_REVERSED_CLIENT_ID=com.googleusercontent.apps.123-abc
```

en ambos xcconfig (Flutter `--dart-define` no llega a Info.plist).

```bash
flutter run --dart-define-from-file=.env
```

FCM es opcional. Si no hay `google-services.json` / `GoogleService-Info.plist`, la app hace poll de ofertas cada 5 s mientras esté en línea.

## Pruebas

```bash
flutter analyze
flutter test
```
