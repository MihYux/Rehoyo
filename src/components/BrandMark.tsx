import logoUrl from '../../ReHoYo_Logo.png'

interface BrandMarkProps {
  compact?: boolean
}

export function BrandMark({ compact = false }: BrandMarkProps) {
  return (
    <div className={`brand-mark ${compact ? 'brand-mark--compact' : ''}`}>
      <div className="brand-mark__plate">
        <img src={logoUrl} alt="ReHoYo" />
      </div>
      {!compact && (
        <div className="brand-mark__descriptor">
          <span>GLOBAL PLAYER INTELLIGENCE</span>
          <small>全球玩家洞察指挥中心</small>
        </div>
      )}
    </div>
  )
}
