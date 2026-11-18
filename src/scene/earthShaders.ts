/**
 * Sombreado de la superficie terrestre compartido por el globo base y las teselas de detalle.
 * Ambos reciben la imagen diurna por `uDay` (el globo entero o una tesela) y leen las luces
 * nocturnas y la máscara de océano de las texturas globales con coordenadas geográficas.
 */

export const surfaceVertex = /* glsl */ `
  attribute vec2 aGeoUv;
  varying vec2 vUv;
  varying vec2 vGeoUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;
  void main() {
    vUv = uv;
    vGeoUv = aGeoUv;
    // En una esfera unidad la normal es la propia posición
    vNormalW = normalize(mat3(modelMatrix) * position);
    vec4 world = modelMatrix * vec4(position, 1.0);
    vPosW = world.xyz;
    gl_Position = projectionMatrix * viewMatrix * world;
  }
`

export const surfaceFragment = /* glsl */ `
  uniform sampler2D uDay;
  uniform sampler2D uNight;
  uniform sampler2D uSpec;
  uniform vec3 uSunDir;
  uniform float uOpacity;
  // Luces nocturnas en alta resolución (solo teselas): textura y recorte (x, y, escala)
  uniform sampler2D uNightTile;
  uniform vec3 uNightRect;
  uniform float uUseNightTile;
  varying vec2 vUv;
  varying vec2 vGeoUv;
  varying vec3 vNormalW;
  varying vec3 vPosW;

  void main() {
    vec3 n = normalize(vNormalW);
    vec3 viewDir = normalize(cameraPosition - vPosW);
    float ndl = dot(n, uSunDir);
    float dayMix = smoothstep(-0.12, 0.22, ndl);

    vec3 day = texture2D(uDay, vUv).rgb;
    vec3 night = texture2D(uNight, vGeoUv).rgb;
    if (uUseNightTile > 0.5) {
      vec2 nuv = vec2(uNightRect.x + vUv.x * uNightRect.z, 1.0 - uNightRect.y - (1.0 - vUv.y) * uNightRect.z);
      night = texture2D(uNightTile, nuv).rgb;
    }
    float ocean = texture2D(uSpec, vGeoUv).r;

    // Difusa suavizada: con el Sol bajo las zonas iluminadas no quedan negras
    float diff = pow(clamp(ndl, 0.0, 1.0), 0.55);
    vec3 lit = day * (0.04 + 1.1 * diff);
    // Las imágenes Blue Marble tienen el océano muy oscuro: un poco de azul de día
    lit += ocean * vec3(0.012, 0.035, 0.075) * diff;
    vec3 h = normalize(uSunDir + viewDir);
    lit += vec3(0.75, 0.82, 0.95) * pow(max(dot(n, h), 0.0), 140.0) * ocean * 0.1 * dayMix;

    // Las luces son cálidas (canal rojo alto); el relieve nocturno es azulado (rojo casi nulo).
    // Ojo: la textura se lee en espacio lineal, de ahí umbrales tan bajos
    float lights = smoothstep(0.004, 0.09, night.r);
    vec3 cities = (night * lights * vec3(1.0, 0.82, 0.6) * 3.2 + night * 0.3) * (1.0 - dayMix);
    vec3 col = mix(cities + day * 0.008, lit, dayMix);

    float dusk = exp(-pow(ndl * 18.0, 2.0));
    col += vec3(1.0, 0.45, 0.18) * dusk * 0.015;

    float fres = pow(1.0 - max(dot(n, viewDir), 0.0), 4.0);
    col += vec3(0.32, 0.55, 1.0) * fres * (0.03 + 0.32 * dayMix);

    gl_FragColor = vec4(col, uOpacity);
    #include <tonemapping_fragment>
    #include <colorspace_fragment>
  }
`

export const atmosphereVertex = /* glsl */ `
  varying vec3 vNormalV;
  varying vec3 vNormalW;
  void main() {
    vNormalV = normalize(normalMatrix * normal);
    vNormalW = normalize(mat3(modelMatrix) * normal);
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
  }
`

export const atmosphereFragment = /* glsl */ `
  uniform vec3 uSunDir;
  uniform float uStrength;
  varying vec3 vNormalV;
  varying vec3 vNormalW;
  void main() {
    float f = -dot(normalize(vNormalV), vec3(0.0, 0.0, 1.0));
    float rim = pow(smoothstep(0.0, 0.42, f), 2.2);
    float sunSide = smoothstep(-0.45, 0.35, dot(normalize(vNormalW), uSunDir));
    vec3 color = mix(vec3(0.16, 0.25, 0.6), vec3(0.38, 0.62, 1.0), sunSide);
    gl_FragColor = vec4(color, 1.0) * rim * mix(0.18, 1.0, sunSide) * uStrength;
    #include <colorspace_fragment>
  }
`

/** Posición en la esfera unidad (marco de la Tierra) de una latitud/longitud en radianes */
export function geoToLocal(lat: number, lon: number, out: number[] | Float32Array, o = 0) {
  const c = Math.cos(lat)
  out[o] = c * Math.cos(lon)
  out[o + 1] = Math.sin(lat)
  out[o + 2] = -c * Math.sin(lon)
}
