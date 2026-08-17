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

```bash
flutter run --dart-define-from-file=.env
```

FCM es opcional. Si no hay `google-services.json` / `GoogleService-Info.plist`, la app hace poll de ofertas cada 5 s mientras esté en línea.

## Pruebas

```bash
flutter analyze
flutter test
```
