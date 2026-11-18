import * as THREE from 'three'

/** Marcadores en pantalla (tamaño fijo en píxeles) dibujados con un shader de puntos */
export type MarkerShape = 'ring' | 'diamond' | 'cross' | 'dot'

const vertex = /* glsl */ `
  uniform float uSize;
  void main() {
    gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = uSize;
  }
`

const shapes: Record<MarkerShape, string> = {
  ring: 'float a = smoothstep(0.62, 0.7, d) * (1.0 - smoothstep(0.86, 0.94, d)) + (1.0 - smoothstep(0.16, 0.24, d));',
  diamond: 'float m = abs(c.x) + abs(c.y); float a = (1.0 - smoothstep(0.42, 0.47, m)) * smoothstep(0.24, 0.29, m) + (1.0 - smoothstep(0.1, 0.15, m));',
  cross: 'float a = (step(abs(c.x - c.y), 0.09) + step(abs(c.x + c.y), 0.09)) * step(d, 0.9);',
  dot: 'float a = 1.0 - smoothstep(0.55, 0.7, d);',
}

export function markerMaterial(shape: MarkerShape, color: string, sizePx: number) {
  return new THREE.ShaderMaterial({
    vertexShader: vertex,
    fragmentShader: /* glsl */ `
      uniform vec3 uColor;
      void main() {
        vec2 c = gl_PointCoord - 0.5;
        float d = length(c) * 2.0;
        ${shapes[shape]}
        a = clamp(a, 0.0, 1.0);
        if (a < 0.02) discard;
        gl_FragColor = vec4(uColor, a);
        #include <colorspace_fragment>
      }
    `,
    uniforms: { uColor: { value: new THREE.Color(color).convertSRGBToLinear() }, uSize: { value: sizePx } },
    transparent: true,
    depthWrite: false,
    // Sin prueba de profundidad: el sprite no se recorta contra la superficie. Quien lo
    // use debe ocultarlo cuando quede detrás de la Tierra (ver hideIfBehindEarth).
    depthTest: false,
  })
}

const tmpW = new THREE.Vector3()
/** Oculta un marcador sobre la superficie si la Tierra lo tapa desde la cámara */
export function hideIfBehindEarth(m: THREE.Object3D, camera: THREE.Camera, local: THREE.Vector3 | null) {
  if (!local) {
    m.visible = false
    return
  }
  m.parent?.updateMatrixWorld()
  tmpW.copy(local).applyMatrix4(m.parent?.matrixWorld ?? new THREE.Matrix4())
  const up = tmpW.clone().normalize()
  // Visible si la cámara está por encima del plano tangente en ese punto (con un pequeño margen)
  m.visible = camera.position.clone().sub(tmpW).dot(up) > -0.002
}

export function makeMarker(shape: MarkerShape, color: string, sizePx: number) {
  const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(new Float32Array(3), 3))
  const p = new THREE.Points(g, markerMaterial(shape, color, sizePx))
  p.frustumCulled = false
  p.renderOrder = 8
  return p
}
