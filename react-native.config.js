// Native modules for Android's full-screen incoming call (Stream ringing). They are left
// out of the iOS build: the free-Apple-ID sideload can't use VoIP push / CallKit ringing,
// and React Native Firebase on iOS would need its own GoogleService-Info.plist and
// static frameworks. The JS side loads them only on Android (src/calls/android-ringing.ts).
module.exports = {
  dependencies: {
    '@react-native-firebase/app': { platforms: { ios: null } },
    '@react-native-firebase/messaging': { platforms: { ios: null } },
    '@stream-io/react-native-callingx': { platforms: { ios: null } },
  },
};
