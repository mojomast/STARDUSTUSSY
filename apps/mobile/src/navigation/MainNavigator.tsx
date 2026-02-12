import React from 'react';
import {createBottomTabNavigator} from '@react-navigation/bottom-tabs';
import {createNativeStackNavigator} from '@react-navigation/native-stack';
import Icon from 'react-native-vector-icons/Ionicons';
import HomeScreen from '@screens/main/HomeScreen';
import DevicesScreen from '@screens/main/DevicesScreen';
import HandoffScreen from '@screens/main/HandoffScreen';
import ProfileScreen from '@screens/main/ProfileScreen';
import QRScannerScreen from '@screens/main/QRScannerScreen';
import SessionDetailsScreen from '@screens/main/SessionDetailsScreen';
import {MainTabParamList, MainStackParamList} from './types';
import {COLORS} from '@constants/index';

const Tab = createBottomTabNavigator<MainTabParamList>();
const Stack = createNativeStackNavigator<MainStackParamList>();

const TabNavigator: React.FC = () => {
  return (
    <Tab.Navigator
      screenOptions={({route}) => ({
        headerShown: false,
        tabBarIcon: ({focused, color, size}) => {
          let iconName: string;

          switch (route.name) {
            case 'Home':
              iconName = focused ? 'home' : 'home-outline';
              break;
            case 'Devices':
              iconName = focused ? 'phone-portrait' : 'phone-portrait-outline';
              break;
            case 'Handoff':
              iconName = focused ? 'sync' : 'sync-outline';
              break;
            case 'Profile':
              iconName = focused ? 'person' : 'person-outline';
              break;
            default:
              iconName = 'help-outline';
          }

          return <Icon name={iconName} size={size} color={color} />;
        },
        tabBarActiveTintColor: COLORS.primary,
        tabBarInactiveTintColor: COLORS.textSecondary,
      })}>
      <Tab.Screen name="Home" component={HomeScreen} />
      <Tab.Screen name="Devices" component={DevicesScreen} />
      <Tab.Screen name="Handoff" component={HandoffScreen} />
      <Tab.Screen name="Profile" component={ProfileScreen} />
    </Tab.Navigator>
  );
};

const MainNavigator: React.FC = () => {
  return (
    <Stack.Navigator
      screenOptions={{
        headerShown: false,
        animation: 'slide_from_right',
      }}>
      <Stack.Screen name="Tabs" component={TabNavigator} />
      <Stack.Screen
        name="QRScanner"
        component={QRScannerScreen}
        options={{
          presentation: 'fullScreenModal',
        }}
      />
      <Stack.Screen
        name="SessionDetails"
        component={SessionDetailsScreen}
        options={{
          headerShown: true,
          headerTitle: 'Session Details',
        }}
      />
    </Stack.Navigator>
  );
};

export default MainNavigator;
