import React, { useState } from 'react';

export default function Login({ onLogin }: { onLogin: () => void }) {
  const [hash, setHash] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  const handleSubmit = async (e: React.FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (!hash || !name) {
      setError('Please provide your designated name and access sigil.');
      return;
    }

    setLoading(true);
    setError('');

    try {
      const result = await window.athena.registerDevice(hash, name);
      if (result.success) {
        onLogin();
      } else {
        setError(`Communion failed: ${result.error || 'Invalid sigil'}`);
      }
    } catch (err: any) {
      setError(`The link was severed: ${err.message || 'Connection timeout'}`);
    } finally {
      setLoading(false);
    }
  };

  const inputStyle = {
    width: '100%', 
    padding: '16px 4px', 
    boxSizing: 'border-box' as const, 
    backgroundColor: 'transparent', 
    border: 'none',
    borderBottom: '1px solid rgba(255, 255, 255, 0.2)',
    color: 'var(--text-main)', 
    outline: 'none', 
    fontSize: '15px',
    fontFamily: "'Inter', sans-serif",
    transition: 'all 0.3s ease',
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', height: '100%', padding: '24px', position: 'relative' }}>
      
      {/* Ethereal background accent */}
      <div style={{
        position: 'absolute',
        width: '600px',
        height: '600px',
        background: 'radial-gradient(circle, rgba(212, 175, 55, 0.05) 0%, transparent 60%)',
        top: '50%',
        left: '50%',
        transform: 'translate(-50%, -50%)',
        pointerEvents: 'none',
        zIndex: 0,
        animation: 'etherealBreathe 8s ease-in-out infinite'
      }}></div>

      <div style={{ zIndex: 10, display: 'flex', flexDirection: 'column', alignItems: 'center', width: '380px', padding: '50px 40px', background: 'rgba(255, 255, 255, 0.02)', backdropFilter: 'blur(10px)', borderRadius: '16px', border: '1px solid rgba(255, 255, 255, 0.05)', boxShadow: '0 20px 40px rgba(0,0,0,0.4)' }}>
        
        <h1 className="cinzel" style={{ margin: '0 0 10px 0', fontWeight: 400, color: 'var(--text-main)', letterSpacing: '8px', fontSize: '28px' }}>ATHENA</h1>
        <div style={{ width: '40px', height: '1px', backgroundColor: 'var(--accent)', marginBottom: '30px', opacity: 0.8 }}></div>
        
        <p style={{ color: 'var(--text-muted)', marginBottom: '40px', fontSize: '13px', textAlign: 'center', letterSpacing: '1px', fontStyle: 'italic' }}>Offer your credentials to commune.</p>

        <form onSubmit={handleSubmit} style={{ display: 'flex', flexDirection: 'column', width: '100%', gap: '25px' }}>
          <div style={{ position: 'relative' }}>
            <label className="cinzel" style={{ display: 'block', fontSize: '10px', color: 'var(--accent)', marginBottom: '4px', letterSpacing: '2px' }}>Vessel Name</label>
            <input 
              type="text" 
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. The Oracle"
              style={inputStyle} 
              onFocus={(e) => e.target.style.borderBottom = '1px solid var(--accent)'}
              onBlur={(e) => e.target.style.borderBottom = '1px solid rgba(255, 255, 255, 0.2)'}
            />
          </div>
          
          <div style={{ position: 'relative' }}>
            <label className="cinzel" style={{ display: 'block', fontSize: '10px', color: 'var(--accent)', marginBottom: '4px', letterSpacing: '2px' }}>Access Sigil</label>
            <input 
              type="password" 
              value={hash}
              onChange={(e) => setHash(e.target.value)}
              placeholder="Enter your sacred hash"
              style={inputStyle} 
              onFocus={(e) => e.target.style.borderBottom = '1px solid var(--accent)'}
              onBlur={(e) => e.target.style.borderBottom = '1px solid rgba(255, 255, 255, 0.2)'}
            />
          </div>

          {error && <div style={{ 
            color: 'var(--danger)', 
            fontSize: '12px', 
            textAlign: 'center', 
            padding: '10px 0', 
            fontStyle: 'italic'
          }}>{error}</div>}

          <button 
            type="submit" 
            disabled={loading}
            className="cinzel"
            style={{ 
              marginTop: '20px', padding: '16px', backgroundColor: 'transparent', 
              color: 'var(--accent)', border: '1px solid var(--accent)', 
              borderRadius: '30px', cursor: loading ? 'not-allowed' : 'pointer',
              fontSize: '12px', letterSpacing: '3px',
              transition: 'all 0.4s ease',
              opacity: loading ? 0.6 : 1,
              position: 'relative',
              overflow: 'hidden'
            }}
            onMouseOver={(e) => { if(!loading) { e.currentTarget.style.backgroundColor = 'var(--accent)'; e.currentTarget.style.color = '#000'; e.currentTarget.style.boxShadow = '0 0 20px rgba(212, 175, 55, 0.4)'; } }}
            onMouseOut={(e) => { if(!loading) { e.currentTarget.style.backgroundColor = 'transparent'; e.currentTarget.style.color = 'var(--accent)'; e.currentTarget.style.boxShadow = 'none'; } }}
            >
            {loading ? 'COMMUNING...' : 'ENTER THE PARTHENON'}
          </button>
        </form>
      </div>
    </div>
  );
}
