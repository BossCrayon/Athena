import React, { useState, useEffect, useRef, useCallback } from 'react';
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
  Animated,
  Keyboard,
  TouchableWithoutFeedback,
  Dimensions,
  Image,
} from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { LinearGradient } from 'expo-linear-gradient';
import * as Battery from 'expo-battery';
import * as Haptics from 'expo-haptics';
import * as Location from 'expo-location';
import * as Updates from 'expo-updates';
import * as SecureStore from 'expo-secure-store';
import * as Crypto from 'expo-crypto';
import * as ImagePicker from 'expo-image-picker';

const DEFAULT_WS_URL = 'wss://my-athena-brain.loca.lt';
const NODE_CAPABILITIES = ['get_battery_level', 'vibrate_phone', 'get_location', 'capture_image'];
const { width: SCREEN_WIDTH } = Dimensions.get('window');

interface Message {
  id: string;
  sender: 'user' | 'athena';
  text: string;
  isStreaming?: boolean;
  toolAction?: string;
}

// ─────────────────────────────────────────
// ROOT APP
// ─────────────────────────────────────────
export default function App() {
  const [appState, setAppState] = useState<'loading' | 'register' | 'chat'>('loading');
  const [deviceToken, setDeviceToken] = useState('');
  const [deviceRole, setDeviceRole] = useState<'admin' | 'user'>('user');
  const [nodeId, setNodeId] = useState('');
  const [serverUrl, setServerUrl] = useState(DEFAULT_WS_URL);

  useEffect(() => {
    async function bootstrap() {
      // Load or create node ID
      let storedId = await SecureStore.getItemAsync('ATHENA_MOBILE_NODE_ID');
      if (!storedId) {
        storedId = 'mobile-' + Crypto.randomUUID();
        await SecureStore.setItemAsync('ATHENA_MOBILE_NODE_ID', storedId);
      }
      setNodeId(storedId);

      // Check for stored server URL
      const storedUrl = await SecureStore.getItemAsync('ATHENA_SERVER_URL');
      if (storedUrl) setServerUrl(storedUrl);

      // Check for stored device token
      const storedToken = await SecureStore.getItemAsync('ATHENA_DEVICE_TOKEN');
      const storedRole = await SecureStore.getItemAsync('ATHENA_DEVICE_ROLE');
      if (storedToken) {
        setDeviceToken(storedToken);
        setDeviceRole((storedRole as 'admin' | 'user') || 'user');
        setAppState('chat');
      } else {
        setAppState('register');
      }
    }
    bootstrap();
  }, []);

  const handleRegistered = (token: string, role: 'admin' | 'user') => {
    setDeviceToken(token);
    setDeviceRole(role);
    setAppState('chat');
  };

  const handleLogout = async () => {
    await SecureStore.deleteItemAsync('ATHENA_DEVICE_TOKEN');
    await SecureStore.deleteItemAsync('ATHENA_DEVICE_ROLE');
    setDeviceToken('');
    setAppState('register');
  };

  if (appState === 'loading') {
    return (
      <LinearGradient colors={['#050d1a', '#0a1229', '#050d1a']} style={styles.loadingContainer}>
        <StatusBar style="light" />
        <Text style={styles.logoText}>A T H E N A</Text>
        <ActivityIndicator color="#00e5ff" style={{ marginTop: 20 }} />
      </LinearGradient>
    );
  }

  if (appState === 'register') {
    return (
      <RegisterScreen
        serverUrl={serverUrl}
        onServerUrlChange={setServerUrl}
        onRegistered={handleRegistered}
      />
    );
  }

  return (
    <ChatScreen
      deviceToken={deviceToken}
      role={deviceRole}
      nodeId={nodeId}
      serverUrl={serverUrl}
      onLogout={handleLogout}
    />
  );
}

