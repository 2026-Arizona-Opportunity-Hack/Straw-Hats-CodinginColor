// Owner: Aryan. Learning gain bar chart; the Breakdown table on the same page has the exact numbers.
import { Bar, BarChart, CartesianGrid, LabelList, ReferenceLine, ResponsiveContainer, Tooltip, XAxis, YAxis } from 'recharts'

const GREEN = '#007a3d'
const axis = { fill: '#595959', fontSize: 12 }
const tooltip = {
  contentStyle: { background: '#fff', border: '1px solid #e3e3e3', borderRadius: 8, color: '#000', fontSize: 13 },
  cursor: { fill: '#e6f4ed' },
}
const gainLabel = (v: unknown) => (typeof v === 'number' ? `${v >= 0 ? '+' : ''}${v} pts` : '')


export function GainChart({ title, data }: { title: string; data: { label: string; gain: number | null }[] }) {
  const rows = data.filter((d) => d.gain != null).map((d) => ({ label: d.label, gain: Math.round(d.gain!) }))
  return (
    <figure aria-label={title} style={{ height: Math.max(160, rows.length * 52 + 40) }} className="w-full">
      <ResponsiveContainer>
        <BarChart data={rows} layout="vertical" margin={{ top: 4, right: 60, left: 8, bottom: 4 }}>
          <CartesianGrid horizontal={false} stroke="#e3e3e3" />
          <XAxis type="number" tick={axis} tickLine={false} axisLine={false} />
          <YAxis type="category" dataKey="label" width={170} tick={axis} tickLine={false} axisLine={false} />
          <ReferenceLine x={0} stroke="#595959" />
          <Tooltip {...tooltip} formatter={(v) => [gainLabel(v), 'Learning gain']} />
          <Bar isAnimationActive={false} dataKey="gain" name="Learning gain" fill={GREEN} radius={[0, 4, 4, 0]} maxBarSize={24}>
            <LabelList dataKey="gain" position="right" formatter={gainLabel} style={{ fill: '#000', fontSize: 12 }} />
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </figure>
  )
}
