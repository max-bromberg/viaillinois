import tailwindcssAnimate from "tailwindcss-animate";

/**
 * The design system reaches Tailwind through the tokens in src/app.css, which are
 * copied from docs/design/reference/foundation.css. What is mapped here is only what a
 * utility class has to be able to name: the three faces, the teal scale, the
 * two gradients that are allowed to exist, and the stock colour names that
 * unconverted screens still use.
 */
/** @type {import('tailwindcss').Config} */
const config = {
	darkMode: ["class"],
	content: ["./src/**/*.{html,js,svelte,ts}"],
	safelist: ["dark"],
	theme: {
		container: {
			center: true,
			padding: "2rem",
			screens: {
				"2xl": "1400px"
			}
		},
		extend: {
			colors: {
				// The teal scale of docs/design/04-color.md, with the mark at its centre.
				via: {
					50:  '#e6f8f8',
					100: '#c3eeef',
					200: '#8fdfe1',
					300: '#52d0d5',
					400: '#2fc4c8',
					500: '#00aaaf',
					600: '#008b8f',
					700: '#007c80',
					800: '#005558',
					900: '#0a3334',
					950: '#0a1516',
				},
				// The design system's own names, so a utility class can reach a token.
				paper: "var(--paper)",
				well: "var(--well)",
				line: { DEFAULT: "var(--line)", strong: "var(--line-strong)" },
				ink: { DEFAULT: "var(--ink)", 2: "var(--ink-2)" },
				faint: "var(--faint)",
				signal: { DEFAULT: "var(--signal)", text: "var(--signal-text)", soft: "var(--signal-soft)" },
				ok: "var(--ok)",
				warn: "var(--warn)",
				danger: "var(--danger)",
				plum: "var(--plum)",
				// The stock names, carried for one step. See src/app.css.
				border: "hsl(var(--stock-border) / <alpha-value>)",
				input: "hsl(var(--stock-input) / <alpha-value>)",
				ring: "hsl(var(--stock-ring) / <alpha-value>)",
				background: "hsl(var(--stock-background) / <alpha-value>)",
				foreground: "hsl(var(--stock-foreground) / <alpha-value>)",
				primary: {
					DEFAULT: "hsl(var(--stock-primary) / <alpha-value>)",
					foreground: "hsl(var(--stock-primary-foreground) / <alpha-value>)"
				},
				secondary: {
					DEFAULT: "hsl(var(--stock-secondary) / <alpha-value>)",
					foreground: "hsl(var(--stock-secondary-foreground) / <alpha-value>)"
				},
				destructive: {
					DEFAULT: "hsl(var(--stock-destructive) / <alpha-value>)",
					foreground: "hsl(var(--stock-destructive-foreground) / <alpha-value>)"
				},
				muted: {
					DEFAULT: "hsl(var(--stock-muted) / <alpha-value>)",
					foreground: "hsl(var(--stock-muted-foreground) / <alpha-value>)"
				},
				accent: {
					DEFAULT: "hsl(var(--stock-accent) / <alpha-value>)",
					foreground: "hsl(var(--stock-accent-foreground) / <alpha-value>)"
				},
				popover: {
					DEFAULT: "hsl(var(--stock-popover) / <alpha-value>)",
					foreground: "hsl(var(--stock-popover-foreground) / <alpha-value>)"
				},
				card: {
					DEFAULT: "hsl(var(--stock-card) / <alpha-value>)",
					foreground: "hsl(var(--stock-card-foreground) / <alpha-value>)"
				},
				sidebar: {
					DEFAULT: "hsl(var(--stock-sidebar-background))",
					foreground: "hsl(var(--stock-sidebar-foreground))",
					primary: "hsl(var(--stock-sidebar-primary))",
					"primary-foreground": "hsl(var(--stock-sidebar-primary-foreground))",
					accent: "hsl(var(--stock-sidebar-accent))",
					"accent-foreground": "hsl(var(--stock-sidebar-accent-foreground))",
					border: "hsl(var(--stock-sidebar-border))",
					ring: "hsl(var(--stock-sidebar-ring))",
        		},
			},
			fontFamily: {
				display: ["Bricolage Grotesque", "IBM Plex Sans", "ui-sans-serif", "system-ui", "sans-serif"],
				sans: ["IBM Plex Sans", "ui-sans-serif", "system-ui", "-apple-system", "Segoe UI", "Roboto", "sans-serif"],
				mono: ["IBM Plex Mono", "ui-monospace", "SFMono-Regular", "Menlo", "Consolas", "monospace"],
			},
			// The only gradients the system permits, beside the sky and the lamp.
			backgroundImage: {
				current: "var(--g-current)",
				board: "var(--g-board)",
				"sky-morning": "var(--sky-morning)",
				"sky-afternoon": "var(--sky-afternoon)",
				"sky-evening": "var(--sky-evening)",
				"sky-night": "var(--sky-night)",
			},
			boxShadow: {
				float: "var(--shadow-float)",
			},
			keyframes: {
				"accordion-down": {
					from: { height: "0" },
					to: { height: "var(--bits-accordion-content-height)" },
				},
				"accordion-up": {
					from: { height: "var(--bits-accordion-content-height)" },
					to: { height: "0" },
				},
				"caret-blink": {
					"0%,70%,100%": { opacity: "1" },
					"20%,50%": { opacity: "0" },
				},
			},
			animation: {
        		"accordion-down": "accordion-down 0.2s ease-out",
        		"accordion-up": "accordion-up 0.2s ease-out",
       			"caret-blink": "caret-blink 1.25s ease-out infinite",
      		},
		},
	},
	plugins: [tailwindcssAnimate],
};

export default config;
