import { useState, useCallback, useMemo, useRef, useEffect } from "react";

/* ════════════════════════════════════════════════════════════════
   TRPGシナリオエディタ — プロトタイプ v8b
   インライン編集（prompt不使用）
   ════════════════════════════════════════════════════════════════ */

const C = {
  bg0:"#0d1017",bg1:"#141b22",bg2:"#1b2430",bg3:"#243040",bgAct:"#1a3548",
  tx:"#dce0e8",tx2:"#8f99a8",tx3:"#5c6878",
  acc:"#4ec9b0",accDim:"#2a7a68",accBg:"#162e28",
  warn:"#d9a334",warnBg:"#2e2510",
  err:"#d05050",ok:"#4caf6a",blue:"#5099d0",
  plBdr:"#2a4a6a",bdr:"#253040",pcMark:"#e8c547",
  edit:"#c084fc",editBg:"#1e1530",
};
const font=`"Hiragino Sans","Yu Gothic UI","Noto Sans JP",sans-serif`;
const clone=o=>JSON.parse(JSON.stringify(o));
const uid=()=>"id_"+Math.random().toString(36).slice(2,9);

// ═══════════════ ENGINE ═══════════════
function getChildren(ents,pid){return Object.values(ents).filter(e=>e.parent===pid)}
function getDescendants(ents,eid){const r=[];for(const c of getChildren(ents,eid)){r.push(c);r.push(...getDescendants(ents,c.id))}return r}
function findPCs(ents){return Object.values(ents).filter(e=>e.categories.some(c=>c.name==="種別"&&c.current==="PC"))}
function entityHasValue(ent,catName,val){
  if(catName==="居場所")return ent.parent===val;
  const cat=ent.categories.find(c=>c.name===catName);if(!cat)return false;
  if(cat.exclusive)return cat.current===val;return Array.isArray(cat.current)&&cat.current.includes(val);
}
function evaluateCondition(cond,ents,ownerId){
  const check=eid=>{const e=ents[eid];return e?entityHasValue(e,cond.category,cond.value):false};let result;
  switch(cond.ref){
    case"self":result=check(ownerId);break;
    case"named":result=check(cond.entity);break;
    case"sibling":{const own=ents[ownerId];result=Object.values(ents).some(e=>e.parent===own.parent&&e.id!==ownerId&&entityHasValue(e,cond.category,cond.value));break}
    case"ancestor":{result=false;let cur=ents[ownerId];while(cur?.parent){cur=ents[cur.parent];if(cur&&entityHasValue(cur,cond.category,cond.value)){result=true;break}}break}
    case"descendant":result=getDescendants(ents,ownerId).some(d=>entityHasValue(d,cond.category,cond.value));break;
    default:result=false}
  return cond.negated?!result:result;
}
function applyEffect(ents,eff,defId){
  const tid=eff.entity||defId;const target=ents[tid];if(!target)return null;
  if(eff.category==="居場所"){const prior=target.parent;target.parent=eff.value;return{prior}}
  const cat=target.categories.find(c=>c.name===eff.category);if(!cat)return null;
  if(eff.type==="set"){if(cat.exclusive){const prior=cat.current;cat.current=eff.value;if(!cat.values[eff.value])cat.values[eff.value]={description:null};return{prior}}else{if(!Array.isArray(cat.current))cat.current=[];if(!cat.current.includes(eff.value))cat.current=[...cat.current,eff.value];if(!cat.values[eff.value])cat.values[eff.value]={description:null};return{}}}
  else if(eff.type==="remove"){if(cat.exclusive){const prior=cat.current;if(cat.current===eff.value)cat.current=null;return{prior}}else{cat.current=(cat.current||[]).filter(v=>v!==eff.value);return{}}}
  return null;
}
function wouldChange(ents,effects,defId){
  for(const eff of effects){const tid=eff.entity||defId;const t=ents[tid];if(!t)continue;if(eff.category==="居場所"){if(t.parent!==eff.value)return true;continue}const cat=t.categories.find(c=>c.name===eff.category);if(!cat)continue;if(eff.type==="set"){if(cat.exclusive){if(cat.current!==eff.value)return true}else{if(!(cat.current||[]).includes(eff.value))return true}}else{if(cat.exclusive){if(cat.current===eff.value)return true}else{if((cat.current||[]).includes(eff.value))return true}}}return false;
}
function runStabilize(ents){
  const fired=[];const firedKeys=new Set();let changed=true,iter=0;
  while(changed&&iter<200){changed=false;iter++;for(const entity of Object.values(ents)){for(const tr of(entity.triggers||[])){const key=entity.id+":"+tr.id;if(firedKeys.has(key))continue;if(!tr.conditions.every(c=>evaluateCondition(c,ents,entity.id)))continue;const action=entity.actions.find(a=>a.id===tr.actionId);if(!action)continue;if(!wouldChange(ents,action.effects,entity.id)){firedKeys.add(key);continue}firedKeys.add(key);for(const eff of action.effects)applyEffect(ents,eff,entity.id);fired.push({name:action.name,desc:action.description||null});changed=true}}}return fired;
}
function computeProjection(ents,eid){
  const dO=["外見","服装","態度","環境","雰囲気"];const ent=ents[eid];if(!ent)return"";
  const o=ent.categoryOrder?.length?ent.categoryOrder:dO;const descs=[];const seen=new Set();
  const add=cat=>{if(cat.exclusive){const d=cat.current&&cat.values[cat.current]?.description;if(d)descs.push(d)}else{for(const v of(cat.current||[])){const d=cat.values[v]?.description;if(d)descs.push(d)}}};
  for(const cn of o){seen.add(cn);const cat=ent.categories.find(c=>c.name===cn);if(cat)add(cat)}
  for(const cat of ent.categories){if(!seen.has(cat.name))add(cat)}return descs.join("\n");
}
function computeFullProjection(ents,eid){const s=computeProjection(ents,eid);const ch=getChildren(ents,eid).map(c=>computeProjection(ents,c.id)).filter(Boolean);return[s,...ch].filter(Boolean).join("\n")}
function isActionAvailable(action,ents,ownerId){if(!action.showConditions||action.showConditions.length===0)return true;return action.showConditions.every(c=>evaluateCondition(c,ents,ownerId))}
function isLocationAccessible(ent,ents){if(!ent.entryConditions||ent.entryConditions.length===0)return true;return ent.entryConditions.every(c=>evaluateCondition(c,ents,ent.id))}
function computePending(ents){
  const pending=[];for(const ent of Object.values(ents)){for(const tr of(ent.triggers||[])){const conds=tr.conditions.map(c=>({...c,met:evaluateCondition(c,ents,ent.id)}));const nMet=conds.filter(c=>c.met).length;if(nMet>0&&(conds.length-nMet)===1){const action=ent.actions.find(a=>a.id===tr.actionId);if(action&&isActionAvailable(action,ents,ent.id))pending.push({triggerId:tr.id,entityId:ent.id,entityName:ent.name,actionName:action?.name||tr.actionId,conditions:conds})}}}return pending;
}
function condLabel(c,ents){const neg=c.negated?"NOT ":"";const src={self:"自身",named:ents[c.entity]?.name||c.entity,sibling:"同位",ancestor:"祖先",descendant:"子孫"}[c.ref]||"?";return`${neg}${src}: ${c.category} = ${c.value}`}
function condTargetEntity(c,ownerId){return c.ref==="self"?ownerId:c.ref==="named"?c.entity:null}
function timeStr(){const d=new Date();return d.getHours().toString().padStart(2,"0")+":"+d.getMinutes().toString().padStart(2,"0")}

