import { Platform } from 'react-native';
import * as TaskManager from 'expo-task-manager';
import * as BackgroundTask from 'expo-background-task';
import { apiOrigin } from './api';
import { syncOffline } from './offline-sync';

const TASK = 'himoto-offline-sync-v1';
if (Platform.OS !== 'web' && !TaskManager.isTaskDefined(TASK)) {
  TaskManager.defineTask(TASK, async () => {
    try {
      const origin = apiOrigin(process.env.EXPO_PUBLIC_API_URL, __DEV__);
      return await syncOffline(origin) ? BackgroundTask.BackgroundTaskResult.Success : BackgroundTask.BackgroundTaskResult.Failed;
    } catch { return BackgroundTask.BackgroundTaskResult.Failed; }
  });
}
export async function registerOfflineBackground() {
  if (Platform.OS === 'web') return;
  if (!await TaskManager.isTaskRegisteredAsync(TASK))
    await BackgroundTask.registerTaskAsync(TASK, { minimumInterval: 15 });
}
