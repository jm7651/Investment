// Tesla-inspired Design System
export const colors = {
  // Primary
  electricBlue: "#3E6AE1",
  white: "#FFFFFF",

  // Surface
  lightAsh: "#F4F4F4",
  carbonDark: "#171A20",
  frostedGlass: "rgba(255, 255, 255, 0.75)",

  // Text
  heading: "#171A20",    // Carbon Dark
  body: "#393C41",       // Graphite
  tertiary: "#5C5E62",   // Pewter
  placeholder: "#8E8E8E", // Silver Fog

  // Border
  cloudGray: "#EEEEEE",
  paleSilver: "#D0D1D2",

  // Semantic
  bullish: "#16a34a",
  bearish: "#dc2626",
  neutral: "#8E8E8E",
};

export const fonts = {
  display: "System", // Universal Sans Display fallback
  text: "System",    // Universal Sans Text fallback
};

export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 24,
  xl: 32,
  xxl: 48,
};

export const radius = {
  none: 0,
  sm: 4,
  md: 12,
  full: 50,
};

export const transition = "0.33s cubic-bezier(0.5, 0, 0, 0.75)";
