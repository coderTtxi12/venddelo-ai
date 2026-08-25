# Supabase pooler: `ECHECKOUTTIMEOUT` / DB no responde

Fecha aplicada: 24 ago 2026.

Localhost y Cloud Run usan el mismo `DATABASE_URL` (pooler de Supabase `:6543`, transaction mode). Si producción deja transacciones abiertas, **localhost también se cuelga**.

Esto **no** es un outage de [status.supabase.com](https://status.supabase.com/). Un incidente de JWT 401 se ve como `401` al refrescar sesión, no como timeout de 60s en Postgres.

## Síntoma

En el API (local o Cloud Run):

```
psycopg.OperationalError: (ECHECKOUTTIMEOUT) unable to check out connection from the pool after 60000ms in Transaction mode
SSL connection has been closed unexpectedly
```

Postgres en sí está vivo. El **pooler** (Supavisor) no tiene hueco: todas las conexiones de backend están en `idle in transaction`.

## Causa

1. Cada request HTTP abre una transacción en el primer `SELECT` (casi siempre `SELECT users…`).
2. El proceso se queda colgado **sin COMMIT** (otro checkout al pooler, snapshot pesado del monitor, event loop bloqueado, SSE del assistant, etc.).
3. En `pg_stat_activity` esas filas aparecen como `postgres` + `idle in transaction` + `wait_event = Client/ClientRead` + `application_name = Supavisor`.
4. El pooler de un plan chico aguanta ~15 conexiones de app. Con ~16 de esas, todo el mundo espera 60s.

El `:6543` (transaction mode) **no sirve para diagnosticar** cuando ya está lleno: el TCP entra y el primer `SELECT 1` espera 60s. Usar el pooler en **session mode, puerto 5432** del mismo host `*.pooler.supabase.com`.

No matar roles internos: `supabase_admin`, `authenticator`, `supabase_auth_admin`, `supabase_storage_admin`, `pgbouncer`.

## Qué se aplicó (y desatasco)

En la base `postgres` y el rol de la API:

```sql
alter database postgres set idle_in_transaction_session_timeout = '60s';
alter role postgres set idle_in_transaction_session_timeout = '60s';
```

Antes estaba en `0` (nunca cortaba); el 24 ago 2026 se puso `'15s'` y luego `'60s'` para no cortar el chat del assistant a mitad de un stream. Las sesiones **nuevas** heredan el timeout. Las que ya estaban abiertas hay que matarlas una vez:

```sql
select pg_terminate_backend(pid)
from pg_stat_activity
where datname = current_database()
  and pid <> pg_backend_pid()
  and usename = 'postgres'
  and state in ('idle in transaction', 'idle in transaction (aborted)');
```

Tras el `ALTER` a 15s + el terminate, a ~16s las `idle in transaction` de app bajaron solas. El pooler `:6543` volvió a responder. El valor vigente es **60s**.

El timeout **no se aplica a sesiones ya abiertas**. Si el pool sigue lleno justo después del `ALTER`, corre el `pg_terminate_backend` de arriba.

## Si vuelve a pasar

### 1. Ver el estado (SQL Editor o `psql` por `:5432`)

```sql
select
  pid,
  usename,
  state,
  application_name,
  extract(epoch from (now() - xact_start))::int as xact_s,
  wait_event_type,
  wait_event,
  left(query, 120) as query
from pg_stat_activity
where datname = current_database()
order by xact_start nulls last;
```

Señal clara: muchas filas `postgres` / `idle in transaction` / `Supavisor` / `ClientRead`, con `xact_s` de decenas de segundos.

Comprobar el timeout:

```sql
show idle_in_transaction_session_timeout;
-- debe ser 60s

select datname, setconfig
from pg_db_role_setting s
join pg_database d on d.oid = s.setdatabase
where datname = current_database();
```

### 2. Cortar las colgadas

El `pg_terminate_backend` del bloque anterior. No toques usuarios internos de Supabase.

### 3. Reaplicar el timeout si alguien lo quitó

```sql
alter database postgres set idle_in_transaction_session_timeout = '60s';
alter role postgres set idle_in_transaction_session_timeout = '60s';
```

### 4. Si aún no hay hueco

Reiniciar Cloud Run (`vendelo-api`, `us-central1`) para matar requests in-flight. El timeout de 60s suele bastar sin ese paso.

## Efecto colateral

Si el chat del assistant mantiene una transacción abierta más de 60s (SSE con el UoW vivo), esa petición puede cortarse. Subir el valor, no volver a `0`.

## Relacionado en código

- GPS del rider **sigue** escribiendo `last_lat` / `last_lng` en DB; no hace falta update de la app.
- El monitor ya no debe recargar el snapshot completo en cada ping GPS (`driver.location` por websocket). Eso reduce la presión, pero el timeout cubre cualquier request que deje la transacción abierta.
