/**
 * The faces a poster can be set in.
 *
 * A poster is a file somebody pins to a corkboard, so it is the one surface on
 * VIA that is not held to the site's own two faces: a board designing one is
 * designing something that stands beside other people's posters, and a display
 * face is most of what makes one stand out. Everything here beyond the three
 * the system already has is loaded from Google Fonts, on demand, only once a
 * face is actually chosen.
 *
 * The list lives here rather than in the designer because three parts of the
 * designer read it: the face menu, the drawing, and the loader that waits for
 * a face before the poster is drawn with it.
 */

export const FONT_GROUPS = [
  { label: 'System', fonts: [
    { key: 'system-sans',  name: 'System Sans',  css: 'system-ui,-apple-system,sans-serif',      google: null },
    { key: 'system-serif', name: 'System Serif', css: 'Georgia,Cambria,serif',                   google: null },
    { key: 'system-mono',  name: 'System Mono',  css: "ui-monospace,'Courier New',monospace",    google: null },
  ]},
  { label: 'Sans-Serif', fonts: [
    { key: 'inter',      name: 'Inter',        css: '"Inter",sans-serif',        google: 'Inter' },
    { key: 'roboto',     name: 'Roboto',       css: '"Roboto",sans-serif',       google: 'Roboto' },
    { key: 'open-sans',  name: 'Open Sans',    css: '"Open Sans",sans-serif',    google: 'Open+Sans' },
    { key: 'lato',       name: 'Lato',         css: '"Lato",sans-serif',         google: 'Lato' },
    { key: 'poppins',    name: 'Poppins',      css: '"Poppins",sans-serif',      google: 'Poppins' },
    { key: 'nunito',     name: 'Nunito',       css: '"Nunito",sans-serif',       google: 'Nunito' },
    { key: 'raleway',    name: 'Raleway',      css: '"Raleway",sans-serif',      google: 'Raleway' },
    { key: 'montserrat', name: 'Montserrat',   css: '"Montserrat",sans-serif',   google: 'Montserrat' },
    { key: 'dm-sans',    name: 'DM Sans',      css: '"DM Sans",sans-serif',      google: 'DM+Sans' },
    { key: 'outfit',     name: 'Outfit',       css: '"Outfit",sans-serif',       google: 'Outfit' },
    { key: 'figtree',    name: 'Figtree',      css: '"Figtree",sans-serif',      google: 'Figtree' },
    { key: 'plus-jakarta', name: 'Plus Jakarta Sans', css: '"Plus Jakarta Sans",sans-serif', google: 'Plus+Jakarta+Sans' },
  ]},
  { label: 'Serif', fonts: [
    { key: 'playfair',   name: 'Playfair Display',   css: '"Playfair Display",serif',   google: 'Playfair+Display' },
    { key: 'merriweather', name: 'Merriweather',     css: '"Merriweather",serif',        google: 'Merriweather' },
    { key: 'lora',       name: 'Lora',               css: '"Lora",serif',                google: 'Lora' },
    { key: 'eb-garamond', name: 'EB Garamond',       css: '"EB Garamond",serif',         google: 'EB+Garamond' },
    { key: 'cormorant',  name: 'Cormorant Garamond', css: '"Cormorant Garamond",serif',  google: 'Cormorant+Garamond' },
    { key: 'spectral',   name: 'Spectral',           css: '"Spectral",serif',            google: 'Spectral' },
  ]},
  { label: 'Display', fonts: [
    { key: 'bebas',     name: 'Bebas Neue',    css: '"Bebas Neue",sans-serif',  google: 'Bebas+Neue' },
    { key: 'anton',     name: 'Anton',         css: '"Anton",sans-serif',       google: 'Anton' },
    { key: 'oswald',    name: 'Oswald',        css: '"Oswald",sans-serif',      google: 'Oswald' },
    { key: 'righteous', name: 'Righteous',     css: '"Righteous",sans-serif',   google: 'Righteous' },
    { key: 'abril',     name: 'Abril Fatface', css: '"Abril Fatface",serif',    google: 'Abril+Fatface' },
    { key: 'russo',     name: 'Russo One',     css: '"Russo One",sans-serif',   google: 'Russo+One' },
  ]},
  { label: 'Script', fonts: [
    { key: 'pacifico',    name: 'Pacifico',       css: '"Pacifico",cursive',        google: 'Pacifico' },
    { key: 'lobster',     name: 'Lobster',        css: '"Lobster",cursive',         google: 'Lobster' },
    { key: 'dancing',     name: 'Dancing Script', css: '"Dancing Script",cursive',  google: 'Dancing+Script' },
    { key: 'great-vibes', name: 'Great Vibes',    css: '"Great Vibes",cursive',     google: 'Great+Vibes' },
  ]},
  { label: 'Monospace', fonts: [
    { key: 'space-mono',    name: 'Space Mono',    css: '"Space Mono",monospace',    google: 'Space+Mono' },
    { key: 'ibm-plex-mono', name: 'IBM Plex Mono', css: '"IBM Plex Mono",monospace', google: 'IBM+Plex+Mono' },
    { key: 'courier-prime', name: 'Courier Prime', css: '"Courier Prime",monospace', google: 'Courier+Prime' },
  ]},
];

/** Every face, out of the groups the menu shows them in. */
export const ALL_FONTS = FONT_GROUPS.flatMap(group => group.fonts);

/** The face a key names, or the first one, so that a drawing always has a face. */
export function fontFor(key) {
  return ALL_FONTS.find(font => font.key === key) ?? ALL_FONTS[0];
}

/** Which faces the document has already asked for, so none is asked for twice. */
const asked = new Set();

/**
 * Put a face in front of the browser and wait for it.
 *
 * A canvas draws with whatever face is loaded at the moment it draws, and it
 * does not wait: a poster drawn before its face arrived is a poster set in the
 * fallback, which is not what the board chose and not what they would have
 * downloaded. So the face is loaded at the two weights the designer sets text
 * in, and the drawing waits.
 */
export async function ensureFont(font, root = globalThis.document) {
  if (!font?.google || !root) return;

  if (!asked.has(font.key)) {
    const link = root.createElement('link');
    link.rel = 'stylesheet';
    link.href = `https://fonts.googleapis.com/css2?family=${font.google}:ital,wght@0,400;0,700;1,400&display=swap`;
    root.head.appendChild(link);
    asked.add(font.key);
  }

  try {
    await Promise.all([
      root.fonts.load(`bold 48px "${font.name}"`),
      root.fonts.load(`400 21px "${font.name}"`),
    ]);
  } catch {
    // A face the network did not bring is drawn in the fallback rather than
    // stopping the poster from being drawn at all.
  }
}
