import { useState, useRef, useEffect, useCallback, PointerEvent } from 'react'
import './App.css'

interface Session {
  id: string;
  expression: string;
  answer: string;
}

// Helper to generate unique IDs
const generateId = () => {
  if (typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  } else {
    // Fallback for browsers that do not support crypto.randomUUID
    return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, function(c) {
      const r = Math.random() * 16 | 0;
      const v = c === 'x' ? r : (r & 0x3 | 0x8);
      return v.toString(16);
    });
  }
};

function App() {
  const initialSessionId = generateId();
  const [sessions, setSessions] = useState<Session[]>([
    { id: initialSessionId, expression: '', answer: '' }
  ]);
  const [activeSessionId, setActiveSessionId] = useState<string>(initialSessionId);
  const [isDegrees, setIsDegrees] = useState(true);
  const [isFunctionMode, setIsFunctionMode] = useState(false);
  
  const activeInputRef = useRef<HTMLInputElement>(null);

  // State for long press detection
  const longPressTimerRef = useRef<number | null>(null); // Use number for browser timeout ID
  const isLongPressTriggeredRef = useRef<boolean>(false);

  // --- State for Swipe-to-Delete ---
  const [pendingDeleteSessionId, setPendingDeleteSessionId] = useState<string | null>(null);
  const swipeStartXRef = useRef<number>(0);
  const swipeStartTimeRef = useRef<number>(0);
  const isSwipingRef = useRef<boolean>(false);
  const SWIPE_THRESHOLD = -60; // Min pixels to swipe left
  const SWIPE_DURATION_THRESHOLD = 500; // Max ms for a swipe

  // Use VirtualKeyboard API if available
  useEffect(() => {
    // Check if VirtualKeyboard API is supported
    if ("virtualKeyboard" in navigator) {
      // Virtual keyboard is supported - use the API
      console.log("VirtualKeyboard API is supported");
      
      // Hide keyboard when input is focused
      const handleFocus = () => {
        (navigator as any).virtualKeyboard?.hide();
      };
      
      if (activeInputRef.current) {
        // Set virtualKeyboardPolicy attribute directly
        activeInputRef.current.setAttribute('virtualKeyboardPolicy', 'manual');
        activeInputRef.current.addEventListener('focus', handleFocus);
      }
      
      return () => {
        if (activeInputRef.current) {
          activeInputRef.current.removeEventListener('focus', handleFocus);
        }
      };
    } else {
      console.log("VirtualKeyboard API is not supported");
    }
  }, [activeInputRef.current]);

  // --- Helper to update sessions immutably ---
  const updateSession = (id: string, updates: Partial<Session>) => {
    setSessions(prev => 
      prev.map(s => (s.id === id ? { ...s, ...updates } : s))
    );
  };

  // Find the active session (memoized for performance)
  const activeSession = useCallback(() => {
    return sessions.find(s => s.id === activeSessionId);
  }, [sessions, activeSessionId]);

  const focusInput = (position: number | null = null) => {
    setTimeout(() => {
      if (activeInputRef.current) {
        activeInputRef.current.focus();
        // Use value from the input directly for position calculation if needed
        const currentValLength = activeInputRef.current.value.length;
        const pos = position ?? activeInputRef.current.selectionStart ?? currentValLength;
        activeInputRef.current.setSelectionRange(pos, pos);
      }
    }, 0);
  };

  useEffect(() => {
    // Only try to focus if there IS an active session 
    // (might not be the case briefly during deletion/addition)
    if (activeSession()) {
        focusInput();
    }
  }, [activeSessionId, activeSession]); // Depend on activeSession callback

  const evaluate = (expr: string): number => {
    // Basic validation: prevent empty or operator-ending expressions
    // Allow trailing operators for live preview, but maybe show "..." or similar?
    // Let's evaluate directly and return NaN if invalid for now.
    // if (!expr || /[+\-*\/^%(]$/.test(expr)) {
    //   return NaN
    // }
    if (!expr) return NaN; // Cannot evaluate empty string

    // Clean up expression for evaluation (e.g., remove trailing operators)
    let cleanedExpr = expr.trim();
    if (/[+\-*\/^%(]$/.test(cleanedExpr)) {
      // Potentially remove trailing operator for calculation or return NaN
      // Let's return NaN for now to indicate incomplete expression
       return NaN; 
    }

    cleanedExpr = cleanedExpr.replace(/(\d+(\.\d+)?)%/g, '($1/100)');
    const prepared = cleanedExpr
      // Trigonometric functions
      .replace(/sin\(/g, `Math.${isDegrees ? 'sin(' : 'sin(Math.PI / 180 * '}`)
      .replace(/cos\(/g, `Math.${isDegrees ? 'cos(' : 'cos(Math.PI / 180 * '}`)
      .replace(/tan\(/g, `Math.${isDegrees ? 'tan(' : 'tan(Math.PI / 180 * '}`)
      // Inverse trigonometric functions
      .replace(/asin\(/g, `Math.asin(`)
      .replace(/acos\(/g, `Math.acos(`)
      .replace(/atan\(/g, `Math.atan(`)
      // Hyperbolic functions
      .replace(/sinh\(/g, `Math.sinh(`)
      .replace(/cosh\(/g, `Math.cosh(`)
      .replace(/tanh\(/g, `Math.tanh(`)
      // Constants
      .replace(/π/g, 'Math.PI')
      .replace(/e/g, 'Math.E')
      // Root functions
      .replace(/√\(/g, 'Math.sqrt(')
      .replace(/cbrt\(/g, 'Math.cbrt(')
      // Rounding functions
      .replace(/round\(/g, 'Math.round(')
      .replace(/floor\(/g, 'Math.floor(')
      .replace(/ceil\(/g, 'Math.ceil(')
      // Other functions
      .replace(/abs\(/g, 'Math.abs(')
      .replace(/log\(/g, 'Math.log10(')
      .replace(/ln\(/g, 'Math.log(')
      // Exponentiation
      .replace(/\^/g, '**')
    try {
      const calcResult = Function(`'use strict'; return (${prepared})`)()
      if (typeof calcResult !== 'number' || !isFinite(calcResult)) {
        return NaN; // Handle non-numeric or infinite results
      }
      return parseFloat(calcResult.toPrecision(12));
    } catch (error) {
      // console.error("Evaluation Error:", error);
      return NaN // Return NaN on syntax errors
    }
  }

  // useEffect to update *active* session's answer
  useEffect(() => {
    const currentActiveSession = activeSession();
    if (!currentActiveSession || currentActiveSession.id === pendingDeleteSessionId) return; // Don't eval if pending delete

    const calculatedResult = evaluate(currentActiveSession.expression);
    const newAnswer = isNaN(calculatedResult) ? '' : `= ${calculatedResult}`;

    // Only update if the answer actually changed
    if (currentActiveSession.answer !== newAnswer) {
        updateSession(activeSessionId, { answer: newAnswer });
    }
    // We depend on the result of activeSession(), which depends on sessions and activeSessionId
  }, [sessions, activeSessionId, isDegrees, activeSession, pendingDeleteSessionId]);

  // Handles inserting text into the *active* session at cursor position
  const insertText = (text: string) => {
    const session = activeSession();
    if (!session || !activeInputRef.current) return;

    const inputElement = activeInputRef.current;
    const start = inputElement.selectionStart ?? 0;
    const end = inputElement.selectionEnd ?? 0;
    const currentValue = session.expression; // Use state value

    let newValue;
    if (currentValue === '' || currentValue === 'Error') {
        newValue = text;
    } else {
        newValue = currentValue.substring(0, start) + text + currentValue.substring(end);
    }

    updateSession(activeSessionId, { expression: newValue });

    // Set cursor position after the inserted text
    const newCursorPos = start + text.length;
    setTimeout(() => focusInput(newCursorPos), 0);
  };

  // Input handlers call insertText (no change needed here)
  const handleInput = (value: string) => insertText(value);
  const handleFunction = (func: string) => insertText(func + '(');
  const handleSqrt = () => insertText('√(');
  const handlePi = () => insertText('π');

  // Handles direct typing in the *active* input field
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // This won't get called with readOnly, but kept for compatibility
    updateSession(activeSessionId, { expression: event.target.value });
  };

  // Equals button logic (remains simple: just focus)
  const handleEquals = () => {
    focusInput();
  }

  // Clear the *active* session (now primarily called by long press)
  const handleClear = () => {
    updateSession(activeSessionId, { expression: '', answer: '' });
    setTimeout(() => focusInput(0), 0); 
  }

  // Backspace in the *active* session (now primarily called by short press)
  const handleBackspace = () => {
    const session = activeSession();
    if (!session || !activeInputRef.current) return;

    const inputElement = activeInputRef.current;
    const start = inputElement.selectionStart ?? 0;
    const end = inputElement.selectionEnd ?? 0;
    const currentValue = session.expression; // Use state value

    let newValue;
    let newCursorPos = start;

    if (start === end) { 
      if (start === 0 || currentValue === 'Error') return; // Cannot backspace at start or from Error
      newValue = currentValue.substring(0, start - 1) + currentValue.substring(start);
      newCursorPos = start - 1;
    } else { 
      newValue = currentValue.substring(0, start) + currentValue.substring(end);
      newCursorPos = start;
    }
     // Reset to '0' if becomes empty
    // if (newValue === "") newValue = "0";

    updateSession(activeSessionId, { expression: newValue });
    setTimeout(() => focusInput(newCursorPos), 0);
  }

  // --- Backspace Long Press Handlers ---
  const startLongPressTimer = () => {
    isLongPressTriggeredRef.current = false; // Reset flag
    // Clear any existing timer
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
    }
    // Start new timer
    longPressTimerRef.current = setTimeout(() => {
      handleClear(); // Execute clear on long press
      isLongPressTriggeredRef.current = true; // Set flag
      // Optionally provide haptic feedback here if possible
    }, 1500); // 1.5 seconds for long press
  };

  const clearLongPressTimer = (isRelease: boolean = true) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    // If released and long press didn't fire, trigger short press (backspace)
    if (isRelease && !isLongPressTriggeredRef.current) {
      handleBackspace();
    }
  };

  // Cleanup timer on unmount
  useEffect(() => {
    return () => {
      if (longPressTimerRef.current) {
        clearTimeout(longPressTimerRef.current);
      }
    };
  }, []);

  // Toggle angle unit (no change needed)
  const handleToggleAngleUnit = () => {
    setIsDegrees(prev => !prev)
    focusInput();
  }
  
  // Cursor move in the *active* session
  const handleCursorMove = (direction: 'left' | 'right') => {
    if (!activeInputRef.current) return;
    const currentPosition = activeInputRef.current.selectionStart ?? 0;
    let newPosition = currentPosition;
    if (direction === 'left') {
      newPosition = Math.max(0, currentPosition - 1);
    } else if (direction === 'right') {
      newPosition = Math.min(activeInputRef.current.value.length, currentPosition + 1);
    }
    focusInput(newPosition);
  };

  // --- Session Management with Delete Logic ---
  const deleteSession = useCallback((idToDelete: string) => {
    setSessions(prev => {
      const remainingSessions = prev.filter(s => s.id !== idToDelete);
      if (remainingSessions.length === 0) {
        // If deleting the last one, add a new default session
        const newId = generateId();
        setActiveSessionId(newId);
        return [{ id: newId, expression: '', answer: '' }];
      } else {
        // If the deleted session was active, activate the previous one or the new last one
        if (activeSessionId === idToDelete) {
          const deletedIndex = prev.findIndex(s => s.id === idToDelete);
          const newActiveIndex = Math.max(0, deletedIndex - 1);
          setActiveSessionId(remainingSessions[newActiveIndex].id);
        }
      }
      return remainingSessions;
    });
    setPendingDeleteSessionId(null); // Ensure pending state is cleared after deletion
  }, [activeSessionId]); // Include activeSessionId dependency

  const handleSetActiveSession = useCallback((id: string) => {
    if (pendingDeleteSessionId && pendingDeleteSessionId !== id) {
      deleteSession(pendingDeleteSessionId);
    }
    setPendingDeleteSessionId(null); // Cancel pending delete on any activation
    setActiveSessionId(id);
  }, [pendingDeleteSessionId, deleteSession]);

  const addSession = () => {
    if (pendingDeleteSessionId) {
      deleteSession(pendingDeleteSessionId);
    }
    const newId = generateId();
    const newSession: Session = { id: newId, expression: '', answer: '' };
    setSessions(prev => [...prev, newSession]);
    setActiveSessionId(newId);
    setPendingDeleteSessionId(null); // Ensure no pending delete after adding
  };

  const handleCancelDelete = (e: React.MouseEvent) => {
      e.stopPropagation(); // Prevent triggering blur/activation
      setPendingDeleteSessionId(null);
  };

  // --- Pointer Event Handlers for Swipe ---
  const handlePointerDown = (e: PointerEvent<HTMLDivElement>, sessionId: string) => {
      // Only allow swipe on non-active sessions? Or always?
      // Let's allow always for now.
      if (pendingDeleteSessionId === sessionId) return; // Don't start swipe if already pending
      
      swipeStartXRef.current = e.clientX;
      swipeStartTimeRef.current = Date.now();
      isSwipingRef.current = true;
      // Capture pointer to track movement outside the element
      (e.target as Element).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: PointerEvent<HTMLDivElement>, sessionId: string) => {
      if (!isSwipingRef.current) return;

      const deltaX = e.clientX - swipeStartXRef.current;
      const elapsedTime = Date.now() - swipeStartTimeRef.current;

      if (deltaX < SWIPE_THRESHOLD && elapsedTime < SWIPE_DURATION_THRESHOLD) {
          // Sufficient left swipe detected
          if (pendingDeleteSessionId && pendingDeleteSessionId !== sessionId) {
            // If another was pending, delete it first
             deleteSession(pendingDeleteSessionId); 
          }
          setPendingDeleteSessionId(sessionId);
          isSwipingRef.current = false; // Stop tracking for this swipe
          // Release pointer capture after swipe detected
           (e.target as Element).releasePointerCapture(e.pointerId);
      }
      // Optional: Cancel swipe if moved too vertically or too slow?
  };

  const handlePointerUp = (e: PointerEvent<HTMLDivElement>) => {
      if (isSwipingRef.current) {
          isSwipingRef.current = false;
          // Release pointer capture if swipe didn't trigger pending delete
          if ((e.target as Element).hasPointerCapture(e.pointerId)) {
             (e.target as Element).releasePointerCapture(e.pointerId);
          }
      }
  };

  // Blur handler for session item
  const handleSessionBlur = (event: React.FocusEvent<HTMLDivElement>, sessionId: string) => {
    // Use timeout to allow cancel button click to register first
    setTimeout(() => {
      // Check if *this* session is still the one pending delete
      if (pendingDeleteSessionId === sessionId) {
        // Check where focus went. event.relatedTarget is the element receiving focus.
        const focusRecipient = event.relatedTarget;
        const sessionElement = event.currentTarget;

        // Only delete if focus moved *outside* the session item 
        // AND not onto the cancel button itself (or something inside it).
        let shouldDelete = true;
        if (focusRecipient && sessionElement.contains(focusRecipient as Node)) {
           // Focus moved to something *inside* the same session item (e.g., input, cancel btn)
           // If it moved specifically to the cancel button, definitely don't delete.
           if ((focusRecipient as Element).classList.contains('cancel-delete-button')) {
             shouldDelete = false;
           }
           // If focus moved elsewhere *within* the item, probably also don't delete yet.
           // Let activation of another session handle deletion if needed.
           shouldDelete = false; 
        }
        
        if (shouldDelete) {
          console.log(`Deleting session ${sessionId} due to blur to outside.`);
          deleteSession(sessionId);
        } else {
          // console.log(`Blur detected for ${sessionId}, but not deleting.`);
        }
      }
    }, 50); // Small delay
  };

  // Form submission handler
  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    handleEquals();
  };

  // Function to toggle between standard and function keypad
  const toggleFunctionMode = () => {
    setIsFunctionMode(!isFunctionMode);
  };

  return (
    <div className="app">
      <div className="calculator">
        {/* New Wrapper for Session Area */}
        <div className="session-area">
          {/* Container for all sessions */}
          <div className="sessions-list">
            {sessions.map((session) => (
              <div 
                key={session.id}
                className={`session-item ${session.id === activeSessionId ? 'active' : ''} ${session.id === pendingDeleteSessionId ? 'pending-delete' : ''}`}
                onClick={() => handleSetActiveSession(session.id)}
                onBlur={(e) => handleSessionBlur(e, session.id)}
                role="button" 
                tabIndex={0}
                onKeyDown={(e) => { if (e.key === 'Enter' || e.key === ' ') handleSetActiveSession(session.id); }}
              >
                <div className="display-container">
                  {session.id === activeSessionId ? (
                    <input
                      ref={activeInputRef}
                      type="text"
                      inputMode='none'
                      className="display-input"
                      value={session.expression}
                      onChange={handleInputChange}
                      aria-label={`Session ${session.id} Input`}
                      onClick={(e) => e.stopPropagation()}
                      placeholder="Enter expression"
                      onPointerDown={(e) => e.stopPropagation()}
                      // VirtualKeyboard policy is set via useEffect
                    />
                  ) : (
                    <input
                      type="text"
                      inputMode='none'
                      className="display-input inactive-expression"
                      value={session.expression}
                      readOnly
                      aria-label={`Session ${session.id} Display`}
                      placeholder={session.expression === '' ? "Empty" : undefined}
                      onClick={(e) => { 
                        handleSetActiveSession(session.id);
                        e.stopPropagation(); 
                      }}
                      onPointerDown={(e) => e.stopPropagation()}
                    />
                  )}
                  {session.id === pendingDeleteSessionId ? (
        <button 
                          type="button" 
                          className="cancel-delete-button" 
                          onClick={handleCancelDelete}
                      >
                          Cancel
                      </button>
                  ) : (
                      <div 
                          className="display-answer" 
                          aria-live="polite"
                          onPointerDown={(e) => handlePointerDown(e, session.id)}
                          onPointerMove={(e) => handlePointerMove(e, session.id)}
                          onPointerUp={handlePointerUp}
                          onPointerCancel={handlePointerUp}
                      >
                          {session.answer}
                      </div>
                  )}
                </div>
              </div>
            ))}
      </div>
      
          {/* Add Session Button - Low Profile */}
          <div className="add-session-container">
              <button type="button" className="add-session-button-low-profile" onClick={addSession}>
                + New Calculation
              </button>
          </div>
        </div> {/* End of session-area wrapper */}

        {/* Keypad Area */}
        <form onSubmit={handleSubmit} className="keypad-form">
          <div className="keypads-container">

            {/* Standard Keypad */}
            {!isFunctionMode && (
              <div className="keypad standard-mode">
                {/* --- Row 1 --- */}

                <button type="button" className="button function" onClick={toggleFunctionMode}>Fn</button>
                <button type="button" className="button function" onClick={() => handleFunction('sin')}>sin</button>
                <button type="button" className="button function" onClick={() => handleFunction('cos')}>cos</button>
                <button type="button" className="button function" onClick={() => handleFunction('tan')}>tan</button>
                <button type="button" className="button function" onClick={handlePi}>π</button>

                {/* --- Row 2 --- */}
                <button type="button" className="button function" onClick={handleToggleAngleUnit}>
                  {isDegrees ? 'DEG' : 'RAD'}
                </button>
                <button type="button" className="button function" onClick={() => handleInput('^')}>x^y</button>
                <button type="button" className="button function" onClick={handleSqrt}>√</button>
                <button type="button" className="button function" onClick={() => handleInput('(')}>(</button>
                <button type="button" className="button function" onClick={() => handleInput(')')}>)</button>

                {/* --- Row 3 --- */}
                <button type="button" className="button" onClick={() => handleInput('7')}>7</button>
                <button type="button" className="button" onClick={() => handleInput('8')}>8</button>
                <button type="button" className="button" onClick={() => handleInput('9')}>9</button>

                <button 
                  type="button" 
                  className="button" 
                  onMouseDown={startLongPressTimer}
                  onMouseUp={() => clearLongPressTimer(true)}
                  onMouseLeave={() => clearLongPressTimer(false)}
                  onTouchStart={startLongPressTimer}
                  onTouchEnd={() => clearLongPressTimer(true)}
                >
                  ⌫
                </button>
                <button type="button" className="button operator" onClick={() => handleInput('%')}>%</button>
                {/* --- Row 4 --- */}
                <button type="button" className="button" onClick={() => handleInput('4')}>4</button>
                <button type="button" className="button" onClick={() => handleInput('5')}>5</button>
                <button type="button" className="button" onClick={() => handleInput('6')}>6</button>
                <button type="button" className="button operator" onClick={() => handleInput('+')}>+</button>
                <button type="button" className="button operator" onClick={() => handleInput('*')}>×</button>
                {/* --- Row 5 --- */}

                <button type="button" className="button" onClick={() => handleInput('1')}>1</button>
                <button type="button" className="button" onClick={() => handleInput('2')}>2</button>
                <button type="button" className="button" onClick={() => handleInput('3')}>3</button>
                <button type="button" className="button operator" onClick={() => handleInput('-')}>-</button>
                <button type="button" className="button operator" onClick={() => handleInput('/')}>/</button>
                {/* --- Row 6 --- */}
                <button type="button" className="button" onClick={() => handleInput('0')}>0</button>
                <button type="button" className="button" onClick={() => handleInput('.')}>.</button>
                <button type="button" className="button function" onClick={() => handleCursorMove('left')}>&lt;</button>
                <button type="button" className="button function" onClick={() => handleCursorMove('right')}>&gt;</button>
        </div>
      )}

            {/* Function Keypad */}
            {isFunctionMode && (
              <div className="keypad standard-mode">
                {/* --- Row 1 --- */}
                <button type="button" className="button back-button" onClick={toggleFunctionMode}>←</button>
                <button type="button" className="button function abs-value" onClick={() => handleInput('abs(')}>|a|</button>
                <button type="button" className="button function" onClick={() => handleFunction('round')}>round</button>
                <button type="button" className="button function" onClick={() => handleInput('e')}>e</button>
                <button type="button" className="button function" onClick={handleToggleAngleUnit}>
                  {isDegrees ? 'DEG' : 'RAD'}
                </button>
                {/* --- Row 2 --- */}
                <button type="button" className="button function" onClick={() => handleFunction('log')}>log</button>
                <button type="button" className="button function" onClick={() => handleFunction('ln')}>ln</button>
                <button type="button" className="button function" onClick={() => handleFunction('floor')}>floor</button>
                <button type="button" className="button function" onClick={() => handleFunction('ceil')}>ceil</button>
                <button 
                  type="button" 
                  className="button" 
                  onMouseDown={startLongPressTimer}
                  onMouseUp={() => clearLongPressTimer(true)}
                  onMouseLeave={() => clearLongPressTimer(false)}
                  onTouchStart={startLongPressTimer}
                  onTouchEnd={() => clearLongPressTimer(true)}
                >
                  ⌫
                </button>
                {/* --- Row 3 --- */}
                <button type="button" className="button function" onClick={() => handleFunction('sinh')}>sinh</button>
                <button type="button" className="button function" onClick={() => handleFunction('cosh')}>cosh</button>
                <button type="button" className="button function" onClick={() => handleFunction('tanh')}>tanh</button>
                <button type="button" className="button function" onClick={() => handleInput('(')}>(</button>
                <button type="button" className="button function" onClick={() => handleInput(')')}>)</button>
                {/* --- Row 4 --- */}
                <button type="button" className="button function" onClick={() => handleFunction('asin')}>asin</button>
                <button type="button" className="button function" onClick={() => handleFunction('acos')}>acos</button>
                <button type="button" className="button function" onClick={() => handleFunction('atan')}>atan</button>
                <button type="button" className="button function" onClick={() => handleInput('Math.sqrt(')}>√</button>
                <button type="button" className="button function" onClick={() => handleInput('Math.cbrt(')}>∛</button>
                {/* --- Row 5 --- */}
                <button type="button" className="button function" onClick={() => handleInput('Math.random()')}>rand</button>
                <button type="button" className="button function" onClick={() => handleInput('Math.pow(')}>x^y</button>
                <button type="button" className="button function" onClick={() => handleInput('Math.abs(')}>abs</button>
                <button type="button" className="button function" onClick={() => handleInput('Math.E')}>e</button>
                <button type="button" className="button equals" onClick={handleEquals}>=</button>
                {/* --- Row 6 --- */}
                <button type="button" className="button operator" onClick={() => handleInput('+')} style={{ gridColumn: '1 / 3' }}>+</button>
                <button type="button" className="button operator" onClick={() => handleInput('-')}>-</button>
                <button type="button" className="button operator" onClick={() => handleInput('*')}>×</button>
                <button type="button" className="button operator" onClick={() => handleInput('/')}>/</button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

export default App 
