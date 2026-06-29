'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import type { CollaborativeSession, CollaborativeSessionStatus, Quest, Scene } from '../lib/types'
import { BRAND_COLORS } from '../lib/branding'
import {
  ROOM_CODE_LENGTH,
  ROOM_CODE_EXPIRY_MINUTES,
  DISCONNECT_TIMEOUT_SECONDS,
  TOTAL_QUEST_SCENES,
  MAX_COINS_PER_QUEST,
} from '../lib/constants'

// ─── WebSocket Message Types ─────────────────────────────────────────────────

/** Messages sent from the server to the client. */
interface ServerMessage {
  type:
    | 'room_created'
    | 'player_joined'
    | 'scene_start'
    | 'answer_selected'
    | 'turn_change'
    | 'quest_complete'
    | 'turn_reminder'
    | 'disconnect_notice'
    | 'player_reconnected'
    | 'reconnected'
    | 'error'
  room_code?: string
  player_number?: number
  player_name?: string
  other_player_name?: string
  scene_number?: number
  active_player?: 1 | 2
  option_id?: string
  is_correct?: boolean
  coins?: number
  total_coins?: number
  message?: string
  current_scene?: number
  shared_coins?: number
  status?: string
}

// ─── Component State ─────────────────────────────────────────────────────────

type CollabPhase =
  | 'menu'         // Initial screen: create or join
  | 'creating'     // P1 is setting up (selecting character, lesson, genre)
  | 'waiting'      // P1 waiting for P2 to join
  | 'joining'      // P2 entering room code
  | 'playing'      // Active quest playback
  | 'complete'     // Quest finished
  | 'disconnected' // Partner disconnected, solo option available
  | 'expired'      // Room code expired
  | 'error'        // Connection error

interface CollaborativeModeProps {
  /** The quest data to play (provided after P1 selects character/lesson/genre). */
  quest?: Quest | null
  /** Player's display name. */
  playerName: string
  /** Callback when quest is ready to start (both players connected). */
  onQuestStart?: (session: CollabSessionState) => void
  /** Callback for when P1 needs to set up the quest (select character, lesson, genre). */
  onSetupQuest?: () => void
  /** Callback when the component should be closed. */
  onClose?: () => void
  /** WebSocket URL base (defaults to ws://localhost:8080/ws/collab). */
  wsUrl?: string
}

/** Internal representation of the collaborative session state. */
export interface CollabSessionState {
  roomCode: string
  playerNumber: 1 | 2
  player1Name: string
  player2Name: string
  currentScene: number
  activePlayer: 1 | 2
  sharedCoins: number
  status: CollaborativeSessionStatus
}

// ─── Utility Functions ───────────────────────────────────────────────────────

/**
 * Determines which player is active for a given scene number.
 * Odd scenes = Player 1, Even scenes = Player 2.
 */
export function getActivePlayer(sceneNumber: number): 1 | 2 {
  return sceneNumber % 2 === 1 ? 1 : 2
}

/**
 * Validates a room code input string.
 * Must be exactly 4 numeric digits.
 */
export function isValidRoomCode(code: string): boolean {
  return /^\d{4}$/.test(code)
}

// ─── Component ───────────────────────────────────────────────────────────────

/**
 * CollaborativeMode manages room creation/joining, WebSocket communication,
 * turn-based gameplay, disconnect handling, and quest completion for
 * a two-player collaborative story session.
 *
 * Requirements: 12.1, 12.2, 12.3, 12.4, 12.5, 12.6, 12.7
 */
