import { useState } from 'react'
import { dB, LINK_PRESETS, linkAt, type LinkParams } from '../../lib/linkBudget'
import type { Pass } from '../../lib/passes'
import { LineChart } from '../charts/LineChart'
import { tn } from '../Tex'
import { fx } from '../format'
import { Row } from './Row'
import { Fold } from '../detail'

const hm = new Intl.DateTimeFormat('en-GB', { hour: '2-digit', minute: '2-digit' })

interface Props {
  pass: Pass
  freqMHz: number
  onFreq: (f: number) => void
}

/** Balance de enlace descendente a lo largo del pase seleccionado */
export function LinkBudget({ pass, freqMHz, onFreq }: Props) {
  const [p, setP] = useState<LinkParams>(LINK_PRESETS[0].p)
  const set = (k: keyof LinkParams) => (e: React.ChangeEvent<HTMLInputElement>) => {
    const v = Number(e.target.value)
    if (Number.isFinite(v)) setP((cur) => ({ ...cur, [k]: v }))
  }
  const f = freqMHz * 1e6
  const samples = pass.track.map((l) => ({ t: l.t, el: l.el, range: l.range, ...linkAt(l.range, f, p) }))
  const best = samples.reduce((a, b) => (b.margin > a.margin ? b : a), samples[0])
  const worst = samples.reduce((a, b) => (b.margin < a.margin ? b : a), samples[0])
  // Volumen descargable: tiempo con margen positivo × tasa de datos
  let closedMs = 0
  for (let k = 1; k < samples.length; k++) if (samples[k].margin >= 0 && samples[k - 1].margin >= 0) closedMs += samples[k].t - samples[k - 1].t
  const volumeMB = (p.rateBps * closedMs) / 1000 / 8 / 1e6

  return (
    <Fold title="Downlink budget" summary={`Margin ${fx(best.margin, 1)} dB at TCA, ${volumeMB >= 1000 ? `${fx(volumeMB / 1000, 2)} GB` : `${fx(volumeMB, 1)} MB`} per pass`}>
      <p className="block-note" style={{ marginTop: 0 }}>
        Signal-to-noise ratio of the downlink along the selected pass. Slant range sets free-space loss: from horizon to zenith it changes by
        about {fx(20 * Math.log10(worst.range / best.range), 0)} dB on this pass.
      </p>
      <div className="btn-row">
        {LINK_PRESETS.map((pr) => (
          <button
            key={pr.label}
            className="btn small"
            aria-pressed={p === pr.p}
            onClick={() => {
              setP(pr.p)
              onFreq(pr.freqMHz)
            }}
          >
            {pr.label}
          </button>
        ))}
      </div>
      <div className="form-grid">
        <label>
          Transmit power <span className="unit">W</span>
          <input type="number" min={0.01} step={0.1} value={p.powerW} onChange={set('powerW')} />
        </label>
        <label>
          Satellite antenna gain <span className="unit">dBi</span>
          <input type="number" step={0.5} value={p.txGainDbi} onChange={set('txGainDbi')} />
        </label>
        <label>
          Station antenna gain <span className="unit">dBi</span>
          <input type="number" step={0.5} value={p.rxGainDbi} onChange={set('rxGainDbi')} />
        </label>
        <label>
          System noise temperature <span className="unit">K</span>
          <input type="number" min={10} step={10} value={p.tsysK} onChange={set('tsysK')} />
        </label>
        <label>
          Data rate <span className="unit">bit/s</span>
          <input type="number" min={1} step={100} value={p.rateBps} onChange={set('rateBps')} />
        </label>
        <label>
          Other losses <span className="unit">dB</span>
          <input type="number" min={0} step={0.5} value={p.lossesDb} onChange={set('lossesDb')} />
        </label>
        <label className="span2">
          <span className="lbl-text">
            Required E<sub>b</sub>/N<sub>0</sub> <span className="unit">dB (modulation and coding)</span>
          </span>
          <input type="number" step={0.1} value={p.requiredEbN0} onChange={set('requiredEbN0')} />
        </label>
      </div>

      <LineChart
        data={samples.map((s) => ({ x: s.t, y: s.margin }))}
        label="Link margin during the pass"
        formatX={(x) => hm.format(x)}
        formatY={(y) => fx(y, 0)}
        yUnit="dB"
        yDomain={[Math.min(0, Math.floor(worst.margin)), Math.ceil(best.margin) + 2]}
        refs={[{ y: 0, label: 'link closes above 0 dB' }]}
      />
      <table className="data">
        <tbody>
          <Row
            label="EIRP"
            value={fx(best.eirp, 1)}
            unit="dBW"
            explain={{ text: <>Effective isotropic radiated power: transmitter power in decibels plus the gain of the satellite antenna.</>, tex: '\\text{EIRP} = 10\\log_{10}P_t + G_t' }}
          />
          <Row
            label="Free-space loss at TCA"
            value={fx(best.fspl, 1)}
            unit="dB"
            explain={{
              text: <>Spreading of the wave over a sphere of radius ρ. It grows with the square of range and of frequency.</>,
              tex: 'L_{fs} = 20\\log_{10}\\frac{4\\pi\\rho f}{c} = 92.45 + 20\\log_{10}\\rho_{\\text{km}} + 20\\log_{10}f_{\\text{GHz}}',
              calc: `L_{fs} = 92.45 + 20\\log_{10}${tn(best.range, 0)} + 20\\log_{10}${tn(freqMHz / 1000, 4)} = ${tn(best.fspl, 1)}\\ \\text{dB}`,
            }}
          />
          <Row
            label="Station G/T"
            value={fx(best.gt, 1)}
            unit="dB/K"
            explain={{ text: <>Figure of merit of the receiving station: antenna gain over system noise temperature.</>, tex: 'G/T = G_r - 10\\log_{10}T_{sys}' }}
          />
          <Row
            sym={<>C/N₀</>}
            label="Carrier to noise density"
            value={fx(best.cn0, 1)}
            unit="dB·Hz"
            explain={{
              text: <>Received carrier power over noise power per hertz. Boltzmann’s constant in decibels is −228.6 dBW/(K·Hz).</>,
              tex: 'C/N_0 = \\text{EIRP} - L_{fs} - L_{\\text{other}} + G/T + 228.6',
            }}
          />
          <Row
            sym={<>E<sub>b</sub>/N<sub>0</sub></>}
            label="Energy per bit to noise, at TCA"
            value={fx(best.ebn0, 1)}
            unit="dB"
            explain={{ text: <>Signal energy per bit: C/N₀ spread over the data rate. It sets the bit error rate for a given modulation and coding.</>, tex: 'E_b/N_0 = C/N_0 - 10\\log_{10}R_b', calc: `E_b/N_0 = ${tn(best.cn0, 1)} - ${tn(dB(p.rateBps), 1)} = ${tn(best.ebn0, 1)}\\ \\text{dB}` }}
          />
          <Row label="Margin at TCA" value={fx(best.margin, 1)} unit="dB" tone={best.margin >= 3 ? 'good' : best.margin >= 0 ? 'caution' : 'warn'} />
          <Row label="Margin at the horizon" value={fx(worst.margin, 1)} unit="dB" tone={worst.margin >= 3 ? 'good' : worst.margin >= 0 ? 'caution' : 'warn'} />
          <Row label="Data downloaded in this pass" value={volumeMB >= 1000 ? fx(volumeMB / 1000, 2) : fx(volumeMB, 2)} unit={volumeMB >= 1000 ? 'GB' : 'MB'} tone="active" />
        </tbody>
      </table>
      <p className="block-note">A real design keeps at least 3 dB of margin for fading, pointing errors and rain (which matters above about 10 GHz).</p>
    </Fold>
  )
}
