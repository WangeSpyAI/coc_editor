// ===== Actor: PC・NPCの統合抽象 =====

export interface CharacterStats {
  str: number;
  con: number;
  siz: number;
  dex: number;
  app: number;
  int: number;
  pow: number;
  edu: number;
  hp: number;
  mp: number;
  san: number;
}

export interface Relation {
  targetId: string;
  type: string;
  description?: string;
}

export interface ScheduleEntry {
  time: string;
  locationId?: string;
  activity?: string;
}

/**
 * Actor: PC と NPC の共通基盤。
 * 「場所にいて、物を持ち、知識を持ち、行動する存在」
 */
export interface Actor {
  id: string;
  name: string;
  age?: number;
  occupation?: string;
  description: string;
  stats?: CharacterStats;
  skills?: Record<string, number>;
  traits: string[];
  relations: Relation[];
  initialKnowledge: string[];
  initialLocationId?: string;
  notes: string;
}

/** NPC は Actor + NPC固有の属性 */
export interface NPC extends Actor {
  /** 敵対/中立/味方。味方NPCはPCと同行・知識共有が可能 */
  allegiance: 'hostile' | 'neutral' | 'allied';
  /** 時刻ごとの行動予定（PC介入がない場合のデフォルト） */
  schedule?: ScheduleEntry[];
}

/** PC テンプレート（セッション開始時に登録） */
export interface PCTemplate extends Actor {
  playerName: string;
  inventory: string[];
}

// ===== Location =====

export interface Location {
  id: string;
  name: string;
  description: string;
  tags: string[];
  connectedLocationIds: string[];
  clueIds: string[];
  npcIds: string[];
  notes: string;
}

// ===== Clue =====

export interface Clue {
  id: string;
  name: string;
  description: string;
  isKey: boolean;
  /** 物理的手がかりの初期所在地 */
  initialLocationId?: string;
  /** 人が持っている手がかり（物理 or 情報） */
  initialHolderId?: string;
  /** 発見に必要なスキル（場所で探す場合） */
  discoverySkill?: string;
  discoveryDifficulty?: 'regular' | 'hard' | 'extreme';
  /**
   * 取得方法のヒント。
   * 'search' = 場所で探索、'conversation' = NPCとの会話、'auto' = 条件で自動取得
   */
  obtainMethod?: 'search' | 'conversation' | 'auto';
  leadsTo: string[];
  notes: string;
}

// ===== Event（タイムラインと旧イベントを統合） =====

/**
 * トリガー種別:
 * - 'condition': 条件が満たされたら発生（旧Event）
 * - 'time': 指定時刻に発生（旧Timeline）
 * - 'manual': KPが手動で発火
 */
export type TriggerType = 'condition' | 'time' | 'manual';

export interface ScenarioEvent {
  id: string;
  name: string;
  description: string;

  /** トリガー種別 */
  triggerType: TriggerType;
  /** 'time' の場合の発生時刻 */
  triggerTime?: string;
  /** 'condition' の場合のトリガー条件 */
  triggerCondition?: Condition;
  /** この条件が真なら発生が阻止される */
  preventedBy?: Condition;

  effects?: Effect[];
  isRepeatable?: boolean;
  notes: string;
}

// ===== Scenario =====

export interface Scenario {
  id: string;
  title: string;
  author: string;
  era: string;
  playerCount: string;
  estimatedTime: string;
  synopsis: string;
  truth: string;
  backgroundInfo: string;
  keeperNotes: string;
  npcs: NPC[];
  locations: Location[];
  clues: Clue[];
  events: ScenarioEvent[];
  createdAt: string;
  updatedAt: string;
}

export type ScenarioElementType = 'npc' | 'location' | 'clue' | 'event';

export interface EditorState {
  scenario: Scenario;
  selectedElement: {
    type: ScenarioElementType;
    id: string;
  } | null;
  activeTab: ScenarioElementType | 'overview';
  isDirty: boolean;
}

// ===== Condition & Effect =====

export type Condition =
  | { type: 'always' }
  | { type: 'never' }
  | { type: 'flag'; flag: string; operator?: '==' | '!=' | '>=' | '<='; value?: string | number | boolean }
  | { type: 'clueDiscovered'; clueId: string }
  | { type: 'clueCountGte'; count: number }
  | { type: 'npcAlive'; npcId: string }
  | { type: 'npcAt'; npcId: string; locationId: string }
  | { type: 'npcKnows'; npcId: string; knowledge: string }
  | { type: 'actorAt'; actorId: string; locationId: string }
  | { type: 'actorKnows'; actorId: string; knowledge: string }
  | { type: 'actorHasItem'; actorId: string; item: string }
  | { type: 'locationVisited'; locationId: string }
  | { type: 'locationVisitedBy'; locationId: string; actorId: string }
  | { type: 'eventOccurred'; eventId: string }
  | { type: 'pcHasItem'; item: string }
  | { type: 'pcStat'; pcId: string; stat: string; operator: '>=' | '<=' | '=='; value: number }
  | { type: 'factExists'; factType?: FactType; descriptionContains?: string; entityId?: string }
  | { type: 'timeReached'; time: string }
  | { type: 'and'; conditions: Condition[] }
  | { type: 'or'; conditions: Condition[] }
  | { type: 'not'; condition: Condition };

export type Effect =
  | { type: 'setFlag'; flag: string; value: string | number | boolean }
  | { type: 'setNpcState'; npcId: string; field: string; value: string | number | boolean }
  | { type: 'addNpcKnowledge'; npcId: string; knowledge: string }
  | { type: 'addActorKnowledge'; actorId: string; knowledge: string }
  | { type: 'moveActor'; actorId: string; locationId: string }
  | { type: 'setClueLocation'; clueId: string; locationId?: string; holderId?: string }
  | { type: 'transferClue'; clueId: string; fromId: string; toId: string }
  | { type: 'destroyClue'; clueId: string }
  | { type: 'setLocationState'; locationId: string; field: string; value: string | number | boolean }
  | { type: 'sanCheck'; successLoss: string; failureLoss: string }
  | { type: 'hpChange'; targetId: string; amount: string }
  | { type: 'mpChange'; targetId: string; amount: string }
  | { type: 'addItem'; targetId: string; item: string }
  | { type: 'removeItem'; targetId: string; item: string }
  | { type: 'showMessage'; message: string }
  | { type: 'triggerEvent'; eventId: string };

export type FactType =
  | 'pc_action'
  | 'npc_action'
  | 'discovery'
  | 'state_change'
  | 'knowledge_transfer'
  | 'timeline_event'
  | 'keeper_note';
