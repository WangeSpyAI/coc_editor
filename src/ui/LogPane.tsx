import { useEffect, useMemo, useRef, useState } from 'react'
import type { LogEntry, Scenario } from '../core/types'

interface Props {
  log: readonly LogEntry[]
  scenario: Scenario
}

/** 種別アイコン: action ▶ / trigger ⚡ / system ・ */
const TYPE_ICON: Record<LogEntry['type'], string> = {
  action: '▶',
  trigger: '⚡',
  system: '・',
}

/** 時刻表示: at（epoch ms）があれば HH:MM、無ければ #step（旧データ互換） */
function formatTime(entry: LogEntry): string {
  if (entry.at !== undefined) {
    const d = new Date(entry.at)
    return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`
  }
  return `#${entry.timestamp}`
}

/**
 * 描写ログペイン — layout-main 下部に常時表示（エンティティ未選択でも）。
 * セッションの成果物である描写テキストを時系列で一覧し、コピーできる。
 */
export function LogPane({ log, scenario }: Props) {
  const [collapsed, setCollapsed] = useState(false)
  // コピー成功の一時表示: エントリindex または 'all'（全文コピー）
  const [copied, setCopied] = useState<number | 'all' | null>(null)
  const bodyRef = useRef<HTMLDivElement>(null)
  const copyTimerRef = useRef<number | undefined>(undefined)
  // 直近のスクロール位置が最下部付近か（自動追従スクロールのピン留め判定）
  const nearBottomRef = useRef(true)

  // 発生源/行為者の名前解決。''（ルート）や '__adhoc__'、削除済みIDは '—'
  const nameOf = useMemo(() => {
    const m = new Map<string, string>()
    for (const e of scenario.entities) m.set(e.id, e.name)
    return (id: string | undefined): string => (id && m.get(id)) || '—'
  }, [scenario.entities])

  // log 配列の同一性が変わったら ✓ 表示を消す —
  // undo/リセット/インポートで行が入れ替わると ✓ が別の行に乗り移るため
  useEffect(() => {
    setCopied(null)
  }, [log])

  // 新エントリ追加時、更新前に最下部付近にいた場合のみ追従スクロール
  // （上にスクロールして過去ログを読んでいる最中は位置を奪わない）。
  // 折りたたみ時はピンをリセットする — 再展開時は必ず最新位置へ。
  useEffect(() => {
    if (collapsed) {
      nearBottomRef.current = true
      return
    }
    const el = bodyRef.current
    if (el && nearBottomRef.current) el.scrollTop = el.scrollHeight
  }, [log.length, collapsed])

  // unmount 時に ✓ 表示タイマーを破棄
  useEffect(() => () => window.clearTimeout(copyTimerRef.current), [])

  const handleScroll = () => {
    const el = bodyRef.current
    if (!el) return
    nearBottomRef.current = el.scrollHeight - el.scrollTop - el.clientHeight < 40
  }

  const copy = (text: string, key: number | 'all') => {
    // 非セキュアコンテキスト（HTTP等）では navigator.clipboard が undefined —
    // プロパティアクセスが同期 throw して .catch に届かないため先に弾く
    if (!navigator.clipboard) return
    navigator.clipboard.writeText(text).then(() => {
      setCopied(key)
      window.clearTimeout(copyTimerRef.current)
      copyTimerRef.current = window.setTimeout(() => setCopied(null), 1200)
    }).catch(() => { /* clipboard 不可（権限拒否等）は silent no-op */ })
  }

  /** 全エントリを「HH:MM 種別 名前: 描写」形式で整形（セッション記録用） */
  const copyAll = () => {
    if (!navigator.clipboard) return
    const text = log
      .map((l) => `${formatTime(l)} ${TYPE_ICON[l.type]} ${nameOf(l.sourceEntityId)}: ${l.description}`)
      .join('\n')
    copy(text, 'all')
  }

  const toggleCollapsed = () => setCollapsed((c) => !c)

  return (
    <div className="log-pane">
      <div
        className="log-pane-header"
        role="button"
        tabIndex={0}
        aria-expanded={!collapsed}
        onClick={toggleCollapsed}
        onKeyDown={(e) => {
          // ヘッダ自身へのキー入力のみ反応（内側の「全文コピー」ボタンからのバブリングは無視）
          if (e.target !== e.currentTarget) return
          if (e.key === 'Enter' || e.key === ' ') {
            e.preventDefault()
            toggleCollapsed()
          }
        }}
      >
        <span className="log-pane-toggle">{collapsed ? '▸' : '▾'}</span>
        <span className="log-pane-title">描写ログ</span>
        <span className="log-pane-count">{log.length}件</span>
        <button
          className="btn btn-sm"
          style={{ marginLeft: 'auto' }}
          disabled={log.length === 0}
          onClick={(e) => { e.stopPropagation(); copyAll() }}
        >
          {copied === 'all' ? '✓ コピーしました' : '全文コピー'}
        </button>
      </div>

      {!collapsed && (
        <div className="log-pane-body" ref={bodyRef} onScroll={handleScroll}>
          {log.length === 0 && <div className="log-pane-empty">まだログがありません</div>}
          {log.map((entry, i) => (
            <div key={i} className="log-pane-entry">
              <span className="log-time">{formatTime(entry)}</span>
              <span className={`log-icon ${entry.type}`} title={entry.type}>{TYPE_ICON[entry.type]}</span>
              <span className="log-source">
                {nameOf(entry.sourceEntityId)}
                {entry.actorId && <span className="log-actor">（{nameOf(entry.actorId)}）</span>}
              </span>
              <span className="log-desc">{entry.description}</span>
              <button
                className="log-copy-btn"
                title="描写をコピー"
                onClick={() => copy(entry.description, i)}
              >
                {copied === i ? '✓' : '⧉'}
              </button>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}
