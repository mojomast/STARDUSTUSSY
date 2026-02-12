import React, {useEffect} from 'react';
import {Linking} from 'react-native';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {RootStackParamList} from '@navigation/types';
import {DEEP_LINKS} from '@constants/index';

type NavigationProp = NativeStackNavigationProp<RootStackParamList>;

const DeepLinkHandler: React.FC = () => {
  const navigation = useNavigation<NavigationProp>();

  useEffect(() => {
    // Handle deep link when app is already open
    const subscription = Linking.addEventListener('url', handleDeepLink);

    // Handle deep link when app is launched from closed state
    Linking.getInitialURL().then((url) => {
      if (url) {
        handleDeepLink({url});
      }
    });

    return () => {
      subscription.remove();
    };
  }, []);

  const handleDeepLink = (event: {url: string}) => {
    const {url} = event;
    console.log('[DeepLink] Received:', url);

    if (url.startsWith(DEEP_LINKS.handoff)) {
      // Navigate to handoff screen
      navigation.navigate('Main', {
        screen: 'Tabs',
        params: {
          screen: 'Handoff',
        },
      });
    } else if (url.startsWith(DEEP_LINKS.session)) {
      // Extract session ID from URL
      const sessionId = url.split('/').pop();
      if (sessionId) {
        navigation.navigate('Main', {
          screen: 'SessionDetails',
          params: {sessionId},
        });
      }
    } else if (url.startsWith(DEEP_LINKS.login)) {
      // Navigate to login
      navigation.navigate('Auth', {
        screen: 'Login',
      });
    }
  };

  return null;
};

export default DeepLinkHandler;
