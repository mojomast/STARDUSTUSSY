import { configureStore } from '@reduxjs/toolkit';
import authReducer from './slices/authSlice';
import sessionReducer from './slices/sessionSlice';
import handoffReducer from './slices/handoffSlice';
import sessionContinuityReducer from './slices/sessionContinuitySlice';
import adminDashboardReducer from './slices/adminDashboardSlice';

export const store = configureStore({
  reducer: {
    auth: authReducer,
    session: sessionReducer,
    handoff: handoffReducer,
    sessionContinuity: sessionContinuityReducer,
    adminDashboard: adminDashboardReducer,
  },
  middleware: (getDefaultMiddleware) =>
    getDefaultMiddleware({
      serializableCheck: {
        ignoredActions: ['session/setSocket'],
        ignoredPaths: ['session.socket'],
      },
    }),
});

export type RootState = ReturnType<typeof store.getState>;
export type AppDispatch = typeof store.dispatch;
