// =====================================================
// コアデータモデル
//
// 設計思想:
//   - エンティティはツリー構造（親子関係で所在・所有を表現）
//   - カテゴリはエンティティの状態軸（排他/非排他）
//   - トリガーはペトリネットのトランジション（条件→自動発火→連鎖）
//   - アクションはKP手動操作（描写・条件・効果を持つ）
//   - stabilize = 不動点計算
// =====================================================

// ===== エンティティ =====

export interface Entity {
  id: string
  name: string
  parentId: string | null // null = ルート
  description: string
  labels: string[] // 勢力図ビュー等でパースされる自由ラベル
  categories: Category[]
  actions: Action[]
  triggers: Trigger[]
}

// ===== カテゴリ（状態軸） =====

export interface Category {
  id: string
  name: string
  exclusive: boolean // true = 排他（値は1つ）, false = 非排他（複数可）
  options: string[] // 取りうる値のリスト
}

// エンティティ実行時の状態
export interface EntityState {
  entityId: string
  parentId: string | null
  categoryValues: Record<string, string | string[]>
  // exclusive category → string, non-exclusive → string[]
}

// ===== 条件参照 =====

export type ReferenceType = 'self' | 'ancestor' | 'descendant' | 'sibling' | 'named'

export interface EntityReference {
  type: ReferenceType
  entityId?: string // type === 'named' のとき必須
  entityName?: string // デバッグ・表示用
}

export interface ConditionClause {
  reference: EntityReference
  categoryId: string
  value: string // この値であること（排他）/ この値を含むこと（非排他）
  negate?: boolean // true なら「この値でない」
}

// トリガー条件 = ConditionClauseのAND結合
export interface TriggerCondition {
  clauses: ConditionClause[]
}

// ===== 効果 =====

// EffectType は Effect['type'] から自動導出（手動の列挙は不整合の元）

export interface SetCategoryEffect {
  type: 'setCategory'
  target: EntityReference
  categoryId: string
  value: string
  // 排他: 値を置換, 非排他: 値を追加
}

export interface RemoveCategoryEffect {
  type: 'removeCategory'
  target: EntityReference
  categoryId: string
  value: string
  // 非排他カテゴリから値を除去
}

export interface MoveEffect {
  type: 'move'
  target: EntityReference
  newParentId: string // 移動先の親エンティティID
}

export type Effect = SetCategoryEffect | RemoveCategoryEffect | MoveEffect
export type EffectType = Effect['type']

// ===== アクション =====

export interface Action {
  id: string
  name: string
  entityId: string // このアクションが属するエンティティ
  description: string // 描写テキスト。$actor で行為者参照
  displayCondition?: TriggerCondition // 表示条件
  rollRequirement?: RollRequirement // ロール条件
  isPlayerAction: boolean // PLアクション（行為者選択あり）
  requiredItems?: string[] // 必要アイテム（エンティティID）
  requiredKnowledge?: string[] // 必要知識（カテゴリ値）
  effects: Effect[]
}

export interface RollRequirement {
  skill: string // 技能名（STR, DEX, 目星, 鍵開け 等）
  difficulty?: number // 目標値（省略時はKPが判断）
  opposed?: boolean // true なら対抗ロール（STR対抗等）
  successEffects?: Effect[] // 成功時の追加効果
  failureEffects?: Effect[] // 失敗時の追加効果
  // エンジンはダイスを振らない。KPが成功/失敗を入力する。
}

// ===== トリガー =====

export interface Trigger {
  id: string
  name: string
  entityId: string // このトリガーが属するエンティティ
  condition: TriggerCondition
  effects: Effect[] // 条件成立時に適用する効果
  firedOnce?: boolean // true なら一度だけ発火
}

// ===== シナリオ =====

export interface Scenario {
  id: string
  title: string
  author: string
  description: string
  entities: Entity[]
  // メタデータ
  createdAt: string
  updatedAt: string
}

// ===== ワールド状態（セッション中） =====

export interface WorldState {
  scenarioId: string
  entityStates: Record<string, EntityState>
  firedTriggerIds: Set<string> // firedOnce トリガーの発火済みセット
  log: LogEntry[] // 描写ログ
  step: number // stabilize のステップカウンタ
}

export interface LogEntry {
  timestamp: number // step number
  type: 'action' | 'trigger' | 'system'
  sourceEntityId: string
  description: string
  actorId?: string // PLアクションの行為者
}

// ===== パーティ（セッション中） =====

export interface Party {
  id: string
  name: string
  memberIds: string[] // PCエンティティのID
  locationId: string // 現在の場所エンティティID
}
