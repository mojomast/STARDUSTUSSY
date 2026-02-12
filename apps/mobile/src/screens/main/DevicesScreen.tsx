import React, {useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import {useDispatch, useSelector} from 'react-redux';
import {AppDispatch, RootState} from '@store/index';
import Icon from 'react-native-vector-icons/Ionicons';
import {COLORS} from '@constants/index';
import {fetchDevices, registerDevice} from '@store/slices/deviceSlice';
import {Device} from '@types/index';

const DevicesScreen: React.FC = () => {
  const [refreshing, setRefreshing] = React.useState(false);
  
  const dispatch = useDispatch<AppDispatch>();
  const {devices, currentDevice, isLoading} = useSelector(
    (state: RootState) => state.device,
  );

  useEffect(() => {
    dispatch(fetchDevices());
    if (!currentDevice) {
      dispatch(registerDevice());
    }
  }, [dispatch, currentDevice]);

  const onRefresh = async () => {
    setRefreshing(true);
    await dispatch(fetchDevices());
    setRefreshing(false);
  };

  const getDeviceIcon = (type: string) => {
    switch (type) {
      case 'mobile':
        return 'phone-portrait';
      case 'tablet':
        return 'tablet-portrait';
      case 'desktop':
        return 'desktop';
      default:
        return 'phone-portrait';
    }
  };

  const getPlatformIcon = (platform: string) => {
    switch (platform) {
      case 'ios':
        return 'logo-apple';
      case 'android':
        return 'logo-android';
      default:
        return 'globe';
    }
  };

  const renderDevice = ({item}: {item: Device}) => {
    const isCurrentDevice = currentDevice?.id === item.id;
    
    return (
      <View
        style={[
          styles.deviceCard,
          isCurrentDevice && styles.currentDeviceCard,
        ]}
      >
        <View style={styles.deviceIcon}>
          <Icon
            name={getDeviceIcon(item.type)}
            size={32}
            color={isCurrentDevice ? COLORS.primary : COLORS.textSecondary}
          />
        </View>

        <View style={styles.deviceInfo}>
          <Text style={styles.deviceName}>
            {item.name} {isCurrentDevice && '(This Device)'}
          </Text>
          <View style={styles.deviceMeta}>
            <Icon
              name={getPlatformIcon(item.platform)}
              size={14}
              color={COLORS.textSecondary}
            />
            <Text style={styles.deviceMetaText}>
              {item.platform} • {item.type}
            </Text>
          </View>
          <Text style={styles.lastSeen}>
            Last seen: {new Date(item.lastSeen).toLocaleString()}
          </Text>
        </View>

        <View
          style={[
            styles.statusIndicator,
            {
              backgroundColor: item.isActive
                ? COLORS.success
                : COLORS.textSecondary,
            },
          ]}
        />
      </View>
    );
  };

  return (
    <View style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>My Devices</Text>
        <Text style={styles.subtitle}>
          {devices.length} device{devices.length !== 1 ? 's' : ''} connected
        </Text>
      </View>

      <FlatList
        data={devices}
        renderItem={renderDevice}
        keyExtractor={(item) => item.id}
        contentContainerStyle={styles.list}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
        }
        ListEmptyComponent={
          <View style={styles.emptyContainer}>
            <Icon
              name="phone-portrait-outline"
              size={64}
              color={COLORS.textSecondary}
            />
            <Text style={styles.emptyText}>No devices found</Text>
            <TouchableOpacity
              style={styles.addButton}
              onPress={() => dispatch(registerDevice())}
            >
              <Text style={styles.addButtonText}>Register This Device</Text>
            </TouchableOpacity>
          </View>
        }
      />
    </View>
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
  list: {
    padding: 20,
  },
  deviceCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  currentDeviceCard: {
    borderWidth: 2,
    borderColor: COLORS.primary,
  },
  deviceIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    backgroundColor: COLORS.background,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 12,
  },
  deviceInfo: {
    flex: 1,
  },
  deviceName: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  deviceMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: 4,
  },
  deviceMetaText: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginLeft: 4,
  },
  lastSeen: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 2,
  },
  statusIndicator: {
    width: 12,
    height: 12,
    borderRadius: 6,
  },
  emptyContainer: {
    alignItems: 'center',
    justifyContent: 'center',
    paddingVertical: 60,
  },
  emptyText: {
    fontSize: 16,
    color: COLORS.textSecondary,
    marginTop: 16,
    marginBottom: 24,
  },
  addButton: {
    backgroundColor: COLORS.primary,
    paddingHorizontal: 24,
    paddingVertical: 12,
    borderRadius: 8,
  },
  addButtonText: {
    color: 'white',
    fontSize: 14,
    fontWeight: '600',
  },
});

export default DevicesScreen;
