import { ArrowLeft, ArrowRight, Check, Flag, MagicWand, Package, Sparkle } from '@phosphor-icons/react'
import { useMemo, useState, type FormEvent } from 'react'
import { BrandMark } from '../../components/BrandMark'
import { createReleaseProject, type Objective, type ReleaseProject, type SellingPoint, type VersionReleaseBrief } from '../../domain/release-project'

interface Props {
  onCreate: (project: ReleaseProject) => void
}

type BudgetLevel = VersionReleaseBrief['budgetLevel']
type RiskPreference = VersionReleaseBrief['riskPreference']

interface DemoBriefPreset {
  game: string
  code: string
  version: string
  releaseAt: string
  updateName: string
  objective: Objective
  pointType: SellingPoint['type']
  sellingPointName: string
  sellingPointDescription: string
  assets: string[]
  budgetLevel: BudgetLevel
  riskPreference: RiskPreference
  allowCharacter: boolean
}

const demoBriefPresets: DemoBriefPreset[] = [
  {
    game: '崩坏：星穹铁道', code: 'HSR', version: '2.0', releaseAt: '2024-02-06', updateName: '假如在午夜入梦',
    objective: 'recall', pointType: 'character', sellingPointName: '黑天鹅与匹诺康尼故事',
    sellingPointDescription: '围绕匹诺康尼世界观、黑天鹅角色内容与已公开剧情信息建立版本发行主轴。',
    assets: ['版本PV', 'KV', '角色设定与审核模板'], budgetLevel: 'medium', riskPreference: 'balanced', allowCharacter: true,
  },
  {
    game: '原神', code: 'GI', version: '5.0', releaseAt: '2024-08-28', updateName: '荣花与炎日之途',
    objective: 'activity', pointType: 'map', sellingPointName: '纳塔全新区域与角色故事',
    sellingPointDescription: '围绕纳塔新区域、探索体验与已公开角色内容建立全球发行主轴，并根据真实区域讨论调整表达。',
    assets: ['版本PV', 'KV', '角色设定与审核模板'], budgetLevel: 'medium', riskPreference: 'balanced', allowCharacter: true,
  },
  {
    game: '绝区零', code: 'ZZZ', version: '1.1', releaseAt: '2024-08-14', updateName: '卧底蓝调',
    objective: 'activity', pointType: 'story', sellingPointName: '新艾利都治安局剧情篇章',
    sellingPointDescription: '围绕治安局阵营、新剧情章节与已公开角色内容建立版本发行主轴，并验证不同地区的关注差异。',
    assets: ['版本PV', 'KV', '角色设定与审核模板'], budgetLevel: 'medium', riskPreference: 'balanced', allowCharacter: true,
  },
]

const defaultPreset = demoBriefPresets.find((preset) => preset.code === 'HSR') ?? demoBriefPresets[0]

const objectiveLabels: Record<Objective, string> = {
  acquisition: '获取新增玩家', activity: '提升版本活跃', recall: '召回流失玩家', revenue: '支持营收目标',
}

