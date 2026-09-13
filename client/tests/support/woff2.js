/**
 * Enough of the WOFF2 container to read a font's character map.
 *
 * The design review ran for three revisions on font files that held almost none
 * of the alphabet, because a stylesheet parser paired subset comments with the
 * wrong blocks and nobody opened the files. Reading the character map is the
 * only way to know what a font file actually covers, so the client reads it
 * rather than trusting a file name.
 *
 * WOFF2 stores the table directory with variable length lengths and brotli
 * compresses the tables into one stream. Only glyf and loca are transformed, so
 * cmap arrives exactly as it is in the original font and can be parsed as it
 * stands. See https://www.w3.org/TR/WOFF2/.
 */
import { readFileSync } from 'node:fs';
import { brotliDecompressSync } from 'node:zlib';

/** The known table tags, in the order the specification numbers them. */
const KNOWN_TAGS = [
  'cmap', 'head', 'hhea', 'hmtx', 'maxp', 'name', 'OS/2', 'post', 'cvt ', 'fpgm',
  'glyf', 'loca', 'prep', 'CFF ', 'VORG', 'EBDT', 'EBLC', 'gasp', 'hdmx', 'kern',
  'LTSH', 'PCLT', 'VDMX', 'vhea', 'vmtx', 'BASE', 'GDEF', 'GPOS', 'GSUB', 'EBSC',
  'JSTF', 'MATH', 'CBDT', 'CBLC', 'COLR', 'CPAL', 'SVG ', 'sbix', 'acnt', 'avar',
  'bdat', 'bloc', 'bsln', 'cvar', 'fdsc', 'feat', 'fmtx', 'fvar', 'gvar', 'hsty',
  'just', 'lcar', 'mort', 'morx', 'opbd', 'prop', 'trak', 'Zapf', 'Silf', 'Glat',
  'Gloc', 'Feat', 'Sill',
];

/** A UIntBase128: seven bits of the number per byte, high bit means another follows. */
function readBase128(buffer, cursor) {
  let value = 0;
  for (let byte = 0; byte < 5; byte += 1) {
    const next = buffer[cursor.at];
    cursor.at += 1;
    value = (value << 7) | (next & 0x7f);
    if ((next & 0x80) === 0) return value >>> 0;
  }
  throw new Error('a length in the table directory does not end');
}

/**
 * The tables of a WOFF2 file, by tag.
 * @param {string} file
 * @returns {Map<string, Buffer>}
 */
export function woff2Tables(file) {
  const buffer = readFileSync(file);
  if (buffer.toString('latin1', 0, 4) !== 'wOF2') {
    throw new Error(`${file} does not start with the WOFF2 signature`);
  }

  const tableCount = buffer.readUInt16BE(12);
  const cursor = { at: 48 };
  const directory = [];
  for (let index = 0; index < tableCount; index += 1) {
    const flags = buffer[cursor.at];
    cursor.at += 1;
    const known = flags & 0x3f;
    let tag;
    if (known === 0x3f) {
      tag = buffer.toString('latin1', cursor.at, cursor.at + 4);
      cursor.at += 4;
    } else {
      tag = KNOWN_TAGS[known];
    }
    const transform = (flags >> 6) & 0x03;
    const originalLength = readBase128(buffer, cursor);
    // glyf and loca are transformed unless the transform is 3; every other
    // table is transformed only when the transform is not 0.
    const transformed = tag === 'glyf' || tag === 'loca' ? transform !== 3 : transform !== 0;
    const length = transformed ? readBase128(buffer, cursor) : originalLength;
    directory.push({ tag, length });
  }

  const stream = brotliDecompressSync(buffer.subarray(cursor.at));
  const tables = new Map();
  let at = 0;
  for (const { tag, length } of directory) {
    tables.set(tag, stream.subarray(at, at + length));
    at += length;
  }
  return tables;
}

/** Every code point a subtable maps to a glyph other than the missing glyph. */
function readSubtable(cmap, offset, characters) {
  const format = cmap.readUInt16BE(offset);
  if (format === 4) {
    const segmentBytes = cmap.readUInt16BE(offset + 6);
    const segments = segmentBytes / 2;
    const endAt = offset + 14;
    const startAt = endAt + segmentBytes + 2;
    const deltaAt = startAt + segmentBytes;
    const rangeAt = deltaAt + segmentBytes;
    for (let segment = 0; segment < segments; segment += 1) {
      const end = cmap.readUInt16BE(endAt + segment * 2);
      const start = cmap.readUInt16BE(startAt + segment * 2);
      const delta = cmap.readInt16BE(deltaAt + segment * 2);
      const rangeOffset = cmap.readUInt16BE(rangeAt + segment * 2);
      if (start === 0xffff) continue;
      for (let code = start; code <= end && code < 0x10000; code += 1) {
        let glyph;
        if (rangeOffset === 0) {
          glyph = (code + delta) & 0xffff;
        } else {
          const at = rangeAt + segment * 2 + rangeOffset + (code - start) * 2;
          if (at + 1 >= cmap.length) continue;
          glyph = cmap.readUInt16BE(at);
          if (glyph !== 0) glyph = (glyph + delta) & 0xffff;
        }
        if (glyph !== 0) characters.add(code);
      }
    }
    return;
  }
  if (format === 12) {
    const groups = cmap.readUInt32BE(offset + 12);
    for (let group = 0; group < groups; group += 1) {
      const at = offset + 16 + group * 12;
      const start = cmap.readUInt32BE(at);
      const end = cmap.readUInt32BE(at + 4);
      for (let code = start; code <= end && code - start < 0x20000; code += 1) {
        characters.add(code);
      }
    }
  }
}

/**
 * Every code point a font file has a glyph for.
 * @param {string} file
 * @returns {Set<number>}
 */
export function characterMap(file) {
  const cmap = woff2Tables(file).get('cmap');
  if (!cmap) throw new Error(`${file} has no character map table`);
  const tableCount = cmap.readUInt16BE(2);
  const characters = new Set();
  const read = new Set();
  for (let index = 0; index < tableCount; index += 1) {
    const offset = cmap.readUInt32BE(4 + index * 8 + 4);
    if (read.has(offset)) continue;
    read.add(offset);
    readSubtable(cmap, offset, characters);
  }
  return characters;
}

/**
 * The variation axes of a font file, by tag, or an empty map for a static font.
 * @param {string} file
 * @returns {Map<string, { minimum: number, maximum: number, initial: number }>}
 */
export function variationAxes(file) {
  const fvar = woff2Tables(file).get('fvar');
  const axes = new Map();
  if (!fvar) return axes;
  const offset = fvar.readUInt16BE(4);
  const count = fvar.readUInt16BE(8);
  const size = fvar.readUInt16BE(10);
  for (let index = 0; index < count; index += 1) {
    const at = offset + index * size;
    axes.set(fvar.toString('latin1', at, at + 4), {
      minimum: fvar.readInt32BE(at + 4) / 65536,
      initial: fvar.readInt32BE(at + 8) / 65536,
      maximum: fvar.readInt32BE(at + 12) / 65536,
    });
  }
  return axes;
}
