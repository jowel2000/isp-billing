import '../demo/demo.css';
import '../(app)/live.css';
import { PortalShell } from '@/components/portal-shell';
import { LiveAuthProvider } from '@/lib/live-auth';

export default function PortalLayout({ children }: { children: React.ReactNode }) {
  return (
    <LiveAuthProvider>
      <PortalShell>{children}</PortalShell>
    </LiveAuthProvider>
  );
}
