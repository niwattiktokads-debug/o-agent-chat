import { useCallback, useEffect, useRef, useState } from 'react'

function speechRecognitionClass() {
  if (typeof window === 'undefined') return null
  return window.SpeechRecognition || window.webkitSpeechRecognition || null
}

function normalizeTranscript(text) {
  return String(text || '').replace(/\s+/g, ' ').trim()
}

export function supportsPushToTalkSpeech() {
  return Boolean(speechRecognitionClass())
}

export function usePushToTalkSpeech({ lang = 'th-TH', onCommit } = {}) {
  const [supported, setSupported] = useState(() => supportsPushToTalkSpeech())
  const [listening, setListening] = useState(false)
  const [interimText, setInterimText] = useState('')
  const [error, setError] = useState('')
  const recognitionRef = useRef(null)
  const finalTextRef = useRef('')
  const interimTextRef = useRef('')
  const onCommitRef = useRef(onCommit)

  useEffect(() => {
    onCommitRef.current = onCommit
  }, [onCommit])

  useEffect(() => {
    setSupported(supportsPushToTalkSpeech())
  }, [])

  const stop = useCallback(() => {
    const recognition = recognitionRef.current
    if (!recognition) return
    try {
      recognition.stop()
    } catch {
      recognitionRef.current = null
      setListening(false)
    }
  }, [])

  const start = useCallback(() => {
    const Recognition = speechRecognitionClass()
    if (!Recognition) {
      setSupported(false)
      setError('voice_not_supported')
      return
    }
    if (recognitionRef.current) return

    const recognition = new Recognition()
    recognition.lang = lang
    recognition.continuous = true
    recognition.interimResults = true
    recognition.maxAlternatives = 1
    finalTextRef.current = ''
    interimTextRef.current = ''
    setInterimText('')
    setError('')

    recognition.onstart = () => {
      setListening(true)
    }

    recognition.onresult = (event) => {
      let nextInterim = ''
      for (let index = event.resultIndex || 0; index < event.results.length; index += 1) {
        const item = event.results[index]
        const chunk = item?.[0]?.transcript || ''
        if (item?.isFinal) finalTextRef.current = normalizeTranscript(`${finalTextRef.current} ${chunk}`)
        else nextInterim = normalizeTranscript(`${nextInterim} ${chunk}`)
      }
      interimTextRef.current = nextInterim
      setInterimText(nextInterim)
    }

    recognition.onerror = (event) => {
      setError(event?.error || 'voice_error')
    }

    recognition.onend = () => {
      recognitionRef.current = null
      setListening(false)
      const committed = normalizeTranscript(`${finalTextRef.current} ${interimTextRef.current}`)
      setInterimText('')
      if (committed) onCommitRef.current?.(committed)
    }

    recognitionRef.current = recognition
    try {
      recognition.start()
      setListening(true)
    } catch (err) {
      recognitionRef.current = null
      setListening(false)
      setError(err?.message || 'voice_start_failed')
    }
  }, [lang])

  useEffect(() => () => {
    try {
      recognitionRef.current?.abort?.()
    } catch {}
  }, [])

  return {
    supported,
    listening,
    interimText,
    error,
    start,
    stop,
  }
}
