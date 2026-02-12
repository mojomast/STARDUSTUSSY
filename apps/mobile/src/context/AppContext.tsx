import React, {createContext, useContext, useState, useEffect} from 'react';
import {View, ActivityIndicator, StyleSheet} from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import NetInfo from '@react-native-community/netinfo';
import {useDispatch} from 'react-redux';
import {setOnlineStatus} from '@store/slices/syncSlice';
import {checkAuth} from '@store/slices/authSlice';
import {AppDispatch} from '@store/index';
import {COLORS} from '@constants/index';
import {configurePushNotifications} from '@services/notifications';
import {initBackgroundFetch} from '@services/backgroundFetch';

interface AppContextType {
  isLoading: boolean;
  isReady: boolean;
}

const AppContext = createContext<AppContextType | undefined>(undefined);

export const AppProvider: React.FC<{children: React.ReactNode}> = ({
  children,
}) => {
  const [isLoading, setIsLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const dispatch = useDispatch<AppDispatch>();

  useEffect(() => {
    initializeApp();
  }, []);

  const initializeApp = async () => {
    try {
      // Check network status
      const netInfo = await NetInfo.fetch();
      dispatch(setOnlineStatus(netInfo.isConnected ?? false));

      // Subscribe to network changes
      const unsubscribe = NetInfo.addEventListener((state) => {
        dispatch(setOnlineStatus(state.isConnected ?? false));
      });

      // Check authentication status
      await dispatch(checkAuth());

      // Configure push notifications
      configurePushNotifications();

      // Initialize background sync
      await initBackgroundFetch();

      setIsReady(true);

      return () => {
        unsubscribe();
      };
    } catch (error) {
      console.error('App initialization error:', error);
    } finally {
      setIsLoading(false);
    }
  };

  if (isLoading) {
    return (
      <View style={styles.container}>
        <ActivityIndicator size="large" color={COLORS.primary} />
      </View>
    );
  }

  return (
    <AppContext.Provider value={{isLoading, isReady}}>
      {children}
    </AppContext.Provider>
  );
};

export const useApp = () => {
  const context = useContext(AppContext);
  if (context === undefined) {
    throw new Error('useApp must be used within an AppProvider');
  }
  return context;
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    backgroundColor: COLORS.background,
  },
});
