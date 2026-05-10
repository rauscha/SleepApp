/** @type {import('tailwindcss').Config} */
// Midnight Editorial Minimalism design tokens.
// Tonight (Phase 1) only uses a subset of these — the full palette is
// declared up front so Phase 3 UI work can use it without re-adjusting.
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      colors: {
        // Neutral foundation: deep charcoal / midnight navy / espresso / warm stone
        ink: {
          950: '#0B0D10', // deepest surface — true bedroom-at-midnight
          900: '#10131A',
          800: '#161A22',
          700: '#1E232D',
          600: '#272D38',
          500: '#363D4A',
        },
        stone: {
          50: '#F4EFE8',  // warm off-white for headings
          100: '#E6DFD3', // body text
          200: '#CFC6B6',
          300: '#A89E8C', // muted metadata
          400: '#7B7264',
          500: '#544D43',
        },
        // Single moonlit accent — muted teal / mineral sage. Used sparingly.
        moon: {
          300: '#9BB7AE',
          400: '#7FA098',
          500: '#658981', // primary CTA
          600: '#4F706A',
          700: '#3C5853',
        },
        // Warm highlight tones used sparingly for emotional richness.
        ember: {
          400: '#C9A187',
          500: '#A8826A',
        },
      },
      fontFamily: {
        // Editorial serif for headings
        serif: ['"EB Garamond"', '"Cormorant Garamond"', 'Georgia', 'serif'],
        // Highly readable sans-serif for UI
        sans: ['Inter', '-apple-system', 'BlinkMacSystemFont', 'system-ui', 'sans-serif'],
      },
      fontSize: {
        // Body minimum 16px per design doc
        base: ['16px', { lineHeight: '1.65' }],
      },
      transitionTimingFunction: {
        // Motion that feels like exhaling — slow, soft, no overshoot
        exhale: 'cubic-bezier(0.22, 0.61, 0.36, 1)',
      },
      transitionDuration: {
        slow: '900ms',
        slower: '1600ms',
      },
      boxShadow: {
        // Soft ambient shadows, not dramatic drop shadows
        ambient: '0 12px 40px -16px rgba(0, 0, 0, 0.55)',
      },
      borderRadius: {
        soft: '14px',
        softer: '22px',
      },
    },
  },
  plugins: [],
};
