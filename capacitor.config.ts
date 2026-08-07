import type { CapacitorConfig } from "@capacitor/cli";

const config: CapacitorConfig = {
  appId: "com.olia.operations",
  appName: "Olia",
  webDir: "dist",

  // iOS-specific
  ios: {
    contentInset: "automatic",   // respects safe areas automatically
    backgroundColor: "#FFFFFF",  // white — matches --background
  },

  // Android-specific
  android: {
    backgroundColor: "#FFFFFF",
    allowMixedContent: false,
  },

  plugins: {
    SplashScreen: {
      launchShowDuration: 1200,
      launchAutoHide: true,
      backgroundColor: "#0B0F0C",      // near-black — matches --sage
      androidSplashResourceName: "splash",
      androidScaleType: "CENTER_CROP",
      showSpinner: false,
      splashFullScreen: true,
      splashImmersive: true,
    },
    StatusBar: {
      style: "DARK",              // dark icons on light (white) background
      backgroundColor: "#FFFFFF",
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
