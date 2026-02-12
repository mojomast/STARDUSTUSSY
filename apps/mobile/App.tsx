/**
 * HarmonyFlow Mobile App
 * React Native TypeScript Application
 * 
 * @format
 */

import React, {useEffect} from 'react';
import {StatusBar, useColorScheme} from 'react-native';
import {Provider} from 'react-redux';
import {NavigationContainer} from '@react-navigation/native';
import {SafeAreaProvider} from 'react-native-safe-area-context';
import {GestureHandlerRootView} from 'react-native-gesture-handler';
import {store} from './src/store';
import RootNavigator from './src/navigation/RootNavigator';
import {checkAuth} from './src/store/slices/authSlice';

const AppContent: React.FC = () => {
  const isDarkMode = useColorScheme() === 'dark';

  useEffect(() => {
    // Check for existing auth session on app start
    store.dispatch(checkAuth());
  }, []);

  return (
    <SafeAreaProvider>
      <StatusBar barStyle={isDarkMode ? 'light-content' : 'dark-content'} />
      <NavigationContainer>
        <RootNavigator />
      </NavigationContainer>
    </SafeAreaProvider>
  );
};

const App: React.FC = () => {
  return (
    <Provider store={store}>
      <GestureHandlerRootView style={{flex: 1}}>
        <AppContent />
      </GestureHandlerRootView>
    </Provider>
  );
};

export default App;
