import LocalAuth from 'react-native-local-auth';
import AsyncStorage from '@react-native-async-storage/async-storage';
import {STORAGE_KEYS, BIOMETRIC_CONFIG} from '@constants/index';
import {BiometricType, BiometricState} from '@types/index';

export const checkBiometricAvailability = async (): Promise<BiometricState> => {
  try {
    const isAvailable = await LocalAuth.isAvailable();
    const biometricType: BiometricType = isAvailable
      ? Platform.select({
          ios: 'face',
          android: 'fingerprint',
          default: 'fingerprint',
        })
      : null;
    const isEnabled =
      (await AsyncStorage.getItem(STORAGE_KEYS.biometricEnabled)) === 'true';

    return {
      isAvailable,
      type: biometricType,
      isEnabled,
    };
  } catch (error) {
    return {
      isAvailable: false,
      type: null,
      isEnabled: false,
    };
  }
};

export const authenticateWithBiometric = async (): Promise<boolean> => {
  try {
    const result = await LocalAuth.authenticate({
      reason: BIOMETRIC_CONFIG.description,
      fallbackToPasscode: true,
      cancelText: BIOMETRIC_CONFIG.cancelButton,
    });
    return result.success;
  } catch (error) {
    return false;
  }
};

export const enableBiometric = async (enabled: boolean): Promise<void> => {
  await AsyncStorage.setItem(
    STORAGE_KEYS.biometricEnabled,
    enabled ? 'true' : 'false',
  );
};

export const promptBiometricSetup = async (): Promise<boolean> => {
  const {isAvailable} = await checkBiometricAvailability();
  if (!isAvailable) return false;

  const success = await authenticateWithBiometric();
  if (success) {
    await enableBiometric(true);
  }
  return success;
};

import {Platform} from 'react-native';
