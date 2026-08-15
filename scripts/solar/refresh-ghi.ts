import { loadOrFetchGhiGrid } from './ghi.ts'

const grid = await loadOrFetchGhiGrid({ force: true })
const ghiValues = grid.cells.map((cell) => cell.ghi_kwh_m2_year)
console.log(
  `GHI ${grid.start_date}→${grid.end_date} (${grid.model}): ${Math.min(...ghiValues).toFixed(0)}–${Math.max(...ghiValues).toFixed(0)} kWh/m²·año, ${grid.cells.length} celdas`,
)
