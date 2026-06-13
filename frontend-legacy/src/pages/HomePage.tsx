export default function HomePage() {
  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        alignItems: 'center',
        justifyContent: 'center',
        height: '100%',
        gap: '1rem',
      }}
    >
      <h1 style={{ fontSize: '2.5rem', fontWeight: 700 }}>Hello World</h1>
      <p style={{ color: 'var(--color-text-secondary)', fontSize: '1.125rem' }}>
        Tienda Go — Dashboard de Proveedores
      </p>
    </div>
  );
}
