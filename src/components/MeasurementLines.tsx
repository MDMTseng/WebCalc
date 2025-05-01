import React, { useState, useEffect, useCallback } from 'react'

interface Line {
  id: string
  position: number
  isHorizontal: boolean
}

interface Measurement {
  id: string
  value: number
  unit: string
  startLine: string
  endLine: string
  isHorizontal: boolean
}

interface MeasurementLinesProps {
  pixelsPerCm: number
  lines: Line[]
  onLinesChange: (lines: Line[]) => void
  showMeasurements: boolean
  onToggleMeasurements: () => void
}

const MeasurementLines: React.FC<MeasurementLinesProps> = ({ 
  pixelsPerCm, 
  lines,
  onLinesChange,
  showMeasurements,
  onToggleMeasurements
}) => {
  const [activeLine, setActiveLine] = useState<string | null>(null)
  const [measurements, setMeasurements] = useState<Measurement[]>([])
  const [initialDragInfo, setInitialDragInfo] = useState<{position: number, mousePosition: number} | null>(null)

  const handleMouseDown = (id: string, e: React.MouseEvent | React.TouchEvent) => {
    e.preventDefault()
    const line = lines.find(l => l.id === id)
    if (!line) return
    
    setActiveLine(id)
    const mousePosition = 'touches' in e 
      ? line.isHorizontal ? e.touches[0].clientY : e.touches[0].clientX
      : line.isHorizontal ? (e as React.MouseEvent).clientY : (e as React.MouseEvent).clientX

    setInitialDragInfo({
      position: line.position,
      mousePosition
    })
  }

  const handleDoubleClick = (e: React.MouseEvent | React.TouchEvent, id: string) => {
    e.preventDefault()
    e.stopPropagation()
    onLinesChange(lines.filter(line => line.id !== id))
  }

  const handleMove = useCallback((e: MouseEvent | TouchEvent) => {
    if (!activeLine || !initialDragInfo) return

    const activeMeasureLine = lines.find(line => line.id === activeLine)
    if (!activeMeasureLine) return

    // Get the current position
    const currentMousePosition = 'touches' in e
      ? activeMeasureLine.isHorizontal ? e.touches[0].clientY : e.touches[0].clientX
      : activeMeasureLine.isHorizontal ? (e as MouseEvent).clientY : (e as MouseEvent).clientX
    
    // Calculate the movement delta from the initial position
    const delta = currentMousePosition - initialDragInfo.mousePosition
    
    // Apply 1/3th of the movement for finer control
    const newPosition = initialDragInfo.position + (delta * 0.3)

    onLinesChange(
      lines.map(line =>
        line.id === activeLine
          ? {
              ...line,
              position: newPosition
            }
          : line
      )
    )
  }, [activeLine, initialDragInfo, lines, onLinesChange])

  const handleEnd = () => {
    setActiveLine(null)
    setInitialDragInfo(null)
  }

  // Calculate measurements between lines
  useEffect(() => {
    const horizontalLines = lines.filter(line => line.isHorizontal)
      .sort((a, b) => a.position - b.position)
    const verticalLines = lines.filter(line => !line.isHorizontal)
      .sort((a, b) => a.position - b.position)

    const newMeasurements: Measurement[] = []

    // Calculate horizontal measurements
    for (let i = 0; i < horizontalLines.length - 1; i++) {
      const distance = Math.abs(horizontalLines[i + 1].position - horizontalLines[i].position)
      const distanceCm = distance / pixelsPerCm
      newMeasurements.push({
        id: `${horizontalLines[i].id}-${horizontalLines[i + 1].id}`,
        value: Number(distanceCm.toFixed(2)),
        unit: 'cm',
        startLine: horizontalLines[i].id,
        endLine: horizontalLines[i + 1].id,
        isHorizontal: true
      })
    }

    // Calculate vertical measurements
    for (let i = 0; i < verticalLines.length - 1; i++) {
      const distance = Math.abs(verticalLines[i + 1].position - verticalLines[i].position)
      const distanceCm = distance / pixelsPerCm
      newMeasurements.push({
        id: `${verticalLines[i].id}-${verticalLines[i + 1].id}`,
        value: Number(distanceCm.toFixed(2)),
        unit: 'cm',
        startLine: verticalLines[i].id,
        endLine: verticalLines[i + 1].id,
        isHorizontal: false
      })
    }

    setMeasurements(newMeasurements)
  }, [lines, pixelsPerCm])

  useEffect(() => {
    if (activeLine) {
      window.addEventListener('mousemove', handleMove)
      window.addEventListener('mouseup', handleEnd)
      window.addEventListener('touchmove', handleMove)
      window.addEventListener('touchend', handleEnd)
    }

    return () => {
      window.removeEventListener('mousemove', handleMove)
      window.removeEventListener('mouseup', handleEnd)
      window.removeEventListener('touchmove', handleMove)
      window.removeEventListener('touchend', handleEnd)
    }
  }, [activeLine, handleMove])

  return (
    <>
      <div className="measurement-lines">
        {lines.map(line => (
          <div
            key={line.id}
            className={`measurement-line ${line.isHorizontal ? 'horizontal' : 'vertical'}`}
            style={{
              [line.isHorizontal ? 'top' : 'left']: `${line.position}px`
            }}
            onMouseDown={(e) => handleMouseDown(line.id, e)}
            onTouchStart={(e) => handleMouseDown(line.id, e)}
            onDoubleClick={(e) => handleDoubleClick(e, line.id)}
            onTouchEnd={(e) => {
              if (e.timeStamp - (e.currentTarget as any).lastTouch < 500) {
                handleDoubleClick(e, line.id)
              }
              (e.currentTarget as any).lastTouch = e.timeStamp
            }}
            title="Double-tap to delete, drag to move"
          />
        ))}

        {/* Measurement labels between lines */}
        {measurements.map(measurement => {
          const startLine = lines.find(l => l.id === measurement.startLine)
          const endLine = lines.find(l => l.id === measurement.endLine)
          if (!startLine || !endLine) return null

          const position = (startLine.position + endLine.position) / 2
          const value = `${measurement.value}${measurement.unit}`

          // For vertical measurements (between vertical lines), show at left and right
          // For horizontal measurements (between horizontal lines), show at top and bottom
          const styles = measurement.isHorizontal
            ? [
                {
                  left: '60px',
                  top: `${position}px`,
                  transform: 'translateY(-50%)'
                },
                {
                  right: '60px',
                  top: `${position}px`,
                  transform: 'translateY(-50%)'
                }
              ]
            : [
                {
                  top: '60px',
                  left: `${position}px`,
                  transform: 'translateX(-50%)'
                },
                {
                  bottom: '60px',
                  left: `${position}px`,
                  transform: 'translateX(-50%)'
                }
              ]

          return (
            <>
              {styles.map((style, index) => (
                <div
                  key={`${measurement.id}-${index}`}
                  className="measurement-label"
                  style={style}
                >
                  {value}
                </div>
              ))}
            </>
          )
        })}
      </div>

      {/* Measurements display in bottom right */}
      {false && lines.length >= 2 && (
        <div className={`measurements-display ${!showMeasurements ? 'minimized' : ''}`}>
          <div className="measurements-header">
            <h3>Measurements</h3>
            <button 
              className="minimize-button"
              onClick={onToggleMeasurements}
              title={showMeasurements ? 'Minimize' : 'Maximize'}
            >
              {showMeasurements ? '−' : '+'}
            </button>
          </div>
          {showMeasurements && (
            <div className="measurement-list">
              <div className="measurement-section">
                <h4>Horizontal</h4>
                {measurements.filter(m => m.isHorizontal).map(m => (
                  <div key={m.id} className="measurement-item">
                    {m.value}{m.unit}
                  </div>
                ))}
              </div>
              <div className="measurement-section">
                <h4>Vertical</h4>
                {measurements.filter(m => !m.isHorizontal).map(m => (
                  <div key={m.id} className="measurement-item">
                    {m.value}{m.unit}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      )}
    </>
  )
}

export default MeasurementLines 