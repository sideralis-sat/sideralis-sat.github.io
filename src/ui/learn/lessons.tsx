import type { ReactNode } from 'react'
import { Tex } from '../Tex'
import type { DossierTab } from '../dossier/Dossier'
import type { FrameMode } from '../../lib/frame'

/** Lo que una lección puede hacer en la aplicación (caso práctico) */
export interface LearnActions {
  select: (query: string, tab?: DossierTab) => boolean
  frame: (m: FrameMode) => void
  speed: (s: number) => void
  layers: (on: string[]) => void
  follow: () => void
  /** Cambia entre el globo y la vista cenital */
  view: (v: 'globe' | 'sky') => void
}

export interface Try {
  label: string
  run: (a: LearnActions) => void
}

export interface Lesson {
  id: string
  title: string
  summary: string
  body: ReactNode
  tries: Try[]
}

export const LESSONS: Lesson[] = [
  {
    id: 'orbita',
    title: 'Keplerian orbital motion',
    summary: 'Two-body problem, circular velocity, the vis-viva equation and Kepler’s laws.',
    body: (
      <>
        <p>
          A satellite is in <strong>free fall</strong> along a path whose curvature matches that of the Earth’s surface (Newton’s cannonball
          thought experiment). Weightlessness on board is not an absence of gravity: at 400 km gravitational acceleration is still 89 % of its
          surface value, but vehicle and crew fall with the same acceleration.
        </p>
        <p>In a circular orbit, gravitational attraction supplies the centripetal acceleration:</p>
        <Tex block>{'\\frac{GMm}{r^2} = \\frac{m v^2}{r} \\quad\\Rightarrow\\quad v_c = \\sqrt{\\frac{\\mu}{r}},\\qquad \\mu = GM_\\oplus = 398600.4\\ \\text{km}^3/\\text{s}^2'}</Tex>
        <p>
          At 400 km altitude (r = 6778 km) this gives v_c = 7.67 km/s and a period of about 92 minutes. In an elliptical orbit speed varies with
          radius according to the <strong>vis-viva equation</strong>, a statement of conservation of specific mechanical energy:
        </p>
        <Tex block>{'v^2 = \\mu\\left(\\frac{2}{r} - \\frac{1}{a}\\right)'}</Tex>
        <p>
          Kepler’s laws complete the picture: the orbit is a conic with the Earth’s center of mass at one focus; areal velocity is constant
          (conservation of angular momentum); and the period depends only on the semi-major axis:
        </p>
        <Tex block>{'T = 2\\pi\\sqrt{\\frac{a^3}{\\mu}}'}</Tex>
      </>
    ),
    tries: [{ label: 'ISS kinematics', run: (a) => a.select('ISS (ZARYA)', 'estado') }],
  },
  {
    id: 'elementos',
    title: 'Classical orbital elements',
    summary: 'a, e, i, Ω, ω, ν; osculating versus mean elements.',
    body: (
      <>
        <p>
          Six parameters define the orbit and the object’s position on it. They are equivalent to the state vector (r, v), but each has a direct
          geometric meaning:
        </p>
        <dl className="lesson-dl">
          <dt>a, semi-major axis</dt>
          <dd>Size of the conic; sets the specific energy and the period.</dd>
          <dt>e, eccentricity</dt>
          <dd>Shape of the conic: 0 circular, 0 &lt; e &lt; 1 elliptical.</dd>
          <dt>i, inclination</dt>
          <dd>Angle between the orbital and equatorial planes (ISS: 51.6°; sun-synchronous: ~98°).</dd>
          <dt>Ω, right ascension of the ascending node</dt>
          <dd>Right ascension of the ascending node, measured from the first point of Aries; orients the line of nodes.</dd>
          <dt>ω, argument of perigee</dt>
          <dd>Angular position of perigee in the orbital plane, measured from the ascending node.</dd>
          <dt>ν, true anomaly</dt>
          <dd>Angular position of the object, measured from perigee.</dd>
        </dl>
        <p>
          The app shows two sets: <em>osculating</em> elements, computed from the instantaneous state vector (the Keplerian conic tangent to the
          real trajectory), and the catalog’s <em>mean</em> elements, averaged according to SGP4 theory. The difference, a few kilometers in a,
          comes from the short-period oscillations driven by J2.
        </p>
      </>
    ),
    tries: [{ label: 'ISS elements', run: (a) => a.select('ISS (ZARYA)', 'orbita') }],
  },
  {
    id: 'marcos',
    title: 'Reference frames: ECI and ECEF',
    summary: 'Inertial and rotating frames, sidereal time and the transformation between them.',
    body: (
      <>
        <p>Both frames are geocentric, with the z axis along the Earth’s spin axis; they differ in where the x axis points:</p>
        <dl className="lesson-dl">
          <dt>ECI (inertial)</dt>
          <dd>
            x axis towards the vernal equinox, fixed relative to the stars. Newton’s laws apply without fictitious terms and the unperturbed orbit
            is a fixed conic. SGP4 works in the TEME variant.
          </dd>
          <dt>ECEF (Earth-fixed)</dt>
          <dd>x axis at the intersection of the equator and the Greenwich meridian; it rotates with the Earth. This is the frame of geodesy, GNSS and ground stations.</dd>
        </dl>
        <p>
          To first order the transformation is a rotation about z by the <strong>Greenwich mean sidereal time (GMST)</strong>. A sidereal day
          lasts 23 h 56 min 4.1 s, about four minutes shorter than the mean solar day.
        </p>
        <Tex block>{'\\vec r_{\\text{ECEF}} = R_z(\\theta_{\\text{GMST}})\\,\\vec r_{\\text{ECI}}'}</Tex>
        <p>
          The ECEF/ECI switch in the top bar changes the display frame: in ECI the Earth turns beneath a fixed orbit; in ECEF the relative
          trajectory drifts westwards.
        </p>
      </>
    ),
    tries: [
      { label: 'ISS in ECI at ×600', run: (a) => (a.select('ISS (ZARYA)'), a.layers(['orbit']), a.frame('ECI'), a.speed(600)) },
      { label: 'Back to ECEF', run: (a) => a.frame('ECEF') },
    ],
  },
  {
    id: 'traza',
    title: 'Ground track and coverage footprint',
    summary: 'Longitude shift per revolution and the central angle of visibility.',
    body: (
      <>
        <p>
          The ground track is the locus of the sub-satellite point. Its sinusoidal shape reflects the latitude swinging between +i and −i every
          revolution.
        </p>
        <p>During one revolution the Earth turns, so each successive ascending node moves west:</p>
        <Tex block>{'\\Delta\\lambda = \\omega_\\oplus\\, T = 360^\\circ\\cdot\\frac{T}{86164\\ \\text{s}}'}</Tex>
        <p>
          For the ISS (T ≈ 92.9 min) the shift is about 23° per revolution. If the ratio between the sidereal day and the period is rational, the
          track repeats (repeat ground track orbits), which sets the revisit cycle of observation missions.
        </p>
        <p>
          The coverage footprint is the region of the surface from which the object is above the horizon. Its central angle is λ₀ =
          arccos(R⊕ / (R⊕ + h)): about 20° for the ISS and 81° for a geostationary satellite.
        </p>
      </>
    ),
    tries: [{ label: 'Follow the ISS with its track (×60)', run: (a) => (a.select('ISS (ZARYA)'), a.layers(['track', 'footprint']), a.frame('ECEF'), a.speed(60), a.follow()) }],
  },
  {
    id: 'regimenes',
    title: 'Types of orbits',
    summary: 'By altitude (LEO, MEO, GEO, HEO), by shape, by inclination, and the special cases: sun-synchronous, transfer and graveyard orbits.',
    body: (
      <>
        <p>Orbits are classified along three independent axes: altitude, shape (eccentricity) and inclination to the equator.</p>
        <h3 className="lesson-h3">By altitude</h3>
        <dl className="lesson-dl">
          <dt>LEO, low Earth orbit (160 to 2000 km; 88 to 127 min)</dt>
          <dd>
            Close to the surface: short signal delay, high-resolution imaging and cheap launches. Each satellite sees a small area for a few
            minutes, so global services need constellations of hundreds or thousands (Starlink at ~550 km). Drag brings them down within years.
            ISS: 420 km.
          </dd>
          <dt>MEO, medium Earth orbit (2000 to 35,786 km)</dt>
          <dd>Home of navigation: GPS at 20,180 km with a 12 h period (half a sidereal day), GLONASS at 19,100 km, Galileo at 23,222 km.</dd>
          <dt>GEO, geostationary orbit (35,786 km; 23 h 56 min)</dt>
          <dd>
            The period equals the sidereal day. If the orbit is also circular and equatorial, the satellite hangs still in the sky, so dishes point
            at a fixed spot: broadcasting, communications, weather (Meteosat). Three satellites cover almost everything except the poles. A
            geosynchronous orbit with some inclination traces a figure eight in the sky every day.
          </dd>
          <dt>HEO, highly elliptical orbit</dt>
          <dd>Perigee of a few hundred kilometers, apogee of tens of thousands. Used to cover high latitudes that GEO sees too low on the horizon.</dd>
        </dl>
        <Tex block>{'r_{GEO} = \\left(\\mu \\left(\\frac{T_{\\text{sid}}}{2\\pi}\\right)^2\\right)^{1/3} = 42164\\ \\text{km} \;\\Rightarrow\; h = 35786\\ \\text{km}'}</Tex>
        <h3 className="lesson-h3">By shape</h3>
        <dl className="lesson-dl">
          <dt>Circular (e ≈ 0)</dt>
          <dd>Constant altitude and speed. Most satellites fly near-circular orbits.</dd>
          <dt>Elliptical (0 &lt; e &lt; 1)</dt>
          <dd>
            Fast at perigee, slow at apogee (Kepler’s second law). <strong>Molniya</strong>: e ≈ 0.74, apogee near 40,000 km over the northern
            hemisphere, 12 h period; it lingers about 8 h over Russia. <strong>Tundra</strong>: similar, with a 24 h period.
          </dd>
          <dt>Transfer orbit (GTO)</dt>
          <dd>Perigee near 200 km, apogee at 35,786 km: where launchers leave geostationary satellites, which then circularize with their own engine.</dd>
        </dl>
        <h3 className="lesson-h3">By inclination</h3>
        <dl className="lesson-dl">
          <dt>Equatorial (i ≈ 0°)</dt>
          <dd>Over the equator, like GEO.</dd>
          <dt>Inclined</dt>
          <dd>The ground track stays between latitudes ±i. The ISS flies at 51.6°, the lowest inclination reachable from Baikonur.</dd>
          <dt>Polar (i ≈ 90°)</dt>
          <dd>Passes over both poles; as the Earth turns beneath, it eventually sees the whole planet.</dd>
          <dt>Retrograde (i &gt; 90°)</dt>
          <dd>Moves against the Earth’s rotation, so launches cost more Δv.</dd>
        </dl>
        <h3 className="lesson-h3">Special orbits</h3>
        <dl className="lesson-dl">
          <dt>Sun-synchronous (SSO)</dt>
          <dd>
            Near-polar LEO at about 600 to 800 km and 97° to 99°. J2 turns its plane 360° a year, in step with the Sun, so it passes over each place
            at the same local solar time with the same lighting. The standard for Earth observation (Sentinel, Landsat).
          </dd>
          <dt>Graveyard orbit</dt>
          <dd>About 300 km above GEO, where geostationary satellites are sent at the end of their life to keep the GEO ring clear.</dd>
          <dt>Lagrange points</dt>
          <dd>Beyond Earth orbit: L2, 1.5 million km away, hosts the James Webb telescope. They are not in the CelesTrak catalog.</dd>
        </dl>
      </>
    ),
    tries: [
      { label: 'A GPS satellite', run: (a) => a.select('GPS', 'orbita') },
      { label: 'A Galileo satellite', run: (a) => a.select('GALILEO', 'orbita') },
    ],
  },
  {
    id: 'j2',
    title: 'J2 zonal perturbation',
    summary: 'Nodal precession, apsidal rotation, sun-synchronous orbits and the critical inclination.',
    body: (
      <>
        <p>
          The Earth’s oblateness (equatorial radius 21 km larger than polar) is represented by the zonal harmonic J₂ = 1.0826·10⁻³. The excess
          equatorial mass exerts a torque on the orbital plane that causes a secular precession of the line of nodes:
        </p>
        <Tex block>{'\\dot\\Omega = -\\frac{3}{2}\\, n\\, J_2 \\left(\\frac{R_\\oplus}{a(1-e^2)}\\right)^2 \\cos i'}</Tex>
        <p>
          For the ISS the drift is about −5 °/day. Choosing a slightly retrograde inclination that makes dΩ/dt = +0.9856 °/day, the orbital
          plane follows the Sun’s mean apparent motion: this is the <strong>sun-synchronous orbit</strong>, the standard for Earth observation
          because lighting conditions stay constant.
        </p>
        <p>
          J2 also rotates the line of apsides, an effect that vanishes at the critical inclination i = 63.4°; this is why Molniya orbits use it.
        </p>
      </>
    ),
    tries: [{ label: 'ISS nodal precession', run: (a) => a.select('ISS (ZARYA)', 'orbita') }],
  },
  {
    id: 'sgp4',
    title: 'GP elements: OMM and SGP4',
    summary: 'Where the data comes from, mean element theory and loss of accuracy over time.',
    body: (
      <>
        <p>
          The US Space Force maintains the catalog of objects in orbit from its surveillance network (radars and optical sensors) and publishes
          it on Space-Track; CelesTrak redistributes it. The legacy TLE format (two 69-character lines) is being replaced by the OMM message
          (CCSDS 502.0), which allows catalog numbers longer than five digits.
        </p>
        <p>
          These are <em>mean</em> elements, fitted by orbit determination for the analytical <strong>SGP4</strong> propagator, which models
          J2–J4, atmospheric drag (the B* term) and, in deep space, lunisolar perturbations. They must not be used as osculating Keplerian
          elements.
        </p>
        <p>
          Typical error is about 1 km at epoch and grows by several kilometers per day, especially in LEO, where drag depends on solar activity.
          That is why the app shows the age of the elements, and why they should be refreshed often.
        </p>
      </>
    ),
    tries: [{ label: 'ISS element epoch', run: (a) => a.select('ISS (ZARYA)', 'orbita') }],
  },
  {
    id: 'sombra',
    title: 'Eclipses and power budget',
    summary: 'β angle, eclipse fraction and sizing the power subsystem.',
    body: (
      <>
        <p>
          The Earth’s shadow can be modelled as a cylinder (strictly, an umbra cone surrounded by penumbra) pointing away from the Sun. The
          fraction of each revolution spent in eclipse depends on the <strong>β angle</strong> between the orbital plane and the Sun vector:
        </p>
        <Tex block>{'f_E = \\frac{1}{\\pi}\\arccos\\left(\\frac{\\sqrt{h^2 + 2R_\\oplus h}}{(R_\\oplus + h)\\cos\\beta}\\right)'}</Tex>
        <p>The expression holds for |β| below the critical angle; above it there is no eclipse:</p>
        <Tex block>{'\\beta^* = \\arcsin\\frac{R_\\oplus}{R_\\oplus+h}'}</Tex>
        <p>
          At 400 km and β = 0° the eclipse lasts about 36 of 92 minutes; above |β| ≈ 70° it disappears. β changes with the Sun’s apparent motion
          and with nodal precession, which produces seasons with and without eclipses.
        </p>
        <p>Design implications:</p>
        <ul>
          <li>During the sunlit phase the solar array must supply the energy for the whole revolution plus the battery recharge.</li>
          <li>The battery is sized for the longest eclipse at a limited depth of discharge: in LEO it goes through about 5,500 cycles a year.</li>
          <li>Shadow entry causes thermal transients of tens of degrees, so thermal design cases are also defined in terms of β.</li>
        </ul>
      </>
    ),
    tries: [{ label: 'ISS illumination', run: (a) => a.select('ISS (ZARYA)', 'energia') }],
  },
  {
    id: 'pases',
    title: 'Tracking from a ground station',
    summary: 'Topocentric coordinates, AOS/LOS windows and Doppler shift.',
    body: (
      <>
        <p>
          Pointing an antenna needs the station-to-satellite vector expressed in the topocentric SEZ frame (South, East, Zenith), from which
          elevation and azimuth follow:
        </p>
        <Tex block>{'El = \\arcsin\\frac{\\rho_Z}{|\\vec\\rho|},\\qquad Az = \\operatorname{atan2}(\\rho_E,\\ -\\rho_S)'}</Tex>
        <p>
          A contact window runs from acquisition (AOS) to loss of signal (LOS). In LEO it lasts 5 to 12 minutes, which limits how much data each
          station can download. Range rate produces a Doppler shift of about ±10 kHz at 437 MHz:
        </p>
        <Tex block>{'f = f_0\\left(1 - \\frac{\\dot\\rho}{c}\\right)'}</Tex>
        <p>
          A pass can be seen with the naked eye when the object is sunlit and the station is in darkness (Sun below −6°), which happens around
          dusk and dawn.
        </p>
      </>
    ),
    tries: [{ label: 'ISS passes over the station', run: (a) => a.select('ISS (ZARYA)', 'pases') }],
  },
  {
    id: 'gnss',
    title: 'Satellite navigation and dilution of precision',
    summary: 'Pseudoranges, the four-unknown solution and why geometry matters.',
    body: (
      <>
        <p>
          A GNSS receiver measures <em>pseudoranges</em>: the signal travel time times c, biased by the receiver clock error. With four unknowns
          (x, y, z and the clock bias) it needs at least four satellites, and solves the linearized system by least squares.
        </p>
        <Tex block>{'\\rho_k = |\\vec r_k - \\vec r| + c\\,\\delta t,\\qquad Q = (G^\\mathsf{T}G)^{-1},\\qquad \\sigma_{\\text{pos}} = \\text{PDOP}\\cdot\\sigma_{\\text{range}}'}</Tex>
        <p>
          The matrix G holds the direction cosines of each line of sight. If the satellites are spread across the sky, Q is small and errors stay
          small; if they bunch together, the same ranging error becomes a large position error. That amplification is the{' '}
          <strong>dilution of precision</strong> (DOP). Mixing systems (GPS + Galileo) adds satellites but also one clock unknown per system.
        </p>
        <p>Urban canyons and steep valleys hide low satellites and raise DOP. Vertical precision is always worse, because no satellite lies below the horizon.</p>
      </>
    ),
    tries: [{ label: 'Open the GNSS sky view', run: (a) => a.view('sky') }],
  },
  {
    id: 'dop',
    title: 'Dilution of precision (DOP)',
    summary: 'Why the position of the satellites in the sky matters as much as the quality of each signal.',
    body: (
      <>
        <p>
          A GNSS receiver locates itself by measuring its distance to several satellites. Each measured distance has a small error, so the receiver
          is not on a sphere but inside a thin shell around each satellite. Where the shells intersect is the possible position.
        </p>
        <ul>
          <li>Satellites spread across the sky: the shells cross at wide angles and the common region is small. Precise position.</li>
          <li>Satellites bunched in one direction: the shells cross at shallow angles and the common region stretches out. Poor position, even with perfect signals.</li>
        </ul>
        <p>The dilution of precision is the factor that turns ranging error into position error:</p>
        <Tex block>{'\\sigma_{\\text{position}} = \\text{DOP}\\cdot\\sigma_{\\text{range}}'}</Tex>
        <p>
          With 3 m of ranging error and PDOP = 1.5, the position is good to about 4.5 m; with PDOP = 8, to about 24 m. It comes from the geometry
          matrix G, one row per satellite with the direction cosines of its line of sight and a 1 for the receiver clock:
        </p>
        <Tex block>{'G = \\begin{bmatrix} -\\hat e_1 & -\\hat n_1 & -\\hat u_1 & 1 \\\\ \\vdots & \\vdots & \\vdots & \\vdots \\\\ -\\hat e_k & -\\hat n_k & -\\hat u_k & 1 \\end{bmatrix},\\qquad Q = (G^\\mathsf{T}G)^{-1}'}</Tex>
        <dl className="lesson-dl">
          <dt>HDOP, horizontal</dt>
          <dd>√(q_EE + q_NN): latitude and longitude.</dd>
          <dt>VDOP, vertical</dt>
          <dd>√q_UU: altitude. Almost always the worst, because no satellite is below the horizon to bracket the vertical.</dd>
          <dt>PDOP, position</dt>
          <dd>√(q_EE + q_NN + q_UU): the three-dimensional figure, the most quoted.</dd>
          <dt>TDOP and GDOP</dt>
          <dd>Time (receiver clock) and everything together, position and time.</dd>
        </dl>
        <p>
          Reading the numbers: below 1 is ideal, 1 to 2 excellent, 2 to 5 good, 5 to 10 moderate, above 10 poor. Streets between tall buildings
          and narrow valleys hide part of the sky, cluster the visible satellites and raise DOP. Combining GPS and Galileo adds satellites, at the
          cost of one extra clock unknown per system.
        </p>
      </>
    ),
    tries: [{ label: 'Open the GNSS sky view', run: (a) => a.view('sky') }],
  },
  {
    id: 'enlace',
    title: 'Communication link budget',
    summary: 'Free-space loss, EIRP, G/T and the margin that closes a link.',
    body: (
      <>
        <p>
          A link budget adds gains and losses in decibels to predict the signal-to-noise ratio at the receiver. The dominant term is the{' '}
          <strong>free-space loss</strong>, the spreading of power over a sphere:
        </p>
        <Tex block>{'L_{fs} = 20\\log_{10}\\frac{4\\pi\\rho f}{c}'}</Tex>
        <p>The received carrier-to-noise density and the energy per bit follow:</p>
        <Tex block>{'\\frac{C}{N_0} = \\text{EIRP} - L_{fs} - L + \\frac{G}{T} + 228.6,\\qquad \\frac{E_b}{N_0} = \\frac{C}{N_0} - 10\\log_{10}R_b'}</Tex>
        <p>
          The link closes when E<sub>b</sub>/N<sub>0</sub> exceeds what the modulation and coding need for the target bit error rate (9.6 dB for
          uncoded BPSK at 10⁻⁵). In LEO the slant range triples between zenith and horizon, which costs about 10 dB: many missions change data
          rate during the pass.
        </p>
      </>
    ),
    tries: [{ label: 'ISS passes and downlink budget', run: (a) => a.select('ISS (ZARYA)', 'pases') }],
  },
  {
    id: 'maniobras',
    title: 'Orbital maneuvers and the rocket equation',
    summary: 'Hohmann and bi-elliptic transfers, plane changes and propellant budgets.',
    body: (
      <>
        <p>
          Changing orbit means changing velocity. For impulsive burns between coplanar circular orbits, the <strong>Hohmann transfer</strong> is
          the cheapest two-burn option: half an ellipse tangent to both circles.
        </p>
        <Tex block>{'a_t = \\frac{r_1 + r_2}{2},\\qquad \\Delta v_1 = \\sqrt{\\mu\\left(\\frac{2}{r_1}-\\frac{1}{a_t}\\right)} - \\sqrt{\\frac{\\mu}{r_1}},\\qquad TOF = \\pi\\sqrt{\\frac{a_t^3}{\\mu}}'}</Tex>
        <p>
          From a 400 km orbit to GEO it costs 3.85 km/s and takes 5.3 hours. Between orbits in the same plane, when the radius ratio exceeds
          11.94, a three-burn <strong>bi-elliptic transfer</strong> through a higher apoapsis can be cheaper, at the price of a much longer
          flight. With a plane change that threshold no longer holds: the bi-elliptic transfer turns the plane far out, where the spacecraft is
          slow, and can win at much smaller ratios. From the ISS to GEO (ratio 6.2, 51.6° plane change) it saves about 190 m/s but takes about
          ten times longer.
        </p>
        <p>Rotating the orbital plane is expensive, because the whole velocity vector has to turn:</p>
        <Tex block>{'\\Delta v_{\\text{plane}} = 2v\\sin\\frac{\\Delta i}{2}'}</Tex>
        <p>
          That is why launches to GEO from Kourou (5°) need less Δv than from Cape Canaveral (28.5°), and why the plane change is merged mostly into
          the apogee burn, where v is lowest (giving a few degrees to the perigee burn saves a little more). Each Δv becomes propellant through the <strong>Tsiolkovsky equation</strong>:
        </p>
        <Tex block>{'\\Delta v = I_{sp}\\,g_0\\ln\\frac{m_0}{m_f}'}</Tex>
      </>
    ),
    tries: [{ label: 'Plan a transfer from the ISS', run: (a) => a.select('ISS (ZARYA)', 'maniobra') }],
  },
  {
    id: 'reentrada',
    title: 'Deorbit and reentry',
    summary: 'Drag decay, retrograde burn, entry interface and regulations.',
    body: (
      <>
        <p>
          In LEO the residual thermosphere exerts drag that removes orbital energy every revolution. As the object descends, density rises and
          decay speeds up; below about 120 km reentry is over in minutes.
        </p>
        <Tex block>{'\\frac{da}{dt} = -\\frac{\\rho\\,\\sqrt{\\mu\\,a}}{BC},\\qquad BC = \\frac{m}{C_D A}'}</Tex>
        <p>
          A controlled reentry uses a retrograde burn that lowers perigee at the opposite point of the orbit. With a resulting perigee below
          ~80 km, reentry happens within the same revolution; from 400 km the Δv needed is of the order of 100 m/s.
        </p>
        <p>
          The atmospheric phase starts at the <em>entry interface</em> (~120 km) at about 7.5 km/s. Without a heat shield the vehicle breaks up
          around 78 km and most of its mass ablates; refractory parts (titanium tanks, optics) can reach the ground. Large structures are aimed
          at <strong>Point Nemo</strong>, the South Pacific oceanic pole of inaccessibility.
        </p>
        <p>
          On debris mitigation, the long-standing guideline capped post-mission time in LEO at 25 years; in 2022 the US FCC adopted a 5-year
          limit.
        </p>
      </>
    ),
    tries: [{ label: 'ISS reentry analysis', run: (a) => a.select('ISS (ZARYA)', 'reentrada') }],
  },
  {
    id: 'basura',
    title: 'Space debris, conjunctions and space weather',
    summary: 'Fragmentation clouds, collision screening and the solar-driven atmosphere.',
    body: (
      <>
        <p>
          Space surveillance networks track about 40,000 objects, of which only some 11,000 are working satellites (ESA, 2025); most of the
          rest are spent stages and fragments. Two events dominate: the Fengyun-1C anti-satellite test (2007)
          and the Iridium 33 and Cosmos 2251 collision (2009). In a <strong>Gabbard diagram</strong> each cloud draws an X around the parent
          orbit.
        </p>
        <p>
          Operators screen their satellites against the catalog every day. For each close approach they estimate the time of closest approach,
          the miss distance in the radial, in-track and cross-track frame, and a collision probability from both position covariances; above
          about 10⁻⁴ they plan an avoidance maneuver.
        </p>
        <p>
          Below 600 km the debris environment cleans itself through drag, and drag depends on the Sun. Extreme ultraviolet heats the thermosphere
          and raises density at a given altitude, tracked by the F10.7 index; geomagnetic storms (Ap index) add sudden heating:
        </p>
        <Tex block>{'T = 900 + 2.5\\,(F_{10.7} - 70) + 1.5\\,A_p,\\qquad \\rho = 6\\cdot10^{-10}\\exp\\left(-\\frac{h - 175}{T/m}\\right)'}</Tex>
        <p>
          Above about 700 km drag no longer helps, so the only cure is <strong>active debris removal</strong>: a chaser that visits the most dangerous
          objects and drags them down. Its cost is dominated by plane changes, Δv = 2v sin(θ/2), and the standard trick is to wait for J2 to
          rotate the planes into line, trading months of mission for hundreds of m/s.
        </p>
      </>
    ),
    tries: [{ label: 'Screen the ISS for conjunctions', run: (a) => a.select('ISS (ZARYA)', 'conjunciones') }],
  },
  {
    id: 'diseno',
    title: 'Designing a small satellite mission',
    summary: 'From mission goal to orbit, power, communications, lifetime and debris rules: the first sizing loop.',
    body: (
      <>
        <p>
          Preliminary design starts from what the satellite must do and works outwards. The orbit comes first, because almost everything else
          depends on it.
        </p>
        <dl className="lesson-dl">
          <dt>Orbit</dt>
          <dd>
            Imaging missions use sun-synchronous orbits so lighting repeats; the local time of the node trades Sun elevation against cloud cover
            (10:30 is the classic choice). Regional communications use an inclination slightly above the region’s latitude. Altitude trades
            resolution and link distance against lifetime.
          </dd>
          <dt>Power</dt>
          <dd>The solar array must run the load in sunlight and recharge the battery for the longest eclipse of the year (SMAD):</dd>
        </dl>
        <Tex block>{'P_{sa} = \\frac{P_e T_e / X_e + P_d T_d / X_d}{T_d},\\qquad A = \\frac{P_{sa}}{S\\,\\eta\\,F}'}</Tex>
        <dl className="lesson-dl">
          <dt>Communications</dt>
          <dd>Data per day is contact time with the ground stations times the data rate the link budget allows.</dd>
          <dt>Lifetime and rules</dt>
          <dd>
            Drag sets the natural lifetime. Since 2022 the US FCC requires LEO satellites to deorbit within 5 years of the end of the mission;
            small satellites without propulsion meet it by choosing a low enough orbit or adding a drag sail.
          </dd>
          <dt>Δv budget</dt>
          <dd>Station keeping against drag, collision avoidance and the final deorbit add up; the rocket equation turns them into propellant.</dd>
        </dl>
        <p>Every choice feeds back into the others, so the loop is repeated until the design closes. That is what the mission designer automates.</p>
      </>
    ),
    tries: [],
  },
  {
    id: 'astrofoto',
    title: 'Satellite trails in astrophotography',
    summary: 'Why satellites shine in the night sky, when they do, and how to predict trails in a frame.',
    body: (
      <>
        <p>
          A satellite has no light of its own: it reflects sunlight. It is visible when it is still sunlit while the observer is already in
          darkness, which happens for hours after dusk and before dawn. Around midnight in winter only objects high enough to escape the Earth’s
          shadow remain lit.
        </p>
        <p>
          A camera with focal length f and a sensor of width L covers a field of view of 2 arctan(L/2f). To know whether a satellite crosses the
          frame, its position is projected onto the plane tangent to the sky at the target (gnomonic projection, the same one a lens performs):
        </p>
        <Tex block>{'\\xi = \\frac{\\vec d\\cdot\\hat e}{\\vec d\\cdot\\hat u},\\qquad \\eta = \\frac{\\vec d\\cdot\\hat n}{\\vec d\\cdot\\hat u},\\qquad |\\xi| < \\frac{L_x}{2f},\\ |\\eta| < \\frac{L_y}{2f}'}</Tex>
        <p>
          The target coordinates are catalogued for the J2000 epoch, so they are precessed to the date first: Earth’s axis has drifted about
          0.37° since 2000, more than the field of a long telescope. Large LEO constellations have made trails a daily problem for wide-field
          astronomy, which is why observatories now plan exposures around predicted passes.
        </p>
      </>
    ),
    tries: [{ label: 'Open the sky view, then choose Astrophoto', run: (a) => a.view('sky') }],
  },
]

