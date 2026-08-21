import React, { useState, useEffect } from 'react';
import Login from './components/Login.js';
import Chat from './components/Chat.js';

declare global {
  interface Window {
    athena: any;
  }
}

export default function App() {
  const [isAuthenticated, setIsAuthenticated] = useState<boolean>(false);
  const [nodeStatus, setNodeStatus] = useState<string>('disconnected');

  useEffect(() => {
    if (window.athena) {
      window.athena.onNodeStatus((data: { status: string, message?: string }) => {
        setNodeStatus(data.status);
        if (data.status === 'connected') {
          setIsAuthenticated(true);
        }
      });
    }
  }, []);

  // Elegant drag region
  const dragStyle = {
    WebkitAppRegion: 'drag',
    height: '50px',
    width: '100%',
    display: 'flex',
    alignItems: 'center',
    padding: '0 30px',
    boxSizing: 'border-box' as const,
    borderBottom: '1px solid rgba(255, 255, 255, 0.05)',
    background: 'transparent',
    position: 'relative' as const,
    zIndex: 10
  };

  return (
    <>
      <div style={dragStyle}>
        
        <div style={{ display: 'flex', alignItems: 'center', gap: '10px', WebkitAppRegion: 'drag' } as any}>
          {/* Subtle gold line ornament */}
          <div style={{ width: '20px', height: '1px', backgroundColor: 'var(--accent)', opacity: 0.7 }}></div>
          <span className="cinzel" style={{ 
            color: 'var(--text-main)', 
            letterSpacing: '6px', 
            fontSize: '15px', 
            fontWeight: 600,
            textShadow: '0 2px 4px rgba(0,0,0,0.5)'
          }}>ATHENA</span>
          <div style={{ width: '20px', height: '1px', backgroundColor: 'var(--accent)', opacity: 0.7 }}></div>
        </div>
        
        <div style={{ marginLeft: 'auto', WebkitAppRegion: 'no-drag', display: 'flex', alignItems: 'center' } as any}>
          <div style={{
            display: 'flex',
            alignItems: 'center',
            gap: '8px',
            opacity: 0.8
          }}>
            <span className="cinzel" style={{ 
              fontSize: '10px', 
              color: 'var(--text-muted)',
              letterSpacing: '2px'
            }}>
              {nodeStatus === 'connected' ? "AEGIS ONLINE" : (nodeStatus === 'connecting' ? "COMMUNING..." : "AEGIS OFFLINE")}
            </span>
            <span style={{ 
              display: 'inline-block', 
              width: '6px', 
              height: '6px', 
              borderRadius: '50%',
              backgroundColor: nodeStatus === 'connected' ? 'var(--accent)' : (nodeStatus === 'connecting' ? 'var(--text-main)' : 'var(--danger)'),
              boxShadow: nodeStatus === 'connected' ? '0 0 8px var(--accent)' : 'none',
              animation: nodeStatus === 'connecting' ? 'pulseOrb 1.5s infinite' : 'none'
            }}></span>
          </div>
        </div>
      </div>
      
      <div style={{ flex: 1, display: 'flex', flexDirection: 'column', position: 'relative', zIndex: 5, overflow: 'hidden' }}>
        
        {/* Global HUD Overlays */}
        <div className="hud-overlay">
          <div className="hud-grid" style={{ width: '100%', height: '100%', position: 'absolute' }}></div>
          <div className="hud-vignette" style={{ width: '100%', height: '100%', position: 'absolute' }}></div>
          <div className="hud-scanline" style={{ width: '100%', position: 'absolute' }}></div>
        </div>

        {!isAuthenticated ? (
          <Login onLogin={() => setIsAuthenticated(true)} />
        ) : (
          <Chat />
        )}
      </div>
    </>
  );
}
