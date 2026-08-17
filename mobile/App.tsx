import React, { useState, useEffect, useRef } from 'react';
import {
  StyleSheet,
  Text,
  View,
  TextInput,
  TouchableOpacity,
  ScrollView,
  KeyboardAvoidingView,
  Platform,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import * as Battery from 'expo-battery';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import * as Updates from 'expo-updates';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';

const WS_URL_CHAT = 'wss://athena-brain.onrender.com/chat';
const WS_URL_NODE = 'wss://athena-brain.onrender.com/nodes';

const NODE_CAPABILITIES = ['get_battery_level', 'vibrate_phone', 'get_location', 'capture_image'];

interface Message {
  id: string;
  sender: 'user' | 'athena';
  text: string;
  isStreaming?: boolean;
  toolAction?: string;
}

export default function App() {
  const [mode, setMode] = useState<'selecting' | 'ai' | 'hardware' | 'auth'>('selecting');
  const [tokenInput, setTokenInput] = useState('');
  const [hasToken, setHasToken] = useState(false);
  const [nodeId, setNodeId] = useState('');

  useEffect(() => {
    async function loadIdentity() {
      let storedId = await SecureStore.getItemAsync('ATHENA_MOBILE_NODE_ID');
      if (!storedId) {
        storedId = 'mobile-' + Crypto.randomUUID();
        await SecureStore.setItemAsync('ATHENA_MOBILE_NODE_ID', storedId);
      }
      setNodeId(storedId);

      const storedToken = await SecureStore.getItemAsync('NODE_AUTH_TOKEN');
      setHasToken(!!storedToken);
    }
    loadIdentity();
  }, []);

  const handleSetToken = async () => {
    if (tokenInput.trim()) {
      await SecureStore.setItemAsync('NODE_AUTH_TOKEN', tokenInput.trim());
      setHasToken(true);
      setMode('hardware');
    }
  };

  const handleClearToken = async () => {
    await SecureStore.deleteItemAsync('NODE_AUTH_TOKEN');
    setHasToken(false);
  };

  if (mode === 'selecting') {
    return (
      <View style={styles.startupContainer}>
        <StatusBar style="light" />
        <Text style={styles.startupTitle}>A T H E N A</Text>
        <Text style={styles.startupSubtitle}>Select Initialization Mode</Text>

        <TouchableOpacity style={styles.modeCard} onPress={() => setMode('ai')}>
          <Text style={styles.modeCardTitle}>Just AI (Standard)</Text>
          <Text style={styles.modeCardDesc}>Connect to Athena's Cloud Brain for chatting and searching only. No hardware access.</Text>
        </TouchableOpacity>

        <TouchableOpacity 
          style={styles.modeCardHardware} 
          onPress={() => hasToken ? setMode('hardware') : setMode('auth')}
        >
          <Text style={styles.modeCardTitleHardware}>Hardware Link</Text>
          <Text style={styles.modeCardDesc}>Register this phone as a Mobile Node. Athena will be able to access battery, vibrate the phone, and retrieve location.</Text>
          {hasToken && (
             <TouchableOpacity style={{ marginTop: 15 }} onPress={handleClearToken}>
               <Text style={{ color: '#ff4444', fontSize: 12 }}>CLEAR SAVED CREDENTIALS</Text>
             </TouchableOpacity>
          )}
        </TouchableOpacity>
      </View>
    );
  }

  if (mode === 'auth') {
    return (
      <View style={styles.startupContainer}>
        <StatusBar style="light" />
        <Text style={styles.startupTitle}>AUTH REQUIRED</Text>
        <Text style={styles.startupSubtitle}>Enter NODE_AUTH_TOKEN to register hardware</Text>
        
        <TextInput
          style={[styles.textInput, { marginBottom: 20 }]}
          placeholder="Auth Token"
          placeholderTextColor="#4a5568"
          secureTextEntry={true}
          value={tokenInput}
          onChangeText={setTokenInput}
          autoCapitalize="none"
        />
        
        <TouchableOpacity style={styles.sendButton} onPress={handleSetToken}>
          <Text style={styles.sendButtonText}>SECURE LOGIN</Text>
        </TouchableOpacity>
        
        <TouchableOpacity style={{ marginTop: 20 }} onPress={() => setMode('selecting')}>
          <Text style={{ color: '#8892b0', textAlign: 'center' }}>Cancel</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return <ChatScreen mode={mode} nodeId={nodeId} />;
}

function ChatScreen({ mode, nodeId }: { mode: 'ai' | 'hardware', nodeId: string }) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [selectedImage, setSelectedImage] = useState<{ uri: string, base64: string, mimeType: string } | null>(null);
  
  const wsChatRef = useRef<WebSocket | null>(null);
  const wsNodeRef = useRef<WebSocket | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const activeMessageRef = useRef<Message | null>(null);

  useEffect(() => {
    connectChatWebSocket();
    if (mode === 'hardware') {
      connectNodeWebSocket();
    }
    return () => {
      wsChatRef.current?.close();
      wsNodeRef.current?.close();
    };
  }, []);

  let nodeReconnectDelay = 1000;
  const connectNodeWebSocket = async () => {
    // Request location permissions upfront if we're in hardware mode
    await Location.requestForegroundPermissionsAsync();
    const token = await SecureStore.getItemAsync('NODE_AUTH_TOKEN');

    const wsNode = new WebSocket(WS_URL_NODE);
    wsNode.onopen = () => {
      console.log('Mobile Node connected');
      nodeReconnectDelay = 1000;
      wsNode.send(JSON.stringify({
        type: 'node_register',
        id: nodeId,
        name: Platform.OS + ' Phone',
        nodeType: 'mobile',
        token,
        capabilities: NODE_CAPABILITIES
      }));
    };

    wsNode.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
          if (message.type === 'ping') {
            wsNode.send(JSON.stringify({ type: 'pong' }));
          } else if (message.type === 'execute_tool') {
            console.log('Received hardware command:', message.toolName);
            let result: any = null;

            if (message.toolName === 'get_battery_level') {
              const level = await Battery.getBatteryLevelAsync();
              const state = await Battery.getBatteryStateAsync();
              let stateStr = 'Unknown';
              if (state === Battery.BatteryState.UNPLUGGED) stateStr = 'Unplugged (Running on battery)';
              else if (state === Battery.BatteryState.CHARGING) stateStr = 'Charging';
              else if (state === Battery.BatteryState.FULL) stateStr = 'Fully Charged';
              result = `🔋 Battery Level: ${Math.round(level * 100)}%\n⚡ Status: ${stateStr}`;
            } 
            else if (message.toolName === 'vibrate_phone') {
              const style = message.args?.style || 'medium';
              if (style === 'heavy') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
              else if (style === 'light') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
              else if (style === 'success') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
              else await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              result = `Phone vibrated with style: ${style}`;
            }
            else if (message.toolName === 'get_location') {
              let { status } = await Location.getForegroundPermissionsAsync();
              if (status !== 'granted') {
                result = 'Location permission denied by user.';
              } else {
                let location = await Location.getCurrentPositionAsync({});
                result = `Lat: ${location.coords.latitude}, Lon: ${location.coords.longitude}`;
              }
            }
            else {
              result = `Unknown mobile tool: ${message.toolName}`;
            }

            wsNode.send(JSON.stringify({
              type: 'tool_result',
              callId: message.callId,
              result: result
            }));
          }
        } catch (err) {
          console.error('Mobile Node error', err);
        }
      };

      wsNode.onclose = () => {
        console.log('Mobile Node disconnected. Reconnecting in', nodeReconnectDelay);
        setTimeout(connectNodeWebSocket, nodeReconnectDelay);
        nodeReconnectDelay = Math.min(nodeReconnectDelay * 2, 30000);
      };

      wsNodeRef.current = wsNode;
    };

  const connectChatWebSocket = () => {
    const ws = new WebSocket(WS_URL_CHAT);

    ws.onopen = () => setIsConnected(true);

    ws.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setIsWaiting(false);

        if (data.type === 'token') {
          if (!activeMessageRef.current) {
            const newMsg: Message = {
              id: Date.now().toString(),
              sender: 'athena',
              text: data.text,
              isStreaming: true,
            };
            activeMessageRef.current = newMsg;
            // Clear any executing tool bubbles when she starts talking
            setMessages((prev) => [...prev.filter(m => !m.toolAction), newMsg]);
          } else {
            activeMessageRef.current.text += data.text;
            setMessages((prev) => [...prev]);
          }
        } else if (data.type === 'tool') {
          // Add a temporary system message indicating tool execution
          setMessages((prev) => [
            ...prev,
            {
              id: Date.now().toString() + '-tool',
              sender: 'athena',
              text: `Executing: ${data.tool}...`,
              toolAction: data.tool,
            },
          ]);
        } else if (data.type === 'done') {
          if (activeMessageRef.current) {
            activeMessageRef.current.isStreaming = false;
            activeMessageRef.current = null;
          }
          // Also ensure tool bubbles are cleared if there was no text response
          setMessages((prev) => [...prev.filter(m => !m.toolAction)]);
        }
      } catch (err) {
        console.error('Chat WS parse error', err);
      }
    };

    ws.onclose = () => {
      setIsConnected(false);
      setIsWaiting(false);
      setTimeout(connectChatWebSocket, 5000);
    };

    wsChatRef.current = ws;
  };

  const sendMessage = () => {
    if ((!inputText.trim() && !selectedImage) || !isConnected) return;
    const textMsg = inputText.trim() || 'Please analyze this image.';
    const userMsg: Message = { id: Date.now().toString(), sender: 'user', text: textMsg + (selectedImage ? ' [Image attached]' : '') };
    setMessages((prev) => [...prev, userMsg]);
    setIsWaiting(true);
    
    const payload: any = { type: 'text', text: textMsg };
    if (selectedImage && selectedImage.base64) {
      payload.attachments = [{
        type: 'image',
        mimeType: selectedImage.mimeType,
        data: selectedImage.base64
      }];
    }
    
    wsChatRef.current?.send(JSON.stringify(payload));
    setInputText('');
    setSelectedImage(null);
  };

  const handlePickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });

    if (!result.canceled && result.assets && result.assets.length > 0) {
      const asset = result.assets[0];
      setSelectedImage({
        uri: asset.uri,
        base64: asset.base64 || '',
        mimeType: asset.mimeType || 'image/jpeg'
      });
    }
  };

  const handleCheckForUpdates = async () => {
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        Alert.alert(
          'Update Available',
          'A new version of Athena is available. Do you want to download and install it?',
          [
            { text: 'Cancel', style: 'cancel' },
            {
              text: 'Update',
              onPress: async () => {
                await Updates.fetchUpdateAsync();
                await Updates.reloadAsync();
              },
            },
          ]
        );
      } else {
        Alert.alert('Up to date', 'You are running the latest version of Athena.');
      }
    } catch (e: any) {
      Alert.alert('Update Error', e.message);
    }
  };

  return (
    <View style={styles.container}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <View style={{ flexDirection: 'row', alignItems: 'center' }}>
          <Text style={styles.headerTitle}>A T H E N A</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
          <View style={styles.statusContainer}>
            <View style={[styles.statusDot, { backgroundColor: isConnected ? '#00e676' : '#ff1744' }]} />
            <Text style={styles.statusText}>{isConnected ? 'SYSTEM ONLINE' : 'OFFLINE'}</Text>
          </View>
          <TouchableOpacity onPress={handleCheckForUpdates} style={{ padding: 5, backgroundColor: '#1a1a2e', borderRadius: 20 }}>
            <Text style={{ fontSize: 16 }}>🔄</Text>
          </TouchableOpacity>
        </View>
      </View>
      <KeyboardAvoidingView style={styles.chatContainer} behavior={Platform.OS === 'ios' ? 'padding' : 'height'} keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}>
        <ScrollView ref={scrollViewRef} style={styles.messageList} contentContainerStyle={{ paddingBottom: 20 }} onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}>
          {messages.length === 0 && (
            <View style={styles.emptyState}>
              <Text style={styles.emptyStateText}>Awaiting direct input...</Text>
            </View>
          )}

          {messages.map((msg, idx) => {
            const isUser = msg.sender === 'user';
            const isTool = !!msg.toolAction;
            return (
              <View key={msg.id + idx} style={[styles.messageBubble, isUser ? styles.userBubble : isTool ? styles.toolBubble : styles.athenaBubble]}>
                {isTool && <ActivityIndicator size="small" color="#00e5ff" style={{ marginRight: 8 }} />}
                <Text style={[styles.messageText, isUser ? styles.userText : isTool ? styles.toolText : styles.athenaText]}>{msg.text}</Text>
                {msg.isStreaming && <View style={styles.cursor} />}
              </View>
            );
          })}
          
          {isWaiting && (
            <View style={[styles.messageBubble, styles.athenaBubble, { paddingVertical: 18 }]}>
               <ActivityIndicator size="small" color="#00e5ff" />
            </View>
          )}
        </ScrollView>

        <View style={styles.inputContainer}>
          <TouchableOpacity style={styles.clearButton} onPress={() => setMessages([])}>
            <Text style={styles.clearButtonText}>CLR</Text>
          </TouchableOpacity>
          <TouchableOpacity style={{ padding: 10, marginRight: 5, backgroundColor: selectedImage ? '#00e5ff22' : 'transparent', borderRadius: 20 }} onPress={handlePickImage}>
            <Text style={{ fontSize: 20 }}>{selectedImage ? '🖼️' : '📎'}</Text>
          </TouchableOpacity>
          <TextInput
            style={styles.textInput}
            placeholder="Command override..."
            placeholderTextColor="#4a5568"
            value={inputText}
            onChangeText={setInputText}
            onSubmitEditing={sendMessage}
            keyboardAppearance="dark"
            multiline={true}
            maxLength={1000}
          />
          <TouchableOpacity style={[styles.sendButton, (!inputText.trim() && !selectedImage) && styles.sendButtonDisabled]} onPress={sendMessage} disabled={!inputText.trim() && !selectedImage}>
            <Text style={styles.sendButtonText}>SEND</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </View>
  );
}