// ─────────────────────────────────────────
// REGISTER SCREEN
// ─────────────────────────────────────────
function RegisterScreen({
  serverUrl,
  onServerUrlChange,
  onRegistered,
}: {
  serverUrl: string;
  onServerUrlChange: (url: string) => void;
  onRegistered: (token: string, role: 'admin' | 'user') => void;
}) {
  const [inviteCode, setInviteCode] = useState('');
  const [userName, setUserName] = useState('');
  const [urlInput, setUrlInput] = useState(serverUrl);
  const [isLoading, setIsLoading] = useState(false);
  const fadeAnim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(fadeAnim, { toValue: 1, duration: 800, useNativeDriver: true }).start();
  }, []);

  const handleRegister = async () => {
    if (!inviteCode.trim() || !userName.trim()) {
      Alert.alert('Missing Info', 'Please enter both your name and the invite code.');
      return;
    }

    setIsLoading(true);
    await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);

    try {
      const httpUrl = urlInput.replace('wss://', 'https://').replace('ws://', 'http://');
      const response = await fetch(`${httpUrl}/auth/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ hash: inviteCode.trim(), name: userName.trim() }),
      });

      const data = await response.json();

      if (!response.ok) {
        Alert.alert('Authentication Failed', data.error || 'Invalid or expired invite code.');
        setIsLoading(false);
        return;
      }

      // Save credentials permanently
      await SecureStore.setItemAsync('ATHENA_DEVICE_TOKEN', data.token);
      await SecureStore.setItemAsync('ATHENA_DEVICE_ROLE', data.role);
      await SecureStore.setItemAsync('ATHENA_SERVER_URL', urlInput.trim());
      onServerUrlChange(urlInput.trim());

      await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      onRegistered(data.token, data.role);
    } catch (e: any) {
      Alert.alert('Connection Error', 'Could not reach the Athena server. Check the URL and try again.');
      setIsLoading(false);
    }
  };

  return (
    <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
      <LinearGradient colors={['#050d1a', '#0a1229', '#050d1a']} style={{ flex: 1 }}>
        <StatusBar style="light" />
        <Animated.View style={[styles.registerContainer, { opacity: fadeAnim }]}>
          <View style={styles.logoSection}>
            <Text style={styles.logoText}>A T H E N A</Text>
            <Text style={styles.logoSubtitle}>DEVICE REGISTRATION</Text>
            <View style={styles.logoDivider} />
          </View>

          <View style={styles.registerCard}>
            <Text style={styles.inputLabel}>YOUR NAME</Text>
            <TextInput
              style={styles.glassInput}
              placeholder="John Loreno"
              placeholderTextColor="rgba(136,146,176,0.5)"
              value={userName}
              onChangeText={setUserName}
              autoCapitalize="words"
            />

            <Text style={[styles.inputLabel, { marginTop: 20 }]}>INVITE CODE</Text>
            <TextInput
              style={[styles.glassInput, styles.codeInput]}
              placeholder="Paste your 128-character invite code here..."
              placeholderTextColor="rgba(136,146,176,0.4)"
              value={inviteCode}
              onChangeText={setInviteCode}
              autoCapitalize="none"
              autoCorrect={false}
              multiline
            />

            <Text style={[styles.inputLabel, { marginTop: 20 }]}>SERVER URL</Text>
            <TextInput
              style={styles.glassInput}
              placeholder="wss://..."
              placeholderTextColor="rgba(136,146,176,0.4)"
              value={urlInput}
              onChangeText={setUrlInput}
              autoCapitalize="none"
              keyboardType="url"
            />

            <TouchableOpacity
              style={[styles.primaryButton, isLoading && styles.primaryButtonDisabled]}
              onPress={handleRegister}
              disabled={isLoading}
            >
              {isLoading ? (
                <ActivityIndicator color="#000" />
              ) : (
                <Text style={styles.primaryButtonText}>REGISTER DEVICE</Text>
              )}
            </TouchableOpacity>
          </View>

          <Text style={styles.footerHint}>
            You only need to do this once. Contact your administrator for an invite code.
          </Text>
        </Animated.View>
      </LinearGradient>
    </TouchableWithoutFeedback>
  );
}

// ─────────────────────────────────────────
// CHAT SCREEN
// ─────────────────────────────────────────
function ChatScreen({
  deviceToken,
  role,
  nodeId,
  serverUrl,
  onLogout,
}: {
  deviceToken: string;
  role: 'admin' | 'user';
  nodeId: string;
  serverUrl: string;
  onLogout: () => void;
}) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [inputText, setInputText] = useState('');
  const [isConnected, setIsConnected] = useState(false);
  const [isWaiting, setIsWaiting] = useState(false);
  const [mode, setMode] = useState<'ai' | 'hardware'>(role === 'admin' ? 'ai' : 'ai');
  const [selectedImage, setSelectedImage] = useState<{ uri: string, base64: string, mimeType: string } | null>(null);
  const [showModeMenu, setShowModeMenu] = useState(false);
  const pulseAnim = useRef(new Animated.Value(1)).current;

  const wsChatRef = useRef<WebSocket | null>(null);
  const wsNodeRef = useRef<WebSocket | null>(null);
  const scrollViewRef = useRef<ScrollView>(null);
  const activeMessageRef = useRef<Message | null>(null);

  // Pulse animation for thinking indicator
  useEffect(() => {
    const pulse = Animated.loop(
      Animated.sequence([
        Animated.timing(pulseAnim, { toValue: 0.4, duration: 700, useNativeDriver: true }),
        Animated.timing(pulseAnim, { toValue: 1, duration: 700, useNativeDriver: true }),
      ])
    );
    if (isWaiting) pulse.start();
    else { pulse.stop(); pulseAnim.setValue(1); }
    return () => pulse.stop();
  }, [isWaiting]);

  useEffect(() => {
    connectChatWebSocket();
    if (mode === 'hardware' && role === 'admin') connectNodeWebSocket();
    return () => {
      wsChatRef.current?.close();
      wsNodeRef.current?.close();
    };
  }, [mode]);

  let nodeReconnectDelay = 1000;
  const connectNodeWebSocket = async () => {
    await Location.requestForegroundPermissionsAsync();

    const wsNode = new WebSocket(`${serverUrl}/nodes`);
    wsNode.onopen = () => {
      nodeReconnectDelay = 1000;
      wsNode.send(JSON.stringify({
        type: 'node_register',
        id: nodeId,
        name: Platform.OS + ' Phone',
        nodeType: 'mobile',
        token: deviceToken,
        capabilities: NODE_CAPABILITIES
      }));
    };

    wsNode.onmessage = async (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'ping') {
          wsNode.send(JSON.stringify({ type: 'pong' }));
        } else if (message.type === 'execute_tool') {
          let result: any = null;
          if (message.toolName === 'get_battery_level') {
            const level = await Battery.getBatteryLevelAsync();
            const state = await Battery.getBatteryStateAsync();
            let stateStr = 'Unknown';
            if (state === Battery.BatteryState.UNPLUGGED) stateStr = 'Running on battery';
            else if (state === Battery.BatteryState.CHARGING) stateStr = 'Charging';
            else if (state === Battery.BatteryState.FULL) stateStr = 'Fully Charged';
            result = `🔋 Battery: ${Math.round(level * 100)}%\n⚡ ${stateStr}`;
          } else if (message.toolName === 'vibrate_phone') {
            const style = message.args?.style || 'medium';
            if (style === 'heavy') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Heavy);
            else if (style === 'light') await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
            else if (style === 'success') await Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
            else await Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            result = `Phone vibrated with style: ${style}`;
          } else if (message.toolName === 'get_location') {
            let { status } = await Location.getForegroundPermissionsAsync();
            if (status !== 'granted') {
              result = 'Location permission denied.';
            } else {
              let loc = await Location.getCurrentPositionAsync({});
              result = `Lat: ${loc.coords.latitude}, Lon: ${loc.coords.longitude}`;
            }
          } else {
            result = `Unknown tool: ${message.toolName}`;
          }
          wsNode.send(JSON.stringify({ type: 'tool_result', callId: message.callId, result }));
        }
      } catch (err) { console.error('Node WS error', err); }
    };

    wsNode.onclose = () => {
      setTimeout(connectNodeWebSocket, nodeReconnectDelay);
      nodeReconnectDelay = Math.min(nodeReconnectDelay * 2, 30000);
    };
    wsNodeRef.current = wsNode;
  };

  let chatReconnectDelay = 1000;
  const connectChatWebSocket = useCallback(() => {
    const wsUrl = `${serverUrl}/chat?token=${encodeURIComponent(deviceToken)}`;
    const wsChat = new WebSocket(wsUrl);

    wsChat.onopen = () => {
      setIsConnected(true);
      chatReconnectDelay = 1000;
    };

    wsChat.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        setIsWaiting(false);
        if (data.type === 'token') {
          if (!activeMessageRef.current) {
            const newMsg: Message = { id: Date.now().toString(), sender: 'athena', text: data.text, isStreaming: true };
            activeMessageRef.current = newMsg;
            setMessages((prev) => [...prev.filter(m => !m.toolAction), newMsg]);
          } else {
            activeMessageRef.current.text += data.text;
            setMessages((prev) => [...prev]);
          }
          scrollViewRef.current?.scrollToEnd({ animated: false });
        } else if (data.type === 'tool') {
          setMessages((prev) => [...prev, {
            id: Date.now().toString() + '-tool',
            sender: 'athena',
            text: `⚙️  ${data.tool}`,
            toolAction: data.tool,
          }]);
        } else if (data.type === 'done') {
          if (activeMessageRef.current) {
            activeMessageRef.current.isStreaming = false;
            activeMessageRef.current = null;
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
          }
          setMessages((prev) => [...prev.filter(m => !m.toolAction)]);
          setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
        }
      } catch (err) { console.error('Chat WS parse error', err); }
    };

    wsChat.onclose = () => {
      setIsConnected(false);
      setIsWaiting(false);
      setTimeout(connectChatWebSocket, chatReconnectDelay);
      chatReconnectDelay = Math.min(chatReconnectDelay * 2, 30000);
    };

    wsChatRef.current = wsChat;
  }, [serverUrl, deviceToken]);

  const sendMessage = () => {
    if ((!inputText.trim() && !selectedImage) || !isConnected) return;

    const textMsg = inputText.trim() || 'Please analyze this image.';
    const userMsg: Message = { id: Date.now().toString(), sender: 'user', text: textMsg + (selectedImage ? ' 📎' : '') };
    setMessages((prev) => [...prev, userMsg]);
    setIsWaiting(true);

    const payload: any = { type: 'text', text: textMsg };
    if (selectedImage?.base64) {
      payload.attachments = [{ type: 'image', mimeType: selectedImage.mimeType, data: selectedImage.base64 }];
    }

    wsChatRef.current?.send(JSON.stringify(payload));
    setInputText('');
    setSelectedImage(null);
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setTimeout(() => scrollViewRef.current?.scrollToEnd({ animated: true }), 100);
  };

  const handlePickImage = async () => {
    let result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ImagePicker.MediaTypeOptions.Images,
      allowsEditing: true,
      quality: 0.7,
      base64: true,
    });
    if (!result.canceled && result.assets?.length > 0) {
      const asset = result.assets[0];
      setSelectedImage({ uri: asset.uri, base64: asset.base64 || '', mimeType: asset.mimeType || 'image/jpeg' });
    }
  };

  const handleCheckForUpdates = async () => {
    try {
      const update = await Updates.checkForUpdateAsync();
      if (update.isAvailable) {
        Alert.alert('Update Available', 'Install the latest version?', [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Update', onPress: async () => { await Updates.fetchUpdateAsync(); await Updates.reloadAsync(); } },
        ]);
      } else {
        Alert.alert('Up to date', 'You are running the latest version.');
      }
    } catch (e: any) { Alert.alert('Update Error', e.message); }
  };

  const confirmLogout = () => {
    Alert.alert('Log Out', 'This will remove your device registration. You will need a new invite code to log back in.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Log Out', style: 'destructive', onPress: onLogout },
    ]);
  };

  return (
    <LinearGradient colors={['#050d1a', '#0a1229', '#050d1a']} style={styles.container}>
      <StatusBar style="light" />

      {/* HEADER */}
      <View style={styles.header}>
        <View>
          <Text style={styles.headerTitle}>A T H E N A</Text>
          <Text style={styles.headerRole}>{role.toUpperCase()} · {mode === 'hardware' ? 'HARDWARE LINK' : 'AI CHAT'}</Text>
        </View>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <View style={[styles.statusPill, { borderColor: isConnected ? '#00e676' : '#ff1744' }]}>
            <View style={[styles.statusDot, { backgroundColor: isConnected ? '#00e676' : '#ff1744' }]} />
            <Text style={[styles.statusText, { color: isConnected ? '#00e676' : '#ff1744' }]}>
              {isConnected ? 'ONLINE' : 'OFFLINE'}
            </Text>
          </View>
          {/* Mode switcher (admin only) */}
          {role === 'admin' && (
            <TouchableOpacity
              style={styles.iconButton}
              onPress={() => setShowModeMenu(!showModeMenu)}
            >
              <Text style={{ fontSize: 15 }}>⚙️</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity style={styles.iconButton} onPress={handleCheckForUpdates}>
            <Text style={{ fontSize: 15 }}>🔄</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.iconButton} onPress={confirmLogout}>
            <Text style={{ fontSize: 14 }}>🔒</Text>
          </TouchableOpacity>
        </View>
      </View>

      {/* MODE MENU (Admin only) */}
      {showModeMenu && role === 'admin' && (
        <View style={styles.modeMenu}>
          <TouchableOpacity
            style={[styles.modeMenuItem, mode === 'ai' && styles.modeMenuItemActive]}
            onPress={() => { setMode('ai'); setShowModeMenu(false); wsNodeRef.current?.close(); }}
          >
            <Text style={styles.modeMenuText}>💬  AI Chat</Text>
          </TouchableOpacity>
          <TouchableOpacity
            style={[styles.modeMenuItem, mode === 'hardware' && styles.modeMenuItemActive]}
            onPress={() => { setMode('hardware'); setShowModeMenu(false); connectNodeWebSocket(); }}
          >
            <Text style={styles.modeMenuText}>🔌  Hardware Link</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* CHAT */}
      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        keyboardVerticalOffset={Platform.OS === 'ios' ? 0 : 20}
      >
        <TouchableWithoutFeedback onPress={Keyboard.dismiss}>
          <ScrollView
            ref={scrollViewRef}
            style={styles.messageList}
            contentContainerStyle={{ paddingBottom: 24, paddingTop: 8 }}
            onContentSizeChange={() => scrollViewRef.current?.scrollToEnd({ animated: true })}
            keyboardShouldPersistTaps="handled"
          >
            {messages.length === 0 && !isWaiting && (
              <View style={styles.emptyState}>
                <Text style={styles.emptyStateIcon}>✦</Text>
                <Text style={styles.emptyStateText}>How can I assist you today?</Text>
              </View>
            )}

            {messages.map((msg, idx) => {
              const isUser = msg.sender === 'user';
              const isTool = !!msg.toolAction;
              return (
                <View key={msg.id + idx} style={[styles.msgRow, isUser && styles.msgRowUser]}>
                  {!isUser && !isTool && (
                    <View style={styles.avatarBadge}>
                      <Text style={styles.avatarText}>A</Text>
                    </View>
                  )}
                  <View style={[
                    styles.bubble,
                    isUser ? styles.userBubble : isTool ? styles.toolBubble : styles.athenaBubble,
                    isTool && { flexDirection: 'row', alignItems: 'center', gap: 8 }
                  ]}>
                    {isTool && <ActivityIndicator size="small" color="#7dd3fc" />}
                    <Text style={[
                      styles.bubbleText,
                      isUser ? styles.userText : isTool ? styles.toolText : styles.athenaText
                    ]}>
                      {msg.text}
                    </Text>
                    {msg.isStreaming && (
                      <View style={styles.cursor} />
                    )}
                  </View>
                </View>
              );
            })}

            {/* Thinking indicator */}
            {isWaiting && (
              <View style={styles.msgRow}>
                <View style={styles.avatarBadge}>
                  <Text style={styles.avatarText}>A</Text>
                </View>
                <Animated.View style={[styles.bubble, styles.athenaBubble, styles.thinkingBubble, { opacity: pulseAnim }]}>
                  <View style={styles.thinkingDots}>
                    <View style={[styles.dot, { backgroundColor: '#7dd3fc' }]} />
                    <View style={[styles.dot, { backgroundColor: '#7dd3fc', opacity: 0.6 }]} />
                    <View style={[styles.dot, { backgroundColor: '#7dd3fc', opacity: 0.3 }]} />
                  </View>
                </Animated.View>
              </View>
            )}
          </ScrollView>
        </TouchableWithoutFeedback>

        {/* Image preview */}
        {selectedImage && (
          <View style={styles.imagePreview}>
            <Image source={{ uri: selectedImage.uri }} style={styles.previewImg} />
            <TouchableOpacity style={styles.removePreview} onPress={() => setSelectedImage(null)}>
              <Text style={{ color: '#fff', fontWeight: 'bold', fontSize: 12 }}>✕</Text>
            </TouchableOpacity>
          </View>
        )}

        {/* INPUT BAR */}
        <View style={styles.inputWrapper}>
          <View style={styles.inputBar}>
            <TouchableOpacity style={styles.attachBtn} onPress={handlePickImage}>
              <Text style={{ fontSize: 18 }}>📎</Text>
            </TouchableOpacity>
            <TextInput
              style={styles.textInput}
              placeholder="Message Athena..."
              placeholderTextColor="rgba(136,146,176,0.6)"
              value={inputText}
              onChangeText={setInputText}
              onSubmitEditing={sendMessage}
              keyboardAppearance="dark"
              multiline
              maxLength={1000}
            />
            <TouchableOpacity
              style={[styles.sendBtn, (!inputText.trim() && !selectedImage) && styles.sendBtnDisabled]}
              onPress={sendMessage}
              disabled={!inputText.trim() && !selectedImage}
            >
              <Text style={styles.sendBtnIcon}>↑</Text>
            </TouchableOpacity>
          </View>
          <TouchableOpacity onPress={() => setMessages([])} style={styles.clearBtn}>
            <Text style={styles.clearBtnText}>Clear chat</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

// ─────────────────────────────────────────
// STYLES
// ─────────────────────────────────────────
const styles = StyleSheet.create({
  // Loading
  loadingContainer: {
    flex: 1, justifyContent: 'center', alignItems: 'center',
  },

  // Register
  registerContainer: {
    flex: 1, justifyContent: 'center', padding: 24,
  },
  logoSection: {
    alignItems: 'center', marginBottom: 36,
  },
  logoText: {
    color: '#00e5ff',
    fontSize: 30,
    fontWeight: '800',
    letterSpacing: 8,
    textAlign: 'center',
  },
  logoSubtitle: {
    color: 'rgba(136,146,176,0.7)',
    fontSize: 11,
    letterSpacing: 4,
    marginTop: 8,
  },
  logoDivider: {
    width: 40, height: 1, backgroundColor: 'rgba(0,229,255,0.3)', marginTop: 20,
  },
  registerCard: {
    backgroundColor: 'rgba(255,255,255,0.04)',
    borderRadius: 20,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
    padding: 24,
  },
  inputLabel: {
    color: 'rgba(136,146,176,0.8)',
    fontSize: 10,
    letterSpacing: 2,
    marginBottom: 8,
    fontWeight: '600',
  },
  glassInput: {
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 12,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    color: '#e2e8f0',
    paddingHorizontal: 16,
    paddingVertical: 14,
    fontSize: 15,
  },
  codeInput: {
    minHeight: 80,
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    fontSize: 11,
    lineHeight: 18,
  },
  primaryButton: {
    backgroundColor: '#00e5ff',
    borderRadius: 14,
    paddingVertical: 16,
    alignItems: 'center',
    marginTop: 28,
    shadowColor: '#00e5ff',
    shadowOpacity: 0.25,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  primaryButtonDisabled: {
    backgroundColor: '#1a3644', shadowOpacity: 0,
  },
  primaryButtonText: {
    color: '#000', fontWeight: '800', fontSize: 13, letterSpacing: 2,
  },
  footerHint: {
    color: 'rgba(136,146,176,0.4)',
    fontSize: 12,
    textAlign: 'center',
    marginTop: 24,
    lineHeight: 18,
  },

  // Chat container
  container: { flex: 1 },
  header: {
    paddingTop: Platform.OS === 'ios' ? 58 : 38,
    paddingBottom: 14,
    paddingHorizontal: 20,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.06)',
    backgroundColor: 'rgba(5,13,26,0.8)',
  },
  headerTitle: {
    color: '#00e5ff',
    fontSize: 18,
    fontWeight: '800',
    letterSpacing: 4,
  },
  headerRole: {
    color: 'rgba(136,146,176,0.6)',
    fontSize: 10,
    letterSpacing: 2,
    marginTop: 2,
  },
  statusPill: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 10,
    paddingVertical: 5,
    borderRadius: 20,
    borderWidth: 1,
    backgroundColor: 'rgba(255,255,255,0.04)',
    gap: 6,
  },
  statusDot: {
    width: 6, height: 6, borderRadius: 3,
  },
  statusText: {
    fontSize: 9, fontWeight: '700', letterSpacing: 1,
  },
  iconButton: {
    width: 34, height: 34,
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 17,
    justifyContent: 'center',
    alignItems: 'center',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },

  // Mode menu
  modeMenu: {
    position: 'absolute',
    top: Platform.OS === 'ios' ? 120 : 100,
    right: 16,
    backgroundColor: 'rgba(10,18,41,0.96)',
    borderRadius: 14,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.2)',
    zIndex: 100,
    overflow: 'hidden',
    shadowColor: '#000',
    shadowOpacity: 0.5,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
  },
  modeMenuItem: {
    paddingVertical: 14,
    paddingHorizontal: 20,
    borderBottomWidth: 1,
    borderBottomColor: 'rgba(255,255,255,0.05)',
  },
  modeMenuItemActive: {
    backgroundColor: 'rgba(0,229,255,0.08)',
  },
  modeMenuText: {
    color: '#e2e8f0',
    fontSize: 14,
    fontWeight: '600',
  },

  // Messages
  messageList: { flex: 1, paddingHorizontal: 16 },
  emptyState: {
    marginTop: 100, alignItems: 'center', gap: 12,
  },
  emptyStateIcon: {
    fontSize: 28, color: 'rgba(0,229,255,0.3)',
  },
  emptyStateText: {
    color: 'rgba(136,146,176,0.5)',
    fontSize: 15,
    textAlign: 'center',
    lineHeight: 22,
  },
  msgRow: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    marginBottom: 14,
    gap: 10,
  },
  msgRowUser: {
    flexDirection: 'row-reverse',
  },
  avatarBadge: {
    width: 30, height: 30, borderRadius: 15,
    backgroundColor: 'rgba(0,229,255,0.12)',
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.3)',
    justifyContent: 'center', alignItems: 'center',
    marginBottom: 2,
  },
  avatarText: {
    color: '#00e5ff', fontSize: 12, fontWeight: '800',
  },
  bubble: {
    maxWidth: SCREEN_WIDTH * 0.75,
    paddingHorizontal: 16,
    paddingVertical: 12,
    borderRadius: 18,
  },
  athenaBubble: {
    backgroundColor: 'rgba(255,255,255,0.05)',
    borderTopLeftRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.08)',
  },
  userBubble: {
    backgroundColor: 'rgba(0,229,255,0.12)',
    borderTopRightRadius: 4,
    borderWidth: 1,
    borderColor: 'rgba(0,229,255,0.2)',
  },
  toolBubble: {
    backgroundColor: 'rgba(255,255,255,0.03)',
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.06)',
    paddingVertical: 10,
  },
  thinkingBubble: {
    paddingVertical: 14,
    paddingHorizontal: 20,
  },
  bubbleText: {
    fontSize: 15,
    lineHeight: 22,
  },
  athenaText: { color: '#e2e8f0' },
  userText: { color: '#a5f3fc' },
  toolText: { color: 'rgba(136,146,176,0.7)', fontSize: 13, fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace' },
  cursor: {
    width: 2, height: 16,
    backgroundColor: '#00e5ff',
    marginLeft: 3,
    marginTop: 3,
    borderRadius: 1,
  },
  thinkingDots: {
    flexDirection: 'row', gap: 6, alignItems: 'center',
  },
  dot: {
    width: 7, height: 7, borderRadius: 4,
  },

  // Input
  inputWrapper: {
    paddingHorizontal: 16,
    paddingBottom: Platform.OS === 'ios' ? 32 : 16,
    paddingTop: 8,
    gap: 6,
  },
  inputBar: {
    flexDirection: 'row',
    alignItems: 'flex-end',
    backgroundColor: 'rgba(255,255,255,0.06)',
    borderRadius: 22,
    borderWidth: 1,
    borderColor: 'rgba(255,255,255,0.1)',
    paddingHorizontal: 6,
    paddingVertical: 6,
    gap: 6,
  },
  attachBtn: {
    width: 38, height: 38,
    justifyContent: 'center', alignItems: 'center',
  },
  textInput: {
    flex: 1,
    color: '#e2e8f0',
    fontSize: 15,
    lineHeight: 22,
    maxHeight: 110,
    paddingTop: 8,
    paddingBottom: 8,
  },
  sendBtn: {
    width: 38, height: 38,
    backgroundColor: '#00e5ff',
    borderRadius: 19,
    justifyContent: 'center', alignItems: 'center',
    shadowColor: '#00e5ff',
    shadowOpacity: 0.3,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 2 },
  },
  sendBtnDisabled: {
    backgroundColor: 'rgba(0,229,255,0.15)',
    shadowOpacity: 0,
  },
  sendBtnIcon: {
    color: '#000', fontSize: 18, fontWeight: '800',
  },
  clearBtn: {
    alignItems: 'center', paddingVertical: 4,
  },
  clearBtnText: {
    color: 'rgba(136,146,176,0.35)',
    fontSize: 12,
  },

  // Image preview
  imagePreview: {
    marginHorizontal: 16, marginBottom: 8,
    position: 'relative', alignSelf: 'flex-start',
  },
  previewImg: {
    width: 80, height: 80, borderRadius: 12,
    borderWidth: 1, borderColor: 'rgba(0,229,255,0.3)',
  },
  removePreview: {
    position: 'absolute', top: -8, right: -8,
    width: 22, height: 22, borderRadius: 11,
    backgroundColor: '#ff1744',
    justifyContent: 'center', alignItems: 'center',
  },
});
