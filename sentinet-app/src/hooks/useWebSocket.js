import { useState, useEffect, useRef } from 'react'
import { getWsUrl } from '../services/api'

const RING_SIZE = 40

export function useWebSocket() {
  const [metrics, setMetrics] = useState(null)
  const [connected, setConnected] = useState(false)
  const [trafficHistory, setTrafficHistory] = useState([])
  const [liveAlerts, setLiveAlerts] = useState([])
  const wsRef = useRef(null)
  const timerRef = useRef(null)
  const ringRef = useRef([])

  useEffect(() => {
    let alive = true

    const connect = () => {
      if (!alive) return
      try {
        const ws = new WebSocket(getWsUrl())
        wsRef.current = ws

        ws.onopen = () => { if (alive) setConnected(true) }
        ws.onclose = () => {
          if (alive) {
            setConnected(false)
            timerRef.current = setTimeout(connect, 5000)
          }
        }
        ws.onerror = () => ws.close()
        ws.onmessage = (e) => {
          if (!alive) return
          try {
            const msg = JSON.parse(e.data)
            if (msg.type === 'metrics') {
              const d = msg.data
              setMetrics(d)
              // Accumulate rolling traffic history
              const label = new Date(d.ts).toLocaleTimeString('fr-FR', { hour: '2-digit', minute: '2-digit', second: '2-digit' })
              const point = {
                time: label,
                in: +(d.net?.inMbps ?? 0).toFixed(3),
                out: +(d.net?.outMbps ?? 0).toFixed(3),
                conns: d.conns ?? 0,
                threats: d.alerts?.critical ?? 0,
              }
              ringRef.current = [...ringRef.current, point].slice(-RING_SIZE)
              setTrafficHistory([...ringRef.current])
            }
            if (msg.type === 'alert') {
              setLiveAlerts(prev => [msg.data, ...prev].slice(0, 50))
            }
          } catch {}
        }
      } catch {
        if (alive) timerRef.current = setTimeout(connect, 5000)
      }
    }

    connect()

    return () => {
      alive = false
      clearTimeout(timerRef.current)
      wsRef.current?.close()
    }
  }, [])

  return { metrics, connected, trafficHistory, liveAlerts }
}
