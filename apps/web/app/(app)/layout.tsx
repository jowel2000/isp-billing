import '../demo/demo.css';
import './live.css';
import { LiveShell } from '@/components/live-shell';
import { LiveAuthProvider } from '@/lib/live-auth';

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <LiveAuthProvider>
      <LiveShell>{children}</LiveShell>
    </LiveAuthProvider>
  );
}
