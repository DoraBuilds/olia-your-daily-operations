import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// A focused number input steps its value on wheel scroll. Dropping focus lets
// the page scroll instead of silently changing what was typed.
export function blurOnWheel(e: { currentTarget: HTMLElement }) {
  e.currentTarget.blur();
}
