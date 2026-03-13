import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.olia.operations",
  appName: "Olia",
  webDir: "dist",

  // iOS-specific
  ios: {
    contentInset: "automatic",   // respects safe areas automatically
    backgroundColor: "#FDFAF7",  // alabaster white — matches --background
  },

  // Android-specific
  android: {
    backgroundColor: "#FDFAF7",
    allowMixedContent: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#1A2A47",      // midnight blue
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",              // dark icons on light (alabaster) background
      backgroundColor: "#FDFAF7",
      overlaysWebView: false,
    },
    Keyboard: {
      resize: "body",             // page shrinks when keyboard appears
      style: "DARK",
      resizeOnFullScreen: true,
    },
  },
};

export default config;
