import React, {useEffect, useState} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  Switch,
  Alert,
} from 'react-native';
import {useDispatch, useSelector} from 'react-redux';
import {AppDispatch, RootState} from '@store/index';
import {useNavigation} from '@react-navigation/native';
import Icon from 'react-native-vector-icons/Ionicons';
import {COLORS} from '@constants/index';
import {logout} from '@store/slices/authSlice';
import {
  checkBiometricAvailability,
  enableBiometric,
} from '@services/biometric';
import {BiometricState} from '@types/index';
import Share from 'react-native-share';

const ProfileScreen: React.FC = () => {
  const [biometric, setBiometric] = useState<BiometricState>({
    isAvailable: false,
    type: null,
    isEnabled: false,
  });

  const dispatch = useDispatch<AppDispatch>();
  const navigation = useNavigation();
  const {user} = useSelector((state: RootState) => state.auth);
  const {currentDevice} = useSelector((state: RootState) => state.device);

  useEffect(() => {
    checkBiometricAvailability().then(setBiometric);
  }, []);

  const handleBiometricToggle = async (value: boolean) => {
    await enableBiometric(value);
    setBiometric((prev) => ({...prev, isEnabled: value}));
  };

  const handleLogout = () => {
    Alert.alert(
      'Logout',
      'Are you sure you want to logout?',
      [
        {text: 'Cancel', style: 'cancel'},
        {
          text: 'Logout',
          style: 'destructive',
          onPress: () => dispatch(logout()),
        },
      ],
    );
  };

  const handleShare = async () => {
    try {
      await Share.default({
        title: 'HarmonyFlow',
        message: 'Check out HarmonyFlow for seamless session sync across devices!',
        url: 'https://harmonyflow.io',
      });
    } catch (error) {
      console.error('Share error:', error);
    }
  };

  const getBiometricLabel = () => {
    switch (biometric.type) {
      case 'face':
        return 'Face ID';
      case 'fingerprint':
        return 'Fingerprint';
      case 'iris':
        return 'Iris Recognition';
      default:
        return 'Biometric Authentication';
    }
  };

  return (
    <ScrollView style={styles.container}>
      <View style={styles.header}>
        <View style={styles.avatar}>
          <Text style={styles.avatarText}>
            {user?.name?.charAt(0).toUpperCase() || 'U'}
          </Text>
        </View>
        <Text style={styles.name}>{user?.name || 'User'}</Text>
        <Text style={styles.email}>{user?.email}</Text>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Security</Text>

        {biometric.isAvailable && (
          <View style={styles.settingItem}>
            <View style={styles.settingInfo}>
              <Icon name="finger-print" size={24} color={COLORS.primary} />
              <View style={styles.settingText}>
                <Text style={styles.settingLabel}>{getBiometricLabel()}</Text>
                <Text style={styles.settingDescription}>
                  Use biometric authentication
                </Text>
              </View>
            </View>
            <Switch
              value={biometric.isEnabled}
              onValueChange={handleBiometricToggle}
              trackColor={{false: COLORS.border, true: COLORS.primary}}
            />
          </View>
        )}

        <TouchableOpacity style={styles.menuItem}>
          <Icon name="key" size={24} color={COLORS.primary} />
          <Text style={styles.menuText}>Change Password</Text>
          <Icon name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Device</Text>

        <View style={styles.settingItem}>
          <View style={styles.settingInfo}>
            <Icon name="phone-portrait" size={24} color={COLORS.primary} />
            <View style={styles.settingText}>
              <Text style={styles.settingLabel}>Device Name</Text>
              <Text style={styles.settingDescription}>
                {currentDevice?.name || 'Unknown Device'}
              </Text>
            </View>
          </View>
        </View>

        <TouchableOpacity style={styles.menuItem}>
          <Icon name="list" size={24} color={COLORS.primary} />
          <Text style={styles.menuText}>Manage Devices</Text>
          <Icon name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>Preferences</Text>

        <TouchableOpacity style={styles.menuItem}>
          <Icon name="notifications" size={24} color={COLORS.primary} />
          <Text style={styles.menuText}>Notifications</Text>
          <Icon name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <Icon name="globe" size={24} color={COLORS.primary} />
          <Text style={styles.menuText}>Language</Text>
          <Text style={styles.menuValue}>English</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.section}>
        <Text style={styles.sectionTitle}>About</Text>

        <TouchableOpacity style={styles.menuItem} onPress={handleShare}>
          <Icon name="share" size={24} color={COLORS.primary} />
          <Text style={styles.menuText}>Share App</Text>
          <Icon name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <Icon name="help-circle" size={24} color={COLORS.primary} />
          <Text style={styles.menuText}>Help & Support</Text>
          <Icon name="chevron-forward" size={20} color={COLORS.textSecondary} />
        </TouchableOpacity>

        <TouchableOpacity style={styles.menuItem}>
          <Icon name="information-circle" size={24} color={COLORS.primary} />
          <Text style={styles.menuText}>About</Text>
          <Text style={styles.menuValue}>Version 1.0.0</Text>
        </TouchableOpacity>
      </View>

      <TouchableOpacity
        style={styles.logoutButton}
        onPress={handleLogout}
      >
        <Icon name="log-out" size={24} color={COLORS.error} />
        <Text style={styles.logoutText}>Logout</Text>
      </TouchableOpacity>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    alignItems: 'center',
    paddingVertical: 32,
    backgroundColor: COLORS.surface,
    marginBottom: 16,
  },
  avatar: {
    width: 80,
    height: 80,
    borderRadius: 40,
    backgroundColor: COLORS.primary,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 16,
  },
  avatarText: {
    fontSize: 32,
    fontWeight: 'bold',
    color: 'white',
  },
  name: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  email: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  section: {
    backgroundColor: COLORS.surface,
    marginBottom: 16,
    paddingVertical: 8,
  },
  sectionTitle: {
    fontSize: 13,
    fontWeight: '600',
    color: COLORS.textSecondary,
    textTransform: 'uppercase',
    paddingHorizontal: 20,
    paddingVertical: 8,
  },
  settingItem: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  settingInfo: {
    flexDirection: 'row',
    alignItems: 'center',
    flex: 1,
  },
  settingText: {
    marginLeft: 12,
    flex: 1,
  },
  settingLabel: {
    fontSize: 16,
    color: COLORS.text,
  },
  settingDescription: {
    fontSize: 13,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  menuItem: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 12,
  },
  menuText: {
    flex: 1,
    fontSize: 16,
    color: COLORS.text,
    marginLeft: 12,
  },
  menuValue: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginRight: 8,
  },
  logoutButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: COLORS.surface,
    marginBottom: 32,
    paddingVertical: 16,
    marginHorizontal: 20,
    borderRadius: 12,
  },
  logoutText: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.error,
    marginLeft: 8,
  },
});

export default ProfileScreen;
