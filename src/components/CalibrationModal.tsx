import React, { useState, useRef, useEffect } from 'react'

interface CalibrationModalProps {
  onCalibrate: (pixelsPerCm: number) => void
  onClose: () => void
  currentPixelsPerCm?: number
}

const CalibrationModal: React.FC<CalibrationModalProps> = ({ 
  onCalibrate, 
  onClose,
  currentPixelsPerCm 
}) => {
  const [numerator, setNumerator] = useState(10) // Default numerator
  const [denominator, setDenominator] = useState(10) // Default denominator
  const modalRef = useRef<HTMLDivElement>(null)

  const handleClickOutside = (event: React.MouseEvent<HTMLDivElement>) => {
    if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
      onClose()
    }
  }

  useEffect(() => {
    const handleDocumentClick = (event: MouseEvent) => {
      if (modalRef.current && !modalRef.current.contains(event.target as Node)) {
        onClose()
      }
    }

    document.addEventListener('mousedown', handleDocumentClick)
    return () => {
      document.removeEventListener('mousedown', handleDocumentClick)
    }
  }, [onClose])

  const calculateMmPerPixel = (pixelsPerCm: number) => {
    return (10 / pixelsPerCm).toFixed(3) // 10mm = 1cm
  }

  const handleNumeratorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    if (!isNaN(value) && value > 0) {
      setNumerator(value)
    }
  }

  const handleDenominatorChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = parseFloat(e.target.value)
    if (!isNaN(value) && value > 0) {
      setDenominator(value)
    }
  }

  return (
    <div className="calibration-modal" onClick={handleClickOutside}>
      <div className="modal-content" ref={modalRef} onClick={(e) => e.stopPropagation()}>
        <div className="modal-header">
          <h2>Screen Calibration</h2>
        </div>
        
        <div className="modal-body">
          {currentPixelsPerCm && (
            <div className="current-calibration">
              <p>Current calibration:</p>
              <div className="calibration-values">
                <div>{currentPixelsPerCm.toFixed(5)} pixels/cm</div>
                <div>{calculateMmPerPixel(currentPixelsPerCm)} mm/pixel</div>
              </div>
            </div>
          )}
          
          <div className="calibration-methods">
            {currentPixelsPerCm && (
              <div className="method">
                <h3>Adjust Current Calibration</h3>
                <p>
                  Fine-tune the current calibration by setting a ratio.
                  For example, to make measurements 10% larger, set 11 / 10.
                </p>
                <div className="control ratio-control">
                  <div className="ratio-inputs">
                    <input
                      type="number"
                      value={numerator}
                      onChange={handleNumeratorChange}
                      min="0.1"
                      step="0.1"
                    />
                    <span className="ratio-divider">/</span>
                    <input
                      type="number"
                      value={denominator}
                      onChange={handleDenominatorChange}
                      min="0.1"
                      step="0.1"
                    />
                  </div>
                  <div className="ratio-preview">
                    Current adjustment: {((numerator / denominator) * 100).toFixed(1)}%
                  </div>
                  {numerator !== denominator && (
                    <div className="new-calibration-preview">
                      New calibration will be:
                      <div className="calibration-values">
                        <div>{(currentPixelsPerCm * (numerator / denominator)).toFixed(2)} pixels/cm</div>
                        <div>{calculateMmPerPixel(currentPixelsPerCm * (numerator / denominator))} mm/pixel</div>
                      </div>
                    </div>
                  )}
                  <button onClick={() => onCalibrate(currentPixelsPerCm * (numerator / denominator))}>
                    Apply
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>
        
        {/* <div className="modal-footer">
          <button onClick={handleCalibrate}>Calibrate</button>
          <button onClick={onClose}>Cancel</button>
        </div> */}
      </div>
    </div>
  )
}

export default CalibrationModal 