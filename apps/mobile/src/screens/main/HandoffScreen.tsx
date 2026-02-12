import React, {useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  ScrollView,
  Alert,
} from 'react-native';
import {useSelector} from 'react-redux';
import {RootState} from '@store/index';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {MainStackParamList} from '@navigation/types';
import Icon from 'react-native-vector-icons/Ionicons';
import QRCode from 'react-native-qrcode-svg';
import {COLORS, QR_CONFIG} from '@constants/index';
import {initiateHandoff, acceptHandoff, getPendingHandoffs} from '@services/handoff';
import {useSession} from '@context/SessionContext';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

const HandoffScreen: React.FC = () => {
  const [activeTab, setActiveTab] = useState<'send' | 'receive' | 'pending'>('send');
  const [isGenerating, setIsGenerating] = useState(false);
  const [qrCode, setQrCode] = useState<string | null>(null);
  
  const navigation = useNavigation<NavigationProp>();
  const {currentSession} = useSelector((state: RootState) => state.session);
  const {devices} = useSelector((state: RootState) => state.device);
  const {stateManager} = useSession();

  const handleGenerateQR = async () => {
    if (!currentSession) {
      Alert.alert('Error', 'No active session to handoff');
      return;
    }

    setIsGenerating(true);
    try {
      // Generate a handoff request
      const handoffData = {
        sessionId: currentSession.id,
        timestamp: Date.now(),
        stateSnapshot: stateManager?.getState(),
      };
      
      // In a real implementation, this would come from the server
      const qrData = JSON.stringify(handoffData);
      setQrCode(qrData);
    } catch (error) {
      Alert.alert('Error', 'Failed to generate QR code');
    } finally {
      setIsGenerating(false);
    }
  };

  const handleScanQR = () => {
    navigation.navigate('QRScanner', {mode: 'receive'});
  };

  const renderSendTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.description}>
        Generate a QR code to transfer your current session to another device.
      </Text>

      {qrCode ? (
        <View style={styles.qrContainer}>
          <QRCode
            value={qrCode}
            size={QR_CONFIG.codeSize}
            level={QR_CONFIG.codeLevel}
            backgroundColor="white"
          />
          <Text style={styles.qrHelp}>
            Show this code to the receiving device
          </Text>
          <TouchableOpacity
            style={styles.regenerateButton}
            onPress={handleGenerateQR}
          >
            <Text style={styles.regenerateText}>Regenerate Code</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <TouchableOpacity
          style={[styles.actionButton, isGenerating && styles.buttonDisabled]}
          onPress={handleGenerateQR}
          disabled={isGenerating}
        >
          <Icon name="qr-code" size={24} color="white" />
          <Text style={styles.actionButtonText}>
            {isGenerating ? 'Generating...' : 'Generate QR Code'}
          </Text>
        </TouchableOpacity>
      )}

      <View style={styles.devicesSection}>
        <Text style={styles.sectionTitle}>Available Devices</Text>
        {devices.length > 1 ? (
          devices
            .filter((d) => d.isActive)
            .map((device) => (
              <TouchableOpacity
                key={device.id}
                style={styles.deviceItem}
                onPress={() => {
                  Alert.alert(
                    'Send Handoff',
                    `Send current session to ${device.name}?`,
                    [
                      {text: 'Cancel', style: 'cancel'},
                      {
                        text: 'Send',
                        onPress: async () => {
                          try {
                            await initiateHandoff(
                              device.id,
                              currentSession?.id || '',
                            );
                            Alert.alert('Success', 'Handoff request sent!');
                          } catch (error) {
                            Alert.alert('Error', 'Failed to send handoff');
                          }
                        },
                      },
                    ],
                  );
                }}
              >
                <Icon name="phone-portrait" size={20} color={COLORS.primary} />
                <Text style={styles.deviceItemText}>{device.name}</Text>
                <Icon name="chevron-forward" size={20} color={COLORS.textSecondary} />
              </TouchableOpacity>
            ))
        ) : (
          <Text style={styles.noDevices}>
            No other active devices found
          </Text>
        )}
      </View>
    </View>
  );

  const renderReceiveTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.description}>
        Scan a QR code from another device to receive a session handoff.
      </Text>

      <TouchableOpacity
        style={styles.actionButton}
        onPress={handleScanQR}
      >
        <Icon name="scan" size={24} color="white" />
        <Text style={styles.actionButtonText}>Scan QR Code</Text>
      </TouchableOpacity>

      <View style={styles.instructions}>
        <Text style={styles.instructionTitle}>How it works:</Text>
        <View style={styles.instructionItem}>
          <Text style={styles.instructionNumber}>1</Text>
          <Text style={styles.instructionText}>
            Open HarmonyFlow on the source device
          </Text>
        </View>
        <View style={styles.instructionItem}>
          <Text style={styles.instructionNumber}>2</Text>
          <Text style={styles.instructionText}>
            Navigate to Handoff & tap "Generate QR Code"
          </Text>
        </View>
        <View style={styles.instructionItem}>
          <Text style={styles.instructionNumber}>3</Text>
          <Text style={styles.instructionText}>
            Scan the code with this device
          </Text>
        </View>
      </View>
    </View>
  );

  const renderPendingTab = () => (
    <View style={styles.tabContent}>
      <Text style={styles.description}>
        View and manage pending handoff requests.
      </Text>

      <View style={styles.pendingContainer}>
        <Icon
          name="time-outline"
          size={64}
          color={COLORS.textSecondary}
        />
        <Text style={styles.pendingText}>No pending handoffs</Text>
        <Text style={styles.pendingSubtext}>
          Handoff requests will appear here
        </Text>
      </View>
    </View>
  );

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>Device Handoff</Text>
        <Text style={styles.subtitle}>Transfer sessions between devices</Text>
      </View>

      <View style={styles.tabBar}>
        {(['send', 'receive', 'pending'] as const).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && styles.activeTab]}
            onPress={() => setActiveTab(tab)}
          >
            <Text
              style={[
                styles.tabText,
                activeTab === tab && styles.activeTabText,
              ]}
            >
              {tab.charAt(0).toUpperCase() + tab.slice(1)}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {activeTab === 'send' && renderSendTab()}
      {activeTab === 'receive' && renderReceiveTab()}
      {activeTab === 'pending' && renderPendingTab()}
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  title: {
    fontSize: 28,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  tabBar: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 20,
    marginBottom: 10,
  },
  tab: {
    flex: 1,
    paddingVertical: 12,
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: COLORS.divider,
  },
  activeTab: {
    borderBottomColor: COLORS.primary,
  },
  tabText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.textSecondary,
  },
  activeTabText: {
    color: COLORS.primary,
  },
  tabContent: {
    padding: 20,
  },
  description: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginBottom: 20,
    lineHeight: 20,
  },
  actionButton: {
    backgroundColor: COLORS.primary,
    borderRadius: 12,
    paddingVertical: 16,
    flexDirection: 'row',
    justifyContent: 'center',
    alignItems: 'center',
  },
  buttonDisabled: {
    opacity: 0.6,
  },
  actionButtonText: {
    color: 'white',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 8,
  },
  qrContainer: {
    alignItems: 'center',
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 24,
  },
  qrHelp: {
    marginTop: 16,
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  regenerateButton: {
    marginTop: 16,
    paddingVertical: 8,
    paddingHorizontal: 16,
    borderRadius: 8,
    backgroundColor: COLORS.background,
  },
  regenerateText: {
    color: COLORS.primary,
    fontSize: 14,
    fontWeight: '600',
  },
  devicesSection: {
    marginTop: 24,
  },
  sectionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  deviceItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 16,
    flexDirection: 'row',
    alignItems: 'center',
    marginBottom: 8,
  },
  deviceItemText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.text,
    marginLeft: 12,
  },
  noDevices: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    paddingVertical: 20,
  },
  instructions: {
    marginTop: 32,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 20,
  },
  instructionTitle: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 16,
  },
  instructionItem: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    marginBottom: 12,
  },
  instructionNumber: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: COLORS.primary,
    color: 'white',
    textAlign: 'center',
    lineHeight: 24,
    fontSize: 12,
    fontWeight: '600',
    marginRight: 12,
  },
  instructionText: {
    flex: 1,
    fontSize: 14,
    color: COLORS.textSecondary,
    lineHeight: 20,
  },
  pendingContainer: {
    alignItems: 'center',
    paddingVertical: 60,
  },
  pendingText: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginTop: 16,
  },
  pendingSubtext: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 8,
  },
});

export default HandoffScreen;
