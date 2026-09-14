import { Role } from '@toolhackchain/shared';

export default function HomePage() {
  return (
    <main style={{ maxWidth: 640, margin: '4rem auto', padding: '0 1rem' }}>
      <h1>ToolHackChain</h1>
      <p>Monorepo scaffold is running.</p>
      <p>
        Roles from <code>@toolhackchain/shared</code>:{' '}
        <strong>{Object.values(Role).join(', ')}</strong>
      </p>
      <p style={{ color: '#666' }}>
        API health check: <code>GET http://localhost:4000/api/health</code>
      </p>
    </main>
  );
}
