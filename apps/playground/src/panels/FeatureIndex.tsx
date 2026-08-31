export type FeatureStatus = 'done' | 'active' | 'coming-soon'

export interface FeatureEntry {
  id: string
  title: string
  status: FeatureStatus
}

export const ROADMAP_FEATURES: FeatureEntry[] = [
  { id: '00', title: 'Package rename', status: 'done' },
  { id: '01', title: 'Playground app', status: 'active' },
  { id: '02', title: 'Page-based canvas', status: 'coming-soon' },
  { id: '03', title: 'Rich text editor', status: 'coming-soon' },
  { id: '04', title: 'Canvas pen design', status: 'coming-soon' },
  { id: '05', title: 'Shape snapping', status: 'coming-soon' },
  { id: '06', title: 'Ink smoothing', status: 'coming-soon' },
  { id: '07', title: 'Handwriting beautify', status: 'coming-soon' },
  { id: '08', title: 'LaTeX shape', status: 'coming-soon' },
  { id: '09', title: 'Grid backgrounds', status: 'coming-soon' },
  { id: '10', title: 'Deep links', status: 'coming-soon' },
  { id: '11', title: 'Collaboration', status: 'coming-soon' },
  { id: '12', title: 'AI presence', status: 'coming-soon' },
  { id: '13', title: 'Sync package', status: 'coming-soon' },
  { id: '14', title: 'Web product shell', status: 'coming-soon' },
  { id: '15', title: 'Mobile product shell', status: 'coming-soon' },
]

const STATUS_LABEL: Record<FeatureStatus, string> = {
  done: 'done',
  active: 'active',
  'coming-soon': 'soon',
}

interface FeatureIndexProps {
  selectedId: string
  onSelect: (id: string) => void
}

export function FeatureIndex({ selectedId, onSelect }: FeatureIndexProps) {
  return (
    <nav style={styles.nav}>
      <ul style={styles.list}>
        {ROADMAP_FEATURES.map((feature) => {
          const selected = feature.id === selectedId
          return (
            <li key={feature.id}>
              <button
                type="button"
                onClick={() => onSelect(feature.id)}
                style={{
                  ...styles.item,
                  ...(selected ? styles.itemSelected : {}),
                }}
              >
                <span style={styles.id}>{feature.id}</span>
                <span style={styles.title}>{feature.title}</span>
                <span
                  style={{
                    ...styles.badge,
                    ...badgeStyle(feature.status),
                  }}
                >
                  {STATUS_LABEL[feature.status]}
                </span>
              </button>
            </li>
          )
        })}
      </ul>
    </nav>
  )
}

function badgeStyle(status: FeatureStatus): React.CSSProperties {
  switch (status) {
    case 'done':
      return { background: '#e6f4ea', color: '#1e7e34' }
    case 'active':
      return { background: '#e8f0fe', color: '#1967d2' }
    case 'coming-soon':
      return { background: '#f1f3f4', color: '#5f6368' }
  }
}

const styles: Record<string, React.CSSProperties> = {
  nav: {
    flex: 1,
    overflow: 'auto',
  },
  list: {
    listStyle: 'none',
    margin: 0,
    padding: '6px 0',
  },
  item: {
    display: 'grid',
    gridTemplateColumns: '28px 1fr auto',
    alignItems: 'center',
    gap: 6,
    width: '100%',
    padding: '8px 12px',
    border: 'none',
    background: 'transparent',
    textAlign: 'left',
    cursor: 'pointer',
    font: 'inherit',
    color: 'inherit',
  },
  itemSelected: {
    background: '#e8f0fe',
  },
  id: {
    fontVariantNumeric: 'tabular-nums',
    color: '#666',
    fontSize: 11,
  },
  title: {
    overflow: 'hidden',
    textOverflow: 'ellipsis',
    whiteSpace: 'nowrap',
  },
  badge: {
    fontSize: 10,
    fontWeight: 600,
    textTransform: 'uppercase',
    padding: '2px 6px',
    borderRadius: 4,
  },
}
