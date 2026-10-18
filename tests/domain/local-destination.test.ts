import { describe, expect, it } from 'vitest'
import { openRelativeDestination } from '../../app/services/local-filter/destination'

describe('local destination', () => {
  it('does not create directories while previewing, and creates them when confirmed', async () => {
    const names: string[] = []
    const folder = { async getDirectoryHandle(name: string, options?: { create?: boolean }) { names.push(`${name}:${Boolean(options?.create)}`); if (!options?.create) throw new DOMException('missing', 'NotFoundError'); return this } }
    expect(await openRelativeDestination(folder as unknown as FileSystemDirectoryHandle, 'KhachA/DaLoc', false)).toBeNull()
    expect(names).toEqual(['KhachA:false'])
    names.length = 0
    expect(await openRelativeDestination(folder as unknown as FileSystemDirectoryHandle, 'KhachA/DaLoc', true)).toBe(folder)
    expect(names).toEqual(['KhachA:true', 'DaLoc:true'])
  })
})
