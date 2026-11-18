import { useEffect, useMemo } from 'react'
import * as THREE from 'three'
import { eciToScene } from '../lib/coords'
import type { ManeuverDrawing } from '../ui/dossier/ManeuverTab'

/**
 * Maniobra planificada (dentro del grupo inercial): tramos de transferencia en amarillo,
 * órbita final en azul discontinuo y órbita inicial, como referencia, en blanco tenue.
 */
export function TransferPath({ drawing }: { drawing: ManeuverDrawing }) {
  const objs = useMemo(() => {
    const toLine = (pts: number[][], mat: THREE.Material, dashed = false) => {
      const arr = new Float32Array(pts.length * 3)
      const tmp = [0, 0, 0]
      pts.forEach((p, i) => {
        eciToScene(p[0], p[1], p[2], tmp)
        arr.set(tmp, i * 3)
      })
      const g = new THREE.BufferGeometry().setAttribute('position', new THREE.BufferAttribute(arr, 3))
      const line = new THREE.Line(g, mat)
      if (dashed) line.computeLineDistances()
      line.frustumCulled = false
      line.renderOrder = 4
      return line
    }
    const leg = new THREE.LineBasicMaterial({ color: '#ffc21a', transparent: true, opacity: 0.95, depthWrite: false })
    const target = new THREE.LineDashedMaterial({ color: '#5b9dff', dashSize: 0.04, gapSize: 0.03, transparent: true, opacity: 0.9, depthWrite: false })
    const start = new THREE.LineBasicMaterial({ color: '#edf0f4', transparent: true, opacity: 0.3, depthWrite: false })
    return [...drawing.legs.map((l) => toLine(l, leg)), toLine(drawing.target, target, true), toLine(drawing.start, start)]
  }, [drawing])

  useEffect(
    () => () => {
      const mats = new Set<THREE.Material>()
      for (const o of objs) {
        o.geometry.dispose()
        mats.add(o.material as THREE.Material)
      }
      mats.forEach((m) => m.dispose())
    },
    [objs],
  )

  return (
    <>
      {objs.map((o, i) => (
        <primitive key={i} object={o} />
      ))}
    </>
  )
}
