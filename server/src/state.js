const VALID_TAGS = ['ASK', 'ANS', 'PROPOSE', 'AGREE', 'DISAGREE', 'DECIDE', 'DO', 'PASS', 'STATE']

function parseTag(text) {
  const m = text.match(/^\[(\w+)\]\s*/)
  if (m && VALID_TAGS.includes(m[1])) {
    return { tag: m[1], text: text.slice(m[0].length) }
  }
  return { tag: undefined, text }
}

export function createState() {
  const data = {
    roomName: 'O Agent Chat',
    leader: '—',
    operator: '—',
    goal: '',
    scope: '',
    dod: '',
    messages: [],
    presence: { Boss: false, Code: false, Codex: false },
    updatedAt: new Date().toISOString(),
  }

  function touch() {
    data.updatedAt = new Date().toISOString()
  }

  return {
    get roomName() { return data.roomName },
    get leader() { return data.leader },
    get operator() { return data.operator },
    get goal() { return data.goal },
    get scope() { return data.scope },
    get dod() { return data.dod },
    get messages() { return data.messages },
    get presence() { return data.presence },

    snapshot() {
      return {
        roomName: data.roomName,
        leader: data.leader,
        operator: data.operator,
        executor: data.operator,
        goal: data.goal,
        scope: data.scope,
        dod: data.dod,
        doneDefinition: data.dod,
        messages: [...data.messages],
        presence: { ...data.presence },
        updatedAt: data.updatedAt,
      }
    },

    addMessage({ sender = 'Boss', role, text }) {
      const { tag, text: cleanText } = parseTag(text)
      const safeRole = ['Boss', 'Code', 'Codex'].includes(role) ? role : sender
      const createdAt = new Date().toISOString()
      const msg = {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        role: safeRole,
        sender: safeRole === 'Boss' ? 'บอส' : safeRole,
        text: cleanText,
        tag,
        createdAt,
        ts: Date.parse(createdAt),
      }
      data.messages.push(msg)
      touch()
      return msg
    },

    setLeader(leader) {
      data.leader = leader
      data.operator = leader === 'Code' ? 'Codex' : 'Code'
      touch()
    },

    setField(key, value) {
      const normalizedKey = key === 'doneDefinition' ? 'dod' : key
      if (['goal', 'scope', 'dod'].includes(normalizedKey)) {
        data[normalizedKey] = value
        touch()
      }
    },

    setPresence(who, online) {
      if (who in data.presence) {
        data.presence[who] = online
        touch()
      }
    },
  }
}

export const room = createState()
