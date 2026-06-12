import { useMemo, useState } from 'react'
import type { Entity, ReadonlyWorldState, Scenario } from '../core/types'

interface Props {
  scenario: Scenario
  worldState: ReadonlyWorldState
  onSetActiveParty: (partyId: string) => void
  onSelectEntity: (entityId: string | null) => void
  onSplitParty: (memberIds: string[], newName: string) => void
  onMergeParties: (srcPartyId: string) => void
  onRemoveFromParty: (entityId: string) => void
}

export function PartyBar({
  scenario,
  worldState,
  onSetActiveParty,
  onSelectEntity,
  onSplitParty,
  onMergeParties,
  onRemoveFromParty,
}: Props) {
  const [splitOpen, setSplitOpen] = useState(false)
  const [splitMemberIds, setSplitMemberIds] = useState<ReadonlySet<string>>(() => new Set())
  const [splitName, setSplitName] = useState('')
  const [mergeSourceId, setMergeSourceId] = useState('')

  const entityMap = useMemo(() => {
    const m = new Map<string, Entity>()
    for (const entity of scenario.entities) m.set(entity.id, entity)
    return m
  }, [scenario.entities])

  const activeParty = worldState.parties.find((party) => party.id === worldState.activePartyId) ?? null
  const activeLocationName = activeParty?.locationId
    ? entityMap.get(activeParty.locationId)?.name ?? activeParty.locationId
    : 'ルート'
  const mergeCandidates = activeParty
    ? worldState.parties.filter((party) => party.id !== activeParty.id && party.locationId === activeParty.locationId)
    : []

  const handlePartyClick = (partyId: string, locationId: string | null) => {
    onSetActiveParty(partyId)
    onSelectEntity(locationId)
  }

  const toggleSplitMember = (memberId: string) => {
    setSplitMemberIds((prev) => {
      const next = new Set(prev)
      if (next.has(memberId)) next.delete(memberId)
      else next.add(memberId)
      return next
    })
  }

  const submitSplit = () => {
    const memberIds = [...splitMemberIds]
    const name = splitName.trim()
    if (memberIds.length === 0 || !name) return
    onSplitParty(memberIds, name)
    setSplitMemberIds(new Set())
    setSplitName('')
    setSplitOpen(false)
  }

  const submitMerge = () => {
    const srcPartyId = mergeSourceId || mergeCandidates[0]?.id
    if (!srcPartyId) return
    onMergeParties(srcPartyId)
    setMergeSourceId('')
  }

  if (worldState.parties.length === 0) {
    return (
      <div className="party-bar">
        <div className="party-bar-empty">パーティなし</div>
      </div>
    )
  }

  return (
    <div className="party-bar">
      <div className="party-bar-tabs">
        {worldState.parties.map((party) => (
          <button
            key={party.id}
            className={`party-tab${party.id === worldState.activePartyId ? ' active' : ''}`}
            type="button"
            onClick={() => handlePartyClick(party.id, party.locationId)}
          >
            <span className="party-tab-name">{party.name}</span>
            <span className="party-tab-count">{party.memberIds.length}人</span>
          </button>
        ))}
        <div className="party-bar-location">現在地: {activeLocationName}</div>
      </div>

      {activeParty && (
        <div className="party-bar-body">
          <div className="party-members">
            {activeParty.memberIds.map((memberId) => {
              const member = entityMap.get(memberId)
              return (
                <span key={memberId} className="party-member-chip">
                  {member?.name ?? memberId}
                  <button
                    className="party-member-remove"
                    type="button"
                    title="パーティから外す"
                    onClick={() => onRemoveFromParty(memberId)}
                  >
                    ×
                  </button>
                </span>
              )
            })}
          </div>

          <div className="party-bar-actions">
            <button className="btn btn-sm" type="button" onClick={() => setSplitOpen((open) => !open)}>
              分割
            </button>
            {mergeCandidates.length > 0 && (
              <div className="party-merge">
                <select
                  className="party-select"
                  value={mergeSourceId || (mergeCandidates[0]?.id ?? '')}
                  onChange={(e) => setMergeSourceId(e.target.value)}
                >
                  {mergeCandidates.map((party) => (
                    <option key={party.id} value={party.id}>{party.name}</option>
                  ))}
                </select>
                <button className="btn btn-sm" type="button" onClick={submitMerge}>合流</button>
              </div>
            )}
          </div>
        </div>
      )}

      {splitOpen && activeParty && (
        <div className="party-split-panel">
          <div className="party-split-members">
            {activeParty.memberIds.map((memberId) => (
              <label key={memberId} className="party-split-member">
                <input
                  type="checkbox"
                  checked={splitMemberIds.has(memberId)}
                  onChange={() => toggleSplitMember(memberId)}
                />
                {entityMap.get(memberId)?.name ?? memberId}
              </label>
            ))}
          </div>
          <input
            className="party-split-name"
            placeholder="新パーティ名"
            value={splitName}
            onChange={(e) => setSplitName(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') submitSplit() }}
          />
          <button
            className="btn btn-sm btn-primary"
            type="button"
            onClick={submitSplit}
            disabled={splitMemberIds.size === 0 || !splitName.trim()}
          >
            作成
          </button>
        </div>
      )}
    </div>
  )
}
