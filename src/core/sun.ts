// Self-contained sun position (Astronomical Almanac low-precision / Meeus). Whitepaper 4.4.
// The numeric coefficients below are ephemeris constants of the published formula, not tunable
// thresholds, so they stay here next to the maths rather than in config.ts.
// No refraction: elevation <= 0 is treated as dark anyway.
import { normalize360, toDeg, toRad } from './geo';

export type SunPosition = { azimuth: number; elevation: number };

const MS_PER_DAY = 86_400_000;
const JD_UNIX_EPOCH = 2_440_587.5;
const JD_J2000 = 2_451_545.0;

/** Sun azimuth (0 = north, clockwise, [0, 360)) and elevation, in degrees, at lat/lon and instant. */
export function sunPosition(lat: number, lon: number, date: Date): SunPosition {
  const n = date.getTime() / MS_PER_DAY + JD_UNIX_EPOCH - JD_J2000;

  const meanLon = normalize360(280.46 + 0.9856474 * n);
  const meanAnomaly = toRad(normalize360(357.528 + 0.9856003 * n));
  const eclipticLon = toRad(
    meanLon + 1.915 * Math.sin(meanAnomaly) + 0.02 * Math.sin(2 * meanAnomaly),
  );
  const obliquity = toRad(23.439 - 0.0000004 * n);

  const rightAscension = Math.atan2(
    Math.cos(obliquity) * Math.sin(eclipticLon),
    Math.cos(eclipticLon),
  );
  const declination = Math.asin(Math.sin(obliquity) * Math.sin(eclipticLon));

  const gmstDeg = 280.46061837 + 360.98564736629 * n;
  const hourAngle = toRad(normalize360(gmstDeg + lon - toDeg(rightAscension)));

  const φ = toRad(lat);
  const elevation = Math.asin(
    Math.sin(φ) * Math.sin(declination) + Math.cos(φ) * Math.cos(declination) * Math.cos(hourAngle),
  );
  const azimuth = Math.atan2(
    -Math.sin(hourAngle),
    Math.tan(declination) * Math.cos(φ) - Math.sin(φ) * Math.cos(hourAngle),
  );

  return { azimuth: normalize360(toDeg(azimuth)), elevation: toDeg(elevation) };
}
