import { useMemo } from 'react'
import { MU, RE, meanElements, wrapDeg, type Telemetry } from '../../lib/astrodynamics'
import type { SatRecord } from '../../data/types'
import { ORBIT_CLASSES, orbitElements } from '../../lib/orbit'
import { OrbitDiagram } from '../charts/OrbitDiagram'
import { tn } from '../Tex'
import { duration, fx, isoUtc, period, sci } from '../format'
import { PropagatorCompare } from './PropagatorCompare'
import { Lead, Row, Table } from './Row'
import { Full, MoreDetail } from '../detail'

const DEG = 180 / Math.PI
const ang = (rad: number | null, d = 3) => (rad === null ? 'undefined' : fx(wrapDeg(rad), d))

export function OrbitTab({ t, record, now }: { t: Telemetry; record: SatRecord; now: number }) {
  const m = useMemo(() => meanElements(record), [record])
  const regime = ORBIT_CLASSES.find((o) => o.id === orbitElements(record).orbitClass)!
  const o = t.osc
  const ageH = (now - m.epoch) / 3.6e6

  return (
    <>
      <Lead short={<>Size and shape of the orbit, drawn to scale. Orbital regime: {regime.label} ({regime.id}).</>}>
        Classical Keplerian elements: a and e set the shape of the conic; i, Ω and ω set its orientation in inertial space; ν locates the
        object on it. Orbital regime: {regime.label} ({regime.id}).
      </Lead>

      <OrbitDiagram a={o.a} e={o.e} nu={o.nu ?? o.u} />

      <Table caption="Orbit geometry">
        <Row
          sym="a"
          label="Semi-major axis"
          value={fx(o.a, 2)}
          unit="km"
          explain={{
            text: <>Semi-major axis of the conic. It fixes the specific energy and the orbital period: orbits with the same a have the same period, whatever their e.</>,
            tex: 'a = -\\frac{\\mu}{2\\varepsilon}',
            calc: `a = -\\frac{398600.4}{2\\cdot(${tn(o.energy, 3)})} = ${tn(o.a, 1)}\\ \\text{km}`,
          }}
        />
        <Row
          sym="e"
          label="Eccentricity"
          value={fx(o.e, 6)}
          explain={{
            text: <>Magnitude of the eccentricity vector, which points to perigee: e = 0 for a circular orbit and 0 &lt; e &lt; 1 for an elliptical one (Molniya: e ≈ 0.74).</>,
            tex: '\\vec e = \\frac{1}{\\mu}\\left[\\left(v^2 - \\frac{\\mu}{r}\\right)\\vec r - (\\vec r\\cdot\\vec v)\\,\\vec v\\right]',
          }}
        />
        <Row
          sym="T"
          label="Period"
          value={period((2 * Math.PI * Math.sqrt(o.a ** 3 / MU)) / 60)}
          explain={{
            text: <>Kepler's third law: the square of the period is proportional to the cube of the semi-major axis.</>,
            tex: 'T = 2\\pi\\sqrt{\\frac{a^3}{\\mu}}',
            calc: `T = 2\\pi\\sqrt{\\frac{${tn(o.a, 1)}^3}{398600.4}} = ${tn((2 * Math.PI * Math.sqrt(o.a ** 3 / MU)) / 60, 2)}\\ \\text{min}`,
          }}
        />
        <Row
          sym={<>h<sub>a</sub></>}
          label="Apogee altitude"
          value={fx(o.a * (1 + o.e) - RE, 1)}
          unit="km"
          explain={{ text: <>Apsis farthest from the focus. Speed is lowest there (Kepler's second law).</>, tex: 'h_a = a(1+e) - R_\\oplus' }}
        />
        <Row
          sym={<>h<sub>p</sub></>}
          label="Perigee altitude"
          value={fx(o.a * (1 - o.e) - RE, 1)}
          unit="km"
          explain={{ text: <>Apsis closest to the focus. With perigees below ~200 km, aerodynamic drag brings the object down within days.</>, tex: 'h_p = a(1-e) - R_\\oplus' }}
        />
      </Table>

      <Full>
      <Table caption="Orientation and anomaly (osculating)">
        <Row
          sym="i"
          label="Inclination"
          value={fx(o.i * DEG, 3)}
          unit="°"
          explain={{
            text: (
              <>
                Dihedral angle between the orbital plane and the equatorial plane. It bounds the sub-satellite latitude to ±
                {fx(Math.min(o.i * DEG, 180 - o.i * DEG), 1)}°. With i &gt; 90° the orbit is retrograde.
              </>
            ),
            tex: 'i = \\arccos\\left(\\frac{h_z}{|\\vec h|}\\right)',
          }}
        />
        <Row
          sym="Ω"
          label="RA of ascending node"
          value={ang(o.raan)}
          unit="°"
          explain={{
            text: <>Angle measured in the equatorial plane from the first point of Aries (vernal equinox) to the ascending node. It orients the line of nodes.</>,
          }}
        />
        <Row
          sym="ω"
          label="Argument of perigee"
          value={ang(o.argp)}
          unit="°"
          explain={{ text: <>Angle in the orbital plane from the ascending node to perigee. Ill-conditioned for near-circular orbits (e → 0).</> }}
        />
        <Row
          sym="ν"
          label="True anomaly"
          value={ang(o.nu)}
          unit="°"
          tone="active"
          explain={{ text: <>Angle from perigee to the position vector. The only fast-varying element: it sweeps 360° per revolution.</> }}
        />
        <Row
          sym="u"
          label="Argument of latitude"
          value={ang(o.u)}
          unit="°"
          explain={{ text: <>u = ω + ν, measured from the ascending node. It replaces ω and ν for circular orbits, where they are undefined.</> }}
        />
      </Table>

      <Table
        caption="Integrals of motion"
        note="In the two-body problem ε and h are conserved. Closed orbits have ε < 0; with ε = 0 the trajectory is parabolic."
      >
        <Row
          sym="ε"
          label="Specific energy"
          value={fx(o.energy, 4)}
          unit="km²/s²"
          explain={{
            text: <>Mechanical energy per unit mass (kinetic plus gravitational potential). Constant in the absence of perturbations and thrust.</>,
            tex: '\\varepsilon = \\frac{v^2}{2} - \\frac{\\mu}{r} = -\\frac{\\mu}{2a}',
            calc: `\\varepsilon = \\frac{${tn(t.vMag, 3)}^2}{2} - \\frac{398600.4}{${tn(t.rMag, 1)}} = ${tn(o.energy, 3)}\\ \\text{km}^2/\\text{s}^2`,
          }}
        />
        <Row
          sym="h"
          label="Specific angular momentum"
          value={fx(o.h, 1)}
          unit="km²/s"
          explain={{
            text: <>Vector normal to the orbital plane. Because it is constant, the plane stays fixed in inertial space, except for perturbations such as J2.</>,
            tex: '\\vec h = \\vec r \\times \\vec v',
          }}
        />
      </Table>

      <Table
        caption="J2 zonal perturbation (secular effects)"
        note={
          m.sunSynchronous
            ? 'Sun-synchronous orbit: nodal precession matches the mean apparent motion of the Sun, so the local solar time at the node stays constant. This is the usual regime for Earth observation.'
            : 'The equatorial bulge (J2) drives a secular drift of the line of nodes and of the line of apsides.'
        }
      >
        <Row
          sym="dΩ/dt"
          label="Nodal precession"
          value={fx(m.raanDot, 4)}
          unit="°/day"
          explain={{
            text: (
              <>
                Secular drift of the ascending node longitude caused by J2. When dΩ/dt = +0.9856 °/day (360° per tropical year) the orbit is
                sun-synchronous.
              </>
            ),
            tex: '\\dot\\Omega = -\\frac{3}{2}\\, n\\, J_2 \\left(\\frac{R_\\oplus}{p}\\right)^2 \\cos i,\\quad p = a(1-e^2)',
            calc: `\\dot\\Omega = -\\tfrac{3}{2}\\cdot n \\cdot 1.0826\\cdot10^{-3}\\left(\\frac{6378.1}{${tn(m.a * (1 - m.e * m.e), 1)}}\\right)^2 \\cos ${tn(m.i, 2)}^\\circ = ${tn(m.raanDot, 3)}\\ ^\\circ/\\text{day}`,
          }}
        />
        <Row
          sym="dω/dt"
          label="Apsidal rotation"
          value={fx(m.argpDot, 4)}
          unit="°/day"
          explain={{
            text: <>Zero at the critical inclination i = 63.4°, which Molniya orbits use to keep apogee over high northern latitudes.</>,
            tex: '\\dot\\omega = \\frac{3}{4}\\, n\\, J_2 \\left(\\frac{R_\\oplus}{p}\\right)^2 (5\\cos^2 i - 1)',
          }}
        />
        <Row label="Sun-synchronous" value={m.sunSynchronous ? 'Yes' : 'No'} tone={m.sunSynchronous ? 'good' : undefined} />
      </Table>

      <Table
        caption="SGP4 mean elements (OMM epoch)"
        note="Mean elements fitted for the SGP4 propagator; they are not osculating Keplerian elements. Typical error is ~1 km at epoch, growing by a few km per day."
      >
        <Row label="Epoch" value={isoUtc(m.epoch)} unit="UTC" />
        <Row label="Age" value={duration(now - m.epoch)} tone={ageH > 72 ? 'caution' : undefined} />
        <Row sym="n" label="Mean motion" value={fx(m.n, 8)} unit="rev/d" />
        <Row sym="i" label="Inclination" value={fx(m.i, 4)} unit="°" />
        <Row sym="Ω" label="RA of node" value={fx(m.raan, 4)} unit="°" />
        <Row sym="e" label="Eccentricity" value={fx(m.e, 7)} />
        <Row sym="ω" label="Arg. of perigee" value={fx(m.argp, 4)} unit="°" />
        <Row sym="M" label="Mean anomaly" value={fx(m.m, 4)} unit="°" />
        <Row
          sym="B*"
          label="B* drag term"
          value={sci(m.bstar)}
          unit="1/R⊕"
          explain={{
            text: (
              <>
                SGP4's aerodynamic drag term, proportional to the inverse of the ballistic coefficient. It is a fitting parameter of the orbit
                determination: it can absorb modeling errors and can even come out negative.
              </>
            ),
            tex: 'B^* = \\frac{\\rho_0}{2}\\,\\frac{C_D A}{m},\\qquad \\rho_0 = 0.157\\ \\text{kg}\\,\\text{m}^{-2}R_\\oplus^{-1}',
          }}
        />
      </Table>

      <PropagatorCompare record={record} now={now} />
      </Full>
      <MoreDetail what="orientation angles, integrals of motion, J2 drift, SGP4 mean elements and the propagator comparison" />
    </>
  )
}