const styles = StyleSheet.create({
  startupContainer: {
    flex: 1,
    backgroundColor: '#050505',
    justifyContent: 'center',
    padding: 20,
  },
  startupTitle: {
    color: '#00e5ff',
    fontSize: 32,
    fontWeight: '800',
    letterSpacing: 6,
    textAlign: 'center',
    marginBottom: 10,
  },
  startupSubtitle: {
    color: '#8892b0',
    fontSize: 16,
    textAlign: 'center',
    marginBottom: 40,
    letterSpacing: 2,
  },
  modeCard: {
    backgroundColor: '#111',
    borderWidth: 1,
    borderColor: '#333',
    borderRadius: 12,
    padding: 24,
    marginBottom: 20,
  },
  modeCardTitle: {
    color: '#fff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  modeCardHardware: {
    backgroundColor: '#0a1929',
    borderWidth: 1,
    borderColor: '#00e5ff',
    borderRadius: 12,
    padding: 24,
    marginBottom: 20,
    shadowColor: '#00e5ff',
    shadowOpacity: 0.2,
    shadowRadius: 10,
    shadowOffset: { width: 0, height: 0 },
  },
  modeCardTitleHardware: {
    color: '#00e5ff',
    fontSize: 20,
    fontWeight: '700',
    marginBottom: 8,
  },
  modeCardDesc: {
    color: '#8892b0',
    fontSize: 14,
    lineHeight: 20,
  },
  container: {
    flex: 1,
    backgroundColor: '#050505',
  },
  header: {
    paddingTop: Platform.OS === 'ios' ? 60 : 40,
    paddingBottom: 15,
    paddingHorizontal: 20,
    backgroundColor: 'rgba(10, 10, 12, 0.95)',
    borderBottomWidth: 1,
    borderBottomColor: '#1a1a2e',
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    zIndex: 10,
  },
  headerTitle: {
    color: '#00e5ff',
    fontSize: 22,
    fontWeight: '800',
    letterSpacing: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: '#111',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: '#222',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    color: '#8892b0',
    fontSize: 10,
    fontWeight: '600',
    letterSpacing: 1,
  },
  chatContainer: {
    flex: 1,
  },
  messageList: {
    flex: 1,
    padding: 15,
  },
  emptyState: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    marginTop: 100,
  },
  emptyStateText: {
    color: '#334155',
    fontSize: 14,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    letterSpacing: 2,
  },
  messageBubble: {
    maxWidth: '85%',
    padding: 16,
    borderRadius: 16,
    marginBottom: 16,
    flexDirection: 'row',
    alignItems: 'center',
  },
  userBubble: {
    alignSelf: 'flex-end',
    backgroundColor: '#1e1e2e',
    borderBottomRightRadius: 4,
    borderWidth: 1,
    borderColor: '#2a2a3c',
  },
  athenaBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#0a1929',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0, 229, 255, 0.2)',
  },
  toolBubble: {
    alignSelf: 'flex-start',
    backgroundColor: '#111827',
    borderBottomLeftRadius: 4,
    borderWidth: 1,
    borderColor: '#374151',
    paddingVertical: 10,
  },
  messageText: {
    fontSize: 16,
    lineHeight: 24,
  },
  userText: {
    color: '#e2e8f0',
  },
  athenaText: {
    color: '#a5f3fc',
  },
  toolText: {
    color: '#9ca3af',
    fontSize: 13,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  cursor: {
    width: 8,
    height: 16,
    backgroundColor: '#00e5ff',
    marginLeft: 4,
    marginTop: 4,
  },
  inputContainer: {
    flexDirection: 'row',
    padding: 15,
    paddingBottom: Platform.OS === 'ios' ? 30 : 15,
    backgroundColor: '#0a0a0f',
    borderTopWidth: 1,
    borderTopColor: '#1a1a2e',
    alignItems: 'flex-end',
  },
  clearButton: {
    backgroundColor: '#1a1a24',
    borderRadius: 12,
    paddingHorizontal: 16,
    paddingVertical: 14,
    marginRight: 10,
    borderWidth: 1,
    borderColor: '#2a2a3c',
    justifyContent: 'center',
  },
  clearButtonText: {
    color: '#ff4444',
    fontWeight: '700',
    fontSize: 12,
    letterSpacing: 1,
  },
  textInput: {
    flex: 1,
    backgroundColor: '#111118',
    color: '#fff',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingTop: 14,
    paddingBottom: 14,
    fontSize: 16,
    maxHeight: 120,
    borderWidth: 1,
    borderColor: '#222',
  },
  sendButton: {
    marginLeft: 10,
    backgroundColor: '#00e5ff',
    borderRadius: 20,
    paddingHorizontal: 20,
    paddingVertical: 14,
    justifyContent: 'center',
    shadowColor: '#00e5ff',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
  sendButtonDisabled: {
    backgroundColor: '#1a3644',
    shadowOpacity: 0,
  },
  sendButtonText: {
    color: '#000',
    fontWeight: '800',
    fontSize: 14,
    letterSpacing: 1,
  },
});
