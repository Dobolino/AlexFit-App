import { Capacitor } from '@capacitor/core';
import { Filesystem, Directory } from '@capacitor/filesystem';
import { Share } from '@capacitor/share';
import { Haptics, ImpactStyle, NotificationType } from '@capacitor/haptics';
import { setupNativeIntegration } from './native-core.js';

setupNativeIntegration({
  Capacitor, Filesystem, Directory, Share, Haptics, ImpactStyle, NotificationType,
  version: '1.0.0',
});
