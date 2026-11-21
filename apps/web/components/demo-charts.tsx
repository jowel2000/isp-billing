interface RevenuePoint {
  month: string;
  value: number;
}

export function RevenueChart({
  data,
  labelFormatter,
}: {
  data: RevenuePoint[];
  labelFormatter?: (value: number) => string;
}) {
  const width = 680;
  const height = 220;
  const padL = 46;
  const padR = 12;
  const padT = 16;
  const padB = 28;
  const innerW = width - padL - padR;
  const innerH = height - padT - padB;
  const max = Math.max(...data.map((point) => point.value), 1) * 1.12;

  const points = data.map((point, index) => {
    const x = padL + (innerW * index) / Math.max(1, data.length - 1);
    const y = padT + innerH * (1 - point.value / max);
    return { ...point, x, y };
  });

  const line = points.map((point) => `${point.x},${point.y}`).join(' ');
  const area = `M ${padL},${padT + innerH} L ${points
    .map((point) => `${point.x},${point.y}`)
    .join(' L ')} L ${padL + innerW},${padT + innerH} Z`;

  const gridValues = [0, 0.25, 0.5, 0.75, 1];

  return (
    <div className="demo-chart-wrap">
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label="Monthly collection chart">
        <defs>
          <linearGradient id="demoRevenueFill" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#f59e0b" stopOpacity="0.28" />
            <stop offset="100%" stopColor="#f59e0b" stopOpacity="0.01" />
          </linearGradient>
        </defs>

        {gridValues.map((ratio) => {
          const y = padT + innerH * (1 - ratio);
          const label = labelFormatter
            ? labelFormatter(max * ratio)
            : `${Math.round((max * ratio) / 1000)}k`;
          return (
            <g key={ratio}>
              <line
                x1={padL}
                y1={y}
                x2={padL + innerW}
                y2={y}
                stroke="#eef2f8"
                strokeWidth="1"
                strokeDasharray="4 5"
              />
              <text x={padL - 8} y={y + 3} textAnchor="end" fontSize="9" fill="#9aa8bc">
                {label}
              </text>
            </g>
          );
        })}

        <path d={area} fill="url(#demoRevenueFill)" />
        <polyline
          points={line}
          fill="none"
          stroke="#f59e0b"
          strokeWidth="2.6"
          strokeLinecap="round"
          strokeLinejoin="round"
        />

        {points.map((point, index) => (
          <g key={point.month}>
            <circle
              cx={point.x}
              cy={point.y}
              r={index === points.length - 1 ? 4.2 : 2.6}
              fill="#fff"
              stroke="#f59e0b"
              strokeWidth="2"
            />
            <text
              x={point.x}
              y={height - 6}
              textAnchor="middle"
              fontSize="8.5"
              fill="#9aa8bc"
            >
              {point.month}
            </text>
          </g>
        ))}
      </svg>
    </div>
  );
}

export function StatusDonut({
  slices,
  total,
  label,
}: {
  slices: Array<{ label: string; value: number; color: string }>;
  total: number;
  label: string;
}) {
  let cursor = 0;
  const stops = slices.map((slice) => {
    const start = cursor;
    const end = cursor + (slice.value / total) * 360;
    cursor = end;
    return `${slice.color} ${start}deg ${end}deg`;
  });

  return (
    <div className="demo-donut-wrap">
      <div
        className="demo-donut"
        style={{ background: `conic-gradient(${stops.join(', ')})` }}
      >
        <div className="demo-donut-center">
          <strong>{total}</strong>
          <small>{label}</small>
        </div>
      </div>
      <div className="demo-legend">
        {slices.map((slice) => (
          <div className="demo-legend-item" key={slice.label}>
            <span className="demo-dot" style={{ background: slice.color }} />
            {slice.label}
            <strong>{slice.value}</strong>
          </div>
        ))}
      </div>
    </div>
  );
}
