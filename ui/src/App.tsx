import { useEffect } from 'react';
import { Sidebar } from './components/Sidebar';
import { DetailPanel } from './components/DetailPanel';
import { OverviewView } from './views/OverviewView';
import { PathsView } from './views/PathsView';
import { VulnerabilitiesView } from './views/VulnerabilitiesView';
import { CriticalNodeView } from './views/CriticalNodeView';
import { ReportView } from './views/ReportView';
import { useAppStore } from './store/useAppStore';

export default function App() {
  const { activeView, selectedNodeId, fetchGraph, fetchVulnerabilities } = useAppStore();

  // Fetch graph + vulnerabilities on mount
  useEffect(() => {
    fetchGraph();
    fetchVulnerabilities();
  }, []);  // eslint-disable-line

  return (
    <div style={{ display: 'flex', height: '100vh', overflow: 'hidden', background: '#0a0a0f' }}>
      <Sidebar />

      {/* Main */}
      <main style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden', position: 'relative' }}>
        {activeView === 'overview'        && <OverviewView />}
        {activeView === 'paths'           && <PathsView />}
        {activeView === 'vulnerabilities' && <VulnerabilitiesView />}
        {activeView === 'critical'        && <CriticalNodeView />}
        {activeView === 'report'          && <ReportView />}
      </main>

      {/* Detail panel slides in from right when a node is selected */}
      {selectedNodeId && <DetailPanel />}
    </div>
  );
}