export const SOURCES: { label: string; url: string }[] = [
  { label: 'D. Vallado, Fundamentals of Astrodynamics and Applications (4th ed.): RV2COE, look angles, exponential atmosphere (table 8-4)', url: 'https://celestrak.org/software/vallado-sw.php' },
  { label: 'CelesTrak: GP data in OMM format and usage policy', url: 'https://celestrak.org/NORAD/documentation/gp-data-formats.php' },
  { label: 'Revisiting Spacetrack Report #3 (SGP4)', url: 'https://celestrak.org/publications/AIAA/2006-6753/' },
  { label: 'Bureau of Meteorology (Australia): Satellite Orbital Decay Calculations', url: 'https://www.sws.bom.gov.au/Category/Educational/Space%20Weather/Space%20Weather%20Effects/SatelliteOrbitalDecayCalculations.pdf' },
  { label: 'Beta angle and eclipses in circular orbits', url: 'https://en.wikipedia.org/wiki/Beta_angle' },
  { label: 'H. Curtis, Orbital Mechanics for Engineering Students (4th ed.): Hohmann, bi-elliptic and plane-change maneuvers', url: 'https://shop.elsevier.com/books/orbital-mechanics-for-engineering-students/curtis/978-0-12-824025-0' },
  { label: 'NOAA Space Weather Prediction Center: F10.7, Kp and the solar cycle forecast', url: 'https://www.swpc.noaa.gov/' },
  { label: 'ESA Space Environment Report', url: 'https://www.esa.int/Space_Safety/Space_Debris/ESA_Space_Environment_Report_2025' },
  { label: 'FCC: 5-year rule for deorbiting satellites (2022)', url: 'https://www.federalregister.gov/documents/2024/08/09/2024-17093/space-innovation-mitigation-of-orbital-debris-in-the-new-space-age' },
]