// ═══════════════ SCENARIO (same as v7) ═══════════════
function createScenario(){return{"e-mansion":{id:"e-mansion",name:"洋館",parent:null,categoryOrder:[],categories:[],actions:[],triggers:[]},"e-hall":{id:"e-hall",name:"玄関ホール",parent:"e-mansion",categoryOrder:["雰囲気"],categories:[{name:"雰囲気",exclusive:true,values:{"薄暗い":{description:"薄暗い照明が揺れる玄関ホール。古びた調度品が並び、かすかに黴の匂いがする。"}},current:"薄暗い"}],actions:[],triggers:[]},"e-study":{id:"e-study",name:"書斎",parent:"e-mansion",categoryOrder:["雰囲気"],categories:[{name:"雰囲気",exclusive:true,values:{"静か":{description:"しんと静まり返った書斎。壁一面の本棚が目を引く。"},"異様":{description:"空気が張り詰めている。何かがおかしい。"}},current:"静か"}],actions:[],triggers:[]},"e-diary":{id:"e-diary",name:"日記",parent:"e-study",categoryOrder:["状態"],categories:[{name:"種別",exclusive:true,values:{"アイテム":{description:null}},current:"アイテム"},{name:"状態",exclusive:true,values:{"未発見":{description:null},"発見":{description:"古い革張りの日記。表紙に何かの紋章が刻まれている。"},"読了":{description:"おぞましい実験の記録が綴られた日記。"}},current:"未発見"}],actions:[{id:"a-find",name:"本棚を調べる",plAction:true,roll:"目星 50",description:"本棚の奥に、何か挟まっているのが見える。引き抜くと、古い革張りの日記が出てきた。",effects:[{type:"set",entity:"e-diary",category:"状態",value:"発見"},{type:"set",entity:"e-diary",category:"居場所",value:"$actor"}],showConditions:[{ref:"self",category:"状態",value:"未発見",negated:false}]},{id:"a-read",name:"日記を読む",plAction:true,requiresItem:"e-diary",description:"ページをめくると、震える筆跡で実験の記録が綴られていた。最後のページには『地下にまだいる』と走り書きがある。",effects:[{type:"set",entity:"e-diary",category:"状態",value:"読了"},{type:"set",entity:"$actor",category:"知識",value:"日記の内容"}],showConditions:[{ref:"self",category:"状態",value:"発見",negated:false}]}],triggers:[]},"e-basement":{id:"e-basement",name:"地下室",parent:"e-mansion",categoryOrder:["施錠","雰囲気"],entryConditions:[{ref:"self",category:"施錠",value:"解錠",negated:false}],categories:[{name:"施錠",exclusive:true,values:{"施錠":{description:null},"解錠":{description:null}},current:"施錠"},{name:"雰囲気",exclusive:true,values:{"暗闇":{description:"冷たい空気と饐えた臭いが立ちこめる地下室。壁に何かの染みがこびりついている。"}},current:"暗闇"}],actions:[],triggers:[]},"e-key":{id:"e-key",name:"地下室の鍵",parent:"e-butler",categoryOrder:["視認"],categories:[{name:"種別",exclusive:true,values:{"アイテム":{description:null}},current:"アイテム"},{name:"視認",exclusive:true,values:{"隠":{description:null},"露出":{description:"床に古びた鍵が落ちている。"}},current:"隠"},{name:"所持",exclusive:true,values:{"執事所持":{description:null},"落下":{description:null},"PC所持":{description:null}},current:"執事所持"}],actions:[{id:"a-pickup",name:"鍵を拾う",plAction:true,roll:"目星 60",description:"床に光るものが見える。拾い上げると、古びた鍵だ。",effects:[{type:"set",entity:"e-key",category:"所持",value:"PC所持"},{type:"set",entity:"e-key",category:"視認",value:"隠"},{type:"set",entity:"e-key",category:"居場所",value:"$actor"}],showConditions:[{ref:"self",category:"視認",value:"露出",negated:false}]},{id:"a-unlock",name:"地下室の鍵を使う",plAction:true,requiresItem:"e-key",description:"錆びた鍵が軋みながら回る。重い扉がゆっくりと開くと、冷たい空気と共に饐えた臭いが漏れ出した。",effects:[{type:"set",entity:"e-basement",category:"施錠",value:"解錠"}],showConditions:[{ref:"self",category:"所持",value:"PC所持",negated:false},{ref:"named",entity:"e-basement",category:"施錠",value:"施錠",negated:false}]}],triggers:[]},"e-butler":{id:"e-butler",name:"執事",parent:"e-hall",categoryOrder:["外見","態度"],categories:[{name:"種別",exclusive:true,values:{"NPC":{description:null}},current:"NPC"},{name:"外見",exclusive:true,values:{"端正":{description:"身なりの整った初老の男。"}},current:"端正"},{name:"態度",exclusive:true,values:{"丁寧":{description:"慇懃な態度で応対している。"},"動揺":{description:"目が泳ぎ、額に汗が浮かんでいる。"},"逃走":{description:null}},current:"丁寧"},{name:"日記の件",exclusive:true,values:{"気づいた":{description:null}},current:null}],actions:[{id:"a-upset",name:"執事が動揺する",plAction:false,description:"執事の表情が凍りつく。「それは……どこでそれを……」声が震えている。",effects:[{type:"set",entity:"e-butler",category:"態度",value:"動揺"}],showConditions:[{ref:"self",category:"態度",value:"丁寧",negated:false}]},{id:"a-flee",name:"執事が逃走する",plAction:false,description:"執事は弾かれたように走り出し、地下室の方へ駆け去った。慌てた拍子に、ポケットから何かが落ちた。",effects:[{type:"set",entity:"e-butler",category:"態度",value:"逃走"},{type:"set",entity:"e-butler",category:"居場所",value:"e-basement"},{type:"set",entity:"e-key",category:"視認",value:"露出"},{type:"set",entity:"e-key",category:"所持",value:"落下"},{type:"set",entity:"e-key",category:"居場所",value:"e-hall"}],showConditions:[{ref:"self",category:"態度",value:"動揺",negated:false}]},{id:"a-ask",name:"執事に問い詰める",plAction:true,requiresKnowledge:"日記の内容",description:"日記の内容について執事に問い詰める。",effects:[{type:"set",entity:"e-butler",category:"日記の件",value:"気づいた"}],showConditions:[{ref:"named",entity:"e-diary",category:"状態",value:"読了",negated:false},{ref:"self",category:"態度",value:"逃走",negated:true}]}],triggers:[{id:"t1",conditions:[{ref:"named",entity:"e-diary",category:"状態",value:"読了",negated:false},{ref:"self",category:"日記の件",value:"気づいた",negated:false},{ref:"self",category:"態度",value:"丁寧",negated:false}],actionId:"a-upset"},{id:"t2",conditions:[{ref:"self",category:"態度",value:"動揺",negated:false},{ref:"sibling",category:"種別",value:"PC",negated:false}],actionId:"a-flee"}]},"e-master":{id:"e-master",name:"館主",parent:"e-basement",categoryOrder:["外見"],categories:[{name:"種別",exclusive:true,values:{"NPC":{description:null}},current:"NPC"},{name:"外見",exclusive:true,values:{"正体不明":{description:null},"露出":{description:"白衣を纏った痩せた男。目が異様に光っている。"}},current:"正体不明"}],actions:[{id:"a-reveal",name:"館主が姿を現す",plAction:false,description:"暗闇の奥から、白衣の男がゆっくりと歩み出てくる。「ようこそ……私の実験室へ」",effects:[{type:"set",entity:"e-master",category:"外見",value:"露出"}],showConditions:[{ref:"self",category:"外見",value:"正体不明",negated:false}]}],triggers:[]},"e-pcA":{id:"e-pcA",name:"探索者A",parent:"e-hall",categoryOrder:[],categories:[{name:"種別",exclusive:true,values:{"PC":{description:null}},current:"PC"},{name:"知識",exclusive:false,values:{"日記の内容":{description:null}},current:[]},{name:"状態異常",exclusive:false,values:{"呪い":{description:null},"毒":{description:null}},current:[]}],actions:[],triggers:[]},"e-pcB":{id:"e-pcB",name:"探索者B",parent:"e-hall",categoryOrder:[],categories:[{name:"種別",exclusive:true,values:{"PC":{description:null}},current:"PC"},{name:"知識",exclusive:false,values:{"日記の内容":{description:null}},current:[]},{name:"状態異常",exclusive:false,values:{"呪い":{description:null},"毒":{description:null}},current:[]}],actions:[],triggers:[]}}}
function createInitialParties(){return[{id:"p1",name:"パーティ",members:["e-pcA","e-pcB"]}]}

// ═══════════════ STYLES ═══════════════
const sIn={background:C.bg3,color:C.tx,border:`1px solid ${C.bdr}`,borderRadius:4,padding:"3px 6px",fontSize:12,fontFamily:font,outline:"none"};
const sSel={...sIn,cursor:"pointer",minWidth:70};
const sBtn={background:C.bg3,color:C.tx2,border:`1px solid ${C.bdr}`,borderRadius:3,padding:"2px 8px",fontSize:11,cursor:"pointer",fontFamily:font};
const sEBtn={background:C.editBg,color:C.edit,border:`1px solid ${C.edit}44`,borderRadius:3,padding:"2px 8px",fontSize:11,cursor:"pointer",fontFamily:font};
const sLbl={fontSize:11,color:C.tx3,fontFamily:font,marginBottom:4,textTransform:"uppercase",letterSpacing:1};

