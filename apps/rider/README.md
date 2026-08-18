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
GOOGLE_MAPS_API_KEY=
```

En el emulador Android usa `http://10.0.2.2:8080/api/v1`.

En un **teléfono físico** por USB (recomendado):

```
API_BASE_URL=http://localhost:8080/api/v1
adb reverse tcp:8080 tcp:8080
```

No uses `10.0.2.2` (solo emulador) ni la IP LAN a menos que el backend esté escuchando en `0.0.0.0:8080`.

El mapa usa **Google Maps**. Copia la misma `GOOGLE_MAPS_API_KEY` de los dashboards a `.env`. En Google Cloud, esa key debe tener **Maps SDK for Android** y **Maps SDK for iOS**. Android lee la key desde `.env` al compilar. En iOS, copia `ios/Flutter/MapsSecrets.xcconfig.example` a `MapsSecrets.xcconfig` (no se commitea) con la misma key.

Hay que **rebuild completo** (`flutter run`); hot reload no inyecta la key nativa.

Google Sign-In en iOS necesita el URL scheme del **reversed client id**. El placeholder en `ios/Flutter/Debug.xcconfig` y `Release.xcconfig` es `com.googleusercontent.apps.REPLACE_ME` (`CFBundleURLTypes` en `Info.plist`).

Si `GOOGLE_IOS_CLIENT_ID` es `123-abc.apps.googleusercontent.com`, pon:

```
GOOGLE_IOS_REVERSED_CLIENT_ID=com.googleusercontent.apps.123-abc
```

en ambos xcconfig (Flutter `--dart-define` no llega a Info.plist).

```bash
flutter run --dart-define-from-file=.env
```

FCM: coloca `android/app/google-services.json` (no se commitea). El plugin de Gradle se aplica solo si el archivo existe. El poll de ofertas cada 5 s sigue de respaldo.

Para que el **backend** mande el push, descarga la clave de cuenta de servicio en Firebase → Project settings → Service accounts, guárdala en `backend/.secrets/firebase-adminsdk.json` y pon en `backend/.env`:

```
FIREBASE_CREDENTIALS_PATH=.secrets/firebase-adminsdk.json
```

## Pruebas

```bash
flutter analyze
flutter test
```
