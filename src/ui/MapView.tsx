import { useMemo } from 'react'
import type { Entity, Scenario, ReadonlyWorldState } from '../core/types'

interface Props {
  scenario: Scenario
  worldState: ReadonlyWorldState
  onSelectEntity: (id: string) => void
  selectedEntityId: string | null
}

interface MapNode {
  id: string
  name: string
  labels: string[]
  x: number
  y: number
}

/**
 * 地図ビュー
 *
 * エンティティの connections（隣接関係）をノードグラフとして可視化。
 * ツリー（親子 = 包含）とは別の関係。
 * 場所同士の空間的なつながりをKPが一目で確認できる。
 */
export function MapView({ scenario, worldState, onSelectEntity, selectedEntityId }: Props) {
  const entityMap = useMemo(() => {
    const m = new Map<string, Entity>()
    for (const e of scenario.entities) m.set(e.id, e)
    return m
  }, [scenario.entities])

  // connections を持つエンティティだけ抽出（地図に載せる意味があるもの）
  const { nodes, edges, width, height } = useMemo(() => {
    const connected = new Set<string>()
    const edgeSet = new Set<string>()
    const edgeList: { from: string; to: string }[] = []

    for (const entity of scenario.entities) {
      if (entity.connections.length > 0) {
        connected.add(entity.id)
        for (const targetId of entity.connections) {
          connected.add(targetId)
          const key = [entity.id, targetId].sort().join('|')
          if (!edgeSet.has(key)) {
            edgeSet.add(key)
            edgeList.push({ from: entity.id, to: targetId })
          }
        }
      }
    }

    if (connected.size === 0) {
      return { nodes: [], edges: [], width: 400, height: 200 }
    }

    // Simple force-directed-ish circular layout
    const nodeIds = Array.from(connected)
    const count = nodeIds.length
    const RADIUS = Math.max(100, count * 35)
    const CX = RADIUS + 80
    const CY = RADIUS + 60

    const mapNodes: MapNode[] = nodeIds.map((id, i) => {
      const entity = entityMap.get(id)
      const angle = (2 * Math.PI * i) / count - Math.PI / 2
      return {
        id,
        name: entity?.name ?? id,
        labels: entity?.labels ?? [],
        x: CX + RADIUS * Math.cos(angle),
        y: CY + RADIUS * Math.sin(angle),
      }
    })

    const w = CX * 2 + 40
    const h = CY * 2 + 40

    return { nodes: mapNodes, edges: edgeList, width: Math.max(w, 400), height: Math.max(h, 300) }
  }, [scenario.entities, entityMap])

  const nodeMap = useMemo(() => {
    const m = new Map<string, MapNode>()
    for (const n of nodes) m.set(n.id, n)
    return m
  }, [nodes])

  if (nodes.length === 0) {
    return (
      <div className="graph-view">
        <h2>地図</h2>
        <div className="empty-state">
          <p>接続が定義されていません</p>
          <p style={{ fontSize: 12 }}>DetailPanel でエンティティの「接続先」を編集してください</p>
        </div>
      </div>
    )
  }

  return (
    <div className="graph-view">
      <h2>地図</h2>
      <div className="graph-legend">
        <div className="graph-legend-item">
          <div className="graph-legend-color" style={{ borderColor: 'var(--accent)', background: 'var(--bg-card)' }} />
          <span>エンティティ</span>
        </div>
        <div className="graph-legend-item">
          <span style={{ color: 'var(--text-dim)' }}>---</span>
          <span>接続</span>
        </div>
      </div>
      <svg
        width={width}
        height={height}
        style={{ background: 'var(--bg)', borderRadius: 'var(--radius-lg)' }}
      >
        {/* Edges */}
        {edges.map((edge, i) => {
          const from = nodeMap.get(edge.from)
          const to = nodeMap.get(edge.to)
          if (!from || !to) return null
          return (
            <line
              key={i}
              x1={from.x} y1={from.y}
              x2={to.x} y2={to.y}
              stroke="var(--border)"
              strokeWidth={2}
              opacity={0.7}
            />
          )
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const isSelected = node.id === selectedEntityId
          const state = worldState.entityStates[node.id]
          // Show first category value as subtitle
          const entity = entityMap.get(node.id)
          const firstCat = entity?.categories[0]
          const catValue = firstCat && state ? state.categoryValues[firstCat.id] : null
          const subtitle = catValue && typeof catValue === 'string' ? `${firstCat!.name}: ${catValue}` : null

          return (
            <g
              key={node.id}
              onClick={() => onSelectEntity(node.id)}
              style={{ cursor: 'pointer' }}
            >
              <rect
                x={node.x - 60}
                y={node.y - 20}
                width={120}
                height={subtitle ? 48 : 36}
                rx={6}
                fill={isSelected ? 'var(--bg-hover)' : 'var(--bg-card)'}
                stroke={isSelected ? 'var(--accent)' : 'var(--border)'}
                strokeWidth={isSelected ? 2 : 1}
              />
              <text
                x={node.x}
                y={node.y + (subtitle ? -2 : 4)}
                fill="var(--text)"
                fontSize={12}
                fontWeight={500}
                textAnchor="middle"
              >
                {node.name}
              </text>
              {subtitle && (
                <text
                  x={node.x}
                  y={node.y + 16}
                  fill="var(--accent)"
                  fontSize={10}
                  textAnchor="middle"
                >
                  {subtitle}
                </text>
              )}
            </g>
          )
        })}
      </svg>
    </div>
  )
}