export function ReleaseProjectForm({ onCreate }: Props) {
  const [game, setGame] = useState(defaultPreset.game)
  const [customGame, setCustomGame] = useState('')
  const [showCustom, setShowCustom] = useState(false)
  const [version, setVersion] = useState(defaultPreset.version)
  const [releaseAt, setReleaseAt] = useState(defaultPreset.releaseAt)
  const [updateName, setUpdateName] = useState(defaultPreset.updateName)
  const [objective, setObjective] = useState<Objective>(defaultPreset.objective)
  const [pointType, setPointType] = useState<SellingPoint['type']>(defaultPreset.pointType)
  const [sellingPointName, setSellingPointName] = useState(defaultPreset.sellingPointName)
  const [sellingPointDescription, setSellingPointDescription] = useState(defaultPreset.sellingPointDescription)
  const [assets, setAssets] = useState<string[]>(defaultPreset.assets)
  const [regions, setRegions] = useState<Array<'CN' | 'JP' | 'WEST'>>(['CN', 'JP', 'WEST'])
  const [budgetLevel, setBudgetLevel] = useState<BudgetLevel>(defaultPreset.budgetLevel)
  const [riskPreference, setRiskPreference] = useState<RiskPreference>(defaultPreset.riskPreference)
  const [allowCharacter, setAllowCharacter] = useState(defaultPreset.allowCharacter)
  const [error, setError] = useState('')
  const chosenGame = showCustom ? customGame.trim() : game

  const steps = useMemo(() => [
    { number: '01', label: '版本内容' },
    { number: '02', label: '发行目标' },
    { number: '03', label: '核心卖点' },
    { number: '04', label: '资产与边界' },
  ], [])

  function applyDemoPreset(preset: DemoBriefPreset) {
    setGame(preset.game)
    setShowCustom(false)
    setVersion(preset.version)
    setReleaseAt(preset.releaseAt)
    setUpdateName(preset.updateName)
    setObjective(preset.objective)
    setPointType(preset.pointType)
    setSellingPointName(preset.sellingPointName)
    setSellingPointDescription(preset.sellingPointDescription)
    setAssets([...preset.assets])
    setRegions(['CN', 'JP', 'WEST'])
    setBudgetLevel(preset.budgetLevel)
    setRiskPreference(preset.riskPreference)
    setAllowCharacter(preset.allowCharacter)
    setError('')
  }

  function useCustomGame() {
    setShowCustom(true)
    setGame('')
    setCustomGame('')
  }

  function toggleAsset(asset: string) {
    setAssets((current) => current.includes(asset) ? current.filter((item) => item !== asset) : [...current, asset])
  }

  function toggleRegion(region: 'CN' | 'JP' | 'WEST') {
    setRegions((current) => current.includes(region) ? current.filter((item) => item !== region) : [...current, region])
  }

  function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault()
    try {
      const pointName = sellingPointName.trim()
      const brief: VersionReleaseBrief = {
        primaryObjective: objective,
        secondaryObjectives: [],
        activityExpectation: 'medium',
        revenueExpectation: 'medium',
        sellingPoints: [{
          id: `selling-point-${pointType}`,
          type: pointType,
          name: pointName,
          description: sellingPointDescription.trim(),
          priority: 'primary',
          regionalAdjustmentAllowed: true,
          regions,
          assetIds: assets,
        }],
        availableAssets: assets,
        budgetLevel,
        teamCapacity: ['发行策划', '社媒运营'],
        mandatoryActions: assets.includes('版本PV') ? ['版本PV'] : [],
        prohibitedActions: ['未经审核的自由角色聊天', '未经验证的商业效果承诺'],
        riskPreference,
        allowCharacterRelationshipPilot: allowCharacter,
      }
      const project = createReleaseProject({
        game: chosenGame,
        version,
        updateName,
        releaseAt: `${releaseAt}T00:00:00.000Z`,
        cycleDays: 42,
        regions,
        brief,
      })
      setError('')
      onCreate(project)
    } catch (submitError) {
      setError(submitError instanceof Error ? submitError.message : '无法创建项目。')
    }
  }

  return (
    <div className="release-create-page">
      <header className="release-simple-header">
        <a href="#/" aria-label="返回项目大厅"><ArrowLeft size={19} /></a>
        <BrandMark compact />
        <div><span>NEW RELEASE PROJECT</span><strong>输入新版本内容</strong></div>
        <p>业务输入会与公开玩家证据分开保存</p>
      </header>

      <nav className="release-progress" aria-label="版本Brief内容">
        {steps.map((step) => <a key={step.number} href={`#brief-${step.number}`}><span>{step.number}</span>{step.label}</a>)}
      </nav>

      <form className="release-brief-form" onSubmit={submit}>
        <section className="brief-chapter" id="brief-01" aria-labelledby="brief-title-01">
          <div className="brief-chapter__intro"><span>01 · VERSION</span><h1 id="brief-title-01">这次要发行什么？</h1><p>先说明版本事实。这里是团队业务输入，不会被包装成玩家观点。</p></div>
          <div className="brief-chapter__body">
            <div className="brief-autofill-note" role="status">
              <MagicWand size={22} />
              <div><strong>评委演示预设已填好</strong><span>已完成全部 4 步。可直接开始研究，也可以修改任意字段。</span></div>
              {!showCustom && <button type="button" onClick={() => applyDemoPreset(demoBriefPresets.find((preset) => preset.game === game) ?? defaultPreset)}>恢复预设</button>}
            </div>
            <fieldset className="brief-game-options"><legend>游戏</legend>
              {demoBriefPresets.map((preset) => <button type="button" key={preset.game} className={!showCustom && game === preset.game ? 'is-selected' : ''} aria-label={`选择游戏 ${preset.game}`} aria-pressed={!showCustom && game === preset.game} onClick={() => applyDemoPreset(preset)}><span>{preset.code}</span><strong>{preset.game}</strong><small>{preset.version} · {preset.updateName}</small>{!showCustom && game === preset.game && <Check size={16} />}</button>)}
            </fieldset>
            <button className="brief-text-link" type="button" onClick={() => showCustom ? applyDemoPreset(defaultPreset) : useCustomGame()}>{showCustom ? '使用演示预设' : '输入其他游戏'}</button>
            {showCustom && <label className="brief-field"><span>自定义游戏名称</span><input value={customGame} onChange={(event) => setCustomGame(event.target.value)} placeholder="输入游戏名称" /></label>}
            <div className="brief-field-row">
              <label className="brief-field"><span>版本号</span><input name="version" aria-label="版本号" required value={version} onChange={(event) => setVersion(event.target.value)} placeholder="例如 3.8" /></label>
              <label className="brief-field"><span>预计上线日期</span><input name="releaseAt" aria-label="预计上线日期" type="date" required value={releaseAt} onChange={(event) => setReleaseAt(event.target.value)} /></label>
            </div>
            <label className="brief-field"><span>更新名称</span><input name="updateName" aria-label="更新名称" required value={updateName} onChange={(event) => setUpdateName(event.target.value)} placeholder="用团队内部确认的版本名称" /></label>
          </div>
        </section>

        <section className="brief-chapter" id="brief-02" aria-labelledby="brief-title-02">
          <div className="brief-chapter__intro"><span>02 · OBJECTIVE</span><h2 id="brief-title-02">这次发行最重要的结果是什么？</h2><p>只设一个首要目标。Agent会用它判断动作是否偏离方向，不预测精确收入。</p></div>
          <div className="brief-chapter__body">
            <label className="brief-field"><span>首要发行目标</span><select aria-label="首要发行目标" value={objective} onChange={(event) => setObjective(event.target.value as Objective)}>{Object.entries(objectiveLabels).map(([value, label]) => <option key={value} value={value}>{label}</option>)}</select></label>
            <div className="brief-readout"><Flag size={21} /><div><span>Agent将优先检查</span><strong>{objectiveLabels[objective]}</strong><small>区域动作必须说明如何服务这个目标</small></div></div>
            <fieldset className="brief-region-options"><legend>目标区域</legend>{([['CN', '中国'], ['JP', '日本'], ['WEST', '北美及英语市场']] as const).map(([value, label]) => <label key={value}><input type="checkbox" checked={regions.includes(value)} onChange={() => toggleRegion(value)} /><span className={`fi fi-${value === 'CN' ? 'cn' : value === 'JP' ? 'jp' : 'us'}`} />{label}</label>)}</fieldset>
          </div>
        </section>

        <section className="brief-chapter" id="brief-03" aria-labelledby="brief-title-03">
          <div className="brief-chapter__intro"><span>03 · SELLING POINT</span><h2 id="brief-title-03">全球统一讲什么？</h2><p>先提交一个最重要的卖点。区域差异只会在真实证据支持时生成。</p></div>
          <div className="brief-chapter__body">
            <label className="brief-field"><span>核心卖点类型</span><select aria-label="核心卖点类型" value={pointType} onChange={(event) => setPointType(event.target.value as SellingPoint['type'])}><option value="character">新角色／角色内容</option><option value="map">新地图／世界探索</option><option value="story">新剧情</option><option value="gameplay">新玩法</option><option value="event">新活动</option><option value="quality">品质升级</option></select></label>
            <label className="brief-field"><span>核心卖点名称</span><input name="sellingPointName" aria-label="核心卖点名称" required value={sellingPointName} onChange={(event) => setSellingPointName(event.target.value)} placeholder="例如：三月七全新形态" /></label>
            <label className="brief-field"><span>核心卖点说明</span><textarea name="sellingPointDescription" aria-label="核心卖点说明" required rows={4} value={sellingPointDescription} onChange={(event) => setSellingPointDescription(event.target.value)} placeholder="只写已确认的版本内容与边界" /></label>
          </div>
        </section>

        <section className="brief-chapter" id="brief-04" aria-labelledby="brief-title-04">
          <div className="brief-chapter__intro"><span>04 · ASSETS & BOUNDARIES</span><h2 id="brief-title-04">Agent可以使用什么？</h2><p>资源和边界决定哪些动作只能建议、哪些可以进入受控预演。</p></div>
          <div className="brief-chapter__body">
            <fieldset className="brief-asset-options"><legend>可用发行资产</legend>{['版本PV', 'KV', '角色设定与审核模板'].map((asset) => <label key={asset}><input type="checkbox" checked={assets.includes(asset)} onChange={() => toggleAsset(asset)} aria-label={asset} /><Package size={18} /><span>{asset}</span></label>)}</fieldset>
            <div className="brief-field-row">
              <label className="brief-field"><span>预算档位</span><select name="budgetLevel" value={budgetLevel} onChange={(event) => setBudgetLevel(event.target.value as BudgetLevel)}><option value="low">低</option><option value="medium">中</option><option value="high">高</option></select></label>
              <label className="brief-field"><span>风险偏好</span><select name="riskPreference" value={riskPreference} onChange={(event) => setRiskPreference(event.target.value as RiskPreference)}><option value="conservative">保守</option><option value="balanced">平衡</option><option value="experimental">实验</option></select></label>
            </div>
            <label className="brief-character-toggle"><input type="checkbox" checked={allowCharacter} onChange={(event) => setAllowCharacter(event.target.checked)} aria-label="允许角色关系发行灰度预演" /><Sparkle size={21} /><span><strong>允许角色关系发行灰度预演</strong><small>仍需真实角色／剧情证据、审核资产和人工批准；不会连接真实玩家</small></span></label>
            {error && <p className="release-form-error" role="alert">{error}</p>}
            <button className="release-primary-action" type="submit"><span>开始区域研究</span><ArrowRight size={20} /></button>
          </div>
        </section>
      </form>
    </div>
  )
}
