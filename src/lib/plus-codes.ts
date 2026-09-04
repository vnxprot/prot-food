import type { Position } from "./hanoi-obstacles";

const ALPHABET = "23456789CFGHJMPQRVWX";
const SEPARATOR_POSITION = 8;
const PAIR_RESOLUTIONS = [20, 1, 0.05, 0.0025, 0.000125] as const;
const HANOI_REFERENCE: Position = { lat: 21.0285, lng: 105.8542 };
const PLUS_CODE_PATTERN = /\b([2-9CFGHJMPQRVWX]{4,8}\+[2-9CFGHJMPQRVWX]{2,4})\b/i;

function readableText(text: string) {
  try {
    return decodeURIComponent(text.replace(/\+/g, "%2B"));
  } catch {
    return text;
  }
}

export function extractPlusCode(text: string) {
  return readableText(text).match(PLUS_CODE_PATTERN)?.[1]?.toUpperCase() ?? null;
}

function encodePairs(position: Position) {
  let latitude = Math.min(90 - Number.EPSILON, Math.max(-90, position.lat)) + 90;
  let longitude = Math.min(180 - Number.EPSILON, Math.max(-180, position.lng)) + 180;
  let result = "";
  for (const resolution of PAIR_RESOLUTIONS) {
    const latDigit = Math.floor(latitude / resolution);
    const lngDigit = Math.floor(longitude / resolution);
    result += ALPHABET[latDigit] + ALPHABET[lngDigit];
    latitude -= latDigit * resolution;
    longitude -= lngDigit * resolution;
  }
  return result;
}

function recoverShortCode(code: string, reference: Position) {
  const separator = code.indexOf("+");
  const missing = SEPARATOR_POSITION - separator;
  if (missing <= 0) return code;
  const prefix = encodePairs(reference).slice(0, missing);
  return `${prefix}${code}`;
}

function decodeFullCode(code: string) {
  const digits = code.replace("+", "");
  if (digits.length < 10) return null;
  let lat = -90;
  let lng = -180;
  const pairLength = Math.min(10, digits.length - (digits.length % 2));
  for (let index = 0; index < pairLength; index += 2) {
    const resolution = PAIR_RESOLUTIONS[index / 2];
    const latDigit = ALPHABET.indexOf(digits[index]);
    const lngDigit = ALPHABET.indexOf(digits[index + 1]);
    if (latDigit < 0 || lngDigit < 0 || resolution == null) return null;
    lat += latDigit * resolution;
    lng += lngDigit * resolution;
  }

  let latResolution = PAIR_RESOLUTIONS[pairLength / 2 - 1];
  let lngResolution = latResolution;
  for (let index = pairLength; index < digits.length; index += 1) {
    const digit = ALPHABET.indexOf(digits[index]);
    if (digit < 0) return null;
    latResolution /= 5;
    lngResolution /= 4;
    lat += Math.floor(digit / 4) * latResolution;
    lng += (digit % 4) * lngResolution;
  }
  return { lat: lat + latResolution / 2, lng: lng + lngResolution / 2 };
}

export function decodePlusCode(code: string, reference: Position = HANOI_REFERENCE) {
  const extracted = extractPlusCode(code);
  if (!extracted) return null;
  const separator = extracted.indexOf("+");
  const missing = Math.max(0, SEPARATOR_POSITION - separator);
  const decoded = decodeFullCode(recoverShortCode(extracted, reference));
  if (!decoded || !missing) return decoded;

  // Move the recovered area to the closest matching cell around the reference.
  const resolution = PAIR_RESOLUTIONS[missing / 2 - 1];
  if (!resolution) return decoded;
  const half = resolution / 2;
  if (reference.lat + half < decoded.lat) decoded.lat -= resolution;
  else if (reference.lat - half > decoded.lat) decoded.lat += resolution;
  if (reference.lng + half < decoded.lng) decoded.lng -= resolution;
  else if (reference.lng - half > decoded.lng) decoded.lng += resolution;
  return decoded;
}
