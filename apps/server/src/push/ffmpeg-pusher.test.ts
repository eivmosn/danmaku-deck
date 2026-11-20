import { EventEmitter } from 'node:events'
import { describe, expect, it, vi } from 'vitest'
import { buildArgs, FfmpegPusher } from './ffmpeg-pusher'

describe('buildArgs', () => {
  it('直接复制编码，不转码', () => {
    const args = buildArgs('rtmp://127.0.0.1:1935/ps5', {
      platform: 'bilibili',
      server: 'rtmp://push.example.com/live',
      key: 'abc',
    })
    expect(args).toContain('-c')
    expect(args[args.indexOf('-c') + 1]).toBe('copy')
    expect(args.at(-1)).toBe('rtmp://push.example.com/live/abc')
  })

  it('服务器地址末尾斜杠不会重复', () => {
    const args = buildArgs('rtmp://in', {
      platform: 'xiaohongshu',
      server: 'rtmp://push.example.com/live/',
      key: 'k',
    })
    expect(args.at(-1)).toBe('rtmp://push.example.com/live/k')
  })
})

describe('FfmpegPusher', () => {
  it('启动时用 ffmpeg 拉起进程，退出后清空状态', () => {
    const child = Object.assign(new EventEmitter(), {
      stderr: new EventEmitter(),
      kill: vi.fn(),
    })
    const spawnImpl = vi.fn(() => child)
    const onExit = vi.fn()

    const pusher = new FfmpegPusher({
      input: 'rtmp://in',
      target: { platform: 'bilibili', server: 'rtmp://out', key: 'k' },
      spawnImpl: spawnImpl as never,
      onExit,
    })

    pusher.start()
    expect(pusher.running).toBe(true)
    expect(spawnImpl).toHaveBeenCalledTimes(1)
    const [, args] = spawnImpl.mock.calls[0] as unknown as [string, string[]]
    expect(args.at(-1)).toBe('rtmp://out/k')

    child.emit('exit', 0, null)
    expect(pusher.running).toBe(false)
    expect(onExit).toHaveBeenCalledWith(0, null)
  })

  it('停止时发 SIGTERM', () => {
    const child = Object.assign(new EventEmitter(), { stderr: new EventEmitter(), kill: vi.fn() })
    const pusher = new FfmpegPusher({
      input: 'rtmp://in',
      target: { platform: 'bilibili', server: 'rtmp://out', key: 'k' },
      spawnImpl: vi.fn(() => child) as never,
    })

    pusher.start()
    pusher.stop()
    expect(child.kill).toHaveBeenCalledWith('SIGTERM')
    expect(pusher.running).toBe(false)
  })
})
