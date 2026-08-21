import React, { useState, useEffect, useRef } from 'react';
import { Send, Square, ChevronDown, ShieldAlert, Check, X, Mic, MicOff, MessageSquare } from 'lucide-react';
import { useLiveAudio } from './useLiveAudio.js';
import AICore from './AICore.js';

interface PermissionReq {
  requestId: string;
  toolName: string;
  summary: string;
}

export default function Chat() {
  const [messages, setMessages] = useState<{ role: 'user' | 'athena', content: string, isToolBubble?: boolean }[]>([]);
  const [input, setInput] = useState('');
  const [permissions, setPermissions] = useState<PermissionReq[]>([]);
  const [connected, setConnected] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [showScrollFAB, setShowScrollFAB] = useState(false);
  const [tasksExpanded, setTasksExpanded] = useState(true);
  const [showTextChat, setShowTextChat] = useState(false);
  
  const bottomRef = useRef<HTMLDivElement>(null);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const { isListening, toggleListening, stopPlayback } = useLiveAudio();

  const [tasks, setTasks] = useState<{ id: string, name: string, status: string }[]>([]);
  
  useEffect(() => {
    window.athena.connectChat().then((res: any) => {
        if (res.success) {
            setConnected(true);
        }
    });

    window.athena.onChatMessage((data: string) => {
        try {
            const msg = JSON.parse(data);
            if (msg.type === 'token') {
                setIsWaiting(false);
                setMessages(prev => {
                    const last = prev[prev.length - 1];
                    if (last && last.role === 'athena') {
                        return [...prev.slice(0, -1), { role: 'athena', content: last.content + msg.text }];
                    } else {
                        return [...prev, { role: 'athena', content: msg.text }];
                    }
                });
                scrollToBottomIfNear();
            } else if (msg.type === 'tool') {
                setMessages(prev => {
                    const lastMsg = prev[prev.length - 1];
                    if (lastMsg && lastMsg.role === 'athena' && lastMsg.isToolBubble) {
                        const newMessages = [...prev];
                        newMessages[newMessages.length - 1] = {
                            ...lastMsg,
                            content: lastMsg.content + `, ${msg.tool}`
                        };
                        return newMessages;
                    }
                    return [...prev, { role: 'athena', content: `[System] Action invoked: ${msg.tool}`, isToolBubble: true }];
                });
                scrollToBottomIfNear();
            } else if (msg.type === 'task_update') {
                setTasksExpanded(true); // Auto expand when new task comes in
                setTasks(prev => {
                    const existing = prev.find(t => t.id === msg.task.id);
                    if (existing) {
                        return prev.map(t => t.id === msg.task.id ? { ...t, status: msg.task.status } : t);
                    }
                    return [...prev, { id: msg.task.id, name: msg.task.name, status: msg.task.status }];
                });
                scrollToBottomIfNear();
            } else if (msg.type === 'done') {
                setIsWaiting(false);
            }
        } catch (e) {
            console.error('Failed to parse chat message', e);
        }
    });

    window.athena.onPermissionRequest((req: PermissionReq) => {
        setPermissions(prev => [...prev, req]);
    });

  }, []);

  const scrollToBottomIfNear = () => {
    if (!scrollContainerRef.current) return;
    const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
    if (scrollHeight - scrollTop - clientHeight < 150) {
        setTimeout(() => bottomRef.current?.scrollIntoView({ behavior: 'smooth' }), 50);
    }
  };

  const forceScrollBottom = () => {
      bottomRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  const handleScroll = () => {
      if (!scrollContainerRef.current) return;
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      setShowScrollFAB(scrollHeight - scrollTop - clientHeight > 150);
  };

  const handleInput = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
      setInput(e.target.value);
      if (textareaRef.current) {
          textareaRef.current.style.height = 'auto';
          textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
      }
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
      if (e.key === 'Enter' && !e.shiftKey) {
          e.preventDefault();
          sendMessage();
      }
  };

  const sendMessage = (e?: React.FormEvent) => {
    if (e) e.preventDefault();
    if (!input.trim() || !connected) return;
    
    setMessages(prev => [...prev, { role: 'user', content: input }]);
    window.athena.sendChatMessage(JSON.stringify({ type: 'text', text: input }));
    setInput('');
    if (textareaRef.current) textareaRef.current.style.height = 'auto';
    setIsWaiting(true);
    setTimeout(forceScrollBottom, 50);
  };

  const handleStop = (e?: React.MouseEvent) => {
    if (e) e.preventDefault();
    setIsWaiting(false);
    stopPlayback();
    window.athena.sendChatMessage(JSON.stringify({ type: 'stop' }));
  };

  const handlePermission = (reqId: string, approved: boolean) => {
      window.athena.respondToPermission(reqId, approved);
      setPermissions(prev => prev.filter(p => p.requestId !== reqId));
  };

  return (
    <div className="fade-in" style={{ display: 'flex', flexDirection: 'column', flex: 1, padding: '0 20px 20px 20px', boxSizing: 'border-box', position: 'relative', overflow: 'hidden' }}>
      
      {/* Scrollable Chat Area OR AI Core */}
      <div 
        ref={scrollContainerRef}
        onScroll={handleScroll}
        style={{ 
          flex: 1, overflowY: 'auto', marginBottom: '20px', paddingRight: '12px', zIndex: 1, paddingTop: '20px',
          display: 'flex', flexDirection: 'column',
          justifyContent: showTextChat ? 'flex-start' : 'center'
        }}
      >
        {!showTextChat ? (
          <div className="fade-in" style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', flex: 1, flexDirection: 'column', gap: '40px' }}>
             <AICore isListening={isListening} />
          </div>
        ) : (
          <>
            {messages.length === 0 && connected && (
              <div style={{ display: 'flex', justifyContent: 'center', alignItems: 'center', height: '100%', opacity: 0.6 }}>
                <div className="cinzel" style={{ color: 'var(--accent)', letterSpacing: '2px', fontSize: '14px', fontStyle: 'italic', animation: 'etherealBreathe 4s infinite' }}>Speak your mind. I am listening.</div>
              </div>
            )}

            {messages.map((msg, i) => {
                const isUser = msg.role === 'user';
                return (
                  <div key={i} className="fade-in" style={{ 
                      display: 'flex',
                      alignItems: 'flex-start',
                      marginBottom: '24px', 
                      gap: '16px',
                      flexDirection: isUser ? 'row-reverse' : 'row'
                  }}>
                      {!isUser && (
                        <div style={{
                          width: '36px', height: '36px', borderRadius: '18px',
                          background: 'radial-gradient(circle, rgba(212,175,55,0.2) 0%, rgba(255,255,255,0.05) 100%)',
                          border: '1px solid rgba(212,175,55,0.3)',
                          boxShadow: '0 0 10px rgba(212,175,55,0.1)',
                          display: 'flex', justifyContent: 'center', alignItems: 'center',
                          flexShrink: 0
                        }}>
                          <span className="cinzel" style={{ color: 'var(--accent)', fontSize: '16px', fontWeight: 600 }}>A</span>
                        </div>
                      )}
                      {isUser && (
                        <div style={{
                          width: '36px', height: '36px', borderRadius: '18px',
                          background: 'rgba(255,255,255,0.05)',
                          border: '1px solid rgba(255,255,255,0.1)',
                          display: 'flex', justifyContent: 'center', alignItems: 'center',
                          flexShrink: 0,
                        }}>
                          <span className="cinzel" style={{ color: 'var(--text-main)', fontSize: '14px' }}>U</span>
                        </div>
                      )}
                      <div style={{ 
                          backgroundColor: isUser ? 'rgba(255,255,255,0.05)' : (msg.isToolBubble ? 'rgba(212,175,55,0.05)' : 'rgba(255,255,255,0.02)'),
                          backdropFilter: 'blur(10px)',
                          color: isUser ? 'var(--text-main)' : (msg.isToolBubble ? 'var(--accent)' : 'var(--text-main)'),
                          border: isUser ? '1px solid rgba(255,255,255,0.1)' : (msg.isToolBubble ? '1px dashed rgba(212,175,55,0.3)' : '1px solid rgba(212,175,55,0.15)'),
                          borderRadius: isUser ? '16px 16px 4px 16px' : '4px 16px 16px 16px',
                          padding: msg.isToolBubble ? '10px 16px' : '16px 20px',
                          maxWidth: '80%',
                          whiteSpace: 'pre-wrap',
                          wordBreak: 'break-word',
                          fontSize: msg.isToolBubble ? '12px' : '14.5px',
                          fontStyle: msg.isToolBubble ? 'italic' : 'normal',
                          lineHeight: '1.6',
                          boxShadow: '0 4px 15px rgba(0,0,0,0.1)',
                          fontWeight: 300
                      }}>
                          {msg.content}
                      </div>
                  </div>
                );
            })}
            
            {/* Loading Indicator & Task Accordion */}
            {isWaiting && (
              <div className="fade-in" style={{ display: 'flex', alignItems: 'flex-start', marginBottom: '24px', gap: '16px', flexDirection: 'row' }}>
                <div style={{
                  width: '36px', height: '36px', borderRadius: '18px',
                  background: 'radial-gradient(circle, rgba(212,175,55,0.2) 0%, rgba(255,255,255,0.05) 100%)',
                  border: '1px solid rgba(212,175,55,0.3)',
                  boxShadow: '0 0 10px rgba(212,175,55,0.1)',
                  display: 'flex', justifyContent: 'center', alignItems: 'center',
                  flexShrink: 0
                }}>
                  <span className="cinzel" style={{ color: 'var(--accent)', fontSize: '16px', fontWeight: 600 }}>A</span>
                </div>
                <div style={{ 
                  backgroundColor: 'rgba(255,255,255,0.01)', backdropFilter: 'blur(10px)', border: '1px solid rgba(212,175,55,0.15)', borderRadius: '4px 16px 16px 16px',
                  padding: '16px 20px',
                  display: 'flex', flexDirection: 'column', gap: '12px', minWidth: '200px'
                }}>
                  <div style={{ display: 'flex', gap: '16px', alignItems: 'center', cursor: tasks.length > 0 ? 'pointer' : 'default' }} onClick={() => tasks.length > 0 && setTasksExpanded(!tasksExpanded)}>
                    <div style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: 'var(--accent)', animation: 'pulseOrb 1.5s infinite' }}></div>
                    <div style={{ color: 'var(--text-muted)', fontSize: '13px', fontStyle: 'italic', flex: 1 }}>Pondering...</div>
                    {tasks.length > 0 && (
                      <ChevronDown size={14} color="var(--accent)" style={{ transform: tasksExpanded ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.3s' }} />
                    )}
                  </div>
                  
                  {tasks.length > 0 && tasksExpanded && (
                    <div className="fade-in" style={{ marginTop: '4px', display: 'flex', flexDirection: 'column', gap: '8px', borderTop: '1px solid rgba(255,255,255,0.05)', paddingTop: '12px' }}>
                      {tasks.map(t => (
                        <div key={t.id} style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
                          <span style={{ 
                            color: t.status === 'completed' ? 'var(--success)' : (t.status === 'failed' ? 'var(--danger)' : 'var(--accent)'), 
                            fontSize: '12px' 
                          }}>
                            {t.status === 'completed' ? '✦' : (t.status === 'failed' ? '✗' : '✧')}
                          </span>
                          <span style={{ 
                            color: t.status === 'completed' ? 'var(--text-dim)' : 'var(--text-muted)', 
                            fontSize: '12px', fontStyle: 'italic'
                          }}>
                            {t.name}
                          </span>
                        </div>
                      ))}
                    </div>
                  )}
                </div>
              </div>
            )}

            <div ref={bottomRef} />
          </>
        )}
      </div>

      {/* Floating Action Button for scrolling to bottom */}
      {showScrollFAB && showTextChat && (
        <button 
          onClick={forceScrollBottom}
          className="fade-in"
          style={{
            position: 'absolute', bottom: '100px', left: '50%', transform: 'translateX(-50%)',
            backgroundColor: 'rgba(212, 175, 55, 0.9)', color: '#000',
            border: 'none', borderRadius: '20px', padding: '8px 16px',
            display: 'flex', alignItems: 'center', gap: '8px',
            boxShadow: '0 4px 15px rgba(0,0,0,0.3)', cursor: 'pointer', zIndex: 10
          }}
        >
          <ChevronDown size={16} />
          <span style={{ fontSize: '12px', fontWeight: 500 }}>Scroll to bottom</span>
        </button>
      )}

      {/* Floating Permission Modal Overlay */}
      {permissions.length > 0 && (
        <div className="fade-in" style={{
            position: 'absolute', top: 0, left: 0, right: 0, bottom: 0,
            backgroundColor: 'rgba(7, 11, 25, 0.8)', backdropFilter: 'blur(5px)',
            zIndex: 50, display: 'flex', justifyContent: 'center', alignItems: 'center'
        }}>
            {permissions.map((req, i) => (
                <div key={`perm-${i}`} style={{
                    backgroundColor: 'rgba(20, 20, 30, 0.95)',
                    border: '1px solid rgba(226, 125, 96, 0.4)',
                    borderRadius: '16px', padding: '32px', width: '400px',
                    boxShadow: '0 20px 50px rgba(0,0,0,0.5)',
                    display: 'flex', flexDirection: 'column', alignItems: 'center', textAlign: 'center'
                }}>
                    <ShieldAlert size={48} color="var(--danger)" style={{ marginBottom: '16px' }} />
                    <h4 className="cinzel" style={{ margin: '0 0 16px 0', color: 'var(--danger)', fontSize: '18px', letterSpacing: '1px' }}>Sacred Override</h4>
                    <p style={{ margin: '0 0 32px 0', fontSize: '15px', color: 'var(--text-muted)', lineHeight: '1.5' }}>
                        Athena requests permission to execute:<br/>
                        <strong style={{color: 'var(--text-main)', display: 'inline-block', marginTop: '12px', padding: '8px 12px', backgroundColor: 'rgba(255,255,255,0.05)', borderRadius: '8px'}}>{req.summary}</strong>
                    </p>
                    <div style={{ display: 'flex', gap: '16px', width: '100%' }}>
                        <button onClick={() => handlePermission(req.requestId, false)} className="cinzel" style={{
                            flex: 1, padding: '14px', backgroundColor: 'transparent', border: '1px solid var(--danger)', borderRadius: '8px', cursor: 'pointer', color: 'var(--danger)', letterSpacing: '2px', transition: 'all 0.3s'
                        }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(226, 125, 96, 0.1)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'transparent'}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><X size={16}/> DENY</div>
                        </button>
                        <button onClick={() => handlePermission(req.requestId, true)} className="cinzel" style={{
                            flex: 1, padding: '14px', backgroundColor: 'rgba(133, 176, 154, 0.15)', border: '1px solid var(--success)', borderRadius: '8px', cursor: 'pointer', color: 'var(--success)', letterSpacing: '2px', transition: 'all 0.3s'
                        }} onMouseOver={(e) => e.currentTarget.style.backgroundColor = 'rgba(133, 176, 154, 0.3)'} onMouseOut={(e) => e.currentTarget.style.backgroundColor = 'rgba(133, 176, 154, 0.15)'}>
                            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'center', gap: '8px' }}><Check size={16}/> GRANT</div>
                        </button>
                    </div>
                </div>
            ))}
        </div>
      )}

      {/* Input Area */}
      <form onSubmit={sendMessage} style={{ display: 'flex', gap: '16px', zIndex: 10, position: 'relative', alignItems: 'flex-end', backgroundColor: 'rgba(255, 255, 255, 0.03)', border: '1px solid rgba(255, 255, 255, 0.1)', borderRadius: '24px', padding: '10px 14px', backdropFilter: 'blur(10px)', transition: 'all 0.3s ease' }}>
        
        <button 
          type="button"
          onClick={() => setShowTextChat(!showTextChat)}
          title="Toggle Text Log"
          style={{
            width: '44px', height: '44px', borderRadius: '22px', 
            backgroundColor: showTextChat ? 'rgba(255,255,255,0.05)' : 'transparent',
            border: '1px solid transparent',
            color: showTextChat ? 'var(--accent)' : 'var(--text-muted)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            cursor: 'pointer', transition: 'all 0.3s ease', flexShrink: 0
          }}
          onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.1)'; }}
          onMouseOut={(e) => { e.currentTarget.style.backgroundColor = showTextChat ? 'rgba(255,255,255,0.05)' : 'transparent'; }}
        >
          <MessageSquare size={18} />
        </button>

        <button 
          type="button"
          onClick={toggleListening}
          title={isListening ? "Stop Voice Mode" : "Start Voice Mode (Gemini Live)"}
          style={{
            width: '44px', height: '44px', borderRadius: '22px', 
            backgroundColor: isListening ? 'rgba(212, 175, 55, 0.2)' : 'transparent',
            border: isListening ? '1px solid var(--accent)' : '1px solid transparent',
            color: isListening ? 'var(--accent)' : 'var(--text-muted)',
            display: 'flex', justifyContent: 'center', alignItems: 'center',
            cursor: 'pointer', transition: 'all 0.3s ease', flexShrink: 0,
            boxShadow: isListening ? '0 0 15px rgba(212, 175, 55, 0.4)' : 'none',
            animation: isListening ? 'pulseOrb 2s infinite' : 'none'
          }}
          onMouseOver={(e) => { if (!isListening) e.currentTarget.style.backgroundColor = 'rgba(255,255,255,0.05)'; }}
          onMouseOut={(e) => { if (!isListening) e.currentTarget.style.backgroundColor = 'transparent'; }}
        >
          {isListening ? <Mic size={20} /> : <MicOff size={20} />}
        </button>

        <textarea 
          ref={textareaRef}
          value={input}
          onChange={handleInput}
          onKeyDown={handleKeyDown}
          placeholder={connected ? "Commune with Athena... (Shift+Enter for new line)" : "Seeking communion..."}
          disabled={!connected}
          rows={1}
          style={{ 
            flex: 1, padding: '8px 10px', boxSizing: 'border-box', 
            backgroundColor: 'transparent', border: 'none', 
            color: 'var(--text-main)', outline: 'none', fontSize: '15px',
            fontFamily: "'Inter', sans-serif", resize: 'none',
            maxHeight: '150px', overflowY: 'auto'
          }} 
        />
        {isWaiting ? (
          <button 
            type="button" 
            onClick={handleStop}
            title="Halt Execution"
            style={{ 
              width: '44px', height: '44px', borderRadius: '22px', backgroundColor: 'rgba(226, 125, 96, 0.1)', 
              color: 'var(--danger)', border: '1px solid rgba(226, 125, 96, 0.3)', 
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              cursor: 'pointer', transition: 'all 0.3s ease', flexShrink: 0
            }}
            onMouseOver={(e) => { e.currentTarget.style.backgroundColor = 'rgba(226, 125, 96, 0.2)'; }}
            onMouseOut={(e) => { e.currentTarget.style.backgroundColor = 'rgba(226, 125, 96, 0.1)'; }}
          >
            <Square size={18} fill="currentColor" />
          </button>
        ) : (
          <button 
            type="submit" 
            disabled={!connected || !input.trim()}
            style={{ 
              width: '44px', height: '44px', borderRadius: '22px', 
              backgroundColor: (!connected || !input.trim()) ? 'transparent' : 'var(--accent)', 
              color: (!connected || !input.trim()) ? 'var(--text-muted)' : '#000', border: 'none',
              display: 'flex', justifyContent: 'center', alignItems: 'center',
              cursor: (!connected || !input.trim()) ? 'not-allowed' : 'pointer',
              opacity: (!connected || !input.trim()) ? 0.5 : 1, transition: 'all 0.3s ease', flexShrink: 0,
              boxShadow: (!connected || !input.trim()) ? 'none' : '0 4px 10px rgba(212, 175, 55, 0.3)'
            }}
            onMouseOver={(e) => { if(connected && input.trim()) { e.currentTarget.style.transform = 'scale(1.05)'; } }}
            onMouseOut={(e) => { if(connected && input.trim()) { e.currentTarget.style.transform = 'scale(1)'; } }}
          >
            <Send size={18} />
          </button>
        )}
      </form>
    </div>
  );
}
