import { useState, useRef, useEffect, useCallback, PointerEvent, useLayoutEffect } from 'react'
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

// Local storage keys
const STORAGE_KEY_SESSIONS = 'webCalc_sessions';
const STORAGE_KEY_ACTIVE_SESSION = 'webCalc_activeSessionId';
const STORAGE_KEY_IS_DEGREES = 'webCalc_isDegrees';
const STORAGE_KEY_IS_FUNCTION_MODE = 'webCalc_isFunctionMode';

function App() {
  // Load saved data from localStorage or use defaults
  const loadSavedSessions = (): Session[] => {
    try {
      const savedSessions = localStorage.getItem(STORAGE_KEY_SESSIONS);
      if (savedSessions) {
        return JSON.parse(savedSessions);
      }
    } catch (error) {
      console.error('Error loading saved sessions:', error);
    }
    // Default if nothing saved or error occurs
    const initialSessionId = generateId();
    return [{ id: initialSessionId, expression: '', answer: '' }];
  };

  const loadSavedActiveSessionId = (): string => {
    try {
      const savedId = localStorage.getItem(STORAGE_KEY_ACTIVE_SESSION);
      if (savedId) {
        // Verify this ID exists in our saved sessions
        const sessions = loadSavedSessions();
        if (sessions.some(s => s.id === savedId)) {
          return savedId;
        }
      }
    } catch (error) {
      console.error('Error loading active session ID:', error);
    }
    // Default to first session if nothing saved or ID not found
    return loadSavedSessions()[0].id;
  };

  const loadSavedIsDegrees = (): boolean => {
    try {
      const savedIsDegrees = localStorage.getItem(STORAGE_KEY_IS_DEGREES);
      if (savedIsDegrees !== null) {
        return savedIsDegrees === 'true';
      }
    } catch (error) {
      console.error('Error loading angle unit setting:', error);
    }
    return true; // Default to degrees
  };

  const loadSavedIsFunctionMode = (): boolean => {
    try {
      const savedIsFunctionMode = localStorage.getItem(STORAGE_KEY_IS_FUNCTION_MODE);
      if (savedIsFunctionMode !== null) {
        return savedIsFunctionMode === 'true';
      }
    } catch (error) {
      console.error('Error loading function mode setting:', error);
    }
    return false; // Default to standard mode
  };

  // Initialize state with saved values
  const [sessions, setSessions] = useState<Session[]>(loadSavedSessions());
  const [activeSessionId, setActiveSessionId] = useState<string>(loadSavedActiveSessionId());
  const [isDegrees, setIsDegrees] = useState(loadSavedIsDegrees());
  const [isFunctionMode, setIsFunctionMode] = useState(loadSavedIsFunctionMode());
  
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

  // State and refs for cursor drag control
  const [isDraggingCursor, setIsDraggingCursor] = useState(false);
  const dragStartXRef = useRef(0);
  const dragLastPositionRef = useRef(0);
  const dragSensitivity = 16; // Pixels needed to move one character (less sensitive)

  // State for reset button countdown
  const [resetCountdown, setResetCountdown] = useState<number>(5);
  const resetButtonRef = useRef<HTMLButtonElement>(null);

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
    // Use a slightly longer timeout to ensure it happens after button focus events
    setTimeout(() => {
      if (activeInputRef.current) {
        activeInputRef.current.focus();
        // Use value from the input directly for position calculation if needed
        const currentValLength = activeInputRef.current.value.length;
        const pos = position ?? activeInputRef.current.selectionStart ?? currentValLength;
        activeInputRef.current.setSelectionRange(pos, pos);
      }
    }, 10); // Slightly longer timeout
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
      return parseFloat(calcResult.toFixed(10));
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
    
    // Format the result with fixed decimals
    let newAnswer = '';
    if (!isNaN(calculatedResult)) {
      // Format using toFixed(10) but remove trailing zeros
      const formattedResult = calculatedResult.toFixed(10).replace(/\.?0+$/, '');
      newAnswer = `= ${formattedResult}`;
    }

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
    focusInput(newCursorPos);
  };

  // Input handlers call insertText (no change needed here)
  const handleInput = (value: string) => {
    // resetResetCountdown();
    insertText(value);
  };

  const handleFunction = (func: string) => {
    // resetResetCountdown();
    insertText(func + '(');
  };

  const handleSqrt = () => {
    // resetResetCountdown();
    insertText('√(');
  };

  const handlePi = () => {
    // resetResetCountdown();
    insertText('π');
  };

  // Handles direct typing in the *active* input field
  const handleInputChange = (event: React.ChangeEvent<HTMLInputElement>) => {
    // This won't get called with readOnly, but kept for compatibility
    updateSession(activeSessionId, { expression: event.target.value });
  };

  // Equals button logic (remains simple: just focus)
  const handleEquals = () => {
    //resetResetCountdown();
    focusInput();
  };

  // Clear the *active* session (now primarily called by long press)
  const handleClear = () => {
    //resetResetCountdown();
    updateSession(activeSessionId, { expression: '', answer: '' });
    focusInput(0);
  };

  // Backspace in the *active* session (now primarily called by short press)
  const handleBackspace = () => {
    //resetResetCountdown();
    
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
    focusInput(newCursorPos);
  };

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
    }, 1000); // 1.5 seconds for long press
  };

  const clearLongPressTimer = (isRelease: boolean = true) => {
    if (longPressTimerRef.current) {
      clearTimeout(longPressTimerRef.current);
      longPressTimerRef.current = null;
    }
    // If released and long press didn't fire, trigger short press (backspace)
    if (isRelease && !isLongPressTriggeredRef.current) {
      console.log("clearLongPressTimer calling handleBackspace",isRelease);
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
    //resetResetCountdown();
    setIsDegrees(prev => !prev);
    focusInput();
  };
  
  // Cursor move in the *active* session
  const handleCursorMove = (direction: 'left' | 'right') => {
    //resetResetCountdown();
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
    resetResetCountdown();
    if (pendingDeleteSessionId && pendingDeleteSessionId !== id) {
      deleteSession(pendingDeleteSessionId);
    }
    setPendingDeleteSessionId(null); // Cancel pending delete on any activation
    setActiveSessionId(id);
  }, [pendingDeleteSessionId, deleteSession, resetCountdown]);

  const addSession = () => {
    //resetResetCountdown();
    if (pendingDeleteSessionId) {
      deleteSession(pendingDeleteSessionId);
    }
    const newId = generateId();
    const newSession: Session = { id: newId, expression: '', answer: '' };
    
    setSessions(prev => {
      // Find the index of the active session
      const activeIndex = prev.findIndex(s => s.id === activeSessionId);
      
      // Insert the new session right after the active session
      const updatedSessions = [...prev];
      updatedSessions.splice(activeIndex + 1, 0, newSession);
      
      return updatedSessions;
    });
    
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
    focusInput(); // Maintain focus when switching keypad modes
  };

  // Helper function to prevent focus loss on button clicks
  const preventFocusLoss = (e: React.MouseEvent | React.TouchEvent) => {
    // Prevent the default behavior that would focus the button
    e.preventDefault();
    // Stop propagation to prevent other handlers from potentially blurring
    e.stopPropagation();
  };

  // Add a useLayoutEffect hook to ensure the input maintains focus after DOM updates
  useLayoutEffect(() => {
    // This runs synchronously after DOM updates but before browser paint
    // Only focus if there is an active session
    if (activeSession()) {
      if (activeInputRef.current) {
        activeInputRef.current.focus();
        // Maintain current cursor position
        const pos = activeInputRef.current.selectionStart ?? activeInputRef.current.value.length;
        activeInputRef.current.setSelectionRange(pos, pos);
      }
    }
  }, [sessions, activeSessionId, isFunctionMode]); // Focus after session changes or toggling function mode

  // Handler for keydown events directly on the keypad container
  const handleKeypadKeyPress = (e: React.KeyboardEvent) => {
    // Prevent default behavior to avoid keyboard popup on mobile
    e.preventDefault();
    
    // If a number or operator key was pressed, handle it
    const key = e.key;
    if (/^[0-9.]$/.test(key)) {
      handleInput(key);
    } else if (['+', '-', '*', '/', '%', '^'].includes(key)) {
      handleInput(key);
    } else if (key === 'Enter') {
      handleEquals();
    } else if (key === 'Backspace') {

      console.log("handleKeypadKeyPress calling handleBackspace");
      handleBackspace();
    } else if (key === 'Escape') {
      handleClear();
    } else if (key === 'ArrowLeft') {
      handleCursorMove('left');
    } else if (key === 'ArrowRight') {
      handleCursorMove('right');
    }
  };

  // Handle start of cursor button drag
  const handleCursorDragStart = (e: React.PointerEvent) => {
    if (!activeInputRef.current) return;
    
    // Prevent focus loss
    preventFocusLoss(e);
    
    // Start tracking drag
    setIsDraggingCursor(true);
    dragStartXRef.current = e.clientX;
    
    // Store current cursor position
    dragLastPositionRef.current = activeInputRef.current.selectionStart ?? 0;
    
    // Capture pointer to track movement
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  // Handle cursor button drag movement
  const handleCursorDrag = (e: React.PointerEvent) => {
    if (!isDraggingCursor || !activeInputRef.current) return;
    
    // Calculate movement
    const deltaX = e.clientX - dragStartXRef.current;
    const charPositionChange = Math.floor(deltaX / dragSensitivity);
    
    if (charPositionChange !== 0) {
      // Update position if change is significant enough
      const currentValue = activeInputRef.current.value;
      const oldPosition = dragLastPositionRef.current;
      const newPosition = Math.max(0, Math.min(oldPosition + charPositionChange, currentValue.length));
      
      // Only update if position changed
      if (newPosition !== oldPosition) {
        // Update the reference position
        dragLastPositionRef.current = newPosition;
        // Update drag start position to avoid cumulative errors
        dragStartXRef.current = e.clientX;
        // Move cursor
        focusInput(newPosition);
      }
    }
  };

  // Handle end of cursor button drag
  const handleCursorDragEnd = (e: React.PointerEvent) => {
    if (isDraggingCursor) {
      setIsDraggingCursor(false);
      
      // Release pointer capture
      if ((e.target as HTMLElement).hasPointerCapture(e.pointerId)) {
        (e.target as HTMLElement).releasePointerCapture(e.pointerId);
      }
    }
  };

  // Save sessions to localStorage whenever they change
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_SESSIONS, JSON.stringify(sessions));
    } catch (error) {
      console.error('Error saving sessions:', error);
    }
  }, [sessions]);

  // Save active session ID whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_ACTIVE_SESSION, activeSessionId);
    } catch (error) {
      console.error('Error saving active session ID:', error);
    }
  }, [activeSessionId]);

  // Save angle unit preference whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_IS_DEGREES, isDegrees.toString());
    } catch (error) {
      console.error('Error saving angle unit setting:', error);
    }
  }, [isDegrees]);

  // Save function mode preference whenever it changes
  useEffect(() => {
    try {
      localStorage.setItem(STORAGE_KEY_IS_FUNCTION_MODE, isFunctionMode.toString());
    } catch (error) {
      console.error('Error saving function mode setting:', error);
    }
  }, [isFunctionMode]);

  // Clear all saved data and reset to defaults
  const clearAllSavedData = () => {
    try {
      localStorage.removeItem(STORAGE_KEY_SESSIONS);
      localStorage.removeItem(STORAGE_KEY_ACTIVE_SESSION);
      localStorage.removeItem(STORAGE_KEY_IS_DEGREES);
      localStorage.removeItem(STORAGE_KEY_IS_FUNCTION_MODE);
      
      // Reset to defaults
      const initialSessionId = generateId();
      setSessions([{ id: initialSessionId, expression: '', answer: '' }]);
      setActiveSessionId(initialSessionId);
      setIsDegrees(true);
      setIsFunctionMode(false);
    } catch (error) {
      console.error('Error clearing saved data:', error);
    }
  };

  // Helper function to reset countdown - we'll call this from various places
  const resetResetCountdown = () => {
    if (resetCountdown !== 5) {
      setResetCountdown(5);
    }
  };

  // Handle reset button click with countdown
  const handleResetClick = (e: React.MouseEvent) => {
    // Stop propagation to prevent the click from reaching the document
    e.stopPropagation();
    
    if (resetCountdown === 1) {
      // Execute reset when countdown reaches 0
      clearAllSavedData();
      // Reset the countdown
      setResetCountdown(5);
    } else {
      // Decrease countdown
      setResetCountdown(prev => prev - 1);
    }
  };

  // Reset the countdown on blur
  const handleResetBlur = () => {
    // Reset countdown when button loses focus
    resetResetCountdown();
  };

  // Add document click handler to reset countdown on any other interaction
  useEffect(() => {
    const handleDocumentClick = (e: MouseEvent) => {
      // Only reset if the click is not on the reset button itself
      if (resetButtonRef.current && !resetButtonRef.current.contains(e.target as Node)) {
        resetResetCountdown();
      }
    };

    document.addEventListener('click', handleDocumentClick);
    
    return () => {
      document.removeEventListener('click', handleDocumentClick);
    };
  }, [resetCountdown]); // Include resetCountdown in dependencies

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
              <button 
                type="button" 
                className="reset-button-low-profile" 
                onClick={handleResetClick}
                onBlur={handleResetBlur}
                ref={resetButtonRef}
                title={resetCountdown === 5 ? "Reset Calculator" : `Click ${resetCountdown} more times to reset`}
              >
                {resetCountdown === 5 ? "Reset All" : `Confirm (${resetCountdown})`}
              </button>
          </div>
        </div> {/* End of session-area wrapper */}

        {/* Keypad Area */}
        <form onSubmit={handleSubmit} className="keypad-form" 
          onKeyDown={handleKeypadKeyPress} // Add keydown handler to the form
          tabIndex={0} // Make the keypad container focusable
        >
          <div className="keypads-container">

            {/* Standard Keypad */}
            {!isFunctionMode && (
              <div className="keypad standard-mode">
                {/* --- Row 1 --- */}

                <button type="button" className="button function" onClick={toggleFunctionMode} onMouseDown={preventFocusLoss}>Fn</button>
                <button type="button" className="button function" onClick={() => handleFunction('sin')} onMouseDown={preventFocusLoss}>sin</button>
                <button type="button" className="button function" onClick={() => handleFunction('cos')} onMouseDown={preventFocusLoss}>cos</button>
                <button type="button" className="button function" onClick={() => handleFunction('tan')} onMouseDown={preventFocusLoss}>tan</button>
                <button type="button" className="button function" onClick={handlePi} onMouseDown={preventFocusLoss}>π</button>

                {/* --- Row 2 --- */}
                <button type="button" className="button function" onClick={handleToggleAngleUnit} onMouseDown={preventFocusLoss}>
                  {/* it's to display "current" mode */}
                  {isDegrees ? 'RAD' : 'DEG'}
                </button>
                <button type="button" className="button function" onClick={() => handleInput('^')} onMouseDown={preventFocusLoss}>x^y</button>
                <button type="button" className="button function" onClick={handleSqrt} onMouseDown={preventFocusLoss}>√</button>
                <button type="button" className="button function" onClick={() => handleInput('(')} onMouseDown={preventFocusLoss}>(</button>
                <button type="button" className="button function" onClick={() => handleInput(')')} onMouseDown={preventFocusLoss}>)</button>

                {/* --- Row 3 --- */}
                <button type="button" className="button" onClick={() => handleInput('7')} onMouseDown={preventFocusLoss}>7</button>
                <button type="button" className="button" onClick={() => handleInput('8')} onMouseDown={preventFocusLoss}>8</button>
                <button type="button" className="button" onClick={() => handleInput('9')} onMouseDown={preventFocusLoss}>9</button>

                <button 
                  type="button" 
                  className="button" 
                  onMouseDown={(e) => {
                    preventFocusLoss(e);
                    startLongPressTimer();
                  }}
                  onMouseUp={() => clearLongPressTimer(true)}
                  onMouseLeave={() => clearLongPressTimer(false)}
                  onTouchStart={(e) => {
                    preventFocusLoss(e);
                    startLongPressTimer();
                  }}
                  // onTouchEnd={() => clearLongPressTimer(true)}
                >
                  ⌫
                </button>
                <button type="button" className="button operator" onClick={() => handleInput('%')} onMouseDown={preventFocusLoss}>%</button>
                {/* --- Row 4 --- */}
                <button type="button" className="button" onClick={() => handleInput('4')} onMouseDown={preventFocusLoss}>4</button>
                <button type="button" className="button" onClick={() => handleInput('5')} onMouseDown={preventFocusLoss}>5</button>
                <button type="button" className="button" onClick={() => handleInput('6')} onMouseDown={preventFocusLoss}>6</button>
                <button type="button" className="button operator" onClick={() => handleInput('+')} onMouseDown={preventFocusLoss}>+</button>
                <button type="button" className="button operator" onClick={() => handleInput('*')} onMouseDown={preventFocusLoss}>×</button>
                {/* --- Row 5 --- */}

                <button type="button" className="button" onClick={() => handleInput('1')} onMouseDown={preventFocusLoss}>1</button>
                <button type="button" className="button" onClick={() => handleInput('2')} onMouseDown={preventFocusLoss}>2</button>
                <button type="button" className="button" onClick={() => handleInput('3')} onMouseDown={preventFocusLoss}>3</button>
                <button type="button" className="button operator" onClick={() => handleInput('-')} onMouseDown={preventFocusLoss}>-</button>
                <button type="button" className="button operator" onClick={() => handleInput('/')} onMouseDown={preventFocusLoss}>/</button>
                {/* --- Row 6 --- */}
                <button type="button" className="button" onClick={() => handleInput('0')} onMouseDown={preventFocusLoss}>0</button>
                <button type="button" className="button" onClick={() => handleInput('.')} onMouseDown={preventFocusLoss}>.</button>
                <button 
                  type="button" 
                  className="button function" 
                  onClick={() => handleCursorMove('left')} 
                  onMouseDown={preventFocusLoss}
                  onPointerDown={handleCursorDragStart}
                  onPointerMove={handleCursorDrag}
                  onPointerUp={handleCursorDragEnd}
                  onPointerCancel={handleCursorDragEnd}
                >&lt;</button>
                <button 
                  type="button" 
                  className="button function" 
                  onClick={() => handleCursorMove('right')} 
                  onMouseDown={preventFocusLoss}
                  onPointerDown={handleCursorDragStart}
                  onPointerMove={handleCursorDrag}
                  onPointerUp={handleCursorDragEnd}
                  onPointerCancel={handleCursorDragEnd}
                >&gt;</button>
        </div>
      )}

            {/* Function Keypad */}
            {isFunctionMode && (
              <div className="keypad standard-mode">
                {/* --- Row 1 --- */}
                <button type="button" className="button back-button" onClick={toggleFunctionMode} onMouseDown={preventFocusLoss}>←</button>
                <button type="button" className="button function abs-value" onClick={() => handleInput('abs(')} onMouseDown={preventFocusLoss}>|a|</button>
                <button type="button" className="button function" onClick={() => handleFunction('round')} onMouseDown={preventFocusLoss}>round</button>
                <button type="button" className="button function" onClick={() => handleInput('e')} onMouseDown={preventFocusLoss}>e</button>
                <button type="button" className="button function" onClick={handleToggleAngleUnit} onMouseDown={preventFocusLoss}>
                  {isDegrees ? 'DEG' : 'RAD'}
                </button>
                {/* --- Row 2 --- */}
                <button type="button" className="button function" onClick={() => handleFunction('log')} onMouseDown={preventFocusLoss}>log</button>
                <button type="button" className="button function" onClick={() => handleFunction('ln')} onMouseDown={preventFocusLoss}>ln</button>
                <button type="button" className="button function" onClick={() => handleFunction('floor')} onMouseDown={preventFocusLoss}>floor</button>
                <button type="button" className="button function" onClick={() => handleFunction('ceil')} onMouseDown={preventFocusLoss}>ceil</button>
                <button 
                  type="button" 
                  className="button" 
                  onMouseDown={(e) => {
                    preventFocusLoss(e);
                    startLongPressTimer();
                  }}
                  onMouseUp={() => clearLongPressTimer(true)}
                  onMouseLeave={() => clearLongPressTimer(false)}
                  onTouchStart={(e) => {
                    preventFocusLoss(e);
                    startLongPressTimer();
                  }}
                  onTouchEnd={() => clearLongPressTimer(true)}
                >
                  ⌫
                </button>
                {/* --- Row 3 --- */}
                <button type="button" className="button function" onClick={() => handleFunction('sinh')} onMouseDown={preventFocusLoss}>sinh</button>
                <button type="button" className="button function" onClick={() => handleFunction('cosh')} onMouseDown={preventFocusLoss}>cosh</button>
                <button type="button" className="button function" onClick={() => handleFunction('tanh')} onMouseDown={preventFocusLoss}>tanh</button>
                <button type="button" className="button function" onClick={() => handleInput('(')} onMouseDown={preventFocusLoss}>(</button>
                <button type="button" className="button function" onClick={() => handleInput(')')} onMouseDown={preventFocusLoss}>)</button>
                {/* --- Row 4 --- */}
                <button type="button" className="button function" onClick={() => handleFunction('asin')} onMouseDown={preventFocusLoss}>asin</button>
                <button type="button" className="button function" onClick={() => handleFunction('acos')} onMouseDown={preventFocusLoss}>acos</button>
                <button type="button" className="button function" onClick={() => handleFunction('atan')} onMouseDown={preventFocusLoss}>atan</button>
                <button type="button" className="button function" onClick={() => handleInput('Math.sqrt(')} onMouseDown={preventFocusLoss}>√</button>
                <button type="button" className="button function" onClick={() => handleInput('Math.cbrt(')} onMouseDown={preventFocusLoss}>∛</button>
                {/* --- Row 5 --- */}
                <button type="button" className="button function" onClick={() => handleInput('Math.random()')} onMouseDown={preventFocusLoss}>rand</button>
                <button type="button" className="button function" onClick={() => handleInput('Math.pow(')} onMouseDown={preventFocusLoss}>x^y</button>
                <button type="button" className="button function" onClick={() => handleInput('Math.abs(')} onMouseDown={preventFocusLoss}>abs</button>
                <button type="button" className="button function" onClick={() => handleInput('Math.E')} onMouseDown={preventFocusLoss}>e</button>
                <button type="button" className="button equals" onClick={handleEquals} onMouseDown={preventFocusLoss}>=</button>
                {/* --- Row 6 --- */}
                <button type="button" className="button operator" onClick={() => handleInput('+')} style={{ gridColumn: '1 / 3' }} onMouseDown={preventFocusLoss}>+</button>
                <button type="button" className="button operator" onClick={() => handleInput('-')} onMouseDown={preventFocusLoss}>-</button>
                <button type="button" className="button operator" onClick={() => handleInput('*')} onMouseDown={preventFocusLoss}>×</button>
                <button type="button" className="button operator" onClick={() => handleInput('/')} onMouseDown={preventFocusLoss}>/</button>
              </div>
            )}
          </div>
        </form>
      </div>
    </div>
  )
}

export default App 
