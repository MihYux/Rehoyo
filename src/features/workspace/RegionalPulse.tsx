import { motion } from 'motion/react'
import chinaFlag from 'flag-icons/flags/4x3/cn.svg'
import euFlag from 'flag-icons/flags/4x3/eu.svg'
import japanFlag from 'flag-icons/flags/4x3/jp.svg'
import usaFlag from 'flag-icons/flags/4x3/us.svg'
import type { AgentStatus, EvidenceRecord, RegionCode, Sentiment } from '../../domain/types'

type ResearchRegion = Exclude<RegionCode, 'GLOBAL'>

interface RegionDefinition {
  code: ResearchRegion
  label: string
  flagSources: string[]
  flagLabel: string
}

export interface RegionalVoice {
  region: ResearchRegion
  label: string
  count: number
  focus: string
  quote: string
  source: string
  sentiment: Sentiment | null
  sentimentLabel: string
}

const regionDefinitions: RegionDefinition[] = [
  { code: 'CN', label: '中国', flagSources: [chinaFlag], flagLabel: '中国旗帜' },
  { code: 'JP', label: '日本', flagSources: [japanFlag], flagLabel: '日本旗帜' },
  { code: 'WEST', label: '欧美', flagSources: [usaFlag, euFlag], flagLabel: '欧美地区旗帜：美国与欧盟' },
]

const sentimentLabels: Record<Sentiment, string> = {
  positive: '正向',
  neutral: '中性',
  negative: '负向',
}

const regionalStatusLabels: Record<AgentStatus, string> = {
  locked: '等待地区证据',
  queued: '等待地区证据',
  running: '地区 Agent 正在比对',
  handoff: '地区 Agent 正在比对',
  completed: '地区对比已完成',
  failed: '地区对比已停止',
}

function deriveTopTopic(evidence: EvidenceRecord[]) {
  const topicCounts = new Map<string, number>()
  evidence.forEach((item) => item.topics.forEach((topic) => {
    topicCounts.set(topic, (topicCounts.get(topic) ?? 0) + 1)
  }))

  return [...topicCounts.entries()]
    .sort((first, second) => second[1] - first[1])[0]?.[0]
}

function deriveDominantSentiment(evidence: EvidenceRecord[]) {
  const counts: Record<Sentiment, number> = { positive: 0, neutral: 0, negative: 0 }
  evidence.forEach((item) => { counts[item.sentiment] += 1 })
  const ordered = (Object.entries(counts) as Array<[Sentiment, number]>)
    .sort((first, second) => second[1] - first[1])
  if (!ordered[0] || ordered[0][1] === 0) return null
  if (ordered[1] && ordered[0][1] === ordered[1][1]) return null
  return ordered[0][0]
}

export function deriveRegionalVoices(evidence: EvidenceRecord[]): RegionalVoice[] {
  return regionDefinitions.map((definition) => {
    const regionalEvidence = evidence.filter((item) => item.region === definition.code)
    const latest = regionalEvidence.at(-1)
    const sentiment = deriveDominantSentiment(regionalEvidence)

    return {
      region: definition.code,
      label: definition.label,
      count: regionalEvidence.length,
      focus: deriveTopTopic(regionalEvidence) ?? `等待${definition.label}真实证据`,
      quote: latest?.excerptZh ?? '真实公开页面到达后，这里将显示代表性玩家观点。',
      source: latest?.source ?? '尚无可核验来源',
      sentiment,
      sentimentLabel: sentiment ? sentimentLabels[sentiment] : regionalEvidence.length ? '观点分化' : '等待分析',
    }
  })
}

function RegionFlag({ definition }: { definition: RegionDefinition }) {
  return (
    <span className={`regional-flag regional-flag--${definition.code.toLowerCase()}`} role="img" aria-label={definition.flagLabel}>
      {definition.flagSources.map((flagSource) => (
        <img src={flagSource} alt="" aria-hidden="true" key={flagSource} />
      ))}
    </span>
  )
}

interface RegionalPulseProps {
  evidence: EvidenceRecord[]
  regionalStatus: AgentStatus
}

export function RegionalPulse({ evidence, regionalStatus }: RegionalPulseProps) {
  const voices = deriveRegionalVoices(evidence)
  const coveredRegions = voices.filter((voice) => voice.count > 0).length
  const statusLabel = ['locked', 'queued'].includes(regionalStatus)
    ? coveredRegions === 3
      ? '三地证据已到达'
      : coveredRegions > 0
        ? '正在补齐地区证据'
        : regionalStatusLabels[regionalStatus]
    : regionalStatusLabels[regionalStatus]

  return (
    <motion.section
      className={`regional-pulse regional-pulse--${regionalStatus}`}
      aria-label="实时地区声音对比"
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      transition={{ duration: 0.16 }}
    >
      <header className="regional-pulse__header">
        <div>
          <span>GLOBAL VOICES / LIVE</span>
          <h2>此刻，各地区在讨论什么</h2>
        </div>
        <div className="regional-pulse__status">
          <i aria-hidden="true" />
          <strong>{statusLabel}</strong>
          <small>已形成 {coveredRegions} / 3 个地区视角</small>
        </div>
      </header>

      <div className="regional-voice-grid">
        {voices.map((voice, index) => {
          const definition = regionDefinitions[index]
          return (
            <motion.article
              className={`regional-voice regional-voice--${voice.region.toLowerCase()}${voice.count ? '' : ' is-waiting'}`}
              data-testid={`regional-voice-${voice.region}`}
              key={voice.region}
              initial={{ opacity: 0 }}
              animate={{ opacity: 1 }}
              transition={{ duration: 0.14, delay: index * 0.035 }}
            >
              <header>
                <RegionFlag definition={definition} />
                <div><strong>{voice.label}</strong><small>{voice.region} MARKET</small></div>
                <span>{voice.count} 条证据</span>
              </header>
              <div className="regional-voice__focus">
                <span>玩家主要关注</span>
                <strong>{voice.focus}</strong>
              </div>
              <blockquote>{voice.quote}</blockquote>
              <footer>
                <span className={voice.sentiment ? `sentiment-${voice.sentiment}` : ''}>{voice.sentimentLabel}</span>
                <small>{voice.source}</small>
              </footer>
            </motion.article>
          )
        })}
      </div>

      <div className="regional-contrast" aria-label="地区焦点对比">
        <strong>差异焦点</strong>
        {voices.map((voice) => <span key={voice.region}>{voice.label}：{voice.focus}</span>)}
      </div>
    </motion.section>
  )
}
