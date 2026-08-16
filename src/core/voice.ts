import { spawn } from 'node:child_process';
import * as fs from 'node:fs';
import * as path from 'node:path';
import { GoogleGenAI } from '@google/genai';

export class VoiceManager {
    private readonly stopFilePath: string;
    private readonly wavFilePath: string;
    private readonly genai?: GoogleGenAI;
    private activeProcess: ReturnType<typeof spawn> | null = null;

    constructor() {
        // We use a file-based lock to communicate "stop" to the PowerShell background process
        this.stopFilePath = path.join(process.cwd(), '.athena', 'stop_record.txt');
        this.wavFilePath = path.join(process.cwd(), '.athena', 'recording.wav');

        const apiKey = process.env.GEMINI_API_KEY;
        if (apiKey) {
            this.genai = new GoogleGenAI({ apiKey });
        }
    }

    /**
     * Spawns a background PowerShell process to record microphone audio using native Windows APIs.
     * It will record indefinitely until stopRecording() is called.
     */
    startRecording(): Promise<void> {
        return new Promise((resolve, reject) => {
            if (this.activeProcess) {
                return reject(new Error('Already recording.'));
            }

            // Ensure directory exists
            const dir = path.dirname(this.wavFilePath);
            if (!fs.existsSync(dir)) {
                fs.mkdirSync(dir, { recursive: true });
            }

            // Clean up old files
            if (fs.existsSync(this.stopFilePath)) fs.unlinkSync(this.stopFilePath);
            if (fs.existsSync(this.wavFilePath)) fs.unlinkSync(this.wavFilePath);

            const psScript = `
Add-Type -TypeDefinition @"
using System;
using System.Runtime.InteropServices;
public class AudioRecorder {
    [DllImport("winmm.dll", EntryPoint = "mciSendStringA", CharSet = CharSet.Ansi, SetLastError = true, ExactSpelling = true)]
    private static extern int mciSendString(string lpstrCommand, string lpstrReturnString, int uReturnLength, int hwndCallback);
    
    public static void Start() {
        mciSendString("open new Type waveaudio Alias recsound", null, 0, 0);
        mciSendString("record recsound", null, 0, 0);
    }
    public static void Stop(string path) {
        mciSendString("save recsound " + path, null, 0, 0);
        mciSendString("close recsound", null, 0, 0);
    }
}
"@

[AudioRecorder]::Start()
Write-Host "RECORDING_STARTED"

while (!(Test-Path "${this.stopFilePath.replace(/\\/g, '\\\\')}")) {
    Start-Sleep -Milliseconds 100
}

[AudioRecorder]::Stop("${this.wavFilePath.replace(/\\/g, '\\\\')}")
Write-Host "RECORDING_STOPPED"
Remove-Item "${this.stopFilePath.replace(/\\/g, '\\\\')}"
            `;

            this.activeProcess = spawn('powershell.exe', ['-NoProfile', '-Command', psScript]);

            this.activeProcess.stdout?.on('data', (data) => {
                const text = data.toString().trim();
                if (text === 'RECORDING_STARTED') {
                    resolve();
                }
            });

            this.activeProcess.stderr?.on('data', (data) => {
                console.error(`[VoiceManager Error] ${data}`);
            });

            this.activeProcess.on('error', (err) => {
                this.activeProcess = null;
                reject(err);
            });
        });
    }

    /**
     * Signals the PowerShell process to stop recording and save the .wav file.
     * Returns the absolute path to the saved .wav file.
     */
    stopRecording(): Promise<string> {
        return new Promise((resolve, reject) => {
            if (!this.activeProcess) {
                return reject(new Error('Not currently recording.'));
            }

            // Create the stop file to break the PowerShell loop
            fs.writeFileSync(this.stopFilePath, 'stop');

            this.activeProcess.on('close', (code) => {
                this.activeProcess = null;
                if (fs.existsSync(this.wavFilePath)) {
                    resolve(this.wavFilePath);
                } else {
                    reject(new Error('Recording file was not generated.'));
                }
            });
        });
    }

