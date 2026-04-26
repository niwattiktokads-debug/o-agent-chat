export function createHub(wss, room) {
  function broadcast(event, payload) {
    const msg = JSON.stringify({ event, state: payload, payload })
    wss.clients.forEach((c) => c.readyState === 1 && c.send(msg))
  }

  wss.on('connection', (ws) => {
    const initialState = room.snapshot()
    ws.send(JSON.stringify({ event: 'state', state: initialState, payload: initialState }))

    let identifiedAs = null

    ws.on('message', (raw) => {
      let msg
      try { msg = JSON.parse(raw) } catch { return }
      if (!msg || typeof msg !== 'object') return

      switch (msg.event) {
        case 'identify': {
          const who = msg.payload?.who
          if (['Boss', 'Code', 'Codex'].includes(who)) {
            if (identifiedAs && identifiedAs !== who) {
              room.setPresence(identifiedAs, false)
            }
            identifiedAs = who
            room.setPresence(who, true)
            broadcast('presence', room.snapshot())
          }
          break
        }
        case 'typing': {
          if (identifiedAs && typeof msg.payload?.typing === 'boolean') {
            const typingPayload = { who: identifiedAs, typing: msg.payload.typing }
            const wireMsg = JSON.stringify({ event: 'typing', payload: typingPayload, state: room.snapshot() })
            wss.clients.forEach((c) => c.readyState === 1 && c.send(wireMsg))
          }
          break
        }
      }
    })

    ws.on('close', () => {
      if (identifiedAs) {
        room.setPresence(identifiedAs, false)
        broadcast('presence', room.snapshot())
      }
    })
  })

  return { broadcast }
}