export default function CollaborativeMode({
  quest,
  playerName,
  onQuestStart,
  onSetupQuest,
  onClose,
  wsUrl = 'ws://localhost:8080/ws/collab',
}: CollaborativeModeProps) {
  const [phase, setPhase] = useState<CollabPhase>('menu')
  const [session, setSession] = useState<CollabSessionState | null>(null)
  const [roomCode, setRoomCode] = useState<string>('')
  const [joinCode, setJoinCode] = useState<string>('')
  const [errorMessage, setErrorMessage] = useState<string>('')
  const [isMyTurn, setIsMyTurn] = useState<boolean>(false)
  const [waitingMessage, setWaitingMessage] = useState<string>('')

  const wsRef = useRef<WebSocket | null>(null)
  const heartbeatRef = useRef<ReturnType<typeof setInterval> | null>(null)

  // ─── WebSocket Management ────────────────────────────────────────────────

  const cleanup = useCallback(() => {
    if (heartbeatRef.current) {
      clearInterval(heartbeatRef.current)
      heartbeatRef.current = null
    }
    if (wsRef.current) {
      wsRef.current.close()
      wsRef.current = null
    }
  }, [])

  useEffect(() => {
    return () => {
      cleanup()
    }
  }, [cleanup])

  const connectWebSocket = useCallback(
    (action: 'create' | 'join', targetRoomCode?: string) => {
      cleanup()

      const wsEndpoint = `${wsUrl}/${targetRoomCode || 'new'}`
      const ws = new WebSocket(wsEndpoint)
      wsRef.current = ws

      ws.onopen = () => {
        // Send the initial message based on action
        if (action === 'create') {
          ws.send(JSON.stringify({ type: 'create', player_name: playerName }))
        } else if (action === 'join' && targetRoomCode) {
          ws.send(
            JSON.stringify({
              type: 'join',
              player_name: playerName,
              room_code: targetRoomCode,
            })
          )
        }

        // Start heartbeat
        heartbeatRef.current = setInterval(() => {
          if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'ping' }))
          }
        }, 10000)
      }

      ws.onmessage = (event) => {
        try {
          const msg: ServerMessage = JSON.parse(event.data)
          handleServerMessage(msg)
        } catch {
          // Ignore malformed messages
        }
      }

      ws.onclose = () => {
        if (heartbeatRef.current) {
          clearInterval(heartbeatRef.current)
          heartbeatRef.current = null
        }
      }

      ws.onerror = () => {
        setErrorMessage('Connection failed. Please try again.')
        setPhase('error')
      }
    },
    [wsUrl, playerName, cleanup]
  )

  // ─── Message Handlers ────────────────────────────────────────────────────

  const handleServerMessage = useCallback(
    (msg: ServerMessage) => {
      switch (msg.type) {
        case 'room_created': {
          const code = msg.room_code || ''
          setRoomCode(code)
          setSession({
            roomCode: code,
            playerNumber: 1,
            player1Name: playerName,
            player2Name: '',
            currentScene: 1,
            activePlayer: 1,
            sharedCoins: 0,
            status: 'waiting',
          })
          setPhase('waiting')
          break
        }

        case 'player_joined': {
          setSession((prev) => {
            if (!prev) return prev
            const p2Name = msg.player_name || 'Player 2'
            const updated = {
              ...prev,
              player2Name: prev.playerNumber === 1 ? p2Name : prev.player2Name,
              player1Name:
                prev.playerNumber === 2 && msg.other_player_name
                  ? msg.other_player_name
                  : prev.player1Name,
              status: 'active' as CollaborativeSessionStatus,
            }
            return updated
          })
          // If this is P2 joining, we now have both player names
          if (msg.player_number === 2 && msg.other_player_name) {
            setSession((prev) =>
              prev
                ? {
                    ...prev,
                    player1Name: msg.other_player_name || prev.player1Name,
                    player2Name: playerName,
                    playerNumber: 2,
                    status: 'active',
                  }
                : prev
            )
          }
          setPhase('playing')
          break
        }

        case 'scene_start': {
          const sceneNum = msg.scene_number || 1
          const activeP = msg.active_player || getActivePlayer(sceneNum)
          setSession((prev) =>
            prev
              ? { ...prev, currentScene: sceneNum, activePlayer: activeP, status: 'active' }
              : prev
          )
          setIsMyTurn(false) // Will be updated after session state reconciles
          setWaitingMessage('')
          // Check if it's this player's turn
          setSession((prev) => {
            if (prev) {
              const myTurn = prev.playerNumber === activeP
              setIsMyTurn(myTurn)
              if (!myTurn) {
                setWaitingMessage('Waiting for your friend...')
              } else {
                setWaitingMessage('')
              }
            }
            return prev
          })
          break
        }

        case 'turn_change': {
          const sceneNum = msg.scene_number || 1
          const activeP = msg.active_player || getActivePlayer(sceneNum)
          setSession((prev) =>
            prev
              ? { ...prev, currentScene: sceneNum, activePlayer: activeP }
              : prev
          )
          setSession((prev) => {
            if (prev) {
              const myTurn = prev.playerNumber === activeP
              setIsMyTurn(myTurn)
              if (!myTurn) {
                setWaitingMessage('Waiting for your friend...')
              } else {
                setWaitingMessage('')
              }
            }
            return prev
          })
          break
        }

        case 'answer_selected': {
          const coins = msg.coins ?? 0
          setSession((prev) => (prev ? { ...prev, sharedCoins: coins } : prev))
          break
        }

        case 'quest_complete': {
          const totalCoins = msg.total_coins ?? 0
          setSession((prev) =>
            prev ? { ...prev, sharedCoins: totalCoins, status: 'completed' } : prev
          )
          setPhase('complete')
          setWaitingMessage('')
          break
        }

        case 'turn_reminder': {
          // The server reminds the active player to answer
          setWaitingMessage(msg.message || "It's your turn! Pick an answer.")
          break
        }

        case 'disconnect_notice': {
          setPhase('disconnected')
          setSession((prev) => (prev ? { ...prev, status: 'solo' } : prev))
          setWaitingMessage('')
          break
        }

        case 'player_reconnected': {
          // Partner reconnected, resume normal play
          setPhase('playing')
          setSession((prev) => (prev ? { ...prev, status: 'active' } : prev))
          break
        }

        case 'reconnected': {
          // We reconnected to an existing session
          setSession((prev) =>
            prev
              ? {
                  ...prev,
                  currentScene: msg.current_scene || prev.currentScene,
                  activePlayer: msg.active_player || prev.activePlayer,
                  sharedCoins: msg.shared_coins ?? prev.sharedCoins,
                  status: (msg.status as CollaborativeSessionStatus) || prev.status,
                }
              : prev
          )
          setPhase('playing')
          break
        }

        case 'error': {
          const errorMsg = msg.message || 'Something went wrong.'
          if (errorMsg.toLowerCase().includes('expired')) {
            setPhase('expired')
            setErrorMessage(errorMsg)
          } else {
            setErrorMessage(errorMsg)
            setPhase('error')
          }
          break
        }
      }
    },
    [playerName]
  )

  // ─── Actions ─────────────────────────────────────────────────────────────

  /** Player 1 creates a new room. */
  const handleCreateRoom = () => {
    if (onSetupQuest) {
      onSetupQuest()
    }
    setPhase('creating')
  }

  /** After P1 finishes setup, connect and create the room. */
  const handleStartWaiting = () => {
    connectWebSocket('create')
  }

  /** Player 2 joins an existing room. */
  const handleJoinRoom = () => {
    if (!isValidRoomCode(joinCode)) {
      setErrorMessage('Please enter a valid 4-digit room code.')
      return
    }
    setErrorMessage('')
    connectWebSocket('join', joinCode)
    setSession({
      roomCode: joinCode,
      playerNumber: 2,
      player1Name: '',
      player2Name: playerName,
      currentScene: 1,
      activePlayer: 1,
      sharedCoins: 0,
      status: 'waiting',
    })
    setPhase('playing')
  }

  /** Send an answer to the server. */
  const sendAnswer = (sceneNumber: number, optionId: string, isCorrect: boolean) => {
    if (wsRef.current && wsRef.current.readyState === WebSocket.OPEN) {
      wsRef.current.send(
        JSON.stringify({
          type: 'select_answer',
          scene_number: sceneNumber,
          option_id: optionId,
          is_correct: isCorrect,
        })
      )
    }
  }

  /** Continue solo after partner disconnect. */
  const handleContinueSolo = () => {
    setPhase('playing')
    setSession((prev) => (prev ? { ...prev, status: 'solo' } : prev))
    setIsMyTurn(true)
    setWaitingMessage('')
  }

  /** Create a new room after expiry. */
  const handleCreateNewRoom = () => {
    setPhase('menu')
    setRoomCode('')
    setJoinCode('')
    setErrorMessage('')
    cleanup()
  }

  // ─── When quest becomes available and we're in creating phase, start waiting ──
  useEffect(() => {
    if (phase === 'creating' && quest) {
      handleStartWaiting()
    }
  }, [quest, phase])

  // Notify parent when quest starts
  useEffect(() => {
    if (phase === 'playing' && session && session.status === 'active' && onQuestStart) {
      onQuestStart(session)
    }
  }, [phase, session?.status])

  // ─── Render ──────────────────────────────────────────────────────────────

  return (
    <div className="w-full max-w-lg mx-auto p-6">
      {/* Menu Phase: Choose create or join */}
      {phase === 'menu' && (
        <div className="flex flex-col items-center gap-6" data-testid="collab-menu">
          <h2
            className="text-2xl font-bold text-center"
            style={{ color: BRAND_COLORS.tertiary }}
          >
            🤝 Play Together!
          </h2>
          <p className="text-gray-600 text-center">
            Create a room to play with a friend, or join an existing game.
          </p>

          <button
            type="button"
            onClick={handleCreateRoom}
            className="w-full py-4 px-6 rounded-2xl text-white font-bold text-lg transition-all duration-300 hover:scale-105"
            style={{
              backgroundColor: BRAND_COLORS.primary,
              minWidth: '44px',
              minHeight: '44px',
            }}
            aria-label="Create a new room"
          >
            🎮 Create Room
          </button>

          <div className="w-full border-t border-gray-200 my-2" />

          <div className="w-full flex flex-col items-center gap-3">
            <label htmlFor="join-code-input" className="text-sm font-medium text-gray-600">
              Have a room code? Enter it below:
            </label>
            <input
              id="join-code-input"
              type="text"
              inputMode="numeric"
              maxLength={ROOM_CODE_LENGTH}
              value={joinCode}
              onChange={(e) => setJoinCode(e.target.value.replace(/\D/g, '').slice(0, ROOM_CODE_LENGTH))}
              placeholder="0000"
              className="w-32 text-center text-2xl font-bold tracking-widest border-2 border-gray-300 rounded-xl p-3 focus:outline-none focus:ring-2 focus:ring-purple-400 focus:border-purple-400"
              aria-label="Enter 4-digit room code"
            />
            <button
              type="button"
              onClick={handleJoinRoom}
              disabled={joinCode.length < ROOM_CODE_LENGTH}
              className="w-full py-4 px-6 rounded-2xl text-white font-bold text-lg transition-all duration-300 hover:scale-105 disabled:opacity-50 disabled:cursor-not-allowed disabled:hover:scale-100"
              style={{
                backgroundColor: BRAND_COLORS.tertiary,
                minWidth: '44px',
                minHeight: '44px',
              }}
              aria-label="Join room"
            >
              🚪 Join Room
            </button>
          </div>

          {errorMessage && (
            <p className="text-sm text-center" style={{ color: BRAND_COLORS.error }} role="alert">
              {errorMessage}
            </p>
          )}

          {onClose && (
            <button
              type="button"
              onClick={onClose}
              className="text-gray-500 text-sm underline mt-2"
              style={{ minWidth: '44px', minHeight: '44px' }}
            >
              Go back
            </button>
          )}
        </div>
      )}

      {/* Creating Phase: P1 selects character, lesson, genre */}
      {phase === 'creating' && !quest && (
        <div className="flex flex-col items-center gap-4" data-testid="collab-creating">
          <h2
            className="text-xl font-bold text-center"
            style={{ color: BRAND_COLORS.tertiary }}
          >
            🎨 Set Up Your Adventure
          </h2>
          <p className="text-gray-600 text-center">
            Choose your character, lesson, and genre. Your friend will join once you are ready!
          </p>
          <div
            className="flex items-center justify-center w-12 h-12 rounded-full animate-pulse"
            style={{ backgroundColor: `${BRAND_COLORS.secondary}33` }}
          >
            <span className="text-2xl">⏳</span>
          </div>
        </div>
      )}

      {/* Waiting Phase: P1 has room code, waiting for P2 */}
      {phase === 'waiting' && (
        <div className="flex flex-col items-center gap-6" data-testid="collab-waiting">
          <h2
            className="text-xl font-bold text-center"
            style={{ color: BRAND_COLORS.tertiary }}
          >
            📋 Share This Code
          </h2>
          <p className="text-gray-600 text-center">
            Tell your friend this code so they can join your adventure!
          </p>

          <div
            className="bg-gray-50 border-2 rounded-2xl px-8 py-6"
            style={{ borderColor: BRAND_COLORS.primary }}
            aria-label={`Room code: ${roomCode}`}
          >
            <span
              className="text-4xl font-bold tracking-[0.3em]"
              style={{ color: BRAND_COLORS.primary }}
              data-testid="room-code-display"
            >
              {roomCode}
            </span>
          </div>

          <p className="text-sm text-gray-500 text-center">
            Code expires in {ROOM_CODE_EXPIRY_MINUTES} minutes
          </p>

          <div className="flex items-center gap-2 text-gray-500">
            <span className="animate-bounce">👀</span>
            <span>Waiting for your friend to join...</span>
          </div>
        </div>
      )}

      {/* Playing Phase */}
      {phase === 'playing' && session && (
        <div className="flex flex-col items-center gap-4" data-testid="collab-playing">
          {/* Player names display */}
          <div className="w-full flex items-center justify-between px-4 py-2 rounded-xl bg-gray-50">
            <div className="flex flex-col items-start">
              <span className="text-xs text-gray-500">Player 1</span>
              <span
                className="font-bold text-sm"
                style={{
                  color:
                    session.activePlayer === 1
                      ? BRAND_COLORS.primary
                      : 'inherit',
                }}
              >
                {session.player1Name || 'Waiting...'}
                {session.playerNumber === 1 && ' (you)'}
              </span>
            </div>
            <div
              className="px-3 py-1 rounded-full text-xs font-bold text-white"
              style={{ backgroundColor: BRAND_COLORS.secondary }}
            >
              ⭐ {session.sharedCoins}/{MAX_COINS_PER_QUEST}
            </div>
            <div className="flex flex-col items-end">
              <span className="text-xs text-gray-500">Player 2</span>
              <span
                className="font-bold text-sm"
                style={{
                  color:
                    session.activePlayer === 2
                      ? BRAND_COLORS.primary
                      : 'inherit',
                }}
              >
                {session.player2Name || 'Waiting...'}
                {session.playerNumber === 2 && ' (you)'}
              </span>
            </div>
          </div>

          {/* Turn indicator */}
          <div
            className="w-full text-center py-2 px-4 rounded-xl font-bold"
            style={{
              backgroundColor: isMyTurn
                ? `${BRAND_COLORS.success}22`
                : `${BRAND_COLORS.info}22`,
              color: isMyTurn ? BRAND_COLORS.success : BRAND_COLORS.info,
            }}
            role="status"
            aria-live="polite"
            data-testid="turn-indicator"
          >
            {isMyTurn ? (
              <span>🎯 Your turn! Scene {session.currentScene} of {TOTAL_QUEST_SCENES}</span>
            ) : (
              <span>
                👋 {waitingMessage || 'Waiting for your friend...'}
              </span>
            )}
          </div>

          {/* Scene progress */}
          <div className="w-full flex items-center gap-1">
            {Array.from({ length: TOTAL_QUEST_SCENES }, (_, i) => (
              <div
                key={i}
                className="flex-1 h-2 rounded-full transition-colors duration-300"
                style={{
                  backgroundColor:
                    i + 1 < session.currentScene
                      ? BRAND_COLORS.success
                      : i + 1 === session.currentScene
                      ? BRAND_COLORS.primary
                      : '#E5E7EB',
                }}
                aria-label={`Scene ${i + 1} ${
                  i + 1 < session.currentScene
                    ? 'completed'
                    : i + 1 === session.currentScene
                    ? 'current'
                    : 'upcoming'
                }`}
              />
            ))}
          </div>

          {/* Solo mode notice */}
          {session.status === 'solo' && (
            <div
              className="w-full text-center py-2 px-4 rounded-xl text-sm"
              style={{
                backgroundColor: `${BRAND_COLORS.secondary}22`,
                color: BRAND_COLORS.primary,
              }}
            >
              Playing solo — your friend disconnected
            </div>
          )}
        </div>
      )}

      {/* Quest Complete Phase */}
      {phase === 'complete' && session && (
        <div className="flex flex-col items-center gap-6" data-testid="collab-complete">
          <h2
            className="text-2xl font-bold text-center"
            style={{ color: BRAND_COLORS.secondary }}
          >
            🎉 Quest Complete!
          </h2>
          <p className="text-gray-600 text-center text-lg">
            Great teamwork, {session.player1Name} &amp; {session.player2Name}!
          </p>

          <div
            className="flex flex-col items-center gap-2 bg-gray-50 rounded-2xl p-6 border-2"
            style={{ borderColor: BRAND_COLORS.secondary }}
          >
            <span className="text-4xl">⭐</span>
            <span
              className="text-3xl font-bold"
              style={{ color: BRAND_COLORS.secondary }}
              data-testid="shared-coin-total"
            >
              {session.sharedCoins} / {MAX_COINS_PER_QUEST}
            </span>
            <span className="text-sm text-gray-500">Team Star Coins</span>
          </div>

          <button
            type="button"
            onClick={handleCreateNewRoom}
            className="w-full py-4 px-6 rounded-2xl text-white font-bold text-lg transition-all duration-300 hover:scale-105"
            style={{
              backgroundColor: BRAND_COLORS.primary,
              minWidth: '44px',
              minHeight: '44px',
            }}
          >
            🚀 Play Again
          </button>
        </div>
      )}

      {/* Disconnected Phase */}
      {phase === 'disconnected' && (
        <div className="flex flex-col items-center gap-6" data-testid="collab-disconnected">
          <h2
            className="text-xl font-bold text-center"
            style={{ color: BRAND_COLORS.primary }}
          >
            😢 Your friend had to go
          </h2>
          <p className="text-gray-600 text-center">
            Your friend had to go. You can finish the adventure on your own!
          </p>
          <button
            type="button"
            onClick={handleContinueSolo}
            className="w-full py-4 px-6 rounded-2xl text-white font-bold text-lg transition-all duration-300 hover:scale-105"
            style={{
              backgroundColor: BRAND_COLORS.success,
              minWidth: '44px',
              minHeight: '44px',
            }}
            aria-label="Continue adventure solo"
          >
            🦸 Continue Solo
          </button>
        </div>
      )}

      {/* Expired Phase */}
      {phase === 'expired' && (
        <div className="flex flex-col items-center gap-6" data-testid="collab-expired">
          <h2
            className="text-xl font-bold text-center"
            style={{ color: BRAND_COLORS.primary }}
          >
            ⏰ Code Expired
          </h2>
          <p className="text-gray-600 text-center">
            The invite code expired. Create a new one to play with a friend!
          </p>
          <button
            type="button"
            onClick={handleCreateNewRoom}
            className="w-full py-4 px-6 rounded-2xl text-white font-bold text-lg transition-all duration-300 hover:scale-105"
            style={{
              backgroundColor: BRAND_COLORS.primary,
              minWidth: '44px',
              minHeight: '44px',
            }}
            aria-label="Create a new room"
          >
            🎮 Create New Room
          </button>
        </div>
      )}

      {/* Error Phase */}
      {phase === 'error' && (
        <div className="flex flex-col items-center gap-6" data-testid="collab-error">
          <h2
            className="text-xl font-bold text-center"
            style={{ color: BRAND_COLORS.error }}
          >
            😿 Oops!
          </h2>
          <p className="text-gray-600 text-center">
            {errorMessage || 'Something went wrong. Please try again.'}
          </p>
          <button
            type="button"
            onClick={handleCreateNewRoom}
            className="w-full py-4 px-6 rounded-2xl text-white font-bold text-lg transition-all duration-300 hover:scale-105"
            style={{
              backgroundColor: BRAND_COLORS.primary,
              minWidth: '44px',
              minHeight: '44px',
            }}
          >
            🔄 Try Again
          </button>
        </div>
      )}
    </div>
  )
}


