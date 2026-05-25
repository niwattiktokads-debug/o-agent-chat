import React from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'
import Composer from './Composer.jsx'

class FakeSpeechRecognition {
  static transcript = 'ทดสอบด้วยเสียง'

  start() {
    this.onstart?.()
    this.onresult?.({
      resultIndex: 0,
      results: [
        {
          0: { transcript: FakeSpeechRecognition.transcript },
          isFinal: true,
          length: 1,
        },
      ],
    })
  }

  stop() {
    this.onend?.()
  }

  abort() {}
}

afterEach(() => {
  delete window.SpeechRecognition
  delete window.webkitSpeechRecognition
  FakeSpeechRecognition.transcript = 'ทดสอบด้วยเสียง'
})

describe('Composer voice input', () => {
  it('turns hold-to-talk speech into editable text and sends it manually', () => {
    window.SpeechRecognition = FakeSpeechRecognition
    const onSend = vi.fn()
    render(<Composer onSend={onSend} />)

    const voiceButton = screen.getByRole('button', { name: 'กดค้างเพื่อพูด' })
    fireEvent.pointerDown(voiceButton, { button: 0, pointerId: 1 })
    fireEvent.pointerUp(voiceButton, { pointerId: 1 })

    const textbox = screen.getByPlaceholderText(/พิมพ์ในนาม บอส/)
    expect(textbox).toHaveValue('ทดสอบด้วยเสียง')
    expect(onSend).not.toHaveBeenCalled()

    fireEvent.click(screen.getByRole('button', { name: 'ส่ง' }))
    expect(onSend).toHaveBeenCalledWith('บอส', 'ทดสอบด้วยเสียง')
  })

  it('keeps the mic button disabled when the browser has no speech recognition', () => {
    render(<Composer onSend={() => {}} />)
    expect(screen.getByRole('button', { name: 'กดค้างเพื่อพูด' })).toBeDisabled()
  })
})
