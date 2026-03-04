import React, { useMemo } from 'react';

interface FavoriteBurstRay {
  index: number;
  innerX: string;
  innerY: string;
  outerX: string;
  outerY: string;
  delaySec: string;
}

interface FavoriteBurstParticle {
  index: number;
  burstX: string;
  burstY: string;
  delaySec: string;
}

const FAVORITE_BURST_PARTICLE_COUNT = 10;
const FAVORITE_BURST_RAY_COUNT = 8;
const FAVORITE_BURST_CENTER = 12;
const FAVORITE_BURST_RAY_INNER_RADIUS = 3.2;
const FAVORITE_BURST_RAY_OUTER_RADIUS = 10.2;
const FAVORITE_BURST_PARTICLE_RADIUS = 8.3;
const FAVORITE_BURST_RING_RADIUS = 3.2;
const FAVORITE_BURST_RING_R_VALUES = '3.2;8.8;10.6';
const FAVORITE_BURST_RING_OPACITY_VALUES = '0;0.75;0';
const FAVORITE_BURST_RING_STROKE_WIDTH_VALUES = '1.9;1.2;0.7';
const FAVORITE_BURST_RAY_OPACITY_VALUES = '0;0.95;0';
const FAVORITE_BURST_PARTICLE_START_RADIUS = '1.1';
const FAVORITE_BURST_PARTICLE_OPACITY_VALUES = '0;1;0';
const FAVORITE_BURST_PARTICLE_RADIUS_VALUES = '1.05;1.45;0.28';
const FAVORITE_BURST_FILL_MODE = 'freeze';
const FAVORITE_BURST_VIEWBOX = '0 0 24 24';
const FAVORITE_BURST_START_AT = '0s';

function buildFavoriteBurstRays(): FavoriteBurstRay[] {
  return Array.from({ length: FAVORITE_BURST_RAY_COUNT }, (_, index) => {
    const angle = (Math.PI * 2 * index) / FAVORITE_BURST_RAY_COUNT;
    const innerX = FAVORITE_BURST_CENTER + Math.cos(angle) * FAVORITE_BURST_RAY_INNER_RADIUS;
    const innerY = FAVORITE_BURST_CENTER + Math.sin(angle) * FAVORITE_BURST_RAY_INNER_RADIUS;
    const outerX = FAVORITE_BURST_CENTER + Math.cos(angle) * FAVORITE_BURST_RAY_OUTER_RADIUS;
    const outerY = FAVORITE_BURST_CENTER + Math.sin(angle) * FAVORITE_BURST_RAY_OUTER_RADIUS;

    return {
      index,
      innerX: innerX.toFixed(2),
      innerY: innerY.toFixed(2),
      outerX: outerX.toFixed(2),
      outerY: outerY.toFixed(2),
      delaySec: (index * 0.01).toFixed(3),
    };
  });
}

function buildFavoriteBurstParticles(): FavoriteBurstParticle[] {
  return Array.from({ length: FAVORITE_BURST_PARTICLE_COUNT }, (_, index) => {
    const angle = (Math.PI * 2 * index) / FAVORITE_BURST_PARTICLE_COUNT + Math.PI / FAVORITE_BURST_PARTICLE_COUNT;
    const burstX = FAVORITE_BURST_CENTER + Math.cos(angle) * FAVORITE_BURST_PARTICLE_RADIUS;
    const burstY = FAVORITE_BURST_CENTER + Math.sin(angle) * FAVORITE_BURST_PARTICLE_RADIUS;

    return {
      index,
      burstX: burstX.toFixed(2),
      burstY: burstY.toFixed(2),
      delaySec: (index * 0.012 + 0.03).toFixed(3),
    };
  });
}

interface FavoriteBurstEffectProps {
  durationSec: string;
}

export const FavoriteBurstEffect = React.memo(function FavoriteBurstEffect({ durationSec }: FavoriteBurstEffectProps) {
  const rays = useMemo(() => buildFavoriteBurstRays(), []);
  const particles = useMemo(() => buildFavoriteBurstParticles(), []);
  const center = String(FAVORITE_BURST_CENTER);

  return (
    <span className="clip-item-time-favorite-burst" aria-hidden="true">
      <svg className="clip-item-time-favorite-burst-svg" viewBox={FAVORITE_BURST_VIEWBOX} focusable="false">
        <circle
          className="clip-item-time-favorite-burst-ring-svg"
          cx={center}
          cy={center}
          r={FAVORITE_BURST_RING_RADIUS}
        >
          <animate attributeName="r" values={FAVORITE_BURST_RING_R_VALUES} dur={durationSec} begin={FAVORITE_BURST_START_AT} fill={FAVORITE_BURST_FILL_MODE} />
          <animate attributeName="opacity" values={FAVORITE_BURST_RING_OPACITY_VALUES} dur={durationSec} begin={FAVORITE_BURST_START_AT} fill={FAVORITE_BURST_FILL_MODE} />
          <animate attributeName="stroke-width" values={FAVORITE_BURST_RING_STROKE_WIDTH_VALUES} dur={durationSec} begin={FAVORITE_BURST_START_AT} fill={FAVORITE_BURST_FILL_MODE} />
        </circle>
        <path
          className="clip-item-time-favorite-burst-core-svg"
          d="M12 4.6l2.1 4.3 4.8.7-3.5 3.4.8 4.6-4.2-2.2-4.2 2.2.8-4.6-3.5-3.4 4.8-.7z"
        />
        {rays.map((ray) => (
          <line
            key={`ray-${ray.index}`}
            className="clip-item-time-favorite-burst-ray-svg"
            x1={ray.innerX}
            y1={ray.innerY}
            x2={ray.innerX}
            y2={ray.innerY}
          >
            <animate attributeName="opacity" values={FAVORITE_BURST_RAY_OPACITY_VALUES} dur={durationSec} begin={`${ray.delaySec}s`} fill={FAVORITE_BURST_FILL_MODE} />
            <animate attributeName="x2" from={ray.innerX} to={ray.outerX} dur={durationSec} begin={`${ray.delaySec}s`} fill={FAVORITE_BURST_FILL_MODE} />
            <animate attributeName="y2" from={ray.innerY} to={ray.outerY} dur={durationSec} begin={`${ray.delaySec}s`} fill={FAVORITE_BURST_FILL_MODE} />
          </line>
        ))}
        {particles.map((particle) => (
          <circle
            key={particle.index}
            cx={center}
            cy={center}
            r={FAVORITE_BURST_PARTICLE_START_RADIUS}
            className="clip-item-time-favorite-burst-particle-svg"
          >
            <animate attributeName="opacity" values={FAVORITE_BURST_PARTICLE_OPACITY_VALUES} dur={durationSec} begin={`${particle.delaySec}s`} fill={FAVORITE_BURST_FILL_MODE} />
            <animate attributeName="cx" from={center} to={particle.burstX} dur={durationSec} begin={`${particle.delaySec}s`} fill={FAVORITE_BURST_FILL_MODE} />
            <animate attributeName="cy" from={center} to={particle.burstY} dur={durationSec} begin={`${particle.delaySec}s`} fill={FAVORITE_BURST_FILL_MODE} />
            <animate attributeName="r" values={FAVORITE_BURST_PARTICLE_RADIUS_VALUES} dur={durationSec} begin={`${particle.delaySec}s`} fill={FAVORITE_BURST_FILL_MODE} />
          </circle>
        ))}
      </svg>
    </span>
  );
});
