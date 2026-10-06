// Body text uses Poppins, headings use Syne. Custom fonts need one family per weight
// (fontWeight is ignored for them on Android).
export const fonts = {
  light: 'Poppins_300Light',
  regular: 'Poppins_400Regular',
  medium: 'Poppins_500Medium',
  semibold: 'Poppins_600SemiBold',
  bold: 'Poppins_700Bold',
  heading: 'Syne_700Bold',
  headingBold: 'Syne_800ExtraBold',
};

export const colors = {
  background: '#f2f4f7',
  surface: '#fff',
  text: '#111827',
  muted: '#6b7280',
  border: '#e5e7eb',
  accent: '#2563eb',
  accentSoft: '#dbeafe',
  // FunButler's brand red, for FunButler screens (Bookinger, booking details).
  funbutler: '#f33c2c',
  funbutlerSoft: '#fee4e2',
};

// At this width and above the menu becomes a sidebar instead of a bottom tab bar.
export const DESKTOP_BREAKPOINT = 768;

// Width of the desktop sidebar menu; overlays (the booking modal) center on the content to its right.
export const SIDEBAR_WIDTH = 240;

// Drop shadow for the white section cards (iOS/web use shadow*, Android uses elevation).
export const cardShadow = {
  shadowColor: '#000',
  shadowOpacity: 0.06,
  shadowRadius: 10,
  shadowOffset: { width: 0, height: 2 },
  elevation: 3,
};

// Stronger blue glow for the highlighted "Totalt salg" card.
export const accentShadow = {
  shadowColor: '#2563eb',
  shadowOpacity: 0.35,
  shadowRadius: 16,
  shadowOffset: { width: 0, height: 6 },
  elevation: 8,
};