    /**
     * Uses Gemini 1.5 Flash to transcribe the audio file.
     */
    async transcribeAudio(audioPath: string): Promise<string> {
        if (!this.genai) {
            throw new Error('GEMINI_API_KEY is not set. Cannot transcribe audio.');
        }

        try {
            // Read audio file as base64
            const audioData = fs.readFileSync(audioPath).toString('base64');
            
            const params = {
                model: 'gemini-3.6-flash',
                input: [
                    {
                        type: 'audio',
                        mime_type: 'audio/wav',
                        data: audioData
                    },
                    {
                        type: 'text',
                        text: "Please transcribe this audio exactly as spoken. Output ONLY the transcription and nothing else."
                    }
                ]
            } as any;

            const interaction = await this.genai.interactions.create(params);

            return interaction.output_text?.trim() || '';
        } catch (error) {
            console.error('[VoiceManager] Transcription failed:', error);
            throw error;
        }
    }

    /**
     * Synthesizes and plays text-to-speech audio.
     * If ELEVENLABS_API_KEY is set, uses ElevenLabs. Otherwise, uses native Windows TTS.
     */
    async speakText(text: string): Promise<void> {
        // Strip markdown formatting before speaking
        const cleanText = text.replace(/[*_#]/g, '').replace(/\[.*?\]\(.*?\)/g, '');

        const elevenLabsKey = process.env.ELEVENLABS_API_KEY;

        if (elevenLabsKey) {
            await this.speakElevenLabs(cleanText, elevenLabsKey);
        } else {
            await this.speakNativeWindows(cleanText);
        }
    }

    private speakNativeWindows(text: string): Promise<void> {
        return new Promise((resolve, reject) => {
            // Escape quotes for powershell
            const escapedText = text.replace(/'/g, "''").replace(/"/g, '""');
            
            const psScript = `
Add-Type -AssemblyName System.Speech
$synth = New-Object System.Speech.Synthesis.SpeechSynthesizer
$synth.Speak('${escapedText}')
            `;

            const child = spawn('powershell.exe', ['-NoProfile', '-Command', psScript]);

            child.on('close', (code) => {
                if (code === 0) resolve();
                else reject(new Error(`Windows TTS exited with code ${code}`));
            });
        });
    }

    private async speakElevenLabs(text: string, apiKey: string): Promise<void> {
        try {
            const voiceId = '21m00Tcm4TlvDq8ikWAM'; // Rachel (default voice)
            const url = `https://api.elevenlabs.io/v1/text-to-speech/${voiceId}`;
            
            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Accept': 'audio/mpeg',
                    'xi-api-key': apiKey,
                    'Content-Type': 'application/json',
                },
                body: JSON.stringify({
                    text: text,
                    model_id: 'eleven_multilingual_v2',
                    voice_settings: {
                        stability: 0.5,
                        similarity_boost: 0.75
                    }
                })
            });

            if (!response.ok) {
                const errorBody = await response.text();
                throw new Error(`ElevenLabs Error: ${response.status} ${response.statusText} - ${errorBody}`);
            }

            const audioBuffer = Buffer.from(await response.arrayBuffer());
            const tempMp3 = path.join(process.cwd(), '.athena', 'output.mp3');
            fs.writeFileSync(tempMp3, audioBuffer);

            // Play the mp3 using a powershell media player instance
            await new Promise<void>((resolve, reject) => {
                const psScript = `
Add-Type -AssemblyName presentationCore
$player = New-Object System.Windows.Media.MediaPlayer
$player.Open('${tempMp3.replace(/\\/g, '\\\\')}')
$player.Play()
Start-Sleep -Seconds 1
while ($player.Position -ne $player.NaturalDuration.TimeSpan) {
    Start-Sleep -Milliseconds 100
}
$player.Close()
                `;

                const child = spawn('powershell.exe', ['-NoProfile', '-Command', psScript]);
                child.on('close', () => resolve());
            });
            
        } catch (error) {
            console.error('[VoiceManager] ElevenLabs TTS failed, falling back to native Windows.', error);
            await this.speakNativeWindows(text);
        }
    }
}