// ═══════════════ INLINE ADD ROW ═══════════════
function AddRow({placeholder,onAdd,buttonLabel}){
  const[v,setV]=useState("");
  const submit=()=>{if(v.trim()){onAdd(v.trim());setV("")}};
  return(<div style={{display:"flex",gap:4,marginTop:4}}>
    <input value={v} onChange={e=>setV(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")submit()}} placeholder={placeholder} style={{...sIn,flex:1}}/>
    <button onClick={submit} style={sEBtn}>{buttonLabel||"＋"}</button>
  </div>);
}

// ═══════════════ EDIT PANEL ═══════════════
function EditEntityPanel({eid,ents,onChange}){
  const e=ents[eid];if(!e)return null;
  const [editingName,setEditingName]=useState(false);
  const [nameVal,setNameVal]=useState(e.name);
  const [newActName,setNewActName]=useState("");
  const [newActDesc,setNewActDesc]=useState("");
  const [editActId,setEditActId]=useState(null);

  useEffect(()=>{setNameVal(e.name)},[e.name]);

  const update=patch=>{onChange({...ents,[eid]:{...e,...patch}})};

  const addCat=(name,exclusive)=>{update({categories:[...e.categories,{name,exclusive,values:{},current:exclusive?null:[]}]})};
  const addValToCat=(ci,val,desc)=>{const cats=clone(e.categories);cats[ci].values[val]={description:desc||null};update({categories:cats})};
  const editValDesc=(ci,val,desc)=>{const cats=clone(e.categories);cats[ci].values[val]={description:desc||null};update({categories:cats})};
  const delCat=ci=>{const cats=clone(e.categories);cats.splice(ci,1);update({categories:cats})};

  const addAction=(name,desc,plAction)=>{update({actions:[...e.actions,{id:uid(),name,plAction,description:desc,effects:[],showConditions:[],roll:""}]})};
  const delAction=ai=>{const a=clone(e.actions);a.splice(ai,1);update({actions:a})};
  const updateAction=(ai,patch)=>{const a=clone(e.actions);a[ai]={...a[ai],...patch};update({actions:a})};
  const addEffect=(ai,eff)=>{const a=clone(e.actions);a[ai].effects.push(eff);update({actions:a})};
  const delEffect=(ai,ei)=>{const a=clone(e.actions);a[ai].effects.splice(ei,1);update({actions:a})};

  const addTrigger=actionId=>{update({triggers:[...(e.triggers||[]),{id:uid(),conditions:[],actionId}]})};
  const addCondToTrigger=(ti,cond)=>{const t=clone(e.triggers||[]);t[ti].conditions.push(cond);update({triggers:t})};
  const delTrigger=ti=>{const t=clone(e.triggers||[]);t.splice(ti,1);update({triggers:t})};
  const delCond=(ti,ci)=>{const t=clone(e.triggers||[]);t[ti].conditions.splice(ci,1);update({triggers:t})};

  return(
    <div style={{padding:10,background:C.editBg,borderRadius:6,fontSize:12,fontFamily:font,border:`1px solid ${C.edit}33`}}>
      {/* Name */}
      <div style={{marginBottom:10}}>
        <span style={{color:C.edit,fontWeight:600}}>✎ {e.name}</span>
        {editingName?(
          <div style={{display:"flex",gap:4,marginTop:4}}>
            <input value={nameVal} onChange={ev=>setNameVal(ev.target.value)} style={{...sIn,flex:1}} autoFocus/>
            <button onClick={()=>{update({name:nameVal});setEditingName(false)}} style={sEBtn}>確定</button>
            <button onClick={()=>setEditingName(false)} style={sBtn}>✕</button>
          </div>
        ):(
          <button onClick={()=>setEditingName(true)} style={{...sEBtn,marginLeft:8}}>名前変更</button>
        )}
      </div>

      {/* Categories */}
      <div style={{marginBottom:10}}>
        <div style={sLbl}>カテゴリ</div>
        {e.categories.map((cat,ci)=>(
          <CatEditor key={ci} cat={cat} ci={ci}
            onAddVal={(val,desc)=>addValToCat(ci,val,desc)}
            onEditDesc={(val,desc)=>editValDesc(ci,val,desc)}
            onDelete={()=>delCat(ci)}/>
        ))}
        <CatAdder onAdd={addCat}/>
      </div>

      {/* Actions */}
      <div style={{marginBottom:10}}>
        <div style={sLbl}>アクション</div>
        {e.actions.map((a,ai)=>(
          <ActionEditor key={a.id} a={a} ai={ai} ents={ents} eid={eid}
            isEditing={editActId===a.id}
            onToggleEdit={()=>setEditActId(editActId===a.id?null:a.id)}
            onUpdate={patch=>updateAction(ai,patch)}
            onAddEffect={eff=>addEffect(ai,eff)}
            onDelEffect={ei=>delEffect(ai,ei)}
            onDelete={()=>delAction(ai)}/>
        ))}
        <ActionAdder onAdd={addAction}/>
      </div>

      {/* Triggers */}
      <div>
        <div style={sLbl}>トリガー</div>
        {(e.triggers||[]).map((tr,ti)=>{
          const act=e.actions.find(a=>a.id===tr.actionId);
          return(
            <div key={tr.id} style={{background:C.bg2,borderRadius:4,padding:"6px 8px",marginTop:4,border:`1px solid ${C.bdr}`}}>
              <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:4}}>
                <span style={{color:C.acc}}>→ {act?.name||tr.actionId}</span>
                <button onClick={()=>delTrigger(ti)} style={{...sBtn,color:C.err,fontSize:10}}>✕</button>
              </div>
              {tr.conditions.map((c,ci)=>(
                <div key={ci} style={{display:"flex",alignItems:"center",gap:4,paddingLeft:8,marginBottom:2}}>
                  <span style={{color:C.tx2,fontSize:11}}>{condLabel(c,ents)}</span>
                  <button onClick={()=>delCond(ti,ci)} style={{background:"transparent",border:"none",color:C.tx3,cursor:"pointer",fontSize:10}}>✕</button>
                </div>
              ))}
              <CondAdder onAdd={cond=>addCondToTrigger(ti,cond)} ents={ents}/>
            </div>
          );
        })}
        {e.actions.length>0&&(
          <TriggerAdder actions={e.actions} onAdd={addTrigger}/>
        )}
      </div>
    </div>
  );
}

