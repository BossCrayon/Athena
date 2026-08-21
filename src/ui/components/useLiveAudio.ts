import { useState, useRef, useEffect } from 'react';

export function useLiveAudio() {
    const [isListening, setIsListening] = useState(false);
    
    // Recording state
    const audioContextRef = useRef<AudioContext | null>(null);
    const mediaStreamRef = useRef<MediaStream | null>(null);
    const processorRef = useRef<ScriptProcessorNode | null>(null);
    const sourceRef = useRef<MediaStreamAudioSourceNode | null>(null);

    // Playback state
    const playbackContextRef = useRef<AudioContext | null>(null);
    const nextPlayTimeRef = useRef<number>(0);

    useEffect(() => {
        // Initialize playback context (Gemini outputs 24kHz PCM)
        playbackContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
            sampleRate: 24000
        });

        const handleAudio = (data: Uint8Array) => {
            if (!playbackContextRef.current) return;
            
            // data is an array of Int16, we need to convert it to Float32 for Web Audio API
            const int16Array = new Int16Array(data.buffer, data.byteOffset, data.byteLength / 2);
            const float32Array = new Float32Array(int16Array.length);
            for (let i = 0; i < int16Array.length; i++) {
                float32Array[i] = int16Array[i] / 32768.0;
            }

            const audioBuffer = playbackContextRef.current.createBuffer(1, float32Array.length, 24000);
            audioBuffer.getChannelData(0).set(float32Array);

            const source = playbackContextRef.current.createBufferSource();
            source.buffer = audioBuffer;
            source.connect(playbackContextRef.current.destination);

            const currentTime = playbackContextRef.current.currentTime;
            const playTime = Math.max(currentTime, nextPlayTimeRef.current);
            source.start(playTime);
            nextPlayTimeRef.current = playTime + audioBuffer.duration;
        };

        // Bind IPC handler
        if (window.athena?.onChatAudio) {
            window.athena.onChatAudio(handleAudio);
        }

        return () => {
            stopListening();
            if (playbackContextRef.current) {
                playbackContextRef.current.close();
            }
        };
    }, []);

    const startListening = async () => {
        try {
            const stream = await navigator.mediaDevices.getUserMedia({ 
                audio: {
                    echoCancellation: true,
                    noiseSuppression: true,
                    autoGainControl: true,
                } 
            });
            mediaStreamRef.current = stream;

            // Gemini input requires 16kHz PCM
            audioContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: 16000
            });

            sourceRef.current = audioContextRef.current.createMediaStreamSource(stream);
            
            // Use ScriptProcessorNode to get raw PCM
            processorRef.current = audioContextRef.current.createScriptProcessor(4096, 1, 1);
            
            processorRef.current.onaudioprocess = (e) => {
                const inputData = e.inputBuffer.getChannelData(0);
                // Convert Float32 to Int16 PCM
                const pcmData = new Int16Array(inputData.length);
                for (let i = 0; i < inputData.length; i++) {
                    let s = Math.max(-1, Math.min(1, inputData[i]));
                    pcmData[i] = s < 0 ? s * 0x8000 : s * 0x7FFF;
                }
                
                // Send binary data via IPC
                if (window.athena?.sendBinaryMessage) {
                    window.athena.sendBinaryMessage(pcmData.buffer);
                }
            };

            sourceRef.current.connect(processorRef.current);
            processorRef.current.connect(audioContextRef.current.destination);
            
            setIsListening(true);
            
            // Tell backend to start Live API session
            if (window.athena?.sendChatMessage) {
                window.athena.sendChatMessage(JSON.stringify({ type: 'live_start' }));
            }
        } catch (err) {
            console.error('Microphone access denied or error:', err);
        }
    };

    const stopListening = () => {
        if (processorRef.current) {
            processorRef.current.disconnect();
            processorRef.current = null;
        }
        if (sourceRef.current) {
            sourceRef.current.disconnect();
            sourceRef.current = null;
        }
        if (audioContextRef.current) {
            audioContextRef.current.close();
            audioContextRef.current = null;
        }
        if (mediaStreamRef.current) {
            mediaStreamRef.current.getTracks().forEach(track => track.stop());
            mediaStreamRef.current = null;
        }
        setIsListening(false);
        
        if (window.athena?.sendChatMessage) {
            window.athena.sendChatMessage(JSON.stringify({ type: 'live_stop' }));
        }
    };

    const toggleListening = () => {
        if (isListening) {
            stopListening();
        } else {
            startListening();
        }
    };
    
    const stopPlayback = () => {
        // Simple way to stop playback is to reset the context
        if (playbackContextRef.current) {
            playbackContextRef.current.close();
            playbackContextRef.current = new (window.AudioContext || (window as any).webkitAudioContext)({
                sampleRate: 24000
            });
            nextPlayTimeRef.current = 0;
        }
    };

    return {
        isListening,
        toggleListening,
        stopPlayback
    };
}
