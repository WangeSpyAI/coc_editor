import { useMemo, useRef, useCallback } from 'react'
import type { Entity, Scenario, WorldState, Trigger, ConditionClause } from '../core/types'

interface Props {
  scenario: Scenario
  worldState: WorldState
  onSelectEntity: (id: string) => void
}

interface GraphNode {
  id: string
  label: string
  type: 'entity-state' | 'trigger'
  entityId: string
  x: number
  y: number
  fired?: boolean
}

interface GraphEdge {
  from: string
  to: string
  label?: string
  type: 'condition' | 'effect'
}

/**
 * 依存グラフビュー
 *
 * トリガーの条件→効果の因果関係をDAGとして可視化。
 * ノード = エンティティの状態値 or トリガー
 * エッジ = 条件（入力）/ 効果（出力）
 */
export function DependencyGraph({ scenario, worldState, onSelectEntity }: Props) {
  const svgRef = useRef<SVGSVGElement>(null)

  const entityMap = useMemo(() => {
    const m = new Map<string, Entity>()
    for (const e of scenario.entities) m.set(e.id, e)
    return m
  }, [scenario.entities])

  // Build graph data from triggers
  const { nodes, edges, width, height } = useMemo(() => {
    const allTriggers: { trigger: Trigger; entity: Entity }[] = []
    for (const entity of scenario.entities) {
      for (const trigger of entity.triggers) {
        allTriggers.push({ trigger, entity })
      }
    }

    if (allTriggers.length === 0) {
      return { nodes: [], edges: [], width: 400, height: 200 }
    }

    // Collect unique state nodes (entity+category+value combinations)
    const stateNodeMap = new Map<string, GraphNode>()
    const triggerNodes: GraphNode[] = []
    const graphEdges: GraphEdge[] = []

    const getStateKey = (entityId: string, categoryId: string, value: string) =>
      `${entityId}:${categoryId}:${value}`

    const ensureStateNode = (entityId: string, categoryId: string, value: string): string => {
      const key = getStateKey(entityId, categoryId, value)
      if (!stateNodeMap.has(key)) {
        const ent = entityMap.get(entityId)
        const cat = ent?.categories.find((c) => c.id === categoryId)
        stateNodeMap.set(key, {
          id: key,
          label: `${ent?.name ?? entityId}\n${cat?.name ?? categoryId}=${value}`,
          type: 'entity-state',
          entityId,
          x: 0,
          y: 0,
        })
      }
      return key
    }

    // Process triggers
    for (const { trigger, entity } of allTriggers) {
      const triggerNodeId = `trigger:${trigger.id}`
      triggerNodes.push({
        id: triggerNodeId,
        label: trigger.name,
        type: 'trigger',
        entityId: entity.id,
        x: 0,
        y: 0,
        fired: trigger.firedOnce ? worldState.firedTriggerIds.has(trigger.id) : false,
      })

      // Condition edges: state → trigger
      for (const clause of trigger.condition.clauses) {
        const resolvedEntityId = resolveClauseEntityId(clause, entity.id)
        if (resolvedEntityId) {
          const stateKey = ensureStateNode(resolvedEntityId, clause.categoryId, clause.value)
          graphEdges.push({
            from: stateKey,
            to: triggerNodeId,
            label: clause.negate ? 'NOT' : undefined,
            type: 'condition',
          })
        }
      }

      // Effect edges: trigger → state
      for (const effect of trigger.effects) {
        if (effect.type === 'setCategory' || effect.type === 'removeCategory') {
          const targetEntityId = resolveEffectEntityId(effect.target, entity.id)
          if (targetEntityId) {
            const stateKey = ensureStateNode(targetEntityId, effect.categoryId, effect.value)
            graphEdges.push({
              from: triggerNodeId,
              to: stateKey,
              type: 'effect',
            })
          }
        }
      }
    }

    const stateNodes = Array.from(stateNodeMap.values())
    const allNodes = [...stateNodes, ...triggerNodes]

    // Simple layered layout
    // Layer 0: state nodes that are only inputs (no incoming effect edges)
    // Layer 1: triggers
    // Layer 2: state nodes that are outputs
    const outputStateIds = new Set(
      graphEdges.filter((e) => e.type === 'effect').map((e) => e.to),
    )
    const inputOnlyStates = stateNodes.filter((n) => !outputStateIds.has(n.id))
    const outputStates = stateNodes.filter((n) => outputStateIds.has(n.id))

    // Remove duplicates (nodes that are both input and output)
    const inputStateIds = new Set(
      graphEdges.filter((e) => e.type === 'condition').map((e) => e.from),
    )
    const pureOutputStates = outputStates.filter((n) => !inputStateIds.has(n.id))
    const sharedStates = outputStates.filter((n) => inputStateIds.has(n.id))

    // Layout columns
    const COL_WIDTH = 220
    const ROW_HEIGHT = 70
    const PADDING = 40

    const layoutColumn = (nodes: GraphNode[], col: number) => {
      nodes.forEach((node, i) => {
        node.x = PADDING + col * COL_WIDTH
        node.y = PADDING + i * ROW_HEIGHT
      })
    }

    layoutColumn([...inputOnlyStates, ...sharedStates], 0)
    layoutColumn(triggerNodes, 1)
    layoutColumn([...pureOutputStates, ...sharedStates.map((n) => ({
      ...n,
      // For shared nodes, keep them at input column
    }))], 2)

    // For shared states, they stay in col 0 but we need output copies
    // Actually, just use 3-column layout directly
    const col0 = [...inputOnlyStates, ...sharedStates]
    const col1 = triggerNodes
    const col2 = pureOutputStates

    layoutColumn(col0, 0)
    layoutColumn(col1, 1)
    layoutColumn(col2, 2)

    const maxRows = Math.max(col0.length, col1.length, col2.length, 1)
    const w = PADDING * 2 + COL_WIDTH * 3
    const h = PADDING * 2 + ROW_HEIGHT * maxRows

    return { nodes: allNodes, edges: graphEdges, width: w, height: h }
  }, [scenario, worldState.firedTriggerIds, entityMap])

  // Find node position by id
  const nodePos = useCallback(
    (id: string) => {
      const n = nodes.find((n) => n.id === id)
      return n ? { x: n.x + 60, y: n.y + 20 } : { x: 0, y: 0 }
    },
    [nodes],
  )

  if (nodes.length === 0) {
    return (
      <div className="graph-view">
        <h2>依存グラフ</h2>
        <div className="empty-state">
          <p>トリガーがないため、グラフを表示できません</p>
        </div>
      </div>
    )
  }

  return (
    <div className="graph-view">
      <h2>依存グラフ</h2>
      <div className="graph-legend">
        <div className="graph-legend-item">
          <div className="graph-legend-color" style={{ borderColor: 'var(--accent)', background: 'var(--bg-card)' }} />
          <span>状態</span>
        </div>
        <div className="graph-legend-item">
          <div className="graph-legend-color" style={{ borderColor: 'var(--warning)', background: 'rgba(255,183,77,0.08)' }} />
          <span>トリガー</span>
        </div>
        <div className="graph-legend-item">
          <span style={{ color: 'var(--accent)' }}>---&gt;</span>
          <span>条件</span>
        </div>
        <div className="graph-legend-item">
          <span style={{ color: 'var(--warning)' }}>---&gt;</span>
          <span>効果</span>
        </div>
      </div>
      <svg
        ref={svgRef}
        width={width}
        height={height}
        style={{ background: 'var(--bg)', borderRadius: 'var(--radius-lg)' }}
      >
        <defs>
          <marker id="arrow-condition" viewBox="0 0 10 6" refX="10" refY="3"
            markerWidth="8" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 3 L 0 6 z" fill="var(--accent)" />
          </marker>
          <marker id="arrow-effect" viewBox="0 0 10 6" refX="10" refY="3"
            markerWidth="8" markerHeight="6" orient="auto-start-reverse">
            <path d="M 0 0 L 10 3 L 0 6 z" fill="var(--warning)" />
          </marker>
        </defs>

        {/* Edges */}
        {edges.map((edge, i) => {
          const from = nodePos(edge.from)
          const to = nodePos(edge.to)
          const color = edge.type === 'condition' ? 'var(--accent)' : 'var(--warning)'
          const marker = edge.type === 'condition' ? 'url(#arrow-condition)' : 'url(#arrow-effect)'
          return (
            <g key={i}>
              <line
                x1={from.x} y1={from.y}
                x2={to.x} y2={to.y}
                stroke={color}
                strokeWidth={1.5}
                opacity={0.6}
                markerEnd={marker}
              />
              {edge.label && (
                <text
                  x={(from.x + to.x) / 2}
                  y={(from.y + to.y) / 2 - 4}
                  fill={color}
                  fontSize={10}
                  textAnchor="middle"
                >
                  {edge.label}
                </text>
              )}
            </g>
          )
        })}

        {/* Nodes */}
        {nodes.map((node) => {
          const isEntity = node.type === 'entity-state'
          const borderColor = isEntity ? 'var(--accent)' : 'var(--warning)'
          const bgColor = isEntity ? '#1f2b47' : 'rgba(255,183,77,0.08)'
          const lines = node.label.split('\n')

          return (
            <g
              key={node.id}
              onClick={() => onSelectEntity(node.entityId)}
              style={{ cursor: 'pointer' }}
              opacity={node.fired ? 0.4 : 1}
            >
              <rect
                x={node.x}
                y={node.y}
                width={120}
                height={38}
                rx={6}
                fill={bgColor}
                stroke={borderColor}
                strokeWidth={1.5}
              />
              {lines.map((line, li) => (
                <text
                  key={li}
                  x={node.x + 60}
                  y={node.y + 15 + li * 14}
                  fill="var(--text)"
                  fontSize={11}
                  textAnchor="middle"
                  fontWeight={li === 0 ? 500 : 400}
                >
                  {line}
                </text>
              ))}
            </g>
          )
        })}
      </svg>
    </div>
  )
}

// Helpers to resolve reference types to concrete entity IDs for graph display
function resolveClauseEntityId(clause: ConditionClause, selfId: string): string | null {
  if (clause.reference.type === 'self') return selfId
  if (clause.reference.type === 'named') return clause.reference.entityId ?? null
  // For ancestor/descendant/sibling, we can't resolve statically, use self as placeholder
  return selfId
}

function resolveEffectEntityId(
  target: { type: string; entityId?: string },
  selfId: string,
): string | null {
  if (target.type === 'self') return selfId
  if (target.type === 'named') return target.entityId ?? null
  return selfId
}
