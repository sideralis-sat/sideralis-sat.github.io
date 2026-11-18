import { MU, RE, type Telemetry } from '../../lib/astrodynamics'
import { tn } from '../Tex'
import { fx, latStr, lonStr } from '../format'
import { Lead, Row, Table } from './Row'
import { Full, MoreDetail } from '../detail'

export function StateTab({ t }: { t: Telemetry }) {
  const vCirc = Math.sqrt(MU / t.rMag)
  const vEsc = Math.sqrt((2 * MU) / t.rMag)
  return (
    <>
      <Lead short={<>Where the object is and how fast it moves. Press <span className="why-inline">?</span> on a row to see how it is computed.</>}>
        State vector and kinematic quantities at the simulation epoch, propagated with SGP4. The{' '}
        <span className="why-inline">?</span> button on each row opens the definition and the calculation with this object's values.
      </Lead>

      <Table caption="Sub-satellite point (WGS-84)">
        <Row
          sym="φ"
          label="Latitude"
          value={latStr(t.latDeg, 4)}
          explain={{
            text: (
              <>
                <em>Geodetic</em> latitude on the WGS-84 ellipsoid (semi-axes 6378.137 km and 6356.752 km). It differs from geocentric latitude
                by up to 0.19°, because the ellipsoid normal does not pass through the Earth's center of mass.
              </>
            ),
          }}
        />
        <Row sym="λ" label="Longitude" value={lonStr(t.lonDeg, 4)} />
        <Row
          sym="h"
          label="Geodetic altitude"
          value={fx(t.altKm, 2)}
          unit="km"
          explain={{
            text: <>Distance to the ellipsoid measured along its normal. Not to be confused with the geocentric radius |r|.</>,
            tex: 'h = |\\vec r| - R(\\varphi)',
            calc: `h = ${tn(t.rMag, 1)} - ${tn(t.rMag - t.altKm, 1)} = ${tn(t.altKm, 1)}\\ \\text{km}`,
          }}
        />
      </Table>

      <Table caption="Kinematics">
        <Row
          sym="v"
          label="Inertial velocity"
          value={fx(t.vMag, 4)}
          unit="km/s"
          tone="active"
          explain={{
            text: (
              <>
                <strong>Vis-viva equation</strong>: conservation of specific mechanical energy in the two-body problem. Speed increases as r
                decreases; a is the semi-major axis and μ = GM⊕ the Earth's gravitational parameter.
              </>
            ),
            tex: 'v = \\sqrt{\\mu\\left(\\frac{2}{r} - \\frac{1}{a}\\right)}',
            calc: `v = \\sqrt{398600.4\\left(\\frac{2}{${tn(t.rMag, 1)}} - \\frac{1}{${tn(t.osc.a, 1)}}\\right)} = ${tn(t.vMag, 3)}\\ \\text{km/s} = ${fx(t.vMag * 3600, 0)}\\ \\text{km/h}`,
          }}
        />
        <Row
          sym={<>v<sub>c</sub></>}
          label="Circular velocity"
          value={fx(vCirc, 4)}
          unit="km/s"
          explain={{
            text: <>Speed of a circular orbit of radius r: gravitational acceleration equals centripetal acceleration.</>,
            tex: 'v_c = \\sqrt{\\mu / r}',
            calc: `v_c = \\sqrt{398600.4 / ${tn(t.rMag, 1)}} = ${tn(vCirc, 3)}\\ \\text{km/s}`,
          }}
        />
        <Full>
        <Row
          sym={<>v<sub>esc</sub></>}
          label="Local escape velocity"
          value={fx(vEsc, 4)}
          unit="km/s"
          explain={{
            text: (
              <>
                Speed at which the specific energy becomes zero (parabolic trajectory). From the current state, the impulsive tangential escape Δv
                is {fx(vEsc - t.vMag, 2)} km/s.
              </>
            ),
            tex: 'v_{esc} = \\sqrt{2\\mu / r} = \\sqrt{2}\\, v_c',
          }}
        />
        <Row
          label="Earth-relative velocity (ECEF)"
          value={fx(t.groundSpeed, 4)}
          unit="km/s"
          explain={{
            text: (
              <>
                Velocity in the rotating Earth-fixed frame. Earth rotation contributes up to 465 m/s at the equator, which is why prograde launches
                towards the east save propellant.
              </>
            ),
            tex: '\\vec v_{\\text{ground}} = \\vec v - \\vec\\omega_\\oplus \\times \\vec r',
          }}
        />
        </Full>
      </Table>

      <Full>
      <Table
        caption="State vector (TEME frame)"
        note="TEME (True Equator, Mean Equinox): the quasi-inertial geocentric frame SGP4 works in. The six components of r and v define the orbit uniquely."
      >
        <Row sym={<>r<sub>x</sub></>} label="" value={fx(t.r.x, 3)} unit="km" />
        <Row sym={<>r<sub>y</sub></>} label="" value={fx(t.r.y, 3)} unit="km" />
        <Row sym={<>r<sub>z</sub></>} label="" value={fx(t.r.z, 3)} unit="km" />
        <Row sym={<>v<sub>x</sub></>} label="" value={fx(t.v.x, 5)} unit="km/s" />
        <Row sym={<>v<sub>y</sub></>} label="" value={fx(t.v.y, 5)} unit="km/s" />
        <Row sym={<>v<sub>z</sub></>} label="" value={fx(t.v.z, 5)} unit="km/s" />
      </Table>
      <p className="block-note">Reference equatorial radius: R⊕ = {fx(RE, 3)} km.</p>
      </Full>
      <MoreDetail what="escape velocity, Earth-relative velocity and the state vector" />
    </>
  )
}
