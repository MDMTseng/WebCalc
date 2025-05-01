import React, { useEffect, useState } from 'react'

interface RulerProps {
  pixelsPerCm: number
  onCreateLine: (isHorizontal: boolean, position: number) => void
}

const Ruler: React.FC<RulerProps> = ({ pixelsPerCm, onCreateLine }) => {
  const [dimensions, setDimensions] = useState({ width: 0, height: 0 })
  const [isTouchDevice, setIsTouchDevice] = useState(false)

  useEffect(() => {
    const updateDimensions = () => {
      setDimensions({
        width: window.innerWidth,
        height: window.innerHeight
      })
    }

    // Detect touch device
    setIsTouchDevice('ontouchstart' in window)

    updateDimensions()
    window.addEventListener('resize', updateDimensions)
    return () => window.removeEventListener('resize', updateDimensions)
  }, [])

  // Calculate required ruler length in cm (add extra 10cm for safety)
  const horizontalLength = Math.ceil((dimensions.width - 50) / pixelsPerCm) + 10
  const verticalLength = Math.ceil((dimensions.height - 50) / pixelsPerCm) + 10
  
  const handleMouseClick = (e: React.MouseEvent, isVerticalRuler: boolean) => {
    if (isTouchDevice) return; // Skip on touch devices
    
    e.preventDefault()
    e.stopPropagation()
    
    const clientPosition = isVerticalRuler ? e.clientY : e.clientX
    const position = clientPosition - 50
    onCreateLine(isVerticalRuler, position)
  }

  const handleTouch = (e: React.TouchEvent, isVerticalRuler: boolean) => {
    e.preventDefault()
    e.stopPropagation()
    
    const clientPosition = isVerticalRuler ? e.touches[0].clientY : e.touches[0].clientX
    const position = clientPosition - 50
    onCreateLine(isVerticalRuler, position)
  }

  return (
    <div className="ruler">
      <div 
        className="horizontal-ruler"
        onClick={!isTouchDevice ? (e) => handleMouseClick(e, false) : undefined}
        onTouchStart={isTouchDevice ? (e) => handleTouch(e, false) : undefined}
        onTouchMove={(e) => e.preventDefault()}
      >
        {Array.from({ length: horizontalLength * 10 + 1 }).map((_, index) => {
          const isCm = index % 10 === 0
          const isMm5 = index % 5 === 0
          
          return (
            <div
              key={index}
              className={`tick ${isCm ? 'cm' : isMm5 ? 'mm5' : 'mm'}`}
              style={{
                left: `${(index * pixelsPerCm) / 10}px`
              }}
            >
              {isCm && <span className="label">{index / 10}</span>}
            </div>
          )
        })}
      </div>
      
      <div 
        className="vertical-ruler"
        onClick={!isTouchDevice ? (e) => handleMouseClick(e, true) : undefined}
        onTouchStart={isTouchDevice ? (e) => handleTouch(e, true) : undefined}
        onTouchMove={(e) => e.preventDefault()}
      >
        {Array.from({ length: verticalLength * 10 + 1 }).map((_, index) => {
          const isCm = index % 10 === 0
          const isMm5 = index % 5 === 0
          
          return (
            <div
              key={index}
              className={`tick ${isCm ? 'cm' : isMm5 ? 'mm5' : 'mm'}`}
              style={{
                top: `${(index * pixelsPerCm) / 10}px`
              }}
            >
              {isCm && <span className="label">{index / 10}</span>}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export default Ruler 