function CatEditor({cat,ci,onAddVal,onEditDesc,onDelete}){
  const[newVal,setNewVal]=useState("");const[newDesc,setNewDesc]=useState("");
  const[editingVal,setEditingVal]=useState(null);const[editDesc,setEditDesc]=useState("");
  return(
    <div style={{background:C.bg2,borderRadius:4,padding:"6px 8px",marginTop:4,border:`1px solid ${C.bdr}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
        <span style={{color:C.tx,fontWeight:500}}>{cat.name} <span style={{color:C.tx3,fontWeight:400}}>({cat.exclusive?"排他":"非排他"})</span></span>
        <button onClick={onDelete} style={{...sBtn,color:C.err,fontSize:10}}>✕</button>
      </div>
      {Object.entries(cat.values).map(([v,def])=>(
        <div key={v} style={{paddingLeft:8,marginBottom:2}}>
          {editingVal===v?(
            <div style={{display:"flex",gap:4,alignItems:"center"}}>
              <span style={{color:C.tx2,minWidth:50}}>{v}:</span>
              <input value={editDesc} onChange={ev=>setEditDesc(ev.target.value)} style={{...sIn,flex:1,fontSize:11}} placeholder="描写"/>
              <button onClick={()=>{onEditDesc(v,editDesc);setEditingVal(null)}} style={sEBtn}>✓</button>
              <button onClick={()=>setEditingVal(null)} style={{...sBtn,fontSize:10}}>✕</button>
            </div>
          ):(
            <div style={{display:"flex",alignItems:"center",gap:4,cursor:"pointer"}} onClick={()=>{setEditingVal(v);setEditDesc(def.description||"")}}>
              <span style={{color:C.tx2,minWidth:50}}>{v}</span>
              <span style={{color:C.tx3,fontSize:11,fontStyle:def.description?"normal":"italic"}}>{def.description||"(描写なし)"}</span>
            </div>
          )}
        </div>
      ))}
      <div style={{display:"flex",gap:4,marginTop:4,paddingLeft:8}}>
        <input value={newVal} onChange={e=>setNewVal(e.target.value)} placeholder="新しい値" style={{...sIn,width:70,fontSize:11}}/>
        <input value={newDesc} onChange={e=>setNewDesc(e.target.value)} placeholder="描写（任意）" style={{...sIn,flex:1,fontSize:11}}/>
        <button onClick={()=>{if(newVal.trim()){onAddVal(newVal.trim(),newDesc.trim());setNewVal("");setNewDesc("")}}} style={sEBtn}>＋</button>
      </div>
    </div>
  );
}

function CatAdder({onAdd}){
  const[name,setName]=useState("");const[excl,setExcl]=useState(true);const[open,setOpen]=useState(false);
  if(!open)return <button onClick={()=>setOpen(true)} style={{...sEBtn,marginTop:4}}>＋ カテゴリ追加</button>;
  return(<div style={{display:"flex",gap:4,marginTop:4,alignItems:"center"}}>
    <input value={name} onChange={e=>setName(e.target.value)} placeholder="カテゴリ名" style={{...sIn,width:100,fontSize:11}}/>
    <label style={{fontSize:11,color:C.tx2,display:"flex",alignItems:"center",gap:2}}><input type="checkbox" checked={excl} onChange={e=>setExcl(e.target.checked)}/>排他</label>
    <button onClick={()=>{if(name.trim()){onAdd(name.trim(),excl);setName("");setOpen(false)}}} style={sEBtn}>追加</button>
    <button onClick={()=>setOpen(false)} style={{...sBtn,fontSize:10}}>✕</button>
  </div>);
}

function ActionEditor({a,ai,ents,eid,isEditing,onToggleEdit,onUpdate,onAddEffect,onDelEffect,onDelete}){
  const[effCat,setEffCat]=useState("");const[effVal,setEffVal]=useState("");const[effEnt,setEffEnt]=useState("");const[effType,setEffType]=useState("set");
  return(
    <div style={{background:C.bg2,borderRadius:4,padding:"6px 8px",marginTop:4,border:`1px solid ${C.bdr}`}}>
      <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:2}}>
        <span style={{color:a.plAction?C.blue:C.acc,fontWeight:500}}>{a.plAction?"[PL]":"[KP]"} {a.name}{a.roll&&<span style={{color:C.warn,fontWeight:400,marginLeft:4}}>🎲{a.roll}</span>}</span>
        <div style={{display:"flex",gap:4}}>
          <button onClick={onToggleEdit} style={sEBtn}>{isEditing?"閉":"✎"}</button>
          <button onClick={onDelete} style={{...sBtn,color:C.err,fontSize:10}}>✕</button>
        </div>
      </div>
      {isEditing&&(
        <div style={{paddingLeft:8,marginTop:4}}>
          <div style={{display:"flex",gap:4,marginBottom:4,alignItems:"center"}}>
            <span style={{color:C.tx3,fontSize:11,minWidth:40}}>名前</span>
            <input value={a.name} onChange={ev=>onUpdate({name:ev.target.value})} style={{...sIn,flex:1,fontSize:11}}/>
          </div>
          <div style={{display:"flex",gap:4,marginBottom:4,alignItems:"center"}}>
            <span style={{color:C.tx3,fontSize:11,minWidth:40}}>描写</span>
            <textarea value={a.description||""} onChange={ev=>onUpdate({description:ev.target.value})} style={{...sIn,flex:1,fontSize:11,minHeight:50,resize:"vertical"}}/>
          </div>
          <div style={{display:"flex",gap:8,marginBottom:4,alignItems:"center",flexWrap:"wrap"}}>
            <label style={{fontSize:11,color:C.tx2,display:"flex",alignItems:"center",gap:2}}><input type="checkbox" checked={a.plAction} onChange={ev=>onUpdate({plAction:ev.target.checked})}/>PL行動</label>
            <span style={{color:C.tx3,fontSize:11}}>🎲</span>
            <input value={a.roll||""} onChange={ev=>onUpdate({roll:ev.target.value||undefined})} placeholder="ロール条件" style={{...sIn,width:100,fontSize:11}}/>
          </div>
          <div style={{fontSize:11,color:C.tx3,marginBottom:2}}>効果:</div>
          {a.effects.map((eff,ei)=>(
            <div key={ei} style={{display:"flex",alignItems:"center",gap:4,paddingLeft:8,marginBottom:2}}>
              <span style={{color:C.tx2,fontSize:11}}>{eff.type==="set"?"＋":"−"} {eff.entity||"self"}.{eff.category}={eff.value}</span>
              <button onClick={()=>onDelEffect(ei)} style={{background:"transparent",border:"none",color:C.tx3,cursor:"pointer",fontSize:10}}>✕</button>
            </div>
          ))}
          <div style={{display:"flex",gap:3,marginTop:2,alignItems:"center",flexWrap:"wrap"}}>
            <select value={effType} onChange={e=>setEffType(e.target.value)} style={{...sSel,width:50,fontSize:10}}>
              <option value="set">付与</option><option value="remove">除去</option>
            </select>
            <input value={effEnt} onChange={e=>setEffEnt(e.target.value)} placeholder="対象ID(空=self)" style={{...sIn,width:80,fontSize:10}}/>
            <input value={effCat} onChange={e=>setEffCat(e.target.value)} placeholder="カテゴリ" style={{...sIn,width:70,fontSize:10}}/>
            <input value={effVal} onChange={e=>setEffVal(e.target.value)} placeholder="値" style={{...sIn,width:70,fontSize:10}}/>
            <button onClick={()=>{if(effCat&&effVal){onAddEffect({type:effType,entity:effEnt||undefined,category:effCat,value:effVal});setEffCat("");setEffVal("");setEffEnt("")}}} style={sEBtn}>＋</button>
          </div>
        </div>
      )}
    </div>
  );
}

function ActionAdder({onAdd}){
  const[open,setOpen]=useState(false);const[name,setName]=useState("");const[desc,setDesc]=useState("");const[pl,setPl]=useState(true);
  if(!open)return <button onClick={()=>setOpen(true)} style={{...sEBtn,marginTop:4}}>＋ アクション追加</button>;
  return(<div style={{background:C.bg2,borderRadius:4,padding:"6px 8px",marginTop:4,border:`1px solid ${C.edit}33`}}>
    <div style={{display:"flex",gap:4,marginBottom:4}}>
      <input value={name} onChange={e=>setName(e.target.value)} placeholder="アクション名" style={{...sIn,flex:1,fontSize:11}}/>
      <label style={{fontSize:11,color:C.tx2,display:"flex",alignItems:"center",gap:2}}><input type="checkbox" checked={pl} onChange={e=>setPl(e.target.checked)}/>PL</label>
    </div>
    <textarea value={desc} onChange={e=>setDesc(e.target.value)} placeholder="描写" style={{...sIn,width:"100%",fontSize:11,minHeight:40,resize:"vertical",marginBottom:4}}/>
    <div style={{display:"flex",gap:4}}>
      <button onClick={()=>{if(name.trim()){onAdd(name.trim(),desc.trim(),pl);setName("");setDesc("");setOpen(false)}}} style={sEBtn}>追加</button>
      <button onClick={()=>setOpen(false)} style={{...sBtn,fontSize:10}}>✕</button>
    </div>
  </div>);
}

function CondAdder({onAdd,ents}){
  const[open,setOpen]=useState(false);
  const[ref,setRef]=useState("self");const[entity,setEntity]=useState("");const[cat,setCat]=useState("");const[val,setVal]=useState("");const[neg,setNeg]=useState(false);
  if(!open)return <button onClick={()=>setOpen(true)} style={{...sEBtn,marginTop:2,fontSize:10}}>＋条件</button>;
  return(<div style={{display:"flex",gap:3,marginTop:4,alignItems:"center",flexWrap:"wrap",paddingLeft:8}}>
    <select value={ref} onChange={e=>setRef(e.target.value)} style={{...sSel,width:60,fontSize:10}}>
      <option value="self">self</option><option value="named">named</option><option value="sibling">sibling</option><option value="ancestor">ancestor</option><option value="descendant">descendant</option>
    </select>
    {ref==="named"&&<input value={entity} onChange={e=>setEntity(e.target.value)} placeholder="エンティティID" style={{...sIn,width:80,fontSize:10}}/>}
    <input value={cat} onChange={e=>setCat(e.target.value)} placeholder="カテゴリ" style={{...sIn,width:70,fontSize:10}}/>
    <input value={val} onChange={e=>setVal(e.target.value)} placeholder="値" style={{...sIn,width:70,fontSize:10}}/>
    <label style={{fontSize:10,color:C.tx2,display:"flex",alignItems:"center",gap:1}}><input type="checkbox" checked={neg} onChange={e=>setNeg(e.target.checked)}/>NOT</label>
    <button onClick={()=>{if(cat&&val){onAdd({ref,entity:ref==="named"?entity:undefined,category:cat,value:val,negated:neg});setCat("");setVal("");setOpen(false)}}} style={sEBtn}>✓</button>
    <button onClick={()=>setOpen(false)} style={{...sBtn,fontSize:10}}>✕</button>
  </div>);
}

function TriggerAdder({actions,onAdd}){
  const[sel,setSel]=useState("");
  return(<div style={{display:"flex",gap:4,marginTop:4,alignItems:"center"}}>
    <select value={sel} onChange={e=>setSel(e.target.value)} style={{...sSel,flex:1,fontSize:11}}>
      <option value="">アクションを選択...</option>
      {actions.map(a=><option key={a.id} value={a.id}>{a.name}</option>)}
    </select>
    <button onClick={()=>{if(sel){onAdd(sel);setSel("")}}} style={sEBtn}>＋トリガー</button>
  </div>);
}

// ═══════════════ SESSION COMPONENTS ═══════════════
function TreeNode({eid,ents,sel,pcLocs,onSel,onDragOver,onDrop,dragOver,depth=0}){
  const e=ents[eid];if(!e)return null;
  const children=Object.values(ents).filter(x=>x.parent===eid).sort((a,b)=>a.name.localeCompare(b.name));
  const isSel=sel===eid,isDO=dragOver===eid,hasPc=pcLocs.includes(eid);
  return(<div><div draggable onClick={()=>onSel(eid)}
    onDragStart={ev=>ev.dataTransfer.setData("text/plain",eid)}
    onDragOver={ev=>{ev.preventDefault();onDragOver(eid)}} onDragLeave={()=>onDragOver(null)}
    onDrop={ev=>{ev.preventDefault();onDrop(eid,ev.dataTransfer.getData("text/plain"))}}
    style={{padding:"4px 8px 4px "+(12+depth*16)+"px",cursor:"pointer",fontSize:13,fontFamily:font,
      background:isDO?C.accBg:isSel?C.bgAct:"transparent",color:isSel?C.acc:C.tx,
      borderLeft:(isDO||isSel)?`2px solid ${C.acc}`:"2px solid transparent"}}
    onMouseEnter={ev=>{if(!isSel&&!isDO)ev.currentTarget.style.background=C.bg3}}
    onMouseLeave={ev=>{if(!isSel&&!isDO)ev.currentTarget.style.background="transparent"}}
  >{children.length>0?"▾ ":"  "}{hasPc&&<span style={{color:C.pcMark,fontSize:11}}>● </span>}{e.name}</div>
  {children.map(c=><TreeNode key={c.id} eid={c.id} ents={ents} sel={sel} pcLocs={pcLocs} onSel={onSel} onDragOver={onDragOver} onDrop={onDrop} dragOver={dragOver} depth={depth+1}/>)}</div>);
}

function MainPanel({eid,ents,parties,activePartyId,onAction,onNavigate,onSetVal,onShareKnowledge,actorPick,onActorConfirm,onActorCancel,onChange,lastAction,descLog,onAddToParty}){
  const[editOpen,setEditOpen]=useState(false);const[copiedId,setCopiedId]=useState(null);const logEndRef=useRef(null);
  const e=ents[eid];if(!e)return <div style={{padding:24,color:C.tx2,fontFamily:font}}>場所を選択してください</div>;
  const children=getChildren(ents,eid);const activeParty=parties.find(p=>p.id===activePartyId);
  const partyHere=activeParty?.members.some(m=>ents[m]?.parent===eid);
  const allPartyMembers=new Set(parties.flatMap(p=>p.members));
  const siblings=Object.values(ents).filter(s=>s.parent===e.parent&&s.id!==eid&&!s.categories.some(c=>c.name==="種別"&&["NPC","PC","アイテム"].includes(c.current)));
  const fullProjection=computeFullProjection(ents,eid);
  useEffect(()=>{logEndRef.current?.scrollIntoView({behavior:"smooth"})},[descLog.length]);
  const handleCopy=(text,id)=>{navigator.clipboard.writeText(text).then(()=>{setCopiedId(id);setTimeout(()=>setCopiedId(null),1500)})};
  const plActions=[],kpActions=[];
  const collectActions=ent=>{for(const a of ent.actions){if(!isActionAvailable(a,ents,ent.id))continue;if(a.plAction)plActions.push({entity:ent,action:a});else kpActions.push({entity:ent,action:a})}};
  collectActions(e);for(const c of children){collectActions(c);for(const gc of getChildren(ents,c.id))collectActions(gc)}
  const pcsHere=activeParty?activeParty.members.filter(m=>ents[m]?.parent===eid):[];
  const knowledgeShares=useMemo(()=>{if(pcsHere.length<2)return[];const shares=[],allK=new Set(),pcK={};for(const pid of pcsHere){const pc=ents[pid];const kc=pc?.categories.find(c=>c.name==="知識");const k=kc&&Array.isArray(kc.current)?kc.current:[];pcK[pid]=new Set(k);k.forEach(v=>allK.add(v))}for(const k of allK){const h=pcsHere.filter(m=>pcK[m].has(k));const n=pcsHere.filter(m=>!pcK[m].has(k));if(h.length>0&&n.length>0)shares.push({knowledge:k,from:h,to:n})}return shares},[pcsHere.join(","),ents]);

  return (<div style={{height:"100%",display:"flex",flexDirection:"column",background:C.bg1,overflow:"hidden"}}>
    {/* Nav */}
    <div style={{padding:"5px 12px",background:C.bg0,borderBottom:`1px solid ${C.bdr}`,display:"flex",gap:4,flexWrap:"wrap",alignItems:"center",flexShrink:0}}>
      <span style={{fontSize:11,color:C.pcMark,fontFamily:font,marginRight:2}}>● 移動:</span>
      {siblings.map(s=>{const acc=isLocationAccessible(s,ents);return <button key={s.id} onClick={()=>acc&&onNavigate(s.id)} style={{background:C.bg3,color:acc?C.tx2:C.tx3,border:"none",borderRadius:3,padding:"3px 10px",fontSize:12,cursor:acc?"pointer":"not-allowed",fontFamily:font,opacity:acc?1:.5}}
        onMouseEnter={ev=>{if(acc)ev.currentTarget.style.color=C.pcMark}} onMouseLeave={ev=>{ev.currentTarget.style.color=acc?C.tx2:C.tx3}}>{acc?"":"🔒 "}{s.name}</button>})}
      {!partyHere&&<span style={{fontSize:11,color:C.warn,fontFamily:font,marginLeft:8}}>⚠ パーティはここにいません</span>}
    </div>
    {/* Actor pick */}
    {actorPick&&(<div style={{padding:"10px 16px",background:C.warnBg,borderBottom:`1px solid ${C.warn}55`,flexShrink:0}}>
      <div style={{fontSize:13,color:C.warn,fontFamily:font,marginBottom:8,fontWeight:600}}>誰が「{actorPick.actionName}」を行う？{actorPick.roll&&<span style={{fontWeight:400,fontStyle:"italic",marginLeft:8}}>🎲 {actorPick.roll}</span>}</div>
      <div style={{display:"flex",gap:6,flexWrap:"wrap"}}>{actorPick.candidates.map(pcId=> <button key={pcId} onClick={()=>onActorConfirm(pcId)} style={{background:C.warn,color:"#000",border:"none",borderRadius:4,padding:"6px 14px",fontSize:13,cursor:"pointer",fontFamily:font,fontWeight:600}}>{ents[pcId]?.name||pcId}</button>)}
      <button onClick={onActorCancel} style={{background:"transparent",color:C.tx3,border:`1px solid ${C.bdr}`,borderRadius:4,padding:"6px 14px",fontSize:13,cursor:"pointer",fontFamily:font}}>キャンセル</button></div></div>)}
    {/* Notification */}
    {lastAction&&(<div style={{padding:"4px 12px",background:C.accBg,borderBottom:`1px solid ${C.accDim}`,display:"flex",alignItems:"center",gap:6,flexShrink:0}}>
      <span style={{fontSize:11,color:C.acc,fontFamily:font}}>{lastAction.auto?"⚡":"▶"} {lastAction.names.join(" → ")}</span>
    </div>)}
    {/* Main scroll */}
    <div style={{flex:1,overflow:"auto",minHeight:0}}>
      {/* Scene header */}
      <div style={{padding:"12px 16px",background:C.bg2,borderBottom:`1px solid ${C.bdr}`}}>
        <div style={{display:"flex",justifyContent:"space-between",alignItems:"center",marginBottom:6}}>
          <span style={{fontSize:16,fontWeight:700,color:C.tx,fontFamily:font}}>{e.name}</span>
          <div style={{display:"flex",gap:4}}>
            {fullProjection&&<button onClick={()=>handleCopy(fullProjection,"proj")} style={{background:copiedId==="proj"?C.accDim:C.bg3,color:copiedId==="proj"?"#fff":C.tx2,border:`1px solid ${C.bdr}`,borderRadius:4,padding:"3px 10px",fontSize:11,cursor:"pointer",fontFamily:font}}>{copiedId==="proj"?"✓":"場面をコピー"}</button>}
            <button onClick={()=>setEditOpen(!editOpen)} style={{...sEBtn,fontSize:12,padding:"3px 10px"}}>{editOpen?"✎ 閉じる":"✎ 編集"}</button>
          </div>
        </div>
        {fullProjection?<div style={{fontSize:14,color:C.tx,lineHeight:1.7,fontFamily:font,whiteSpace:"pre-wrap"}}>{fullProjection}</div>
          :<div style={{fontSize:13,color:C.tx3,fontStyle:"italic",fontFamily:font}}>（描写なし）</div>}
      </div>
      {/* Actions */}
      <div style={{padding:"10px 16px",borderBottom:`1px solid ${C.bdr}`}}>
        {plActions.length>0&&(<div style={{marginBottom:10}}><div style={sLbl}>PL行動</div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {plActions.map(({entity:en,action:a})=>(<button key={en.id+a.id} onClick={()=>onAction(en.id,a.id)} style={{background:C.plBdr,color:"#fff",border:"none",borderRadius:4,padding:"6px 12px",fontSize:13,cursor:"pointer",fontFamily:font,display:"flex",flexDirection:"column",gap:2,textAlign:"left"}}
            onMouseEnter={ev=>ev.currentTarget.style.background=C.blue} onMouseLeave={ev=>ev.currentTarget.style.background=C.plBdr}>
            <span>{en.id!==eid&&<span style={{fontSize:10,opacity:.7}}>{en.name}: </span>}{a.name}</span>
            {a.roll&&<span style={{fontSize:10,opacity:.8,fontStyle:"italic"}}>🎲 {a.roll}</span>}
          </button>))}</div></div>)}
        {knowledgeShares.length>0&&(<div style={{marginBottom:10}}><div style={sLbl}>情報共有</div>
          {knowledgeShares.map(s=>(<div key={s.knowledge} style={{display:"flex",alignItems:"center",gap:8,marginBottom:4,background:C.bg3,borderRadius:4,padding:"6px 10px",fontSize:12,fontFamily:font}}>
            <span style={{color:C.pcMark,fontWeight:500}}>「{s.knowledge}」</span>
            <span style={{color:C.tx3}}>{s.from.map(m=>ents[m]?.name).join(",")} → {s.to.map(m=>ents[m]?.name).join(",")}</span>
            <button onClick={()=>onShareKnowledge(s.knowledge,s.to)} style={{background:C.pcMark,color:"#000",border:"none",borderRadius:3,padding:"2px 8px",fontSize:11,cursor:"pointer",fontFamily:font,fontWeight:600,marginLeft:"auto"}}>共有</button>
          </div>))}</div>)}
        {kpActions.length>0&&(<div><div style={sLbl}>KP判断</div><div style={{display:"flex",flexWrap:"wrap",gap:6}}>
          {kpActions.map(({entity:en,action:a})=>(<button key={en.id+a.id} onClick={()=>onAction(en.id,a.id)} style={{background:C.accDim,color:"#fff",border:"none",borderRadius:4,padding:"6px 12px",fontSize:13,cursor:"pointer",fontFamily:font,textAlign:"left"}}
            onMouseEnter={ev=>ev.currentTarget.style.background=C.acc} onMouseLeave={ev=>ev.currentTarget.style.background=C.accDim}>
            {en.id!==eid&&<span style={{fontSize:10,opacity:.7}}>{en.name}: </span>}{a.name}
          </button>))}</div></div>)}
      </div>
      {/* Quick state */}
      {children.filter(c=>c.categories.some(ct=>ct.name!=="種別")).length>0&&(
        <div style={{padding:"10px 16px",borderBottom:`1px solid ${C.bdr}`}}>
          <div style={sLbl}>状態</div>
          {children.filter(c=>c.categories.some(ct=>ct.name!=="種別")).map(c=>(
            <div key={c.id} style={{marginBottom:6}}>
              <div style={{display:"flex",alignItems:"center",gap:6,marginBottom:2}}>
                <span style={{fontSize:12,color:C.tx,fontFamily:font,fontWeight:500}}>{c.name}</span>
                {allPartyMembers.has(c.id)&&<span style={{fontSize:9,color:C.pcMark}}>●パーティ</span>}
                {!allPartyMembers.has(c.id)&&c.categories.some(ct=>ct.name==="種別"&&(ct.current==="NPC"||ct.current==="PC"))&&(
                  <button onClick={()=>onAddToParty(c.id)} style={{fontSize:10,color:C.edit,background:"transparent",border:`1px solid ${C.edit}44`,borderRadius:2,padding:"0px 5px",cursor:"pointer",fontFamily:font}}>+パーティ</button>
                )}
              </div>
              <div style={{display:"flex",flexWrap:"wrap",gap:6,paddingLeft:8}}>
                {c.categories.filter(ct=>ct.name!=="種別").map(cat=>(
                  <div key={cat.name} style={{display:"flex",alignItems:"center",gap:3}}>
                    <span style={{fontSize:11,color:C.tx3,fontFamily:font}}>{cat.name}</span>
                    {cat.exclusive?(
                      <select value={cat.current||""} onChange={ev=>onSetVal(c.id,cat.name,ev.target.value||null)} style={{...sSel,fontSize:11,minWidth:55,padding:"1px 3px"}}>
                        <option value="">—</option>
                        {Object.keys(cat.values).map(v=> <option key={v} value={v}>{v}</option>)}
                      </select>
                    ):(
                      <span style={{fontSize:11,color:C.tx2,fontFamily:font}}>{(cat.current||[]).join(",")||"—"}</span>
                    )}
                  </div>
                ))}
              </div>
            </div>
          ))}
        </div>
      )}
      {/* Edit */}
      {editOpen&&(<div style={{padding:"12px 16px",borderBottom:`1px solid ${C.bdr}`}}>
        <EditEntityPanel eid={eid} ents={ents} onChange={onChange}/>
        {children.map(c=><div key={c.id} style={{marginTop:12}}><EditEntityPanel eid={c.id} ents={ents} onChange={onChange}/></div>)}
      </div>)}
    </div>
    {/* Mini log */}
    <div style={{height:110,flexShrink:0,borderTop:`1px solid ${C.bdr}`,background:C.bg0,overflow:"auto"}}>
      <div style={{padding:"3px 8px",fontSize:10,color:C.tx3,fontFamily:font,borderBottom:`1px solid ${C.bdr}22`,position:"sticky",top:0,background:C.bg0,zIndex:1}}>描写ログ</div>
      {descLog.length===0?<div style={{padding:6,fontSize:11,color:C.tx3,fontFamily:font}}>まだログはありません</div>
      :descLog.map((entry,i)=>(
        <div key={i} style={{padding:"2px 8px",borderBottom:`1px solid ${C.bdr}11`,fontSize:11,fontFamily:font}}>
          <span style={{color:C.tx3}}>{entry.time} </span>
          {entry.actor&&<span style={{color:C.pcMark}}>{entry.actor} </span>}
          <span style={{color:entry.auto?C.acc:C.blue}}>{entry.auto?"⚡":"▶"}{entry.name} </span>
          {entry.roll&&<span style={{color:C.warn}}>🎲{entry.roll} </span>}
          <button onClick={()=>handleCopy(entry.desc,`ml-${i}`)} style={{background:"transparent",color:copiedId===`ml-${i}`?C.acc:C.tx3,border:"none",fontSize:9,cursor:"pointer",fontFamily:font,padding:"0 3px",float:"right"}}>{copiedId===`ml-${i}`?"✓":"copy"}</button>
          <div style={{color:C.tx2,paddingLeft:4,overflow:"hidden",textOverflow:"ellipsis",whiteSpace:"nowrap"}}>{entry.desc}</div>
        </div>
      ))}
      <div ref={logEndRef}/>
    </div>
  </div>);
}

function PendingPanel({pending,ents,onGrant}){
  if(pending.length===0)return <div style={{padding:12,fontSize:12,color:C.tx3,fontFamily:font}}>待機中のトリガーはありません</div>;
  return(<div style={{padding:8}}>{pending.map(p=>(<div key={p.triggerId} style={{background:C.warnBg,border:`1px solid ${C.warn}33`,borderRadius:4,padding:"8px 10px",marginBottom:6}}>
    <div style={{fontSize:13,color:C.warn,fontFamily:font,fontWeight:500,marginBottom:6}}>{p.actionName}</div>
    {p.conditions.map((c,i)=>{const tid=condTargetEntity(c,p.entityId);const canGrant=!c.met&&tid;return(<div key={i} style={{display:"flex",alignItems:"center",justifyContent:"space-between",fontSize:12,fontFamily:font,marginBottom:3,color:c.met?C.ok:C.tx3}}>
      <span>{c.met?"✓":"✗"} {condLabel(c,ents)}</span>
      {canGrant&&<button onClick={()=>onGrant(tid,c.category,c.value)} style={{background:C.warn,color:"#000",border:"none",borderRadius:3,padding:"2px 8px",fontSize:11,cursor:"pointer",fontFamily:font,fontWeight:600,marginLeft:8,whiteSpace:"nowrap"}}>付与 ▶</button>}
    </div>)})}</div>))}</div>);
}
function LogPanel({descLog}){
  const[copiedId,setCopiedId]=useState(null);
  const logEndRef=useRef(null);
  useEffect(()=>{logEndRef.current?.scrollIntoView({behavior:"smooth"})},[descLog.length]);
  const handleCopy=(text,id)=>{navigator.clipboard.writeText(text).then(()=>{setCopiedId(id);setTimeout(()=>setCopiedId(null),1500)})};
  if(descLog.length===0)return <div style={{padding:12,fontSize:12,color:C.tx3,fontFamily:font}}>描写ログはありません</div>;
  return (<div style={{padding:0}}>
    {descLog.map((entry,i)=>(<div key={i} style={{padding:"8px 10px",borderBottom:`1px solid ${C.bdr}22`,background:i%2===0?"transparent":C.bg0+"44"}}>
      <div style={{display:"flex",alignItems:"center",gap:4,marginBottom:3,flexWrap:"wrap"}}>
        <span style={{fontSize:10,color:C.tx3,fontFamily:font}}>{entry.time}</span>
        {entry.location&&<span style={{fontSize:10,color:C.tx3,fontFamily:font}}>@{entry.location}</span>}
        {entry.actor&&<span style={{fontSize:10,color:C.pcMark,fontFamily:font}}>{entry.actor}</span>}
        <span style={{fontSize:11,color:entry.auto?C.acc:C.blue,fontFamily:font,fontWeight:500}}>{entry.auto?"⚡":"▶"} {entry.name}</span>
        {entry.roll&&<span style={{fontSize:10,color:C.warn,fontFamily:font}}>🎲{entry.roll}</span>}
        <button onClick={()=>handleCopy(entry.desc,`log-${i}`)} style={{background:copiedId===`log-${i}`?C.accDim:"transparent",color:copiedId===`log-${i}`?"#fff":C.tx3,border:"none",fontSize:10,cursor:"pointer",fontFamily:font,padding:"1px 4px",borderRadius:2,marginLeft:"auto"}}>{copiedId===`log-${i}`?"✓":"copy"}</button>
      </div>
      <div style={{fontSize:12,color:C.tx,fontFamily:font,lineHeight:1.6,paddingLeft:8,borderLeft:`2px solid ${entry.auto?C.accDim:C.plBdr}`}}>{entry.desc}</div>
    </div>))}
    <div ref={logEndRef}/>
  </div>);
}
function HistoryPanel({history,onUndo}){
  return(<div style={{padding:8}}>
    {history.length>0&&<button onClick={onUndo} style={{background:C.err+"44",color:C.err,border:`1px solid ${C.err}66`,borderRadius:4,padding:"5px 14px",fontSize:12,cursor:"pointer",fontFamily:font,width:"100%",marginBottom:8}}>↩ Undo</button>}
    {[...history].reverse().map((h,i)=>(<div key={history.length-1-i} style={{background:C.bg3,borderRadius:4,padding:"6px 10px",marginBottom:4,fontSize:12,fontFamily:font}}><div style={{color:C.tx}}>{h.tree.root}</div>{h.tree.autoFired.map((a,j)=><div key={j} style={{color:C.acc,paddingLeft:12}}>└ {a}</div>)}</div>))}
    {history.length===0&&<div style={{fontSize:12,color:C.tx3,fontFamily:font,padding:4}}>履歴はありません</div>}
  </div>);
}

// ═══════════════ APP ═══════════════
export default function App(){
  const[entities,setEntities]=useState(createScenario);
  const[parties,setParties]=useState(createInitialParties);
  const[activePartyId,setActivePartyId]=useState("p1");
  const[selId,setSelId]=useState("e-hall");
  const[history,setHistory]=useState([]);
  const[descLog,setDescLog]=useState([]);
  const[lastAction,setLastAction]=useState(null);
  const[sideTab,setSideTab]=useState("pending");
  const[dragOver,setDragOver]=useState(null);
  const[actorPick,setActorPick]=useState(null);
  const[splitMode,setSplitMode]=useState(false);
  const[splitSelection,setSplitSelection]=useState(new Set());
  const[newEntName,setNewEntName]=useState("");
  const[newEntType,setNewEntType]=useState("場所");
  const[addingTo,setAddingTo]=useState(null);

  const templates={
    "場所":{categoryOrder:["雰囲気"],categories:[{name:"雰囲気",exclusive:true,values:{},current:null}],actions:[],triggers:[]},
    "NPC":{categoryOrder:["外見","態度"],categories:[{name:"種別",exclusive:true,values:{"NPC":{description:null}},current:"NPC"},{name:"外見",exclusive:true,values:{},current:null},{name:"態度",exclusive:true,values:{"丁寧":{description:null},"中立":{description:null},"敵対":{description:null}},current:"中立"}],actions:[],triggers:[]},
    "PC":{categoryOrder:[],categories:[{name:"種別",exclusive:true,values:{"PC":{description:null}},current:"PC"},{name:"知識",exclusive:false,values:{},current:[]},{name:"状態異常",exclusive:false,values:{},current:[]}],actions:[],triggers:[]},
    "アイテム":{categoryOrder:["状態"],categories:[{name:"種別",exclusive:true,values:{"アイテム":{description:null}},current:"アイテム"},{name:"状態",exclusive:true,values:{"未発見":{description:null},"発見":{description:null}},current:"未発見"}],actions:[],triggers:[]},
    "空":{categoryOrder:[],categories:[],actions:[],triggers:[]},
  };

  const pending=useMemo(()=>computePending(entities),[entities]);
  const pcLocs=useMemo(()=>{const s=new Set();findPCs(entities).forEach(pc=>{if(pc.parent)s.add(pc.parent)});return[...s]},[entities]);
  const activeParty=parties.find(p=>p.id===activePartyId);
  const activeLoc=useMemo(()=>activeParty?.members[0]?entities[activeParty.members[0]]?.parent:null,[activeParty,entities]);
  const mergeableParties=useMemo(()=>{if(!activeLoc||parties.length<=1)return[];return parties.filter(p=>p.id!==activePartyId&&p.members.some(m=>entities[m]?.parent===activeLoc))},[parties,activePartyId,activeLoc,entities]);

  const executeWithActor=useCallback((actionName,effects,sourceEntityId,directDesc,roll,actorId)=>{
    const prior=clone(entities);const newEnts=clone(entities);
    const resolved=effects.map(eff=>({...eff,entity:eff.entity==="$actor"?actorId:eff.entity,value:eff.value==="$actor"?actorId:eff.value}));
    for(const eff of resolved)applyEffect(newEnts,eff,sourceEntityId);
    const autoFired=runStabilize(newEnts);setEntities(newEnts);
    setHistory(h=>[...h,{priorEntities:prior,tree:{root:actionName,autoFired:autoFired.map(a=>a.name)}}]);
    const time=timeStr();const locName=entities[selId]?.name||"";const actorName=actorId?entities[actorId]?.name:null;const newLogs=[];
    if(directDesc)newLogs.push({time,name:actionName,desc:directDesc,roll:roll||null,auto:false,location:locName,actor:actorName});
    for(const af of autoFired){if(af.desc)newLogs.push({time,name:af.name,desc:af.desc,roll:null,auto:true,location:locName,actor:null})}
    if(newLogs.length>0){setDescLog(prev=>[...prev,...newLogs]);setLastAction({names:newLogs.map(l=>l.name),auto:autoFired.length>0});setTimeout(()=>setLastAction(null),5000)}
  },[entities,selId]);

  const handleAction=useCallback((eid,actionId)=>{
    const ent=entities[eid];const action=ent?.actions.find(a=>a.id===actionId);if(!action)return;
    if(action.plAction&&activeParty){
      let candidates=activeParty.members.filter(m=>entities[m]?.parent===selId);
      if(action.requiresItem)candidates=candidates.filter(m=>entities[action.requiresItem]?.parent===m);
      if(action.requiresKnowledge)candidates=candidates.filter(m=>{const pc=entities[m];const kc=pc?.categories.find(c=>c.name==="知識");return kc&&Array.isArray(kc.current)&&kc.current.includes(action.requiresKnowledge)});
      if(candidates.length===0)executeWithActor(action.name,action.effects,eid,action.description||null,action.roll||null,null);
      else if(candidates.length===1)executeWithActor(action.name,action.effects,eid,action.description||null,action.roll||null,candidates[0]);
      else{setActorPick({entityId:eid,actionId,actionName:action.name,roll:action.roll,candidates});return}
    }else executeWithActor(action.name,action.effects,eid,action.description||null,action.roll||null,null);
  },[entities,activeParty,selId,executeWithActor]);

  const handleActorConfirm=useCallback(pcId=>{if(!actorPick)return;const ent=entities[actorPick.entityId];const action=ent?.actions.find(a=>a.id===actorPick.actionId);if(!action)return;setActorPick(null);executeWithActor(action.name,action.effects,actorPick.entityId,action.description||null,action.roll||null,pcId)},[actorPick,entities,executeWithActor]);
  const handleSetVal=useCallback((eid,catName,value)=>{const ent=entities[eid];const label=catName==="居場所"?`${ent.name}: 居場所 → ${entities[value]?.name||value}`:`${ent.name}: ${catName} → ${value}`;executeWithActor(label,[{type:"set",entity:eid,category:catName,value}],eid,null,null,null)},[entities,executeWithActor]);
  const handleShareKnowledge=useCallback((knowledge,toPcIds)=>{const effects=toPcIds.map(pcId=>({type:"set",entity:pcId,category:"知識",value:knowledge}));const names=toPcIds.map(id=>entities[id]?.name||id).join(", ");executeWithActor(`情報共有: ${knowledge}`,effects,toPcIds[0],`「${knowledge}」の情報を${names}に共有した。`,null,null)},[entities,executeWithActor]);
  const handleNavigate=useCallback(locationId=>{const loc=entities[locationId];if(loc&&!isLocationAccessible(loc,entities))return;if(!activeParty)return;const prior=clone(entities);const newEnts=clone(entities);for(const m of activeParty.members){if(newEnts[m])newEnts[m].parent=locationId}const autoFired=runStabilize(newEnts);setEntities(newEnts);const locName=entities[locationId]?.name||locationId;setHistory(h=>[...h,{priorEntities:prior,tree:{root:`${locName}へ移動`,autoFired:autoFired.map(a=>a.name)}}]);setSelId(locationId);const time=timeStr();const newLogs=[];const sd=computeFullProjection(newEnts,locationId);if(sd)newLogs.push({time,name:`${locName}に到着`,desc:sd,roll:null,auto:false,location:locName,actor:null});for(const af of autoFired){if(af.desc)newLogs.push({time,name:af.name,desc:af.desc,roll:null,auto:true,location:locName,actor:null})}if(newLogs.length>0)setDescLog(prev=>[...prev,...newLogs])},[entities,activeParty]);
  const handleUndo=useCallback(()=>{if(history.length===0)return;setEntities(history[history.length-1].priorEntities);setHistory(h=>h.slice(0,-1));setActorPick(null)},[history]);
  const handleDrop=useCallback((targetId,sourceId)=>{setDragOver(null);if(!sourceId||sourceId===targetId)return;if(getDescendants(entities,sourceId).some(d=>d.id===targetId))return;if(entities[sourceId].parent===targetId)return;executeWithActor(`${entities[sourceId].name}: 居場所 → ${entities[targetId]?.name}`,[{type:"set",entity:sourceId,category:"居場所",value:targetId}],sourceId,null,null,null)},[entities,executeWithActor]);

  const handleAddEntity=(parentId)=>{setAddingTo(parentId)};
  const confirmAddEntity=()=>{if(!newEntName.trim())return;const id=uid();const tmpl=clone(templates[newEntType]||templates["空"]);setEntities(prev=>({...prev,[id]:{id,name:newEntName.trim(),parent:addingTo,...tmpl}}));if(newEntType==="PC"&&activeParty){setParties(prev=>prev.map(p=>p.id===activePartyId?{...p,members:[...p.members,id]}:p))}setNewEntName("");setAddingTo(null);setNewEntType("場所");setSelId(id)};
  const handleSplitConfirm=useCallback(()=>{if(splitSelection.size===0||!activeParty)return;const remaining=activeParty.members.filter(m=>!splitSelection.has(m));if(remaining.length===0)return;const newId="p"+Date.now();setParties(prev=>prev.map(p=>p.id===activePartyId?{...p,members:remaining}:p).concat({id:newId,name:"別動隊",members:[...splitSelection]}));setActivePartyId(newId);const first=entities[[...splitSelection][0]];if(first?.parent)setSelId(first.parent);setSplitMode(false);setSplitSelection(new Set())},[splitSelection,activeParty,activePartyId,entities]);
  const handleMerge=useCallback(()=>{if(mergeableParties.length===0)return;const mergeIds=new Set(mergeableParties.map(p=>p.id));const merged=parties.filter(p=>mergeIds.has(p.id)).flatMap(p=>p.members);const newMembers=[...activeParty.members,...merged];const prior=clone(entities);const newEnts=clone(entities);for(const m of merged){if(newEnts[m])newEnts[m].parent=activeLoc}const autoFired=runStabilize(newEnts);setEntities(newEnts);setHistory(h=>[...h,{priorEntities:prior,tree:{root:"パーティ合流",autoFired:autoFired.map(a=>a.name)}}]);setParties(prev=>prev.filter(p=>!mergeIds.has(p.id)).map(p=>p.id===activePartyId?{...p,members:newMembers}:p))},[mergeableParties,parties,activeParty,activePartyId,activeLoc,entities]);

  const handleAddToParty=useCallback((entityId)=>{if(!activeParty)return;setParties(prev=>prev.map(p=>p.id===activePartyId?{...p,members:[...p.members,entityId]}:p))},[activeParty,activePartyId]);

  const roots=Object.values(entities).filter(e=>e.parent===null);
  const sTab=a=>({flex:1,padding:"6px 0",textAlign:"center",fontSize:11,fontFamily:font,cursor:"pointer",letterSpacing:.5,color:a?C.acc:C.tx3,background:a?C.bg2:C.bg1,borderBottom:a?`2px solid ${C.acc}`:`2px solid transparent`});

  return(<div style={{display:"flex",height:"100vh",width:"100%",background:C.bg0,color:C.tx,overflow:"hidden"}}>
    <div style={{width:180,minWidth:180,borderRight:`1px solid ${C.bdr}`,background:C.bg1,overflow:"auto",flexShrink:0}}>
      <div style={{padding:"8px 12px",fontSize:11,color:C.tx3,fontFamily:font,borderBottom:`1px solid ${C.bdr}`,letterSpacing:1,display:"flex",justifyContent:"space-between",alignItems:"center"}}>
        <span>ツリー</span><button onClick={()=>handleAddEntity(null)} style={sEBtn}>＋</button>
      </div>
      {roots.map(r=><TreeNode key={r.id} eid={r.id} ents={entities} sel={selId} pcLocs={pcLocs} onSel={setSelId} onDragOver={setDragOver} onDrop={handleDrop} dragOver={dragOver}/>)}
      {selId&&<div style={{padding:"6px 12px",borderTop:`1px solid ${C.bdr}`}}>
        <button onClick={()=>handleAddEntity(selId)} style={{...sEBtn,width:"100%",textAlign:"center",padding:"4px 0"}}>＋ {entities[selId]?.name}に追加</button>
      </div>}
      {addingTo!==null&&(
        <div style={{padding:"6px 12px",background:C.editBg,borderTop:`1px solid ${C.edit}33`}}>
          <div style={{fontSize:11,color:C.edit,fontFamily:font,marginBottom:4}}>新規エンティティ{addingTo?` (${entities[addingTo]?.name}内)`:" (ルート)"}</div>
          <div style={{display:"flex",gap:4,marginBottom:4}}>
            {Object.keys(templates).map(t=>(<button key={t} onClick={()=>setNewEntType(t)} style={{background:newEntType===t?C.edit:C.bg3,color:newEntType===t?"#000":C.tx2,border:"none",borderRadius:3,padding:"2px 8px",fontSize:11,cursor:"pointer",fontFamily:font,fontWeight:newEntType===t?600:400}}>{t}</button>))}
          </div>
          <div style={{display:"flex",gap:4}}>
            <input value={newEntName} onChange={e=>setNewEntName(e.target.value)} onKeyDown={e=>{if(e.key==="Enter")confirmAddEntity()}} placeholder="名前" style={{...sIn,flex:1}} autoFocus/>
            <button onClick={confirmAddEntity} style={sEBtn}>追加</button>
            <button onClick={()=>{setAddingTo(null);setNewEntName("")}} style={{...sBtn,fontSize:10}}>✕</button>
          </div>
        </div>
      )}
    </div>
    <div style={{flex:1,overflow:"hidden",display:"flex",flexDirection:"column"}}>
      <div style={{padding:"5px 12px",background:C.bg2,borderBottom:`1px solid ${C.bdr}`,display:"flex",gap:6,alignItems:"center",flexShrink:0,flexWrap:"wrap"}}>
        <span style={{fontSize:11,color:C.tx3,fontFamily:font}}>パーティ:</span>
        {parties.map(p=>(<button key={p.id} onClick={()=>{setActivePartyId(p.id);const fm=entities[p.members[0]];if(fm?.parent)setSelId(fm.parent)}} style={{background:activePartyId===p.id?C.accDim:C.bg3,color:activePartyId===p.id?"#fff":C.tx2,border:activePartyId===p.id?`1px solid ${C.acc}`:`1px solid ${C.bdr}`,borderRadius:4,padding:"3px 10px",fontSize:12,cursor:"pointer",fontFamily:font}}>{p.name} ({p.members.map(m=>entities[m]?.name||m).join(", ")})</button>))}
        <span style={{marginLeft:"auto",display:"flex",gap:4}}>
          {activeParty&&activeParty.members.length>1&&!splitMode&&<button onClick={()=>setSplitMode(true)} style={sBtn}>分割</button>}
          {mergeableParties.length>0&&!splitMode&&<button onClick={handleMerge} style={sBtn}>合流</button>}
        </span>
      </div>
      {splitMode&&activeParty&&(<div style={{padding:"8px 12px",background:C.warnBg,borderBottom:`1px solid ${C.warn}55`,display:"flex",gap:8,alignItems:"center",flexShrink:0}}>
        <span style={{fontSize:12,color:C.warn,fontFamily:font}}>別行動:</span>
        {activeParty.members.map(m=>(<label key={m} style={{fontSize:12,color:C.tx,fontFamily:font,cursor:"pointer",display:"flex",alignItems:"center",gap:3}}><input type="checkbox" checked={splitSelection.has(m)} onChange={ev=>{const n=new Set(splitSelection);ev.target.checked?n.add(m):n.delete(m);setSplitSelection(n)}}/>{entities[m]?.name||m}</label>))}
        <button onClick={handleSplitConfirm} disabled={splitSelection.size===0||splitSelection.size===activeParty.members.length} style={{background:splitSelection.size>0&&splitSelection.size<activeParty.members.length?C.warn:C.bg3,color:splitSelection.size>0&&splitSelection.size<activeParty.members.length?"#000":C.tx3,border:"none",borderRadius:3,padding:"3px 10px",fontSize:12,cursor:"pointer",fontFamily:font,fontWeight:600}}>確定</button>
        <button onClick={()=>{setSplitMode(false);setSplitSelection(new Set())}} style={sBtn}>キャンセル</button>
      </div>)}
      <div style={{flex:1,overflow:"hidden"}}>
        <MainPanel eid={selId} ents={entities} parties={parties} activePartyId={activePartyId}
          onAction={handleAction} onNavigate={handleNavigate} onSetVal={handleSetVal} onShareKnowledge={handleShareKnowledge}
          actorPick={actorPick} onActorConfirm={handleActorConfirm} onActorCancel={()=>setActorPick(null)} onChange={setEntities} lastAction={lastAction} descLog={descLog} onAddToParty={handleAddToParty}/>
      </div>
    </div>
    <div style={{width:260,minWidth:260,borderLeft:`1px solid ${C.bdr}`,background:C.bg1,overflow:"auto",flexShrink:0}}>
      <div style={{display:"flex",borderBottom:`1px solid ${C.bdr}`}}>
        <div style={sTab(sideTab==="pending")} onClick={()=>setSideTab("pending")}>⚡ 待機中 {pending.length>0&&`(${pending.length})`}</div>
        <div style={sTab(sideTab==="history")} onClick={()=>setSideTab("history")}>履歴</div>
      </div>
      {sideTab==="pending"?<PendingPanel pending={pending} ents={entities} onGrant={handleSetVal}/>
        :<HistoryPanel history={history} onUndo={handleUndo}/>}
    </div>
  </div>);
}
