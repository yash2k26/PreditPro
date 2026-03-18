# Recharts Guide (Web App)

This project now uses **Recharts** for the two market-detail graphs:

- `DepthChart` in `components/order-book/DepthChart.tsx`
- `PriceChart` in `components/market/PriceChart.tsx`

## What changed

1. Added `recharts` as a dependency in `apps/web/package.json`.
2. Replaced custom `<canvas>` chart rendering with Recharts components.
3. Added chart entrance animations when opening a market from a market card.

## Files touched

- `apps/web/package.json`
- `apps/web/app/market/[id]/page.tsx`
- `apps/web/components/market/PriceChart.tsx`
- `apps/web/components/order-book/DepthChart.tsx`

## How chart animation works on market open

When a market card is clicked, Next.js navigates to `/market/[id]` and mounts the detail page.

In `app/market/[id]/page.tsx`:

- A `chartsVisible` state toggles from `false` to `true` after a short timeout.
- The chart wrappers use Tailwind transitions for `opacity` and `translate-y`.
- Each chart receives a stable `animationKey` derived from `marketId`.
- Transition profile now uses a stronger ease curve:
  - `ease-[cubic-bezier(0.22,1,0.36,1)]`
  - 900ms duration
  - second chart delay of 250ms for stagger

This ensures:

- visual entrance (fade + slide), and
- Recharts draw animation runs fresh for each opened market.
- The motion feels more cinematic and less abrupt.

## PriceChart pattern

Use `AreaChart` with two `Area` series:

- `yes` series (green)
- `no` series (red)

Key points:

- `ResponsiveContainer` for mobile/desktop resizing
- `Tooltip` for value inspection
- `isAnimationActive`, `animationDuration`, `animationBegin` for staging

Minimal pattern:

```tsx
<ResponsiveContainer width="100%" height="100%">
  <AreaChart data={data}>
    <XAxis dataKey="time" type="number" />
    <YAxis tickFormatter={(v) => `${(v * 100).toFixed(1)}c`} />
    <Area dataKey="no" isAnimationActive animationDuration={900} />
    <Area dataKey="yes" isAnimationActive animationBegin={150} animationDuration={900} />
  </AreaChart>
</ResponsiveContainer>
```

## DepthChart pattern

Use `ComposedChart` + two `Area` series (`bidDepth`, `askDepth`) with step interpolation.

Data prep steps:

1. Build cumulative bid depth by price.
2. Build cumulative ask depth by price.
3. Merge all prices into one sorted x-axis array.
4. Emit `{ price, bidDepth, askDepth }` points.

Minimal pattern:

```tsx
<ResponsiveContainer width="100%" height="100%">
  <ComposedChart data={points}>
    <XAxis dataKey="price" type="number" />
    <YAxis />
    <ReferenceLine x={mid} strokeDasharray="4 4" />
    <Area type="stepAfter" dataKey="bidDepth" isAnimationActive />
    <Area type="stepAfter" dataKey="askDepth" isAnimationActive animationBegin={150} />
  </ComposedChart>
</ResponsiveContainer>
```

## Recharts workflow for future charts

1. Shape backend/frontend data into a flat array of objects.
2. Pick chart primitive (`LineChart`, `AreaChart`, `BarChart`, `ComposedChart`).
3. Add `ResponsiveContainer` first.
4. Add axis formatters for domain-specific units (cents, dollars, shares).
5. Add `Tooltip` and optional `ReferenceLine`.
6. Add animation props (`isAnimationActive`, `animationDuration`, `animationBegin`).
7. Keep data transforms in `useMemo` to avoid expensive recalculation.

## Common gotchas

- Recharts expects numeric axes for smooth interpolation. Use `type="number"` for price/time.
- Keep chart height explicit (`h-36`, `h-40`) or `ResponsiveContainer` will collapse.
- If you want animation to replay on route/entity change, use a changing `key`.

## Verify locally

```bash
pnpm --filter web check-types
pnpm --filter web lint
pnpm dev
```

Open `http://localhost:3000`, click any market card, and confirm:

- both charts appear with entrance animation,
- line/area draw animation runs,
- tooltips work on hover.
