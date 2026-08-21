import React, { useState, useEffect } from 'react';

interface AICoreProps {
    isListening: boolean;
}

export default function AICore({ isListening }: AICoreProps) {
    const [sysData, setSysData] = useState({ mem: '00.00', cpu: '00', net: '000' });
    const [points, setPoints] = useState<string>('');

    // Generate random tech data for the UI
    useEffect(() => {
        const interval = setInterval(() => {
            setSysData({
                mem: (Math.random() * 40 + 20).toFixed(2),
                cpu: Math.floor(Math.random() * 30 + 10).toString(),
                net: Math.floor(Math.random() * 900 + 100).toString()
            });
        }, 1000);
        return () => clearInterval(interval);
    }, []);

    // Generate a circular equalizer for the Voice Visualizer
    useEffect(() => {
        const p = Array.from({ length: 60 }).map((_, i) => {
            const angle = (i * 6) * (Math.PI / 180);
            const radius = isListening ? 65 + Math.random() * 15 : 65 + Math.random() * 3;
            const x = 100 + radius * Math.cos(angle);
            const y = 100 + radius * Math.sin(angle);
            return `${x},${y}`;
        }).join(' ');
        setPoints(p);

        let raf: number;
        if (isListening) {
            const animate = () => {
                const newP = Array.from({ length: 60 }).map((_, i) => {
                    const angle = (i * 6) * (Math.PI / 180);
                    const radius = 65 + Math.random() * 20;
                    const x = 100 + radius * Math.cos(angle);
                    const y = 100 + radius * Math.sin(angle);
                    return `${x},${y}`;
                }).join(' ');
                setPoints(newP);
                raf = requestAnimationFrame(() => setTimeout(animate, 100)); // ~10fps
            };
            animate();
        }
        return () => cancelAnimationFrame(raf);
    }, [isListening]);

    return (
        <div className={`ai-core-container ${isListening ? 'listening' : ''}`}>
            
            {/* Ambient Background Glow & Hex Grid */}
            <div className="core-ambient-glow"></div>
            <div className="hex-grid"></div>

            {/* Massive Outer Scale Ring */}
            <div className="hud-ring scale-ring">
                <svg viewBox="0 0 200 200">
                    <circle cx="100" cy="100" r="95" stroke="rgba(212, 175, 55, 0.15)" strokeWidth="0.2" fill="none" />
                    {Array.from({length: 120}).map((_, i) => (
                        <line key={i} x1="100" y1="5" x2="100" y2={i % 10 === 0 ? "12" : (i % 5 === 0 ? "9" : "7")} stroke={i % 10 === 0 ? "rgba(255, 223, 0, 0.5)" : "rgba(212, 175, 55, 0.3)"} strokeWidth={i % 10 === 0 ? "0.8" : "0.4"} transform={`rotate(${i * 3} 100 100)`} />
                    ))}
                </svg>
            </div>

            <div className="hud-ring outer-ring-1">
                <svg viewBox="0 0 200 200">
                    <circle cx="100" cy="100" r="88" stroke="rgba(212, 175, 55, 0.25)" strokeWidth="1.5" fill="none" strokeDasharray="2 4 8 4" />
                    <circle cx="100" cy="100" r="86" stroke="rgba(212, 175, 55, 0.15)" strokeWidth="0.5" fill="none" />
                </svg>
            </div>
            
            <div className="hud-ring outer-ring-2">
                <svg viewBox="0 0 200 200">
                    <circle cx="100" cy="100" r="80" stroke="rgba(212, 175, 55, 0.6)" strokeWidth="3" fill="none" strokeDasharray="40 10 5 10 80 15" />
                    <circle cx="100" cy="100" r="82" stroke="rgba(255, 223, 0, 0.4)" strokeWidth="0.5" fill="none" strokeDasharray="100 20" />
                    {/* Triangles on the ring */}
                    <polygon points="100,16 105,24 95,24" fill="var(--accent)" opacity="0.8" />
                    <polygon points="100,184 105,176 95,176" fill="var(--accent)" opacity="0.8" />
                    <polygon points="16,100 24,95 24,105" fill="var(--accent)" opacity="0.8" />
                    <polygon points="184,100 176,95 176,105" fill="var(--accent)" opacity="0.8" />
                </svg>
            </div>

            <div className="hud-ring outer-ring-3">
                <svg viewBox="0 0 200 200">
                    <circle cx="100" cy="100" r="76" stroke="rgba(212, 175, 55, 0.3)" strokeWidth="1" fill="none" strokeDasharray="2 6" />
                </svg>
            </div>

            <div className="hud-ring middle-ring">
                <svg viewBox="0 0 200 200">
                    <circle cx="100" cy="100" r="72" stroke="var(--accent)" strokeWidth="1.5" fill="none" strokeDasharray="1 3" opacity="0.7"/>
                    <circle cx="100" cy="100" r="70" stroke="var(--accent-bright)" strokeWidth="4" fill="none" strokeDasharray="120 180" strokeLinecap="round" opacity="0.5"/>
                    <circle cx="100" cy="100" r="68" stroke="var(--accent)" strokeWidth="0.5" fill="none" />
                </svg>
            </div>

            {/* Voice Spectrum Analyzer Ring */}
            <div className="hud-ring voice-spectrum">
                <svg viewBox="0 0 200 200">
                    <polygon points={points} fill="none" stroke="rgba(255, 223, 0, 0.8)" strokeWidth="1.5" />
                    <polygon points={points} fill="rgba(212, 175, 55, 0.05)" stroke="none" />
                </svg>
            </div>

            <div className="hud-ring inner-ring">
                <svg viewBox="0 0 200 200">
                    <circle cx="100" cy="100" r="55" stroke="var(--accent-bright)" strokeWidth="2" fill="none" strokeDasharray="60 180" strokeLinecap="round" />
                    <circle cx="100" cy="100" r="57" stroke="rgba(212, 175, 55, 0.4)" strokeWidth="0.5" fill="none" strokeDasharray="4 4" />
                </svg>
            </div>
            
            <div className="hud-ring inner-ring-reverse">
                <svg viewBox="0 0 200 200">
                    <circle cx="100" cy="100" r="48" stroke="rgba(212, 175, 55, 0.9)" strokeWidth="2.5" fill="none" strokeDasharray="10 10 30 10" />
                    <polygon points="100,48 103,53 97,53" fill="var(--accent-bright)" />
                    <polygon points="100,152 103,147 97,147" fill="var(--accent-bright)" />
                    <polygon points="48,100 53,103 53,97" fill="var(--accent-bright)" />
                    <polygon points="152,100 147,103 147,97" fill="var(--accent-bright)" />
                </svg>
            </div>

            <div className="central-orb">
                <div className="orb-core-symbol"></div>
                {isListening && (
                    <>
                        <div className="orb-wave wave-1"></div>
                        <div className="orb-wave wave-2"></div>
                        <div className="orb-wave wave-3"></div>
                        <div className="orb-wave wave-4"></div>
                    </>
                )}
            </div>

            {/* Highly Detailed HUD Crosshairs & Brackets */}
            <div className="hud-bracket top-left"></div>
            <div className="hud-bracket top-right"></div>
            <div className="hud-bracket bottom-left"></div>
            <div className="hud-bracket bottom-right"></div>
            
            {/* Dynamic Data Nodes */}
            <div className="hud-data-node node-tl">
                <div className="node-text tech-mono">SYS.KERNEL <span className="blink">_</span></div>
                <div className="node-line-container"><div className="node-line"></div></div>
                <div className="node-sub tech-mono">MEM: {sysData.mem} GB</div>
                <div className="node-tiny tech-mono">CPU: {sysData.cpu}% VOLATILE</div>
            </div>
            
            <div className="hud-data-node node-tr">
                <div className="node-text tech-mono glitch-text">AEGIS.NET</div>
                <div className="node-line-container reverse"><div className="node-line"></div></div>
                <div className="node-sub tech-mono">UPLINK: {sysData.net} MB/S</div>
                <div className="node-tiny tech-mono">SECURE / ENCRYPTED</div>
            </div>

            <div className="hud-data-node node-bl">
                <div className="node-text tech-mono">TARGETING</div>
                <div className="node-line-container"><div className="node-line"></div></div>
                <div className="node-sub tech-mono">AZIMUTH: {(Math.random() * 360).toFixed(2)}</div>
                <div className="node-tiny tech-mono">TRACKING ACTIVE</div>
            </div>

            <div className="hud-data-node node-br">
                <div className="node-text tech-mono">DIAGNOSTICS</div>
                <div className="node-line-container reverse"><div className="node-line"></div></div>
                <div className="node-sub tech-mono">ALL SYSTEMS NOMINAL</div>
                <div className="node-tiny tech-mono">AWAITING INPUT</div>
            </div>
        </div>
    );
}
