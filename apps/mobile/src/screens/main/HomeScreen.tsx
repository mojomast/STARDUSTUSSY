import React, {useEffect} from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  RefreshControl,
} from 'react-native';
import {useDispatch, useSelector} from 'react-redux';
import {AppDispatch, RootState} from '@store/index';
import {useNavigation} from '@react-navigation/native';
import {NativeStackNavigationProp} from '@react-navigation/native-stack';
import {MainStackParamList} from '@navigation/types';
import Icon from 'react-native-vector-icons/Ionicons';
import {COLORS} from '@constants/index';
import {fetchSessions, createSession} from '@store/slices/sessionSlice';
import {useSession} from '@context/SessionContext';
import {Session} from '@types/index';

type NavigationProp = NativeStackNavigationProp<MainStackParamList>;

const HomeScreen: React.FC = () => {
  const [refreshing, setRefreshing] = React.useState(false);
  
  const dispatch = useDispatch<AppDispatch>();
  const navigation = useNavigation<NavigationProp>();
  const {user} = useSelector((state: RootState) => state.auth);
  const {currentSession, sessions, isLoading} = useSelector(
    (state: RootState) => state.session,
  );
  const {isConnected} = useSession();
  const sync = useSelector((state: RootState) => state.sync);

  useEffect(() => {
    dispatch(fetchSessions());
  }, [dispatch]);

  const onRefresh = async () => {
    setRefreshing(true);
    await dispatch(fetchSessions());
    setRefreshing(false);
  };

  const handleCreateSession = () => {
    dispatch(createSession());
  };

  const getStatusColor = (status: string) => {
    switch (status) {
      case 'active':
        return COLORS.success;
      case 'inactive':
        return COLORS.textSecondary;
      case 'suspended':
        return COLORS.warning;
      default:
        return COLORS.textSecondary;
    }
  };

  return (
    <ScrollView
      style={styles.container}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} />
      }
    >
      <View style={styles.header}>
        <View>
          <Text style={styles.greeting}>Hello, {user?.name || 'User'}!</Text>
          <Text style={styles.subtitle}>Welcome back to HarmonyFlow</Text>
        </View>
        <View style={styles.statusContainer}>
          <View
            style={[
              styles.statusDot,
              {backgroundColor: isConnected ? COLORS.success : COLORS.error},
            ]}
          />
          <Text style={styles.statusText}>
            {isConnected ? 'Connected' : 'Disconnected'}
          </Text>
        </View>
      </View>

      <View style={styles.connectionStatus}>
        <Icon
          name={sync.isOnline ? 'wifi' : 'wifi-off'}
          size={16}
          color={sync.isOnline ? COLORS.success : COLORS.error}
        />
        <Text
          style={[
            styles.connectionText,
            {color: sync.isOnline ? COLORS.success : COLORS.error},
          ]}
        >
          {sync.isOnline ? 'Online' : 'Offline'}
          {sync.isSyncing && ' • Syncing...'}
          {sync.pendingChanges > 0 && ` • ${sync.pendingChanges} pending`}
        </Text>
      </View>

      <View style={styles.currentSession}>
        <Text style={styles.sectionTitle}>Current Session</Text>
        {currentSession ? (
          <TouchableOpacity
            style={styles.sessionCard}
            onPress={() =>
              navigation.navigate('SessionDetails', {
                sessionId: currentSession.id,
              })
            }
          >
            <View style={styles.sessionHeader}>
              <Text style={styles.sessionId}>
                Session {currentSession.id.slice(0, 8)}...
              </Text>
              <View
                style={[
                  styles.badge,
                  {backgroundColor: getStatusColor(currentSession.status)},
                ]}
              >
                <Text style={styles.badgeText}>{currentSession.status}</Text>
              </View>
            </View>
            <Text style={styles.sessionMeta}>
              Started: {new Date(currentSession.createdAt).toLocaleDateString()}
            </Text>
          </TouchableOpacity>
        ) : (
          <TouchableOpacity
            style={styles.createSessionButton}
            onPress={handleCreateSession}
          >
            <Icon name="add-circle" size={24} color={COLORS.primary} />
            <Text style={styles.createSessionText}>Start New Session</Text>
          </TouchableOpacity>
        )}
      </View>

      <View style={styles.actions}>
        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('QRScanner', {mode: 'send'})}
        >
          <View style={[styles.actionIcon, {backgroundColor: COLORS.primary}]}>
            <Icon name="qr-code" size={24} color="white" />
          </View>
          <Text style={styles.actionText}>Send Handoff</Text>
        </TouchableOpacity>

        <TouchableOpacity
          style={styles.actionButton}
          onPress={() => navigation.navigate('QRScanner', {mode: 'receive'})}
        >
          <View style={[styles.actionIcon, {backgroundColor: COLORS.secondary}]}>
            <Icon name="scan" size={24} color="white" />
          </View>
          <Text style={styles.actionText}>Receive Handoff</Text>
        </TouchableOpacity>
      </View>

      <View style={styles.recentSessions}>
        <Text style={styles.sectionTitle}>Recent Sessions</Text>
        {isLoading ? (
          <Text style={styles.loadingText}>Loading...</Text>
        ) : sessions.length > 0 ? (
          sessions.slice(0, 5).map((session) => (
            <TouchableOpacity
              key={session.id}
              style={styles.sessionItem}
              onPress={() =>
                navigation.navigate('SessionDetails', {
                  sessionId: session.id,
                })
              }
            >
              <View style={styles.sessionItemContent}>
                <Text style={styles.sessionItemId}>
                  {session.id.slice(0, 12)}...
                </Text>
                <Text style={styles.sessionItemDate}>
                  {new Date(session.lastActivity).toLocaleDateString()}
                </Text>
              </View>
              <View
                style={[
                  styles.statusIndicator,
                  {backgroundColor: getStatusColor(session.status)},
                ]}
              />
            </TouchableOpacity>
          ))
        ) : (
          <Text style={styles.emptyText}>No recent sessions</Text>
        )}
      </View>
    </ScrollView>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    backgroundColor: COLORS.background,
  },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingTop: 20,
    paddingBottom: 10,
  },
  greeting: {
    fontSize: 24,
    fontWeight: 'bold',
    color: COLORS.text,
  },
  subtitle: {
    fontSize: 14,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  statusContainer: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  statusDot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    marginRight: 6,
  },
  statusText: {
    fontSize: 12,
    color: COLORS.textSecondary,
  },
  connectionStatus: {
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 20,
    paddingVertical: 8,
    backgroundColor: COLORS.surface,
    marginHorizontal: 20,
    marginVertical: 10,
    borderRadius: 8,
  },
  connectionText: {
    marginLeft: 8,
    fontSize: 14,
  },
  currentSession: {
    paddingHorizontal: 20,
    marginTop: 10,
  },
  sectionTitle: {
    fontSize: 18,
    fontWeight: '600',
    color: COLORS.text,
    marginBottom: 12,
  },
  sessionCard: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  sessionHeader: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginBottom: 8,
  },
  sessionId: {
    fontSize: 16,
    fontWeight: '600',
    color: COLORS.text,
  },
  badge: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: 4,
  },
  badgeText: {
    color: 'white',
    fontSize: 12,
    fontWeight: '600',
  },
  sessionMeta: {
    fontSize: 14,
    color: COLORS.textSecondary,
  },
  createSessionButton: {
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 20,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    borderStyle: 'dashed',
    borderWidth: 2,
    borderColor: COLORS.border,
  },
  createSessionText: {
    marginLeft: 8,
    fontSize: 16,
    color: COLORS.primary,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    paddingHorizontal: 20,
    marginTop: 20,
    gap: 12,
  },
  actionButton: {
    flex: 1,
    backgroundColor: COLORS.surface,
    borderRadius: 12,
    padding: 16,
    alignItems: 'center',
    shadowColor: '#000',
    shadowOffset: {width: 0, height: 2},
    shadowOpacity: 0.1,
    shadowRadius: 4,
    elevation: 3,
  },
  actionIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginBottom: 8,
  },
  actionText: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  recentSessions: {
    paddingHorizontal: 20,
    marginTop: 20,
    paddingBottom: 20,
  },
  loadingText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    paddingVertical: 20,
  },
  emptyText: {
    textAlign: 'center',
    color: COLORS.textSecondary,
    paddingVertical: 20,
  },
  sessionItem: {
    backgroundColor: COLORS.surface,
    borderRadius: 8,
    padding: 16,
    marginBottom: 8,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  sessionItemContent: {
    flex: 1,
  },
  sessionItemId: {
    fontSize: 14,
    fontWeight: '600',
    color: COLORS.text,
  },
  sessionItemDate: {
    fontSize: 12,
    color: COLORS.textSecondary,
    marginTop: 4,
  },
  statusIndicator: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
});

export default HomeScreen;
