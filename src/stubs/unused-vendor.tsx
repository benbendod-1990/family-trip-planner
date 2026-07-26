/*
 * Build-time stub for `recharts` and `@monaco-editor/react`.
 *
 * myk-library is shipped as a single ES module that statically imports both,
 * and it does not tree-shake — importing one `Button` from it pulls in ~1.18MB.
 * Together those two libraries were a 932kB chunk that every launch downloaded
 * eagerly. This app renders neither of the components that need them
 * (myk-library's `Chart` and `CodeEditor`); it only uses `DataTable`, so
 * @tanstack/react-table is deliberately NOT stubbed.
 *
 * Wired up via resolve.alias in vite.config.ts. If a chart or code editor is
 * ever added, drop the alias rather than extending this file — the components
 * below deliberately render nothing and warn, so a real usage is loud in dev
 * instead of silently blank.
 */
type AnyProps = Record<string, unknown>

function makeStub(name: string) {
  const Stub = () => {
    if (import.meta.env.DEV) {
      console.warn(
        `[unused-vendor stub] <${name}> rendered, but recharts/@monaco-editor ` +
          `are stubbed out in vite.config.ts. Remove the alias to use it.`,
      )
    }
    return null
  }
  Stub.displayName = `Stub(${name})`
  return Stub as (props: AnyProps) => null
}

// The exact named imports myk-library takes from `recharts`.
export const ResponsiveContainer = makeStub('ResponsiveContainer')
export const CartesianGrid = makeStub('CartesianGrid')
export const XAxis = makeStub('XAxis')
export const YAxis = makeStub('YAxis')
export const Tooltip = makeStub('Tooltip')
export const Legend = makeStub('Legend')
export const ComposedChart = makeStub('ComposedChart')
export const Bar = makeStub('Bar')
export const Area = makeStub('Area')
export const Line = makeStub('Line')
export const ScatterChart = makeStub('ScatterChart')
export const Scatter = makeStub('Scatter')
export const PieChart = makeStub('PieChart')
export const Pie = makeStub('Pie')
export const Cell = makeStub('Cell')
export const AreaChart = makeStub('AreaChart')
export const BarChart = makeStub('BarChart')
export const LineChart = makeStub('LineChart')

// `@monaco-editor/react` is consumed as a default import.
export default makeStub('MonacoEditor')
