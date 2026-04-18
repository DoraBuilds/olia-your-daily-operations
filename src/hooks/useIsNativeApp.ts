import { Capacitor } from "@capacitor/core";

/**
 * Returns true when running inside a native iOS or Android Capacitor shell.
 * Use this to hide billing/pricing UI that violates App Store guidelines.
 */
export function useIsNativeApp(): boolean {
  const platform = Capacitor.getPlatform();
  return platform === "ios" || platform === "android";
}

export function isNativeApp(): boolean {
  const platform = Capacitor.getPlatform();
  return platform === "ios" || platform === "android";
}
