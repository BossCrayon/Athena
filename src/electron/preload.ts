// @ts-ignore
import { contextBridge, ipcRenderer, IpcRendererEvent } from 'electron';

contextBridge.exposeInMainWorld('athena', {
    // Window Management
    hideWindow: () => ipcRenderer.invoke('hide-window'),
    
    // Auth
    registerDevice: (hash: string, name: string) => ipcRenderer.invoke('register-device', hash, name),
    
    // Node Status
    onNodeStatus: (callback: (data: { status: string, message?: string }) => void) => {
        ipcRenderer.on('node-status', (_event: IpcRendererEvent, data: { status: string, message?: string }) => callback(data));
    },
    
    // Chat Transport (Secure Proxy via Main)
    connectChat: () => ipcRenderer.invoke('chat-connect'),
    sendChatMessage: (message: string) => ipcRenderer.invoke('chat-send', message),
    sendBinaryMessage: (data: ArrayBuffer) => ipcRenderer.invoke('chat-send-binary', data),
    onChatMessage: (callback: (data: string) => void) => {
        ipcRenderer.on('chat-message', (_event: any, data: any) => callback(data));
    },
    onChatAudio: (callback: (data: Uint8Array) => void) => {
        ipcRenderer.on('chat-audio', (_event: any, data: any) => callback(data));
    },
    onChatError: (callback: (err: string) => void) => {
        ipcRenderer.on('chat-error', (_event: any, err: any) => callback(err));
    },
    
    // Permission Management
    onPermissionRequest: (callback: (data: { requestId: string, toolName: string, summary: string }) => void) => {
        ipcRenderer.on('permission-request', (_event: any, data: any) => callback(data));
    },
    respondToPermission: (requestId: string, approved: boolean) => {
        ipcRenderer.send(`permission-response-${requestId}`, approved);
    },
    
    // OS Notifications
    showNotification: (title: string, body: string) => ipcRenderer.invoke('show-notification', title, body)
});
